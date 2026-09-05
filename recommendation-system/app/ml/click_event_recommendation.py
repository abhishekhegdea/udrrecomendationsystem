"""
ClickEvent-driven recommendation extension for UdrCrafts.

This module adds TWO separate click signals:

1. True Recommendation Click Through Rate / CTR (4%)
   - Measures the probability that a visible recommendation impression becomes
     a genuine product-discovery click during the last 7 days.
   - Uses RecommendationLog impressions + clicks with Bayesian smoothing.

2. User Click Affinity (10%)
   - Measures how similar a candidate is to products THIS user clicked
     during the last 7 days.
   - Combines semantic similarity, category affinity, brand affinity,
     and frequency/recency of the user's clicks.

The original recommendation_engine.py remains unchanged.

Dynamic weights are resolved per user before blending.  When a trained
LightGBM/XGBoost ranker is available, its learned gain importance is blended
with NEW/ACTIVE/RETURNING segment priors.
"""

from __future__ import annotations

import math

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Sequence, Tuple

from sqlalchemy import bindparam, func, text
from sqlalchemy.orm import Session, joinedload

from app.ml.content_based import get_similar_products

from app.ml.event_tracker import (
    EVENT_CART,
    EVENT_PRODUCT_VIEW,
    EVENT_PURCHASE,
    EVENT_WISHLIST,
)

from app.ml.recommendation_engine import (
    BusinessRuleFilter,
    CandidateGenerator,
    EngineConfig,
    FeatureComputer,
    RankerSelector,
    ScoredProduct,
)

from app.ml.learning_to_rank import (
    DynamicWeightResolver,
)

from app.models import (
    ClickEvent,
    Product,
    ProductView,
    UserBehaviour,
)

from app.ml.cold_start import (
    STAGE_COMPLETELY_COLD,
    STAGE_EARLY_SIGNAL,
    STAGE_EMERGING_PROFILE,
    STAGE_DEVELOPING_PROFILE,
    STAGE_WARM,
    MODE_COLD_START,
    MODE_EARLY_PERSONALIZED,
    MODE_PERSONALIZED,
    UserActivityProfile,
    get_user_activity_profile,
    get_cold_start_blend,
    generate_cold_start_candidates,
    compute_cold_start_scores,
    build_cold_start_explanation,
)

from app.ml.price_affinity import (
    build_user_price_profile,
    compute_candidate_price_affinity,
    UserPriceProfile,
)


# ============================================================
# CONFIGURATION
# ============================================================

CLICK_EVENT_WINDOW_DAYS = 7

# True CTR uses the same rolling window as the existing click signals.
CTR_PRIOR_MEAN = 0.05
CTR_PRIOR_STRENGTH = 20.0

# Raw/smoothed CTR is a probability. The recommendation blender expects
# roughly 0..1 feature scores, so 20% smoothed CTR maps to a full score of 1.
CTR_SCORE_REFERENCE = 0.20


# ============================================================
# TREND VELOCITY CONFIGURATION
# ============================================================

# Compare the most recent 3 days with the 3 days immediately before them.
TREND_VELOCITY_CURRENT_WINDOW_DAYS = 3
TREND_VELOCITY_PREVIOUS_WINDOW_DAYS = 3

# Stabilizes growth when the previous period has little/no activity.
TREND_VELOCITY_PRIOR_INTEREST_PER_DAY = 1.0

# Existing "trending" feature is preserved. Its score becomes:
#   70% interest velocity + 30% historical popularity
# If there is no recent behavioral evidence for a product, the old popularity
# score is kept unchanged as a safe fallback.
TREND_VELOCITY_WEIGHT = 0.70
TREND_POPULARITY_WEIGHT = 0.30

# Rising-interest products can also enter the candidate pool directly.
TREND_VELOCITY_CANDIDATE_LIMIT = 30

# Product-interest event strength. ClickEvent is handled separately so
# authenticated clicks are not double-counted through UserBehaviour EVENT_CLICK.
TREND_BEHAVIOUR_EVENT_WEIGHTS: Dict[str, float] = {
    EVENT_PRODUCT_VIEW: 1.0,
    EVENT_WISHLIST: 3.0,
    EVENT_CART: 4.0,
    EVENT_PURCHASE: 5.0,
}

TREND_CLICK_INTEREST_WEIGHT = 1.5


CLICK_AFFINITY_RECENCY_HALFLIFE_DAYS = 2.0

CLICK_AFFINITY_MAX_SEEDS = 5

CLICK_AFFINITY_CANDIDATES_PER_SEED = 10


# ============================================================
# FINAL RECOMMENDATION WEIGHTS
# ============================================================

# Total = 1.00
#
# click_rate is retained as the internal feature key for backward compatibility
# with the dynamic-weight / LTR feature contract. It now represents TRUE
# recommendation CTR rather than click-volume popularity.
#
# User Click Affinity remains a separate personalised KPI.

PERSONALIZED_CLICK_WEIGHTS: Dict[str, float] = {
    "content": 0.10,
    "collaborative": 0.10,
    "trending": 0.07,
    "seasonal": 0.06,

    # Location is now part of the actual recommendation score at 10%.
    # location_score = exp(-seller_distance_km / distance_decay_km)
    # location_contribution = location_score * 0.10
    "location": 0.10,

    "category_affinity": 0.08,
    "brand_affinity": 0.07,
    "rating": 0.07,
    "seller_freshness": 0.05,
    "click_rate": 0.04,
    "user_click_affinity": 0.10,
    "engagement": 0.11,
    "price_affinity": 0.05,
}


# ============================================================
# INTERNAL USER CLICK AFFINITY WEIGHTS
# ============================================================

USER_CLICK_AFFINITY_COMPONENT_WEIGHTS: Dict[str, float] = {
    "semantic": 0.40,
    "category": 0.25,
    "brand": 0.20,
    "frequency_recency": 0.15,
}


# ============================================================
# DATA STRUCTURE
# ============================================================

@dataclass
class ClickSeed:
    """
    Aggregated click history for one product clicked by the user.
    """

    product: Product

    click_count: int

    last_clicked_at: datetime

    frequency_score: float

    recency_score: float

    strength: float


# ============================================================
# BASIC HELPERS
# ============================================================

def _clamp01(
    value: float,
) -> float:

    return max(
        0.0,
        min(
            1.0,
            float(value),
        ),
    )


def _normalise_brand(
    value: Optional[str],
) -> str:

    return (
        value
        or ""
    ).strip().lower()


