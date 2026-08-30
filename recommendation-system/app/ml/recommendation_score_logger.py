"""
Recommendation score audit persistence for UdrCrafts.

This module stores one database record for every personalized recommendation
execution and one score snapshot for every product returned by that execution.

The purpose is auditability and debugging.  A snapshot makes it possible to
inspect, directly in PostgreSQL, all of the raw feature values used for a
product, each weighted contribution, the score before business rules, the net
business-rule adjustment, and the final score shown by the recommendation
engine.

Database layout
---------------

RecommendationRun
    |
    +-- RecommendationScoreSnapshot (rank 1)
    +-- RecommendationScoreSnapshot (rank 2)
    +-- RecommendationScoreSnapshot (rank 3)
    +-- ...

All score values are persisted as decimal values in the same scale used by the
recommendation engine.  For example, 0.93264 means 93.264% and a contribution
of 0.093264 means 9.3264 percentage points of the final weighted score.
"""

from __future__ import annotations

import uuid

from datetime import (
    datetime,
    timedelta,
)

from typing import (
    Dict,
    Iterable,
    List,
    Optional,
    Tuple,
)

from sqlalchemy.orm import Session

from app.ml.click_event_recommendation import (
    PERSONALIZED_CLICK_WEIGHTS,
)

from app.ml.recommendation_engine import (
    ScoredProduct,
)

from app.models import (
    RecommendationRun,
    RecommendationScoreSnapshot,
)


# ============================================================
# CONFIGURATION
# ============================================================

ALGORITHM_VERSION = "personalized-click-location-score-v4"

# Recommendation score history is useful for debugging and comparison, but a
# home-page recommendation call can happen very frequently.  Retaining the
# audit rows for 30 days keeps the table bounded while still preserving enough
# history for regression analysis.
SNAPSHOT_RETENTION_DAYS = 30


# ============================================================
# FEATURE DEFINITIONS
# ============================================================

# Each tuple contains:
#
#   public diagnostic name
#   ScoredProduct attribute name
#   recommendation weight key
#
# The mapping intentionally mirrors ClickAwareScoreBlender so that the score
# reconstructed here is the same score produced by the recommendation engine
# before BusinessRuleFilter applies fairness/penalty adjustments.

FEATURE_SPECS: Tuple[
    Tuple[
        str,
        str,
        str,
    ],
    ...,
] = (
    (
        "content",
        "content_score",
        "content",
    ),
    (
        "collaborative",
        "collab_score",
        "collaborative",
    ),
    (
        "trending",
        "trend_score",
        "trending",
    ),
    (
        "seasonal",
        "seasonal_boost",
        "seasonal",
    ),
    (
        "location",
        "location_boost",
        "location",
    ),
    (
        "category_affinity",
        "category_boost",
        "category_affinity",
    ),
    (
        "brand_affinity",
        "brand_boost",
        "brand_affinity",
    ),
    (
        "rating",
        "rating_score",
        "rating",
    ),
    (
        "seller_freshness",
        "seller_boost",
        "seller_freshness",
    ),
    (
        "product_click_popularity",
        "click_rate_score",
        "click_rate",
    ),
    (
        "user_click_affinity",
        "user_click_affinity_score",
        "user_click_affinity",
    ),
    (
        "engagement",
        "engagement_score",
        "engagement",
    ),
)


# ============================================================
# SAFE HELPERS
# ============================================================

def _safe_float(
    value: object,
    default: float = 0.0,
) -> float:
    """Convert a value to float without allowing serialization errors."""

    try:
        return float(value)
    except (
        TypeError,
        ValueError,
    ):
        return default


def _clamp01(
    value: float,
) -> float:
    """Match the 0..1 clamping performed by ClickAwareScoreBlender."""

    return max(
        0.0,
        min(
            1.0,
            _safe_float(value),
        ),
    )


# ============================================================
# WEIGHT NORMALIZATION
# ============================================================

def normalize_weights(
    weights: Optional[
        Dict[
            str,
            float,
        ]
    ] = None,
) -> Dict[
    str,
    float,
]:
    """
    Return the exact normalized weights used by the score blender.

    ClickAwareScoreBlender normalizes whatever dictionary is passed to it.
    This function performs the same normalization so the audit contribution
    calculation cannot drift from the scoring implementation.
    """

    merged_weights = dict(
        PERSONALIZED_CLICK_WEIGHTS
    )

    if weights:
        merged_weights.update(
            weights
        )

    total = sum(
        _safe_float(
            value
        )
        for value in merged_weights.values()
    )

    if total <= 0.0:
        raise ValueError(
            "Recommendation weights must sum to a positive value."
        )

    return {
        key: (
            _safe_float(value)
            / total
        )
        for (
            key,
            value,
        ) in merged_weights.items()
    }


# ============================================================
# SCORE BREAKDOWN
# ============================================================

