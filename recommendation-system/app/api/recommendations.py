# pyrefly: ignore [missing-import]

import logging

from time import (
    perf_counter,
)

from typing import Optional

from fastapi import (
    APIRouter,
    Depends,
    Query,
)

from pydantic import (
    BaseModel,
    Field,
)

from sqlalchemy.orm import (
    Session,
    joinedload,
)

from app.core.fairness_config import (
    get_config,
    update_config,
)

from app.database import (
    get_db,
)

from app.ml.click_event_recommendation import (
    CLICK_EVENT_WINDOW_DAYS,
    PERSONALIZED_CLICK_WEIGHTS,
    USER_CLICK_AFFINITY_COMPONENT_WEIGHTS,
    get_recommendations_from_click_events,
)

from app.ml.content_based import (
    get_similar_products,
)

from app.ml.hybrid_search import (
    hybrid_search,
    load_products,
)

from app.ml.recommendation_score_logger import (
    ALGORITHM_VERSION,
    calculate_score_breakdown,
    persist_recommendation_run,
)

from app.ml.cold_start import (
    get_user_activity_profile,
    STAGE_COMPLETELY_COLD,
    MODE_COLD_START,
)

from app.ml.seller_boost import (
    CANCEL_PENALTY_WEIGHT,
    fair_rank,
)

from app.models import (
    Product,
    Seller,
    User,
)


logger = logging.getLogger(
    __name__
)


router = APIRouter()


# ============================================================
# HELPERS
# ============================================================

def _safe_float(
    value,
    default: float = 0.0,
) -> float:

    try:

        return float(
            value
        )

    except (
        TypeError,
        ValueError,
    ):

        return default


def _percentage(
    value: float,
    digits: int = 3,
) -> float:

    return round(
        _safe_float(
            value
        )
        * 100.0,
        digits,
    )


def _resolved_weights(
    weights=None,
):
    return (
        weights
        if isinstance(weights, dict) and weights
        else PERSONALIZED_CLICK_WEIGHTS
    )


def _weight_percentage(
    key: str,
    weights=None,
) -> float:

    active_weights = _resolved_weights(
        weights
    )

    return _percentage(
        active_weights.get(
            key,
            0.0,
        )
    )


def _contribution(
    score: float,
    weight_key: str,
    weights=None,
) -> float:

    active_weights = _resolved_weights(
        weights
    )

    return (
        _safe_float(
            score
        )
        *
        active_weights.get(
            weight_key,
            0.0,
        )
    )


def _contribution_percentage(
    score: float,
    weight_key: str,
    weights=None,
) -> float:

    return _percentage(
        _contribution(
            score,
            weight_key,
            weights,
        )
    )


# ============================================================
# PRODUCT FORMATTER
# ============================================================