def _to_float_vector(
    value: object,
) -> Optional[List[float]]:
    """
    Convert pgvector / numpy / list values to List[float].
    """

    if value is None:
        return None


    try:

        if hasattr(
            value,
            "tolist",
        ):

            value = value.tolist()


        vector = [
            float(x)
            for x in value
        ]


        if not vector:
            return None


        return vector


    except (
        TypeError,
        ValueError,
    ):

        return None


def _cosine_similarity(
    vector_a: object,
    vector_b: object,
) -> float:
    """
    Compute semantic cosine similarity.

    Result is clamped to 0–1.
    """

    a = _to_float_vector(
        vector_a
    )

    b = _to_float_vector(
        vector_b
    )


    if (
        not a
        or not b
        or len(a) != len(b)
    ):
        return 0.0


    dot = sum(
        x * y
        for x, y in zip(
            a,
            b,
        )
    )


    norm_a = math.sqrt(
        sum(
            x * x
            for x in a
        )
    )


    norm_b = math.sqrt(
        sum(
            y * y
            for y in b
        )
    )


    if (
        norm_a <= 0.0
        or norm_b <= 0.0
    ):
        return 0.0


    similarity = (
        dot
        /
        (
            norm_a
            * norm_b
        )
    )


    return _clamp01(
        similarity
    )


# ============================================================
# RECENCY
# ============================================================

def _recency_score(
    clicked_at: datetime,
    now: datetime,
) -> float:
    """
    Recent clicks receive more importance.

    Half-life = 2 days.

    Roughly:

        clicked now      -> 100%
        2 days ago       -> 50%
        4 days ago       -> 25%
        6 days ago       -> 12.5%
    """

    age_seconds = max(
        0.0,
        (
            now
            - clicked_at
        ).total_seconds(),
    )


    age_days = (
        age_seconds
        / 86400.0
    )


    score = (
        0.5
        **
        (
            age_days
            /
            CLICK_AFFINITY_RECENCY_HALFLIFE_DAYS
        )
    )


    return _clamp01(
        score
    )


# ============================================================
# TRUE RECOMMENDATION CLICK THROUGH RATE (CTR)
# ============================================================

def get_product_ctr_stats(
    db: Session,
    product_ids: Sequence[str],
    *,
    window_days: int = CLICK_EVENT_WINDOW_DAYS,
) -> Dict[str, Dict[str, float]]:
    """
    Calculate true recommendation CTR for candidate products.

    CTR definition:

        raw_ctr = recommendation_clicks / visible_recommendation_impressions

    RecommendationLog is written by the Node tracking layer. One row maps to
    one RecommendationRun and stores unique visible product ids in
    ``recommendedIds`` and unique clicked product ids in ``clickedIds``.

    Bayesian smoothing prevents 1 click / 1 impression from dominating:

        smoothed_ctr =
            (clicks + prior_strength * prior_mean)
            / (impressions + prior_strength)

    ``smoothed_ctr`` is the interpretable probability. ``score`` maps that
    probability onto the 0..1 recommendation feature scale while preserving
    the existing internal ``click_rate`` feature key used by dynamic LTR.
    """

    unique_ids = [
        str(product_id)
        for product_id in dict.fromkeys(product_ids)
        if product_id
    ]

    if not unique_ids:
        return {}

    cutoff = (
        datetime.utcnow()
        - timedelta(
            days=max(1, window_days)
        )
    )

    # DISTINCT run_id/product_id means one product contributes at most one
    # impression and one click per recommendation run.
    statement = text(
        """
        WITH expanded AS (
            SELECT DISTINCT
                r.id AS run_id,
                exposure.product_id,
                (
                    exposure.product_id = ANY(r."clickedIds")
                ) AS clicked
            FROM "RecommendationLog" AS r
            CROSS JOIN LATERAL
                unnest(r."recommendedIds") AS exposure(product_id)
            WHERE
                r."createdAt" >= :cutoff
                AND exposure.product_id IN :product_ids
        )
        SELECT
            product_id,
            COUNT(*)::integer AS impressions,
            COUNT(*) FILTER (WHERE clicked)::integer AS clicks
        FROM expanded
        GROUP BY product_id
        """
    ).bindparams(
        bindparam(
            "product_ids",
            expanding=True,
        )
    )

    rows = (
        db.execute(
            statement,
            {
                "cutoff": cutoff,
                "product_ids": unique_ids,
            },
        )
        .mappings()
        .all()
    )

    if not rows:
        return {}

    total_impressions = sum(
        int(row.get("impressions") or 0)
        for row in rows
    )

    total_clicks = sum(
        int(row.get("clicks") or 0)
        for row in rows
    )

    # Use empirical candidate CTR as the prior once enough evidence exists;
    # otherwise use the conservative 5% cold-start prior.
    prior_mean = (
        total_clicks / float(total_impressions)
        if total_impressions >= 50
        else CTR_PRIOR_MEAN
    )
    prior_mean = _clamp01(prior_mean)

    stats: Dict[str, Dict[str, float]] = {}

    for row in rows:
        product_id = str(
            row.get("product_id")
            or ""
        )

        if not product_id:
            continue

        impressions = max(
            0,
            int(
                row.get("impressions")
                or 0
            ),
        )

        clicks = max(
            0,
            min(
                impressions,
                int(
                    row.get("clicks")
                    or 0
                ),
            ),
        )

        if impressions <= 0:
            continue

        raw_ctr = clicks / float(impressions)

        smoothed_ctr = (
            clicks
            + CTR_PRIOR_STRENGTH * prior_mean
        ) / (
            impressions
            + CTR_PRIOR_STRENGTH
        )

        ctr_score = (
            smoothed_ctr / CTR_SCORE_REFERENCE
            if CTR_SCORE_REFERENCE > 0.0
            else 0.0
        )

        stats[product_id] = {
            "impressions_7d": float(impressions),
            "clicks_7d": float(clicks),
            "clicks_per_day": (
                clicks
                / float(max(1, window_days))
            ),
            "raw_ctr": _clamp01(raw_ctr),
            "smoothed_ctr": _clamp01(smoothed_ctr),
            "prior_ctr": prior_mean,
            "score": _clamp01(ctr_score),
        }

    return stats


def get_product_click_popularity_stats(
    db: Session,
    product_ids: Sequence[str],
    *,
    window_days: int = CLICK_EVENT_WINDOW_DAYS,
) -> Dict[str, Dict[str, float]]:
    """Backward-compatible alias for the historical function name."""

    return get_product_ctr_stats(
        db,
        product_ids,
        window_days=window_days,
    )