def calculate_score_breakdown(
    scored_product: ScoredProduct,
    weights: Optional[
        Dict[
            str,
            float,
        ]
    ] = None,
) -> Dict[
    str,
    object,
]:
    """
    Reconstruct the full score trace for a ScoredProduct.

    The recommendation pipeline is:

        raw feature scores
            -> weighted contributions
            -> ClickAwareScoreBlender clamp to [0, 1]
            -> BusinessRuleFilter / fair_rank
            -> final_score

    Therefore:

        businessRuleAdjustment = finalScore - weightedScoreBeforeRules

    The adjustment is a NET value.  It can include a new-seller boost,
    cancellation penalty, quality-return penalty, or a combination of those
    score-changing rules.  Pure filtering/interleaving rules affect rank or
    eligibility but do not have a numeric adjustment and therefore are not
    represented in this numeric difference.
    """

    normalized_weights = normalize_weights(
        weights
    )

    raw_scores: Dict[
        str,
        float,
    ] = {}

    contributions: Dict[
        str,
        float,
    ] = {}

    for (
        public_name,
        attribute_name,
        weight_key,
    ) in FEATURE_SPECS:

        score = _safe_float(
            getattr(
                scored_product,
                attribute_name,
                0.0,
            )
        )

        weight = _safe_float(
            normalized_weights.get(
                weight_key,
                0.0,
            )
        )

        raw_scores[
            public_name
        ] = score

        contributions[
            public_name
        ] = (
            score
            * weight
        )

    # ClickAwareScoreBlender clamps the weighted sum before business rules.
    # Reproducing that clamp here is important if engagement or any future
    # signal can be negative or if a future weight configuration exceeds 1.
    weighted_score_before_rules = _clamp01(
        sum(
            contributions.values()
        )
    )

    final_score = _safe_float(
        getattr(
            scored_product,
            "final_score",
            0.0,
        )
    )

    business_rule_adjustment = (
        final_score
        - weighted_score_before_rules
    )

    return {
        "weights": normalized_weights,
        "raw_scores": raw_scores,
        "contributions": contributions,
        "weighted_score_before_rules": weighted_score_before_rules,
        "business_rule_adjustment": business_rule_adjustment,
        "final_score": final_score,
    }


# ============================================================
# RETENTION
# ============================================================

def cleanup_old_recommendation_runs(
    db: Session,
    retention_days: int = SNAPSHOT_RETENTION_DAYS,
) -> int:
    """
    Delete recommendation audit runs older than the retention window.

    RecommendationScoreSnapshot rows are deleted automatically because the
    runId foreign key uses ON DELETE CASCADE.
    """

    if retention_days <= 0:
        return 0

    cutoff = (
        datetime.utcnow()
        - timedelta(
            days=retention_days
        )
    )

    deleted = (
        db.query(
            RecommendationRun
        )
        .filter(
            RecommendationRun.createdAt
            < cutoff
        )
        .delete(
            synchronize_session=False
        )
    )

    return int(
        deleted
        or 0
    )


# ============================================================
# PERSISTENCE
# ============================================================

