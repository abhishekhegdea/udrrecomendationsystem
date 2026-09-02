"""
ClickEvent-driven recommendation extension for UdrCrafts.

This module adds TWO separate click signals:

1. Product Click Popularity (4%)
   - Measures how much the candidate product itself was clicked by all users
     during the last 7 days.

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

from sqlalchemy import func
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


# ============================================================
# CONFIGURATION
# ============================================================

CLICK_EVENT_WINDOW_DAYS = 7

CLICK_AFFINITY_RECENCY_HALFLIFE_DAYS = 2.0

CLICK_AFFINITY_MAX_SEEDS = 5

CLICK_AFFINITY_CANDIDATES_PER_SEED = 10


# ============================================================
# FINAL RECOMMENDATION WEIGHTS
# ============================================================

# Total = 1.00
#
# click_rate is retained internally for backward compatibility.
# It now means:
#
#     Product Click Popularity
#
# User Click Affinity is a new independent personalised KPI.

PERSONALIZED_CLICK_WEIGHTS: Dict[str, float] = {
    "content": 0.12,
    "collaborative": 0.10,
    "trending": 0.08,
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
    "engagement": 0.13,
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
# PRODUCT CLICK POPULARITY
# ============================================================

def get_product_click_popularity_stats(
    db: Session,
    product_ids: Sequence[str],
    *,
    window_days: int = CLICK_EVENT_WINDOW_DAYS,
) -> Dict[str, Dict[str, float]]:
    """
    GLOBAL product click popularity.

    Uses ClickEvent from ALL users.

    Formula:

        clicks_per_day =
            clicks_last_7_days / 7

        click_score =
            log(1 + clicks_per_day)
            -----------------------
            log(1 + max_candidate_clicks_per_day)

    This is NOT true CTR because impressions are not currently stored.
    """

    unique_ids = list(
        dict.fromkeys(
            product_ids
        )
    )


    if not unique_ids:
        return {}


    cutoff = (
        datetime.utcnow()
        - timedelta(
            days=window_days
        )
    )


    rows = (
        db.query(
            ClickEvent.productId,

            func.count(
                ClickEvent.id
            ).label(
                "click_count"
            ),
        )

        .filter(
            ClickEvent.productId.in_(
                unique_ids
            ),

            ClickEvent.createdAt
            >= cutoff,
        )

        .group_by(
            ClickEvent.productId
        )

        .all()
    )


    click_counts = {

        str(
            row.productId
        ):
        int(
            row.click_count
        )

        for row in rows

        if row.productId
        is not None
    }


    if not click_counts:
        return {}


    rates = {

        product_id:
        count
        / float(
            window_days
        )

        for (
            product_id,
            count,
        ) in click_counts.items()
    }


    max_rate = max(
        rates.values(),
        default=0.0,
    )


    denominator = (
        math.log1p(
            max_rate
        )
        if max_rate > 0.0
        else 0.0
    )


    stats: Dict[
        str,
        Dict[str, float],
    ] = {}


    for (
        product_id,
        count,
    ) in click_counts.items():

        rate = rates[
            product_id
        ]


        if denominator > 0.0:

            score = (
                math.log1p(
                    rate
                )
                /
                denominator
            )

        else:

            score = 0.0


        stats[
            product_id
        ] = {

            "clicks_7d":
                float(
                    count
                ),

            "clicks_per_day":
                float(
                    rate
                ),

            "score":
                _clamp01(
                    score
                ),
        }


    return stats


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

        # ----------------------------------------------------
        # Existing recommendation candidates
        # ----------------------------------------------------

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
    Product Click Popularity +
    User Click Affinity.
    """


    _SOURCE_CONTENT_SCORES = dict(
        FeatureComputer
        ._SOURCE_CONTENT_SCORES
    )


    _SOURCE_CONTENT_SCORES[
        "click_affinity"
    ] = 0.75


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
    # PRODUCT CLICK POPULARITY
    # --------------------------------------------------------

    def _get_product_click_rate_scores(
        self,
        product_ids: List[str],
    ) -> Dict[str, float]:
        """
        Override original ProductClickHistory implementation.

        We now use ClickEvent.
        """

        self.latest_product_click_stats = (
            get_product_click_popularity_stats(

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
            # Global Product Click Popularity diagnostics
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
        Product Click Popularity
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
    ) -> List[
        ScoredProduct
    ]:

        w = (
            self.weights
        )


        for sp in candidates:

            user_click_affinity = float(

                getattr(
                    sp,
                    "user_click_affinity_score",
                    0.0,
                )

                or 0.0
            )


            blended = (

                w.get(
                    "content",
                    0.0,
                )
                * sp.content_score

                +

                w.get(
                    "collaborative",
                    0.0,
                )
                * sp.collab_score

                +

                w.get(
                    "trending",
                    0.0,
                )
                * sp.trend_score

                +

                w.get(
                    "seasonal",
                    0.0,
                )
                * sp.seasonal_boost

                +

                w.get(
                    "location",
                    0.0,
                )
                * sp.location_boost

                +

                w.get(
                    "category_affinity",
                    0.0,
                )
                * sp.category_boost

                +

                w.get(
                    "brand_affinity",
                    0.0,
                )
                * sp.brand_boost

                +

                w.get(
                    "rating",
                    0.0,
                )
                * sp.rating_score

                +

                w.get(
                    "seller_freshness",
                    0.0,
                )
                * sp.seller_boost

                +

                w.get(
                    "click_rate",
                    0.0,
                )
                * sp.click_rate_score

                +

                w.get(
                    "user_click_affinity",
                    0.0,
                )
                * user_click_affinity

                +

                w.get(
                    "engagement",
                    0.0,
                )
                * sp.engagement_score
            )


            sp.final_score = (
                _clamp01(
                    blended
                )
            )


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

        affinity = float(

            getattr(
                sp,
                "user_click_affinity_score",
                0.0,
            )

            or 0.0
        )


        if affinity >= 0.55:

            return (
                "Based on products you've been clicking recently."
            )


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

        Candidate generation
                ↓
        Existing features
                +
        Product Click Popularity
                +
        User Click Affinity
                ↓
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
        # Weighted Blending
        # ====================================================

        blender = (
            ClickAwareScoreBlender(
                config.weights
            )
        )


        scored = (
            blender.blend(
                scored
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