# ============================================================
# TREND VELOCITY
# ============================================================

def get_product_trend_velocity_stats(
    db: Session,
    product_ids: Optional[Sequence[str]] = None,
    *,
    current_window_days: int = TREND_VELOCITY_CURRENT_WINDOW_DAYS,
    previous_window_days: int = TREND_VELOCITY_PREVIOUS_WINDOW_DAYS,
) -> Dict[str, Dict[str, float]]:
    """
    Measure whether product interest is accelerating.

    Current interest rate:
        weighted interactions during the most recent window / days

    Previous interest rate:
        weighted interactions during the immediately preceding window / days

    Growth:
        (current_rate - previous_rate)
        / (previous_rate + prior_interest_per_day)

    Only positive growth produces a velocity score. Falling/flat interest gets
    zero velocity, while the existing historical popularity score remains
    available as a fallback/blended component.

    Interest sources:
        Product view -> 1.0
        Click        -> 1.5
        Wishlist     -> 3.0
        Cart         -> 4.0
        Purchase     -> 5.0
    """

    current_days = max(1, int(current_window_days))
    previous_days = max(1, int(previous_window_days))

    requested_ids: Optional[List[str]]
    if product_ids is None:
        requested_ids = None
    else:
        requested_ids = [
            str(product_id)
            for product_id in dict.fromkeys(product_ids)
            if product_id
        ]
        if not requested_ids:
            return {}

    now = datetime.utcnow()
    current_cutoff = now - timedelta(days=current_days)
    previous_cutoff = current_cutoff - timedelta(days=previous_days)

    buckets: Dict[str, Dict[str, float]] = {}

    def _add_interest(
        product_id: object,
        created_at: Optional[datetime],
        weight: float,
    ) -> None:
        if not product_id or created_at is None:
            return

        product_key = str(product_id)

        values = buckets.setdefault(
            product_key,
            {
                "current_interest": 0.0,
                "previous_interest": 0.0,
            },
        )

        if created_at >= current_cutoff:
            values["current_interest"] += float(weight)
        elif created_at >= previous_cutoff:
            values["previous_interest"] += float(weight)

    # UserBehaviour captures the main authenticated behavioral funnel.
    behaviour_query = (
        db.query(
            UserBehaviour.productId,
            UserBehaviour.eventType,
            UserBehaviour.createdAt,
        )
        .filter(
            UserBehaviour.productId.isnot(None),
            UserBehaviour.createdAt >= previous_cutoff,
            UserBehaviour.eventType.in_(
                list(TREND_BEHAVIOUR_EVENT_WEIGHTS.keys())
            ),
        )
    )

    if requested_ids is not None:
        behaviour_query = behaviour_query.filter(
            UserBehaviour.productId.in_(requested_ids)
        )

    for row in behaviour_query.all():
        _add_interest(
            row.productId,
            row.createdAt,
            TREND_BEHAVIOUR_EVENT_WEIGHTS.get(
                row.eventType,
                0.0,
            ),
        )

    # ClickEvent is the canonical click stream and can include anonymous clicks.
    click_query = (
        db.query(
            ClickEvent.productId,
            ClickEvent.createdAt,
        )
        .filter(
            ClickEvent.productId.isnot(None),
            ClickEvent.createdAt >= previous_cutoff,
        )
    )

    if requested_ids is not None:
        click_query = click_query.filter(
            ClickEvent.productId.in_(requested_ids)
        )

    for row in click_query.all():
        _add_interest(
            row.productId,
            row.createdAt,
            TREND_CLICK_INTEREST_WEIGHT,
        )

    stats: Dict[str, Dict[str, float]] = {}

    for product_id, values in buckets.items():
        current_interest = float(
            values.get("current_interest", 0.0)
        )
        previous_interest = float(
            values.get("previous_interest", 0.0)
        )

        current_rate = current_interest / float(current_days)
        previous_rate = previous_interest / float(previous_days)

        rate_delta = current_rate - previous_rate

        growth_rate = (
            rate_delta
            / (
                previous_rate
                + TREND_VELOCITY_PRIOR_INTEREST_PER_DAY
            )
        )

        positive_growth = max(0.0, growth_rate)

        # Smooth bounded mapping: 0 growth -> 0, stronger positive growth -> 1.
        velocity_score = (
            1.0
            - math.exp(-positive_growth)
        )

        stats[product_id] = {
            "current_interest": current_interest,
            "previous_interest": previous_interest,
            "current_interest_per_day": current_rate,
            "previous_interest_per_day": previous_rate,
            "interest_rate_delta": rate_delta,
            "growth_rate": growth_rate,
            "velocity_score": _clamp01(velocity_score),
        }

    return stats


def get_trend_velocity_candidate_ids(
    db: Session,
    *,
    limit: int = TREND_VELOCITY_CANDIDATE_LIMIT,
) -> List[str]:
    """
    Return products whose recent interest is rising the fastest.

    Products with zero/negative velocity are excluded. Historical popularity is
    still supplied by the base CandidateGenerator, so this method specifically
    adds emerging/rising products that total-popularity ranking can miss.
    """

    stats = get_product_trend_velocity_stats(
        db,
        product_ids=None,
    )

    ranked = sorted(
        (
            (product_id, values)
            for product_id, values in stats.items()
            if values.get("velocity_score", 0.0) > 0.0
            and values.get("current_interest", 0.0) > 0.0
        ),
        key=lambda item: (
            float(item[1].get("velocity_score", 0.0)),
            float(item[1].get("current_interest_per_day", 0.0)),
            float(item[1].get("current_interest", 0.0)),
        ),
        reverse=True,
    )

    return [
        product_id
        for product_id, _ in ranked[: max(0, int(limit))]
    ]


# ============================================================
# BUILD USER CLICK PROFILE
# ============================================================