def format_product(
    product: Product,
):

    image_url = (
        "/products/product-vase.jpg"
    )


    if getattr(
        product,
        "images",
        None,
    ):

        if len(
            product.images
        ) > 0:

            image_url = (
                product.images[
                    0
                ].url
            )


    final_score = (
        _safe_float(
            getattr(
                product,
                "final_score",
                0.0,
            )
        )
    )


    click_rate_score = (
        _safe_float(
            getattr(
                product,
                "click_rate_score",
                0.0,
            )
        )
    )


    product_impressions_7d = int(
        getattr(
            product,
            "product_impressions_7d",
            0,
        )
        or 0
    )


    product_ctr = (
        _safe_float(
            getattr(
                product,
                "product_ctr",
                0.0,
            )
        )
    )


    product_ctr_smoothed = (
        _safe_float(
            getattr(
                product,
                "product_ctr_smoothed",
                0.0,
            )
        )
    )


    engagement_score = (
        _safe_float(
            getattr(
                product,
                "engagement_score",
                0.0,
            )
        )
    )


    user_click_affinity_score = (
        _safe_float(
            getattr(
                product,
                "user_click_affinity_score",
                0.0,
            )
        )
    )


    seller = (
        getattr(
            product,
            "seller",
            None,
        )
    )


    product_weights = _resolved_weights(
        getattr(
            product,
            "dynamic_weights",
            None,
        )
    )


    return {

        "id":
            product.id,

        "name":
            product.name,

        "price":
            getattr(
                product,
                "price",
                999,
            ),

        "seller_name":
            (
                getattr(
                    seller,
                    "firstName",
                    None,
                )

                or getattr(
                    seller,
                    "businessName",
                    None,
                )

                or
                "UdrCrafts Artisan"
            ),

        "seller_new":
            bool(
                getattr(
                    seller,
                    "isNewSeller",
                    False,
                )
            ),

        "image":
            image_url,

        "popularity":
            getattr(
                product,
                "popularity",
                0,
            ),

        # ====================================================
        # FINAL SCORE
        # ====================================================

        "score":
            round(
                final_score,
                6,
            ),

        "score_percentage":
            _percentage(
                final_score
            ),

        # ====================================================
        # TRUE RECOMMENDATION CLICK THROUGH RATE (CTR)
        # ====================================================

        # Internal feature-key compatibility.
        "click_rate_score":
            round(
                click_rate_score,
                6,
            ),

        "click_rate_percentage":
            _percentage(
                click_rate_score
            ),

        # Clear public names.
        "ctr_score":
            round(
                click_rate_score,
                6,
            ),

        "ctr_score_percentage":
            _percentage(
                click_rate_score
            ),

        "product_impressions_7d":
            product_impressions_7d,

        "product_clicks_7d":
            int(
                getattr(
                    product,
                    "product_clicks_7d",
                    0,
                )
                or 0
            ),

        "product_ctr":
            round(
                product_ctr,
                6,
            ),

        "product_ctr_percentage":
            _percentage(
                product_ctr
            ),

        "product_ctr_smoothed":
            round(
                product_ctr_smoothed,
                6,
            ),

        "product_ctr_smoothed_percentage":
            _percentage(
                product_ctr_smoothed
            ),

        "product_clicks_per_day":
            round(
                _safe_float(
                    getattr(
                        product,
                        "product_clicks_per_day",
                        0.0,
                    )
                ),
                6,
            ),

        # Deprecated aliases retained so older UI/debug consumers do not break.
        "product_click_popularity_score":
            round(
                click_rate_score,
                6,
            ),

        "product_click_popularity_percentage":
            _percentage(
                click_rate_score
            ),

        # ====================================================
        # USER CLICK AFFINITY
        # ====================================================

        "user_click_affinity_score":
            round(
                user_click_affinity_score,
                6,
            ),

        "user_click_affinity_percentage":
            _percentage(
                user_click_affinity_score
            ),

        # ====================================================
        # PRECISE LOCATION
        # ====================================================

        "location_score":
            round(
                _safe_float(
                    getattr(
                        product,
                        "location_score",
                        0.0,
                    )
                ),
                6,
            ),

        "location_weight":
            round(
                _safe_float(
                    product_weights.get(
                        "location",
                        0.0,
                    )
                ),
                6,
            ),

        "location_weight_percentage":
            _weight_percentage(
                "location",
                product_weights,
            ),

        "location_contribution":
            _contribution(
                _safe_float(
                    getattr(
                        product,
                        "location_score",
                        0.0,
                    )
                ),
                "location",
                product_weights,
            ),

        "location_contribution_percentage":
            _contribution_percentage(
                _safe_float(
                    getattr(
                        product,
                        "location_score",
                        0.0,
                    )
                ),
                "location",
                product_weights,
            ),

        "seller_distance_km":
            (
                round(
                    _safe_float(
                        getattr(
                            product,
                            "seller_distance_km",
                            0.0,
                        )
                    ),
                    2,
                )
                if getattr(
                    product,
                    "seller_distance_km",
                    None,
                ) is not None
                else None
            ),

        "nearby_seller":
            bool(
                getattr(
                    product,
                    "nearby_seller",
                    False,
                )
            ),

        "location_priority_applied":
            bool(
                getattr(
                    product,
                    "location_priority_applied",
                    False,
                )
            ),

        # ====================================================
        # ENGAGEMENT
        # ====================================================

        "engagement_score":
            round(
                engagement_score,
                6,
            ),

        "cold_start_score":
            round(
                _safe_float(
                    getattr(
                        product,
                        "cold_start_score",
                        0.0,
                    )
                ),
                6,
            ),

        "personalized_score":
            round(
                _safe_float(
                    getattr(
                        product,
                        "personalized_score",
                        0.0,
                    )
                ),
                6,
            ),

        "explanation":
            getattr(
                product,
                "explanation",
                "Recommended for you.",
            ),

        "score_details":
            getattr(
                product,
                "score_details",
                None,
            ),
    }


# ============================================================
# HOME RECOMMENDATIONS
# ============================================================