def persist_recommendation_run(
    db: Session,
    *,
    user_id: str,
    scored_products: Iterable[
        ScoredProduct
    ],
    context: str = "home",
    execution_time_ms: float = 0.0,
    weights: Optional[
        Dict[
            str,
            float,
        ]
    ] = None,
    algorithm_version: str = ALGORITHM_VERSION,
    retention_days: int = SNAPSHOT_RETENTION_DAYS,
) -> str:
    """
    Persist one RecommendationRun plus one snapshot per final product.

    Parameters
    ----------
    db:
        Active SQLAlchemy session used by the recommendation API.
    user_id:
        User for whom the recommendation list was generated.
    scored_products:
        Final, ranked ScoredProduct objects returned to the API.
    context:
        Recommendation surface, currently ``home``.
    execution_time_ms:
        Recommendation-engine execution time.
    weights:
        Recommendation weights used for this run.
    algorithm_version:
        Version marker used to compare historical runs.
    retention_days:
        Number of days of audit history to retain.

    Returns
    -------
    str
        Generated RecommendationRun UUID.
    """

    products: List[
        ScoredProduct
    ] = list(
        scored_products
    )

    normalized_weights = normalize_weights(
        weights
    )

    cleanup_old_recommendation_runs(
        db,
        retention_days=retention_days,
    )

    run_id = str(
        uuid.uuid4()
    )

    now = datetime.utcnow()

    run = RecommendationRun(
        id=run_id,
        userId=user_id,
        context=context,
        algorithmVersion=algorithm_version,
        totalReturned=len(products),
        executionTimeMs=max(
            0.0,
            _safe_float(
                execution_time_ms
            ),
        ),
        weights=normalized_weights,
        createdAt=now,
    )

    db.add(
        run
    )

    # Ensure the parent row is present before child rows are inserted.
    db.flush()

    snapshots: List[
        RecommendationScoreSnapshot
    ] = []

    for (
        rank,
        scored_product,
    ) in enumerate(
        products,
        start=1,
    ):

        breakdown = calculate_score_breakdown(
            scored_product,
            weights=normalized_weights,
        )

        raw = breakdown[
            "raw_scores"
        ]

        contributions = breakdown[
            "contributions"
        ]

        product = scored_product.product

        snapshot = RecommendationScoreSnapshot(
            id=str(
                uuid.uuid4()
            ),
            runId=run_id,
            userId=user_id,
            productId=product.id,
            productName=getattr(
                product,
                "name",
                None,
            ),
            rank=rank,
            source=getattr(
                scored_product,
                "source",
                None,
            ),

            # ------------------------------------------------------------
            # Raw feature scores
            # ------------------------------------------------------------
            contentScore=_safe_float(
                raw["content"]
            ),
            collaborativeScore=_safe_float(
                raw["collaborative"]
            ),
            trendingScore=_safe_float(
                raw["trending"]
            ),
            seasonalScore=_safe_float(
                raw["seasonal"]
            ),
            locationScore=_safe_float(
                raw["location"]
            ),
            locationWeight=_safe_float(
                breakdown["weights"].get(
                    "location",
                    0.0,
                )
            ),
            sellerDistanceKm=(
                _safe_float(
                    getattr(
                        scored_product,
                        "seller_distance_km",
                        None,
                    )
                )
                if getattr(
                    scored_product,
                    "seller_distance_km",
                    None,
                ) is not None
                else None
            ),
            nearbySeller=bool(
                getattr(
                    scored_product,
                    "nearby_seller",
                    False,
                )
            ),
            locationPriorityApplied=bool(
                getattr(
                    scored_product,
                    "location_priority_applied",
                    False,
                )
            ),
            categoryAffinityScore=_safe_float(
                raw["category_affinity"]
            ),
            brandAffinityScore=_safe_float(
                raw["brand_affinity"]
            ),
            ratingScore=_safe_float(
                raw["rating"]
            ),
            sellerFreshnessScore=_safe_float(
                raw["seller_freshness"]
            ),
            productClickPopularityScore=_safe_float(
                raw["product_click_popularity"]
            ),
            userClickAffinityScore=_safe_float(
                raw["user_click_affinity"]
            ),
            engagementScore=_safe_float(
                raw["engagement"]
            ),

            # ------------------------------------------------------------
            # Product click diagnostics
            # ------------------------------------------------------------
            productClicks7d=int(
                getattr(
                    scored_product,
                    "product_clicks_7d",
                    0,
                )
                or 0
            ),
            productClicksPerDay=_safe_float(
                getattr(
                    scored_product,
                    "product_clicks_per_day",
                    0.0,
                )
            ),

            # ------------------------------------------------------------
            # User click affinity internals
            # ------------------------------------------------------------
            semanticSimilarityScore=_safe_float(
                getattr(
                    scored_product,
                    "user_click_affinity_semantic",
                    0.0,
                )
            ),
            clickCategoryScore=_safe_float(
                getattr(
                    scored_product,
                    "user_click_affinity_category",
                    0.0,
                )
            ),
            clickBrandScore=_safe_float(
                getattr(
                    scored_product,
                    "user_click_affinity_brand",
                    0.0,
                )
            ),
            clickFrequencyRecencyScore=_safe_float(
                getattr(
                    scored_product,
                    "user_click_affinity_frequency_recency",
                    0.0,
                )
            ),
            matchedClickedProductId=getattr(
                scored_product,
                "matched_clicked_product_id",
                None,
            ),
            matchedClickedProductName=getattr(
                scored_product,
                "matched_clicked_product_name",
                None,
            ),

            # ------------------------------------------------------------
            # Weighted feature contributions
            # ------------------------------------------------------------
            contentContribution=_safe_float(
                contributions["content"]
            ),
            collaborativeContribution=_safe_float(
                contributions["collaborative"]
            ),
            trendingContribution=_safe_float(
                contributions["trending"]
            ),
            seasonalContribution=_safe_float(
                contributions["seasonal"]
            ),
            locationContribution=_safe_float(
                contributions["location"]
            ),
            categoryAffinityContribution=_safe_float(
                contributions["category_affinity"]
            ),
            brandAffinityContribution=_safe_float(
                contributions["brand_affinity"]
            ),
            ratingContribution=_safe_float(
                contributions["rating"]
            ),
            sellerFreshnessContribution=_safe_float(
                contributions["seller_freshness"]
            ),
            productClickPopularityContribution=_safe_float(
                contributions["product_click_popularity"]
            ),
            userClickAffinityContribution=_safe_float(
                contributions["user_click_affinity"]
            ),
            engagementContribution=_safe_float(
                contributions["engagement"]
            ),

            # ------------------------------------------------------------
            # Final score trace
            # ------------------------------------------------------------
            weightedScoreBeforeRules=_safe_float(
                breakdown[
                    "weighted_score_before_rules"
                ]
            ),
            businessRuleAdjustment=_safe_float(
                breakdown[
                    "business_rule_adjustment"
                ]
            ),
            finalScore=_safe_float(
                breakdown[
                    "final_score"
                ]
            ),
            explanation=getattr(
                scored_product,
                "explanation",
                None,
            ),
            createdAt=now,
        )

        snapshots.append(
            snapshot
        )

    if snapshots:
        db.add_all(
            snapshots
        )

    db.commit()

    return run_id