def load_user_click_seeds(
    db: Session,
    user_id: str,
    *,
    window_days: int = CLICK_EVENT_WINDOW_DAYS,
    max_seeds: Optional[int] = None,
) -> List[ClickSeed]:
    """
    Build a profile of what THIS user clicked.

    Example:

        Dual Birthstone Ring       -> 6 clicks
        Pearl Bridal Sash          -> 5 clicks
        Bridal Veil                -> 4 clicks

    Repeated and recent clicks receive higher strength.
    """

    cutoff = (
        datetime.utcnow()
        - timedelta(
            days=window_days
        )
    )


    now = (
        datetime.utcnow()
    )


    rows = (
        db.query(
            ClickEvent.productId,

            func.count(
                ClickEvent.id
            ).label(
                "click_count"
            ),

            func.max(
                ClickEvent.createdAt
            ).label(
                "last_clicked_at"
            ),
        )

        .filter(
            ClickEvent.userId
            == user_id,

            ClickEvent.productId.isnot(
                None
            ),

            ClickEvent.createdAt
            >= cutoff,
        )

        .group_by(
            ClickEvent.productId
        )

        .all()
    )


    if not rows:
        return []


    max_count = max(
        int(
            row.click_count
        )
        for row in rows
    )


    frequency_denominator = (
        math.log1p(
            max_count
        )
        if max_count > 0
        else 1.0
    )


    product_ids = [

        str(
            row.productId
        )

        for row in rows

        if row.productId
    ]


    products = (
        db.query(
            Product
        )

        .options(
            joinedload(
                Product.images
            ),

            joinedload(
                Product.seller
            ),

            joinedload(
                Product.category
            ),
        )

        .filter(
            Product.id.in_(
                product_ids
            )
        )

        .all()
    )


    product_map = {

        product.id:
            product

        for product in products
    }


    seeds: List[
        ClickSeed
    ] = []


    for row in rows:

        product_id = str(
            row.productId
        )


        product = (
            product_map.get(
                product_id
            )
        )


        last_clicked_at = (
            row.last_clicked_at
        )


        if (
            product is None
            or last_clicked_at is None
        ):
            continue


        click_count = int(
            row.click_count
        )


        if (
            frequency_denominator
            > 0.0
        ):

            frequency = (
                math.log1p(
                    click_count
                )
                /
                frequency_denominator
            )

        else:

            frequency = 0.0


        recency = (
            _recency_score(
                last_clicked_at,
                now,
            )
        )


        # Repeated clicks slightly outweigh recency.
        #
        # 60% frequency
        # 40% recency

        strength = _clamp01(
            (
                0.60
                * frequency
            )
            +
            (
                0.40
                * recency
            )
        )


        seeds.append(

            ClickSeed(

                product=
                    product,

                click_count=
                    click_count,

                last_clicked_at=
                    last_clicked_at,

                frequency_score=
                    _clamp01(
                        frequency
                    ),

                recency_score=
                    recency,

                strength=
                    strength,
            )
        )


    seeds.sort(

        key=lambda seed: (

            seed.strength,

            seed.click_count,

            seed.last_clicked_at,
        ),

        reverse=True,
    )


    if max_seeds is not None:

        seeds = (
            seeds[
                :max_seeds
            ]
        )


    return seeds


# ============================================================
# USER CLICK AFFINITY
# ============================================================

def compute_user_click_affinity(
    candidate: Product,
    seeds: Sequence[ClickSeed],
) -> Dict[str, object]:
    """
    Calculate how strongly the candidate matches this user's clicks.

    IMPORTANT:

    Candidate does NOT need its own ClickEvent.

    Example:

        User clicks:
            Birthstone Ring
            Pearl Sash
            Paw Print Ring

        Candidate:
            Crystal Birthstone Necklace

    Candidate can receive a high score because it is semantically /
    categorically similar to what the user clicked.
    """

    if not seeds:

        return {
            "score": 0.0,
            "semantic": 0.0,
            "category": 0.0,
            "brand": 0.0,
            "frequency_recency": 0.0,
            "matched_product_id": None,
            "matched_product_name": None,
        }


    candidate_brand = (
        _normalise_brand(
            getattr(
                candidate,
                "brand",
                None,
            )
        )
    )


    semantic_component = 0.0

    category_component = 0.0

    brand_component = 0.0

    behaviour_component = 0.0


    best_match_score = 0.0

    best_seed: Optional[
        ClickSeed
    ] = None


    for seed in seeds:

        seed_product = (
            seed.product
        )


        # ----------------------------------------------------
        # Semantic similarity
        # ----------------------------------------------------

        semantic = (
            _cosine_similarity(

                getattr(
                    candidate,
                    "embedding",
                    None,
                ),

                getattr(
                    seed_product,
                    "embedding",
                    None,
                ),
            )
        )


        # ----------------------------------------------------
        # Category similarity
        # ----------------------------------------------------

        same_category = bool(

            candidate.categoryId

            and seed_product.categoryId

            and candidate.categoryId
            == seed_product.categoryId
        )


        # ----------------------------------------------------
        # Brand similarity
        # ----------------------------------------------------

        seed_brand = (
            _normalise_brand(
                getattr(
                    seed_product,
                    "brand",
                    None,
                )
            )
        )


        same_brand = bool(

            candidate_brand

            and seed_brand

            and candidate_brand
            == seed_brand
        )


        # ----------------------------------------------------
        # Semantic component
        # ----------------------------------------------------

        semantic_component = max(
            semantic_component,
            semantic,
        )


        # ----------------------------------------------------
        # Category component
        # ----------------------------------------------------

        if same_category:

            category_component = max(
                category_component,
                seed.strength,
            )


        # ----------------------------------------------------
        # Brand component
        # ----------------------------------------------------

        if same_brand:

            brand_component = max(
                brand_component,
                seed.strength,
            )


        # ----------------------------------------------------
        # Frequency + Recency component
        #
        # Only counts if candidate is actually related to seed.
        # ----------------------------------------------------

        relatedness = max(

            semantic,

            (
                1.0
                if same_category
                else 0.0
            ),

            (
                1.0
                if same_brand
                else 0.0
            ),
        )


        related_behaviour = (
            seed.strength
            * relatedness
        )


        behaviour_component = max(
            behaviour_component,
            related_behaviour,
        )


        # ----------------------------------------------------
        # Find best clicked product for explanation
        # ----------------------------------------------------

        match_score = (

            (
                0.55
                * semantic
            )

            +

            (
                0.25
                if same_category
                else 0.0
            )

            +

            (
                0.20
                if same_brand
                else 0.0
            )

        ) * seed.strength


        if (
            match_score
            > best_match_score
            and match_score > 0.0
        ):

            best_match_score = (
                match_score
            )

            best_seed = (
                seed
            )


    weights = (
        USER_CLICK_AFFINITY_COMPONENT_WEIGHTS
    )


    final_affinity = (

        weights[
            "semantic"
        ]
        * semantic_component

        +

        weights[
            "category"
        ]
        * category_component

        +

        weights[
            "brand"
        ]
        * brand_component

        +

        weights[
            "frequency_recency"
        ]
        * behaviour_component
    )


    return {

        "score":
            _clamp01(
                final_affinity
            ),

        "semantic":
            _clamp01(
                semantic_component
            ),

        "category":
            _clamp01(
                category_component
            ),

        "brand":
            _clamp01(
                brand_component
            ),

        "frequency_recency":
            _clamp01(
                behaviour_component
            ),

        "matched_product_id":
            (
                best_seed.product.id
                if best_seed
                else None
            ),

        "matched_product_name":
            (
                best_seed.product.name
                if best_seed
                else None
            ),
    }