@router.get(
    "/home/{user_id}"
)
def get_home_recommendations(
    user_id: str,
    db: Session = Depends(
        get_db
    ),
):
    """
    Personalized recommendation endpoint.

    Click behaviour is represented by two independent signals:

    Product Click Popularity = 4%
    User Click Affinity      = 10%
    Precise Location         = 10%
    """


    user = (
        db.query(
            User
        )
        .filter(
            User.id
            == user_id
        )
        .first()
    )


    seller = (
        db.query(
            Seller
        )
        .filter(
            Seller.id
            == user_id
        )
        .first()
    )


    user_city_id = (
        getattr(
            user,
            "cityId",
            None,
        )
        or getattr(
            seller,
            "cityId",
            None,
        )
    )


    user_state_id = (
        getattr(
            user,
            "stateId",
            None,
        )
        or getattr(
            seller,
            "stateId",
            None,
        )
    )


    user_latitude = (
        getattr(
            user,
            "latitude",
            None,
        )
        if getattr(
            user,
            "latitude",
            None,
        ) is not None
        else getattr(
            seller,
            "latitude",
            None,
        )
    )


    user_longitude = (
        getattr(
            user,
            "longitude",
            None,
        )
        if getattr(
            user,
            "longitude",
            None,
        ) is not None
        else getattr(
            seller,
            "longitude",
            None,
        )
    )


    # ========================================================
    # RUN RECOMMENDATION ENGINE
    # ========================================================

    recommendation_started = (
        perf_counter()
    )


    results = (
        get_recommendations_from_click_events(

            db,

            user_id,

            limit=
                20,

            user_city_id=
                user_city_id,

            user_state_id=
                user_state_id,

            user_latitude=
                user_latitude,

            user_longitude=
                user_longitude,
        )
    )


    execution_time_ms = (
        (
            perf_counter()
            - recommendation_started
        )
        * 1000.0
    )


    # ========================================================
    # DYNAMIC WEIGHT / LEARNING-TO-RANK CONTEXT
    # ========================================================
    first_result = (
        results[0]
        if results
        else None
    )

    effective_weights = dict(
        getattr(
            first_result,
            "effective_weights",
            PERSONALIZED_CLICK_WEIGHTS,
        )
        or PERSONALIZED_CLICK_WEIGHTS
    )

    user_segment = getattr(
        first_result,
        "user_segment",
        "unknown",
    )

    weight_strategy = getattr(
        first_result,
        "weight_strategy",
        "static_weights",
    )

    ltr_model_version = getattr(
        first_result,
        "ltr_model_version",
        None,
    )

    ltr_backend = getattr(
        first_result,
        "ltr_backend",
        None,
    )

    ltr_model_source = getattr(
        first_result,
        "ltr_model_source",
        None,
    )

    user_activity_profile = getattr(
        first_result,
        "user_activity_profile",
        {},
    )


    formatted = []

    unique_results = []

    seen_product_ids = set()


    for scored_product in (
        results
    ):

        product = (
            scored_product
            .product
        )


        if (
            product.id
            in seen_product_ids
        ):
            continue


        seen_product_ids.add(
            product.id
        )


        unique_results.append(
            scored_product
        )


        # ====================================================
        # STANDARD SIGNALS
        # ====================================================

        final_score = (
            _safe_float(
                scored_product
                .final_score
            )
        )


        content_score = (
            _safe_float(
                scored_product
                .content_score
            )
        )


        collab_score = (
            _safe_float(
                scored_product
                .collab_score
            )
        )


        trend_score = (
            _safe_float(
                scored_product
                .trend_score
            )
        )


        seasonal_score = (
            _safe_float(
                scored_product
                .seasonal_boost
            )
        )


        location_score = (
            _safe_float(
                scored_product
                .location_boost
            )
        )


        seller_distance_km = (
            getattr(
                scored_product,
                "seller_distance_km",
                None,
            )
        )


        nearby_seller = bool(
            getattr(
                scored_product,
                "nearby_seller",
                False,
            )
        )


        location_priority_applied = bool(
            getattr(
                scored_product,
                "location_priority_applied",
                False,
            )
        )


        category_score = (
            _safe_float(
                scored_product
                .category_boost
            )
        )


        brand_score = (
            _safe_float(
                scored_product
                .brand_boost
            )
        )


        rating_score = (
            _safe_float(
                scored_product
                .rating_score
            )
        )


        seller_score = (
            _safe_float(
                scored_product
                .seller_boost
            )
        )


        engagement_score = (
            _safe_float(
                scored_product
                .engagement_score
            )
        )


        # ====================================================
        # PRODUCT CLICK POPULARITY
        # ====================================================

        click_popularity_score = (
            _safe_float(
                scored_product
                .click_rate_score
            )
        )


        product_clicks_7d = int(

            getattr(
                scored_product,
                "product_clicks_7d",
                0,
            )

            or 0
        )


        product_clicks_per_day = (
            _safe_float(
                getattr(
                    scored_product,
                    "product_clicks_per_day",
                    0.0,
                )
            )
        )


        product_impressions_7d = int(
            getattr(
                scored_product,
                "product_impressions_7d",
                0,
            )
            or 0
        )


        product_ctr = (
            _safe_float(
                getattr(
                    scored_product,
                    "product_ctr",
                    0.0,
                )
            )
        )


        product_ctr_smoothed = (
            _safe_float(
                getattr(
                    scored_product,
                    "product_ctr_smoothed",
                    0.0,
                )
            )
        )


        # ====================================================
        # USER CLICK AFFINITY
        # ====================================================

        user_click_affinity_score = (
            _safe_float(
                getattr(
                    scored_product,
                    "user_click_affinity_score",
                    0.0,
                )
            )
        )


        click_affinity_semantic = (
            _safe_float(
                getattr(
                    scored_product,
                    "user_click_affinity_semantic",
                    0.0,
                )
            )
        )


        click_affinity_category = (
            _safe_float(
                getattr(
                    scored_product,
                    "user_click_affinity_category",
                    0.0,
                )
            )
        )


        click_affinity_brand = (
            _safe_float(
                getattr(
                    scored_product,
                    "user_click_affinity_brand",
                    0.0,
                )
            )
        )


        click_affinity_frequency_recency = (
            _safe_float(
                getattr(
                    scored_product,
                    "user_click_affinity_frequency_recency",
                    0.0,
                )
            )
        )


        matched_clicked_product_id = (
            getattr(
                scored_product,
                "matched_clicked_product_id",
                None,
            )
        )


        matched_clicked_product_name = (
            getattr(
                scored_product,
                "matched_clicked_product_name",
                None,
            )
        )


        # ====================================================
        # AUDIT SCORE BREAKDOWN
        # ====================================================

        audit_breakdown = (
            calculate_score_breakdown(
                scored_product,
                weights=
                    effective_weights,
            )
        )


        weighted_score_before_rules = (
            _safe_float(
                audit_breakdown[
                    "weighted_score_before_rules"
                ]
            )
        )


        business_rule_adjustment = (
            _safe_float(
                audit_breakdown[
                    "business_rule_adjustment"
                ]
            )
        )


        # ====================================================
        # SCORE DETAILS
        # ====================================================

        score_details = {

            "content":
                round(
                    content_score,
                    6,
                ),

            "collab":
                round(
                    collab_score,
                    6,
                ),

            "trend":
                round(
                    trend_score,
                    6,
                ),

            "seasonal":
                round(
                    seasonal_score,
                    6,
                ),

            "location":
                round(
                    location_score,
                    6,
                ),

            "location_percentage":
                _percentage(
                    location_score
                ),

            "location_weight":
                round(
                    _safe_float(
                        effective_weights.get(
                            "location",
                            0.0,
                        )
                    ),
                    6,
                ),

            "location_weight_percentage":
                _weight_percentage(
                    "location",
                    effective_weights,
                ),

            "location_contribution":
                _contribution(
                    location_score,
                    "location",
                        effective_weights,
                ),

            "location_contribution_percentage":
                _contribution_percentage(
                    location_score,
                    "location",
                        effective_weights,
                ),

            "seller_distance_km":
                (
                    round(
                        _safe_float(
                            seller_distance_km
                        ),
                        2,
                    )
                    if seller_distance_km is not None
                    else None
                ),

            "nearby_seller":
                nearby_seller,

            "location_priority_applied":
                location_priority_applied,

            "category":
                round(
                    category_score,
                    6,
                ),

            "brand":
                round(
                    brand_score,
                    6,
                ),

            "rating":
                round(
                    rating_score,
                    6,
                ),

            "seller":
                round(
                    seller_score,
                    6,
                ),

            "engagement":
                round(
                    engagement_score,
                    6,
                ),


            # =================================================
            # TRUE RECOMMENDATION CTR
            # =================================================

            "ctr_score":
                round(
                    click_popularity_score,
                    6,
                ),

            "ctr_score_percentage":
                _percentage(
                    click_popularity_score
                ),

            "product_impressions_7d":
                product_impressions_7d,

            "product_clicks_7d":
                product_clicks_7d,

            "product_ctr":
                round(
                    product_ctr,
                    6,
                ),

            "product_ctr_percentage":
                _percentage(
                    product_ctr
                ),

            "product_ctr_smoothed":
                round(
                    product_ctr_smoothed,
                    6,
                ),

            "product_ctr_smoothed_percentage":
                _percentage(
                    product_ctr_smoothed
                ),

            "product_clicks_per_day":
                round(
                    product_clicks_per_day,
                    6,
                ),

            "ctr_weight_percentage":
                _weight_percentage(
                    "click_rate",
                    effective_weights,
                ),

            "ctr_contribution_percentage":
                _contribution_percentage(
                    click_popularity_score,
                    "click_rate",
                    effective_weights,
                ),

            # Deprecated names retained for compatibility with existing audit UI.
            "product_click_popularity":
                round(
                    click_popularity_score,
                    6,
                ),

            "product_click_popularity_percentage":
                _percentage(
                    click_popularity_score
                ),

            "product_click_popularity_weight_percentage":
                _weight_percentage(
                    "click_rate",
                    effective_weights,
                ),

            "product_click_popularity_contribution_percentage":
                _contribution_percentage(
                    click_popularity_score,
                    "click_rate",
                    effective_weights,
                ),

            # =================================================
            # BACKWARD-COMPATIBLE CLICK RATE NAMES
            # =================================================

            "click_rate":
                round(
                    click_popularity_score,
                    6,
                ),

            "click_rate_percentage":
                _percentage(
                    click_popularity_score
                ),

            "click_rate_weight_percentage":
                _weight_percentage(
                    "click_rate",
                    effective_weights,
                ),

            "click_rate_contribution_percentage":
                _contribution_percentage(
                    click_popularity_score,
                    "click_rate",
                        effective_weights,
                ),


            # =================================================
            # USER CLICK AFFINITY
            # =================================================

            "user_click_affinity":
                round(
                    user_click_affinity_score,
                    6,
                ),

            "user_click_affinity_percentage":
                _percentage(
                    user_click_affinity_score
                ),

            "user_click_affinity_weight_percentage":
                _weight_percentage(
                    "user_click_affinity",
                    effective_weights,
                ),

            "user_click_affinity_contribution_percentage":
                _contribution_percentage(
                    user_click_affinity_score,
                    "user_click_affinity",
                        effective_weights,
                ),


            # -------------------------------------------------
            # INTERNAL CLICK AFFINITY CALCULATION
            # -------------------------------------------------

            "user_click_affinity_components": {

                "semantic_similarity":
                    round(
                        click_affinity_semantic,
                        6,
                    ),

                "semantic_similarity_percentage":
                    _percentage(
                        click_affinity_semantic
                    ),

                "semantic_component_weight_percentage":
                    _percentage(
                        USER_CLICK_AFFINITY_COMPONENT_WEIGHTS[
                            "semantic"
                        ]
                    ),


                "category_affinity":
                    round(
                        click_affinity_category,
                        6,
                    ),

                "category_affinity_percentage":
                    _percentage(
                        click_affinity_category
                    ),

                "category_component_weight_percentage":
                    _percentage(
                        USER_CLICK_AFFINITY_COMPONENT_WEIGHTS[
                            "category"
                        ]
                    ),


                "brand_affinity":
                    round(
                        click_affinity_brand,
                        6,
                    ),

                "brand_affinity_percentage":
                    _percentage(
                        click_affinity_brand
                    ),

                "brand_component_weight_percentage":
                    _percentage(
                        USER_CLICK_AFFINITY_COMPONENT_WEIGHTS[
                            "brand"
                        ]
                    ),


                "frequency_recency":
                    round(
                        click_affinity_frequency_recency,
                        6,
                    ),

                "frequency_recency_percentage":
                    _percentage(
                        click_affinity_frequency_recency
                    ),

                "frequency_recency_component_weight_percentage":
                    _percentage(
                        USER_CLICK_AFFINITY_COMPONENT_WEIGHTS[
                            "frequency_recency"
                        ]
                    ),
            },


            # =================================================
            # WHICH CLICKED PRODUCT MATCHED?
            # =================================================

            "matched_clicked_product_id":
                matched_clicked_product_id,

            "matched_clicked_product_name":
                matched_clicked_product_name,


            # =================================================
            # CONTRIBUTION OF EACH KPI TO FINAL SCORE
            # =================================================

            "contribution_percentages": {

                "content":
                    _contribution_percentage(
                        content_score,
                        "content",
                        effective_weights,
                    ),

                "collaborative":
                    _contribution_percentage(
                        collab_score,
                        "collaborative",
                        effective_weights,
                    ),

                "trending":
                    _contribution_percentage(
                        trend_score,
                        "trending",
                        effective_weights,
                    ),

                "seasonal":
                    _contribution_percentage(
                        seasonal_score,
                        "seasonal",
                        effective_weights,
                    ),

                "location":
                    _contribution_percentage(
                        location_score,
                        "location",
                        effective_weights,
                    ),

                "category_affinity":
                    _contribution_percentage(
                        category_score,
                        "category_affinity",
                        effective_weights,
                    ),

                "brand_affinity":
                    _contribution_percentage(
                        brand_score,
                        "brand_affinity",
                        effective_weights,
                    ),

                "rating":
                    _contribution_percentage(
                        rating_score,
                        "rating",
                        effective_weights,
                    ),

                "seller_freshness":
                    _contribution_percentage(
                        seller_score,
                        "seller_freshness",
                        effective_weights,
                    ),

                "product_click_popularity":
                    _contribution_percentage(
                        click_popularity_score,
                        "click_rate",
                        effective_weights,
                    ),

                "user_click_affinity":
                    _contribution_percentage(
                        user_click_affinity_score,
                        "user_click_affinity",
                        effective_weights,
                    ),

                "engagement":
                    _contribution_percentage(
                        engagement_score,
                        "engagement",
                        effective_weights,
                    ),
            },


            # =================================================
            # COMPLETE FINAL-SCORE TRACE
            # =================================================

            "weighted_score_before_rules":
                round(
                    weighted_score_before_rules,
                    6,
                ),

            "weighted_score_before_rules_percentage":
                _percentage(
                    weighted_score_before_rules
                ),

            "business_rule_adjustment":
                round(
                    business_rule_adjustment,
                    6,
                ),

            "business_rule_adjustment_percentage":
                _percentage(
                    business_rule_adjustment
                ),

            "cold_start_score":
                round(
                    _safe_float(
                        getattr(
                            scored_product,
                            "cold_start_score",
                            final_score,
                        )
                    ),
                    6,
                ),

            "personalized_score":
                round(
                    _safe_float(
                        getattr(
                            scored_product,
                            "personalized_score",
                            final_score,
                        )
                    ),
                    6,
                ),

            "cold_start_weight":
                round(
                    _safe_float(
                        getattr(
                            scored_product,
                            "cold_start_weight",
                            0.0,
                        )
                    ),
                    4,
                ),

            "personalized_weight":
                round(
                    _safe_float(
                        getattr(
                            scored_product,
                            "personalized_weight",
                            1.0,
                        )
                    ),
                    4,
                ),

            "final_score":
                round(
                    final_score,
                    6,
                ),

            "final_score_percentage":
                _percentage(
                    final_score
                ),


            "source":
                scored_product
                .source,
        }


        # ====================================================
        # ATTACH VALUES TO PRODUCT FOR SERIALIZATION
        # ====================================================

        setattr(
            product,
            "cold_start_score",
            _safe_float(
                getattr(
                    scored_product,
                    "cold_start_score",
                    final_score,
                )
            ),
        )

        setattr(
            product,
            "personalized_score",
            _safe_float(
                getattr(
                    scored_product,
                    "personalized_score",
                    final_score,
                )
            ),
        )

        setattr(
            product,
            "final_score",
            final_score,
        )


        setattr(
            product,
            "explanation",
            scored_product
            .explanation,
        )


        setattr(
            product,
            "click_rate_score",
            click_popularity_score,
        )


        setattr(
            product,
            "product_clicks_7d",
            product_clicks_7d,
        )


        setattr(
            product,
            "product_clicks_per_day",
            product_clicks_per_day,
        )


        setattr(
            product,
            "product_impressions_7d",
            product_impressions_7d,
        )


        setattr(
            product,
            "product_ctr",
            product_ctr,
        )


        setattr(
            product,
            "product_ctr_smoothed",
            product_ctr_smoothed,
        )


        setattr(
            product,
            "user_click_affinity_score",
            user_click_affinity_score,
        )


        setattr(
            product,
            "location_score",
            location_score,
        )


        setattr(
            product,
            "seller_distance_km",
            seller_distance_km,
        )


        setattr(
            product,
            "nearby_seller",
            nearby_seller,
        )


        setattr(
            product,
            "location_priority_applied",
            location_priority_applied,
        )


        setattr(
            product,
            "engagement_score",
            engagement_score,
        )


        setattr(
            product,
            "dynamic_weights",
            dict(effective_weights),
        )


        setattr(
            product,
            "score_details",
            score_details,
        )


        formatted.append(
            format_product(
                product
            )
        )


    # ========================================================
    # SAVE RECOMMENDATION SCORE SNAPSHOT
    # ========================================================

    recommendation_run_id = None

    score_snapshot_saved = False

    score_snapshot_error = None


    try:

        recommendation_run_id = (
            persist_recommendation_run(
                db,
                user_id=
                    user_id,
                scored_products=
                    unique_results,
                context=
                    "home",
                execution_time_ms=
                    execution_time_ms,
                weights=
                    effective_weights,
                user_segment=
                    user_segment,
                weight_strategy=
                    weight_strategy,
                ltr_model_version=
                    ltr_model_version,
                ltr_backend=
                    ltr_backend,
                algorithm_version=
                    ALGORITHM_VERSION,
            )
        )


        score_snapshot_saved = True


    except Exception as exc:

        # Recommendation delivery must not fail just because audit persistence
        # failed. Roll back the audit transaction, keep the recommendation
        # response, and expose the database error for debugging.
        db.rollback()


        score_snapshot_error = str(
            exc
        )


        logger.exception(
            "Failed to persist recommendation score snapshot for user %s",
            user_id,
        )


    activity_profile = get_user_activity_profile(db, user_id)

    # ========================================================
    # API RESPONSE
    # ========================================================

    return {

        "user_id":
            user_id,

        # ----------------------------------------------------
        # COLD-START & ACTIVITY METADATA
        # ----------------------------------------------------

        "recommendation_mode":
            activity_profile.recommendation_mode,

        "user_activity_stage":
            activity_profile.activity_stage,

        "user_activity_count":
            activity_profile.total_interactions,

        "cold_start_blend": {
            "cold_start_weight":
                activity_profile.cold_start_weight,
            "personalized_weight":
                activity_profile.personalized_weight,
            "cold_start_percentage":
                _percentage(
                    activity_profile.cold_start_weight,
                    1,
                ),
            "personalized_percentage":
                _percentage(
                    activity_profile.personalized_weight,
                    1,
                ),
        },

        "user_activity_breakdown":
            activity_profile.breakdown,

        # ----------------------------------------------------
        # RECOMMENDATION AUDIT
        # ----------------------------------------------------

        "recommendation_run_id":
            recommendation_run_id,

        "score_snapshot_saved":
            score_snapshot_saved,

        "score_snapshot_error":
            score_snapshot_error,

        "algorithm_version":
            ALGORITHM_VERSION,

        "execution_time_ms":
            round(
                execution_time_ms,
                3,
            ),


        # ----------------------------------------------------
        # DYNAMIC WEIGHT / LEARNING-TO-RANK CONTEXT
        # ----------------------------------------------------
        "user_segment":
            user_segment,

        "dynamic_weighting": {
            "strategy": weight_strategy,
            "ltr_backend": ltr_backend,
            "ltr_model_version": ltr_model_version,
            "ltr_model_source": ltr_model_source,
            "activity_profile": user_activity_profile,
        },


        "location_context": {
            "latitude":
                user_latitude,
            "longitude":
                user_longitude,
            "location_weight_percentage":
                _weight_percentage(
                    "location",
                    effective_weights,
                ),
            "nearby_ranking_enabled":
                (
                    user_latitude is not None
                    and user_longitude is not None
                ),
        },

        "click_window_days":
            CLICK_EVENT_WINDOW_DAYS,

        "click_rate_source":
            "RecommendationLog visible impressions / attributed clicks",

        "ctr_definition":
            "clicks / visible recommendation impressions",

        "ctr_weight_percentage":
            _weight_percentage(
                "click_rate",
                effective_weights,
            ),

        "product_click_popularity_weight_percentage":
            _weight_percentage(
                "click_rate",
                effective_weights,
            ),

        "user_click_affinity_weight_percentage":
            _weight_percentage(
                "user_click_affinity",
                effective_weights,
            ),

        "weights_percentage": {

            key:
                _percentage(
                    value
                )

            for (
                key,
                value,
            ) in effective_weights.items()
        },

        "recommendations":
            formatted,
    }