# ============================================================
# CLICK-AWARE CANDIDATE GENERATOR
# ============================================================

class ClickAwareCandidateGenerator(
    CandidateGenerator
):
    """
    Adds explicit recommendation candidates based on clicked products.

    This is important.

    Clicks now affect:

        1. Candidate generation
        2. Candidate scoring
    """


    def _get_recent_interacted_products(
        self,
        user_id: str,
        limit: int = 5,
    ) -> List[Product]:
        """
        Existing interactions + ClickEvent.
        """

        recent_events: List[
            Tuple[
                datetime,
                str,
            ]
        ] = []


        # ----------------------------------------------------
        # ClickEvent interactions
        # ----------------------------------------------------

        click_rows = (
            self.db.query(
                ClickEvent
            )

            .filter(
                ClickEvent.userId
                == user_id,

                ClickEvent.productId.isnot(
                    None
                ),
            )

            .order_by(
                ClickEvent.createdAt.desc()
            )

            .limit(
                limit * 4
            )

            .all()
        )


        for event in click_rows:

            if event.productId:

                recent_events.append(
                    (
                        event.createdAt,
                        event.productId,
                    )
                )


        # ----------------------------------------------------
        # Existing UserBehaviour interactions
        # ----------------------------------------------------

        behaviour_rows = (
            self.db.query(
                UserBehaviour
            )

            .filter(
                UserBehaviour.userId
                == user_id,

                UserBehaviour.productId.isnot(
                    None
                ),

                UserBehaviour.eventType.in_(
                    [
                        EVENT_PRODUCT_VIEW,
                        EVENT_CART,
                        EVENT_PURCHASE,
                        EVENT_WISHLIST,
                    ]
                ),
            )

            .order_by(
                UserBehaviour.createdAt.desc()
            )

            .limit(
                limit * 4
            )

            .all()
        )


        for event in behaviour_rows:

            if event.productId:

                recent_events.append(
                    (
                        event.createdAt,
                        event.productId,
                    )
                )


        if not recent_events:
            return []


        recent_events.sort(
            key=lambda item:
                item[0],
            reverse=True,
        )


        ordered_ids: List[
            str
        ] = []


        seen_ids = set()


        for (
            _,
            product_id,
        ) in recent_events:

            if (
                product_id
                in seen_ids
            ):
                continue


            seen_ids.add(
                product_id
            )


            ordered_ids.append(
                product_id
            )


            if (
                len(
                    ordered_ids
                )
                >= limit
            ):
                break


        products = (
            self.db.query(
                Product
            )

            .options(
                joinedload(
                    Product.images
                )
            )

            .filter(
                Product.id.in_(
                    ordered_ids
                )
            )

            .all()
        )


        product_map = {

            product.id:
                product

            for product in products
        }


        return [

            product_map[
                product_id
            ]

            for product_id
            in ordered_ids

            if product_id
            in product_map
        ]


    def generate(
        self,
        user_id: str,
    ) -> List[
        Tuple[
            Product,
            str,
        ]
    ]:
        activity_profile = get_user_activity_profile(self.db, user_id)

        # Completely cold users still use the existing diversified cold-start
        # candidate strategy. We continue through this method so global
        # trend-velocity candidates can also be considered.
        if activity_profile.activity_stage == STAGE_COMPLETELY_COLD:
            candidates = generate_cold_start_candidates(
                self.db,
                self.config,
                user_id,
            )
        else:
            # Early, emerging, developing or warm user -> generate base candidates
            candidates = (
                super().generate(
                    user_id
                )
            )

        seen = {
            product.id
            for (
                product,
                _,
            ) in candidates
        }

        # Include cold-start candidates for early/emerging/developing users to guarantee multi-source variety
        if activity_profile.activity_stage in (
            STAGE_EARLY_SIGNAL,
            STAGE_EMERGING_PROFILE,
            STAGE_DEVELOPING_PROFILE,
        ):
            cold_candidates = generate_cold_start_candidates(
                self.db,
                self.config,
                user_id,
            )
            for product, source in cold_candidates:
                if product.id not in seen:
                    seen.add(product.id)
                    candidates.append((product, source))

        # ----------------------------------------------------
        # Rising-interest / trend-velocity candidates
        # ----------------------------------------------------
        velocity_candidate_ids = get_trend_velocity_candidate_ids(
            self.db,
            limit=TREND_VELOCITY_CANDIDATE_LIMIT,
        )

        if velocity_candidate_ids:
            velocity_products = (
                self.db.query(Product)
                .options(
                    joinedload(Product.images),
                    joinedload(Product.seller),
                    joinedload(Product.category),
                )
                .filter(
                    Product.id.in_(velocity_candidate_ids)
                )
                .all()
            )

            velocity_product_map = {
                product.id: product
                for product in velocity_products
            }

            # Preserve the global velocity ranking returned above.
            for product_id in velocity_candidate_ids:
                product = velocity_product_map.get(product_id)

                if (
                    product is None
                    or product.id in seen
                ):
                    continue

                seen.add(product.id)
                candidates.append(
                    (
                        product,
                        "trend_velocity",
                    )
                )

        # ----------------------------------------------------
        # Strongest recently clicked products
        # ----------------------------------------------------

        seeds = (
            load_user_click_seeds(
                self.db,
                user_id,
                max_seeds=
                    CLICK_AFFINITY_MAX_SEEDS,
            )
        )

        # ----------------------------------------------------
        # Add semantically similar products
        # ----------------------------------------------------

        for seed in seeds:
            similar_products = (
                get_similar_products(
                    seed.product.id,
                    self.db,
                    limit=
                        CLICK_AFFINITY_CANDIDATES_PER_SEED,
                )
            )

            for product in (
                similar_products
            ):
                if (
                    product.id
                    in seen
                ):
                    continue

                seen.add(
                    product.id
                )

                candidates.append(
                    (
                        product,
                        "click_affinity",
                    )
                )

        return candidates


# ============================================================
# CLICK-AWARE FEATURE COMPUTER
# ============================================================

class ClickAwareFeatureComputer(
    FeatureComputer
):
    """
    Existing recommendation features +
    True Recommendation CTR +
    User Click Affinity.
    """


    _SOURCE_CONTENT_SCORES = dict(
        FeatureComputer
        ._SOURCE_CONTENT_SCORES
    )


    _SOURCE_CONTENT_SCORES[
        "click_affinity"
    ] = 0.75


    # Trend-velocity is a discovery source rather than semantic similarity.
    # Keep content at zero so velocity is counted only through the existing
    # "trending" feature and is not accidentally double-counted.
    _SOURCE_CONTENT_SCORES[
        "trend_velocity"
    ] = 0.0


    def __init__(
        self,
        db: Session,
        config: EngineConfig,
    ):

        super().__init__(
            db,
            config,
        )


        self.latest_product_click_stats: Dict[
            str,
            Dict[
                str,
                float,
            ],
        ] = {}


    # --------------------------------------------------------
    # TRUE RECOMMENDATION CTR
    # --------------------------------------------------------

    def _get_product_click_rate_scores(
        self,
        product_ids: List[str],
    ) -> Dict[str, float]:
        """
        Compute a true recommendation CTR feature.

        Denominator = actually visible recommendation impressions.
        Numerator   = genuine product-discovery clicks from those impressions.
        """

        self.latest_product_click_stats = (
            get_product_ctr_stats(

                self.db,

                product_ids,

                window_days=
                    CLICK_EVENT_WINDOW_DAYS,
            )
        )


        return {

            product_id:
                values[
                    "score"
                ]

            for (
                product_id,
                values,
            )
            in
            self
            .latest_product_click_stats
            .items()
        }


    def compute(
        self,
        candidates: List[
            Tuple[
                Product,
                str,
            ]
        ],
        user_id: str,
        recent_views: Optional[
            List[
                ProductView
            ]
        ] = None,
    ) -> List[
        ScoredProduct
    ]:
        """
        Compute standard scores first, then add personalized click affinity.
        """


        scored_products = (
            super().compute(
                candidates,
                user_id,
                recent_views=
                    recent_views,
            )
        )


        # ----------------------------------------------------
        # Trend velocity
        # ----------------------------------------------------
        trend_stats = get_product_trend_velocity_stats(
            self.db,
            [
                scored_product.product.id
                for scored_product in scored_products
            ],
        )

        for scored_product in scored_products:
            product_id = scored_product.product.id

            # This is the original historical-popularity trend score computed
            # by FeatureComputer. Preserve it for diagnostics and fallback.
            popularity_trend_score = _clamp01(
                float(
                    getattr(
                        scored_product,
                        "trend_score",
                        0.0,
                    )
                    or 0.0
                )
            )

            velocity = trend_stats.get(
                product_id,
                {},
            )

            if velocity:
                velocity_score = _clamp01(
                    float(
                        velocity.get(
                            "velocity_score",
                            0.0,
                        )
                    )
                )

                combined_trend_score = _clamp01(
                    TREND_VELOCITY_WEIGHT
                    * velocity_score
                    + TREND_POPULARITY_WEIGHT
                    * popularity_trend_score
                )
            else:
                # No recent behavior -> preserve old trending behavior exactly.
                velocity_score = 0.0
                combined_trend_score = popularity_trend_score

            scored_product.trend_score = combined_trend_score

            setattr(
                scored_product,
                "trend_popularity_score",
                popularity_trend_score,
            )
            setattr(
                scored_product,
                "trend_velocity_score",
                velocity_score,
            )
            setattr(
                scored_product,
                "trend_current_interest",
                float(
                    velocity.get(
                        "current_interest",
                        0.0,
                    )
                ),
            )
            setattr(
                scored_product,
                "trend_previous_interest",
                float(
                    velocity.get(
                        "previous_interest",
                        0.0,
                    )
                ),
            )
            setattr(
                scored_product,
                "trend_current_interest_per_day",
                float(
                    velocity.get(
                        "current_interest_per_day",
                        0.0,
                    )
                ),
            )
            setattr(
                scored_product,
                "trend_previous_interest_per_day",
                float(
                    velocity.get(
                        "previous_interest_per_day",
                        0.0,
                    )
                ),
            )
            setattr(
                scored_product,
                "trend_interest_rate_delta",
                float(
                    velocity.get(
                        "interest_rate_delta",
                        0.0,
                    )
                ),
            )
            setattr(
                scored_product,
                "trend_growth_rate",
                float(
                    velocity.get(
                        "growth_rate",
                        0.0,
                    )
                ),
            )


        # ----------------------------------------------------
        # User's strongest clicked products
        # ----------------------------------------------------

        user_click_seeds = (
            load_user_click_seeds(

                self.db,

                user_id,

                max_seeds=
                    CLICK_AFFINITY_MAX_SEEDS,
            )
        )


        # ----------------------------------------------------
        # Calculate affinity for each candidate
        # ----------------------------------------------------

        for scored_product in (
            scored_products
        ):

            product_id = (
                scored_product
                .product
                .id
            )


            popularity_stats = (
                self
                .latest_product_click_stats
                .get(
                    product_id,
                    {},
                )
            )


            affinity = (
                compute_user_click_affinity(

                    scored_product.product,

                    user_click_seeds,
                )
            )


            # ------------------------------------------------
            # True recommendation CTR diagnostics
            # ------------------------------------------------

            setattr(

                scored_product,

                "product_clicks_7d",

                int(
                    popularity_stats.get(
                        "clicks_7d",
                        0.0,
                    )
                ),
            )


            setattr(

                scored_product,

                "product_clicks_per_day",

                float(
                    popularity_stats.get(
                        "clicks_per_day",
                        0.0,
                    )
                ),
            )


            setattr(

                scored_product,

                "product_impressions_7d",

                int(
                    popularity_stats.get(
                        "impressions_7d",
                        0.0,
                    )
                ),
            )


            setattr(

                scored_product,

                "product_ctr",

                float(
                    popularity_stats.get(
                        "raw_ctr",
                        0.0,
                    )
                ),
            )


            setattr(

                scored_product,

                "product_ctr_smoothed",

                float(
                    popularity_stats.get(
                        "smoothed_ctr",
                        0.0,
                    )
                ),
            )


            setattr(

                scored_product,

                "product_ctr_prior",

                float(
                    popularity_stats.get(
                        "prior_ctr",
                        CTR_PRIOR_MEAN,
                    )
                ),
            )


            setattr(

                scored_product,

                "product_ctr_score",

                float(
                    popularity_stats.get(
                        "score",
                        0.0,
                    )
                ),
            )


            # ------------------------------------------------
            # Personalized click affinity
            # ------------------------------------------------

            setattr(

                scored_product,

                "user_click_affinity_score",

                float(
                    affinity[
                        "score"
                    ]
                ),
            )


            setattr(

                scored_product,

                "user_click_affinity_semantic",

                float(
                    affinity[
                        "semantic"
                    ]
                ),
            )


            setattr(

                scored_product,

                "user_click_affinity_category",

                float(
                    affinity[
                        "category"
                    ]
                ),
            )


            setattr(

                scored_product,

                "user_click_affinity_brand",

                float(
                    affinity[
                        "brand"
                    ]
                ),
            )


            setattr(

                scored_product,

                "user_click_affinity_frequency_recency",

                float(
                    affinity[
                        "frequency_recency"
                    ]
                ),
            )


            setattr(

                scored_product,

                "matched_clicked_product_id",

                affinity[
                    "matched_product_id"
                ],
            )


            setattr(

                scored_product,

                "matched_clicked_product_name",

                affinity[
                    "matched_product_name"
                ],
            )


        return scored_products