# ============================================================
# SIMILAR PRODUCTS
# ============================================================

@router.get(
    "/product/{product_id}"
)
def get_similar(
    product_id: str,
    db: Session = Depends(
        get_db
    ),
):

    similar = (
        get_similar_products(
            product_id,
            db,
            limit=10,
        )
    )


    return {

        "product_id":
            product_id,

        "similar_products":
            [
                format_product(
                    product
                )
                for product
                in similar
            ],

        "explanation":
            "Because you viewed this product.",
    }


# ============================================================
# TRENDING
# ============================================================

@router.get(
    "/trending"
)
def get_trending_products(
    db: Session = Depends(
        get_db
    ),
):

    trending = (
        db.query(
            Product
        )

        .options(
            joinedload(
                Product.images
            )
        )

        .order_by(
            Product
            .popularity
            .desc()
        )

        .limit(
            10
        )

        .all()
    )


    return {

        "trending_products":
            [
                format_product(
                    product
                )
                for product
                in trending
            ],

        "explanation":
            "Popular among customers recently.",
    }


# ============================================================
# NEW ARRIVALS
# ============================================================

@router.get(
    "/new-arrivals"
)
def get_new_arrivals(
    db: Session = Depends(
        get_db
    ),
):

    new_seller_products = (
        db.query(
            Product
        )

        .options(
            joinedload(
                Product.images
            )
        )

        .join(
            Seller
        )

        .filter(
            Seller.isNewSeller
            == True
        )

        .order_by(
            Product
            .createdAt
            .desc()
        )

        .limit(
            20
        )

        .all()
    )


    return {

        "new_arrivals":
            [
                format_product(
                    product
                )
                for product
                in new_seller_products
            ],

        "explanation":
            "Discover new artisans on UdrCrafts.",
    }


# ============================================================
# ALSO BOUGHT
# ============================================================

@router.get(
    "/also-bought/{product_id}"
)
def get_also_bought(
    product_id: str,

    limit: int = Query(
        10,
        ge=1,
        le=20,
    ),

    db: Session = Depends(
        get_db
    ),
):

    from sqlalchemy import func

    from app.models import (
        OrderItem,
    )


    order_ids_subq = (
        db.query(
            OrderItem.orderId
        )

        .filter(
            OrderItem.productId
            == product_id
        )

        .subquery()
    )


    also_bought = (
        db.query(
            OrderItem.productId,

            func.count(
                OrderItem.id
            ).label(
                "co_purchase_count"
            ),
        )

        .filter(
            OrderItem.orderId.in_(
                order_ids_subq
            ),

            OrderItem.productId
            != product_id,
        )

        .group_by(
            OrderItem.productId
        )

        .order_by(
            func.count(
                OrderItem.id
            ).desc()
        )

        .limit(
            limit
        )

        .all()
    )


    if not also_bought:

        return {

            "product_id":
                product_id,

            "also_bought":
                [],

            "explanation":
                "No co-purchase data available yet.",
        }


    matched_ids = [

        row.productId

        for row
        in also_bought
    ]


    products = (
        db.query(
            Product
        )

        .options(
            joinedload(
                Product.images
            )
        )

        .filter(
            Product.id.in_(
                matched_ids
            )
        )

        .all()
    )


    product_map = {

        product.id:
            product

        for product
        in products
    }


    ranked = []


    for row in also_bought:

        product = (
            product_map.get(
                row.productId
            )
        )


        if product is None:
            continue


        setattr(

            product,

            "final_score",

            min(
                1.0,

                row.co_purchase_count
                / 10.0,
            ),
        )


        setattr(

            product,

            "explanation",

            (
                "Frequently bought together "
                f"({row.co_purchase_count} orders)."
            ),
        )


        ranked.append(
            product
        )


    return {

        "product_id":
            product_id,

        "also_bought":
            [
                format_product(
                    product
                )
                for product
                in ranked
            ],

        "explanation":
            (
                "Customers who bought this "
                "also bought these items."
            ),
    }