# ============================================================
# SCORE BLENDER
# ============================================================

class ClickAwareScoreBlender:
    """
    Blend 12 recommendation signals.

    Includes:
        True Recommendation CTR
        Trend Velocity inside the existing trending feature
        User Click Affinity
    """


    def __init__(
        self,
        weights: Dict[
            str,
            float,
        ],
    ):

        total = sum(
            weights.values()
        )


        if total <= 0.0:

            raise ValueError(
                "Recommendation weights must sum to a positive value."
            )


        self.weights = {

            key:
                value
                / total

            for (
                key,
                value,
            ) in weights.items()
        }


    def blend(
        self,
        candidates: List[
            ScoredProduct
        ],
        db: Optional[Session] = None,
        config: Optional[EngineConfig] = None,
        user_id: Optional[str] = None,
        price_profile: Optional[UserPriceProfile] = None,
    ) -> List[
        ScoredProduct
    ]:
        w = (
            self.weights
        )

        activity_profile = (
            get_user_activity_profile(db, user_id)
            if (db is not None and user_id is not None)
            else None
        )

        cold_scores_map = (
            compute_cold_start_scores(candidates, db, config)
            if (db is not None and config is not None)
            else {}
        )

        if price_profile is None and db is not None and user_id is not None:
            price_profile = build_user_price_profile(db, user_id)

        for sp in candidates:
            user_click_affinity = float(
                getattr(
                    sp,
                    "user_click_affinity_score",
                    0.0,
                )
                or 0.0
            )

            # Compute candidate price affinity score
            cand_price = compute_candidate_price_affinity(sp.product, price_profile)
            sp.price_affinity_score = cand_price.price_affinity_score
            sp.price_affinity_confidence = cand_price.price_affinity_confidence
            sp.price_distance = cand_price.price_distance
            sp.price_is_in_range = cand_price.is_in_range
            sp.preferred_price = cand_price.preferred_price
            sp.preferred_price_lower = cand_price.lower_price
            sp.preferred_price_upper = cand_price.upper_price

            blended_personalized = (
                w.get(
                    "content",
                    0.0,
                )
                * sp.content_score
                + w.get(
                    "collaborative",
                    0.0,
                )
                * sp.collab_score
                + w.get(
                    "trending",
                    0.0,
                )
                * sp.trend_score
                + w.get(
                    "seasonal",
                    0.0,
                )
                * sp.seasonal_boost
                + w.get(
                    "location",
                    0.0,
                )
                * sp.location_boost
                + w.get(
                    "category_affinity",
                    0.0,
                )
                * sp.category_boost
                + w.get(
                    "brand_affinity",
                    0.0,
                )
                * sp.brand_boost
                + w.get(
                    "rating",
                    0.0,
                )
                * sp.rating_score
                + w.get(
                    "seller_freshness",
                    0.0,
                )
                * sp.seller_boost
                + w.get(
                    "click_rate",
                    0.0,
                )
                * sp.click_rate_score
                + w.get(
                    "user_click_affinity",
                    0.0,
                )
                * user_click_affinity
                + w.get(
                    "engagement",
                    0.0,
                )
                * sp.engagement_score
                + w.get(
                    "price_affinity",
                    0.0,
                )
                * sp.price_affinity_score
            )

            pers_score = _clamp01(blended_personalized)
            sp.personalized_score = pers_score

            cold_info = cold_scores_map.get(sp.product.id)
            if cold_info:
                sp.cold_start_score = cold_info.cold_start_score
                sp.cold_start_scores = cold_info
            else:
                sp.cold_start_score = pers_score
                sp.cold_start_scores = None

            if activity_profile is not None:
                sp.cold_start_weight = activity_profile.cold_start_weight
                sp.personalized_weight = activity_profile.personalized_weight
                sp.user_activity_stage = activity_profile.activity_stage
                sp.user_activity_count = activity_profile.total_interactions
                sp.recommendation_mode = activity_profile.recommendation_mode

                # Progressive blending: FinalScore = W_cold * S_cold + W_pers * S_pers
                final = (
                    activity_profile.cold_start_weight * sp.cold_start_score
                    + activity_profile.personalized_weight * pers_score
                )
                sp.final_score = _clamp01(final)
            else:
                sp.final_score = pers_score

        return candidates


# ============================================================
# EXPLANATION
# ============================================================

class ClickAwareRankerSelector(
    RankerSelector
):

    @staticmethod
    def _build_explanation(
        sp: ScoredProduct,
    ) -> str:
        if (
            getattr(
                sp,
                "location_priority_applied",
                False,
            )
            and getattr(
                sp,
                "seller_distance_km",
                None,
            ) is not None
        ):
            return (
                f"Nearby seller — {sp.seller_distance_km:.1f} km away."
            )

        # If user is in cold start or product comes from cold candidate generation
        activity_stage = getattr(sp, "user_activity_stage", None)
        product_source = getattr(sp, "source", "") or ""
        cold_info = getattr(sp, "cold_start_scores", None)

        if activity_stage == STAGE_COMPLETELY_COLD or product_source.startswith("cold_"):
            if cold_info and getattr(cold_info, "explanation", None):
                return cold_info.explanation

        affinity = float(
            getattr(
                sp,
                "user_click_affinity_score",
                0.0,
            )
            or 0.0
        )

        if affinity >= 0.55 and activity_stage != STAGE_COMPLETELY_COLD:
            return (
                "Based on products you've been clicking recently."
            )

        trend_velocity_score = float(
            getattr(
                sp,
                "trend_velocity_score",
                0.0,
            )
            or 0.0
        )

        if (
            trend_velocity_score >= 0.55
            and activity_stage != STAGE_COMPLETELY_COLD
        ):
            return (
                "Trending fast — shopper interest is rising."
            )

        if cold_info and getattr(cold_info, "explanation", None) and activity_stage in (STAGE_EARLY_SIGNAL, STAGE_EMERGING_PROFILE):
            # If personalized score is negligible, prefer cold-start explanation
            if getattr(sp, "personalized_score", 0.0) < 0.15:
                return cold_info.explanation

        return (
            RankerSelector
            ._build_explanation(
                sp
            )
        )