# ============================================================
# SEARCH
# ============================================================

@router.get(
    "/search"
)
def search_products(

    q: str = Query(
        "...",
        min_length=0,
        description=
            "Free-text search query",
    ),

    limit: int = Query(
        20,
        ge=1,
        le=100,
        description=
            "Results per page",
    ),

    offset: int = Query(
        0,
        ge=0,
        description=
            "Pagination offset",
    ),

    alpha: float = Query(
        0.7,
        ge=0.0,
        le=1.0,
        description=(
            "Semantic weight "
            "(0 = keyword only, "
            "1 = semantic only)"
        ),
    ),

    db: Session = Depends(
        get_db
    ),
):


    scored_results, total = (
        hybrid_search(

            db,

            q,

            limit=
                limit,

            offset=
                offset,

            alpha=
                alpha,
        )
    )


    products = (
        load_products(
            db,
            scored_results,
        )
    )


    cfg = (
        get_config(
            db
        )
    )


    products = (
        fair_rank(

            products,

            total_slots=
                limit,

            boost_amount=
                cfg.boost_amount,

            new_seller_ratio=
                cfg.new_seller_ratio,

            max_per_seller_ratio=
                cfg.max_per_seller_ratio,

            attribute=
                "final_score",

            penalty_weight=
                CANCEL_PENALTY_WEIGHT,
        )
    )


    return {

        "query":
            q,

        "alpha":
            alpha,

        "total":
            total,

        "results":
            [
                format_product(
                    product
                )
                for product
                in products
            ],

        "explanation":
            (
                "Results blended from semantic similarity "
                "and keyword matching, boosted for seller fairness."
            ),
    }