# ============================================================
# COMPLETE RECOMMENDATION ENGINE
# ============================================================

class ClickPersonalizedRecommendationEngine:
    """
    Full recommendation pipeline:

        Candidate generation (Personalized + Cold-Start)
                ↓
        Existing features
                +
        Trend Velocity (inside the existing trending feature)
                +
        True Recommendation CTR
                +
        User Click Affinity
                ↓
        Progressive Cold-Start / Personalized Blending
        Dynamic NEW / ACTIVE / RETURNING weights
                +
        learned LTR feature importance (when trained)
                ↓
        Weighted blending
                ↓
        Business rules
                ↓
        Final ranking
    """

    def __init__(
        self,
        db: Session,
    ):
        self.db = db


    def recommend(
        self,
        user_id: str,
        *,
        limit: int = 20,
        user_location: Optional[str] = None,
        user_city_id: Optional[str] = None,
        user_state_id: Optional[str] = None,
        user_latitude: Optional[float] = None,
        user_longitude: Optional[float] = None,
        weights: Optional[
            Dict[
                str,
                float,
            ]
        ] = None,
        include_random: bool = True,
        **rule_overrides,
    ) -> List[
        ScoredProduct
    ]:
        merged_weights = dict(
            PERSONALIZED_CLICK_WEIGHTS
        )

        if weights:
            merged_weights.update(
                weights
            )


        # ====================================================
        # DYNAMIC WEIGHT RESOLUTION / LEARNING TO RANK
        # ====================================================
        # The resolver first profiles the user as NEW, ACTIVE, or RETURNING.
        # It applies a segment prior and, when an offline-trained ranker model
        # exists, blends the ranker's learned gain importance into the live
        # scoring weights.  The resulting dictionary remains normalized to 1.
        dynamic_weights_enabled = bool(
            rule_overrides.pop(
                "dynamic_weights_enabled",
                True,
            )
        )

        weight_context = (
            DynamicWeightResolver(
                enabled=dynamic_weights_enabled
            )
            .resolve(
                self.db,
                user_id,
                merged_weights,
            )
        )


        config = EngineConfig(
            weights=
                weight_context.weights,

            total_slots=
                limit,
            include_random=
                include_random,
            user_location=
                user_location,
            user_city_id=
                user_city_id,
            user_state_id=
                user_state_id,
            user_latitude=
                user_latitude,
            user_longitude=
                user_longitude,
            **rule_overrides,
        )

        # ====================================================
        # STAGE 1
        # Candidate Generation
        # ====================================================

        generator = (
            ClickAwareCandidateGenerator(
                self.db,
                config,
            )
        )

        candidates = (
            generator.generate(
                user_id
            )
        )

        # ====================================================
        # STAGE 2
        # Feature Calculation
        # ====================================================

        computer = (
            ClickAwareFeatureComputer(
                self.db,
                config,
            )
        )

        scored = (
            computer.compute(
                candidates,
                user_id,
            )
        )

        # ====================================================
        # STAGE 3
        # Progressive Cold-Start / Personalized Blending
        # ====================================================

        # Precompute user price profile once per recommendation call
        price_profile = build_user_price_profile(self.db, user_id)

        blender = (
            ClickAwareScoreBlender(
                config.weights
            )
        )

        scored = (
            blender.blend(
                scored,
                db=self.db,
                config=config,
                user_id=user_id,
                price_profile=price_profile,
            )
        )


        # ====================================================
        # STAGE 4
        # Existing Business Rules
        # ====================================================

        rule_filter = (
            BusinessRuleFilter(
                self.db,
                config,
            )
        )


        scored = (
            rule_filter.apply(
                scored,
                user_id,
            )
        )


        # ====================================================
        # STAGE 5
        # Ranking
        # ====================================================

        selector = (
            ClickAwareRankerSelector(
                config.total_slots,
                config=config,
            )
        )


        ranked = (
            selector.select(
                scored
            )
        )


        # Attach one request-level weight context to every returned product.
        # This preserves the existing public return type (List[ScoredProduct])
        # while allowing the API and audit logger to persist the exact dynamic
        # weights that produced this ranking.
        for scored_product in ranked:

            setattr(
                scored_product,
                "effective_weights",
                dict(weight_context.weights),
            )

            setattr(
                scored_product,
                "user_segment",
                weight_context.user_segment,
            )

            setattr(
                scored_product,
                "weight_strategy",
                weight_context.strategy,
            )

            setattr(
                scored_product,
                "ltr_model_version",
                weight_context.ltr_model_version,
            )

            setattr(
                scored_product,
                "ltr_backend",
                weight_context.ltr_backend,
            )

            setattr(
                scored_product,
                "ltr_model_source",
                weight_context.model_source,
            )

            setattr(
                scored_product,
                "user_activity_profile",
                weight_context.activity_profile.as_dict(),
            )


        return ranked


# ============================================================
# PUBLIC FUNCTION
# ============================================================

def get_recommendations_from_click_events(
    db: Session,
    user_id: str,
    *,
    limit: int = 20,
    user_location: Optional[str] = None,
    user_city_id: Optional[str] = None,
    user_state_id: Optional[str] = None,
    user_latitude: Optional[float] = None,
    user_longitude: Optional[float] = None,
    weights: Optional[
        Dict[
            str,
            float,
        ]
    ] = None,
    include_random: bool = True,
    **rule_overrides,
) -> List[
    ScoredProduct
]:

    engine = (
        ClickPersonalizedRecommendationEngine(
            db
        )
    )


    return engine.recommend(

        user_id,

        limit=
            limit,

        user_location=
            user_location,

        user_city_id=
            user_city_id,

        user_state_id=
            user_state_id,

        user_latitude=
            user_latitude,

        user_longitude=
            user_longitude,

        weights=
            weights,

        include_random=
            include_random,

        **rule_overrides,
    )