# ============================================================
# FAIRNESS CONFIGURATION
# ============================================================

class FairnessConfigResponse(
    BaseModel
):

    boost_amount: float

    new_seller_ratio: float

    max_per_seller_ratio: float


class FairnessConfigUpdate(
    BaseModel
):

    boost_amount: Optional[
        float
    ] = Field(
        None,
        ge=0.0,
        le=1.0,
        description=
            "Score boost for new sellers",
    )


    new_seller_ratio: Optional[
        float
    ] = Field(
        None,
        ge=0.0,
        le=1.0,
        description=
            "Fraction of slots reserved for new sellers",
    )


    max_per_seller_ratio: Optional[
        float
    ] = Field(
        None,
        ge=0.0,
        le=1.0,
        description=
            "Max fraction of slots per seller",
    )


@router.get(
    "/fairness-config",
    response_model=
        FairnessConfigResponse,
    summary=
        "Read seller fairness config",
)
def get_fairness_config(
    db: Session = Depends(
        get_db
    ),
):

    cfg = (
        get_config(
            db
        )
    )


    return FairnessConfigResponse(

        boost_amount=
            cfg.boost_amount,

        new_seller_ratio=
            cfg.new_seller_ratio,

        max_per_seller_ratio=
            cfg.max_per_seller_ratio,
    )


@router.put(
    "/fairness-config",
    response_model=
        FairnessConfigResponse,
    summary=
        "Update seller fairness config",
)
def update_fairness_config(
    body: FairnessConfigUpdate,

    db: Session = Depends(
        get_db
    ),
):

    cfg = (
        update_config(

            db,

            boost_amount=
                body.boost_amount,

            new_seller_ratio=
                body.new_seller_ratio,

            max_per_seller_ratio=
                body.max_per_seller_ratio,
        )
    )


    return FairnessConfigResponse(

        boost_amount=
            cfg.boost_amount,

        new_seller_ratio=
            cfg.new_seller_ratio,

        max_per_seller_ratio=
            cfg.max_per_seller_ratio,
    )