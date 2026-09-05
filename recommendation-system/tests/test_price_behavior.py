"""
test_price_behavior.py — Unit Test Suite for the Price Behaviour Model

Covers the 15 required validation scenarios:
  1.  New user with zero interactions -> no strong price preference
  2.  Repeated discounted purchases -> high discount affinity
  3.  Repeated premium (category-relative) purchases -> high premium affinity
  4.  Repeated full-price purchases -> high full-price affinity
  5.  Mixed behaviour -> multiple affinities remain meaningful
  6.  One expensive purchase among many inexpensive -> no extreme premium
  7.  One discounted purchase among many full-price -> no extreme discount
  8.  Recent discounted behaviour vs old premium -> recency wins
  9.  Category-specific behaviour -> different profiles per category
  10. Insufficient category data -> fallback to global profile
  11. No discount metadata -> graceful handling
  12. Invalid price values -> no crash
  13. Highly discounted product -> discount intensity affects score
  14. Premium product in a cheap category -> category-relative premium score
  15. Cold-start user -> neutral score, existing behaviour preserved

Plus focused unit tests for price-feature extraction, premium percentiles,
recency decay and confidence.
"""

import math
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

from app.ml.event_tracker import (
    EVENT_CART,
    EVENT_CLICK,
    EVENT_PRODUCT_VIEW,
    EVENT_PURCHASE,
    EVENT_WISHLIST,
)
from app.ml.price_behavior import (
    BEHAVIOR_DISCOUNT,
    BEHAVIOR_FULL_PRICE,
    BEHAVIOR_MIXED,
    BEHAVIOR_PREMIUM,
    BEHAVIOR_UNKNOWN,
    PRICE_BEHAVIOR_EVENT_WEIGHTS,
    PRICE_BEHAVIOR_HALFLIFE_DAYS,
    CategoryPriceStats,
    CategoryPriceBehaviorProfile,
    PriceBehaviorObservation,
    UserPriceBehaviorProfile,
    _aggregate_affinities,
    _calculate_behavior_confidence,
    _decay_factor,
    build_category_price_stats,
    build_price_behavior_explanation,
    build_user_price_behavior_profile,
    classify_behavior_type,
    compute_candidate_price_behavior_score,
    compute_premium_score,
    get_product_price_features,
)
from app.models import Product, UserBehaviour

NOW = datetime(2026, 9, 1, tzinfo=timezone.utc)


# ===========================================================================
# FIXTURES & HELPERS
# ===========================================================================

def make_product(
    product_id: str,
    price: float,
    category_id: str = "cat-1",
    discount: float = 0.0,
    name: str = "Test Product",
) -> Product:
    return Product(
        id=product_id,
        name=name,
        price=price,
        discount=discount,
        categoryId=category_id,
    )


def make_obs(
    price: float,
    event_type: str = EVENT_PURCHASE,
    discount_pct: float = 0.0,
    premium: float = 0.0,
    timestamp: datetime = NOW,
    product_id: str = "p1",
    category_id: str = "cat-1",
) -> PriceBehaviorObservation:
    """Build a PriceBehaviorObservation with computed discount features."""
    intensity = max(0.0, min(1.0, discount_pct / 50.0))
    if discount_pct <= 1.0:
        full_price_score = 1.0
    else:
        full_price_score = max(0.0, min(1.0, (5.0 - discount_pct) / 4.0))
    return PriceBehaviorObservation(
        product_id=product_id,
        category_id=category_id,
        event_type=event_type,
        weight=PRICE_BEHAVIOR_EVENT_WEIGHTS.get(event_type, 0.25),
        timestamp=timestamp,
        price=price,
        original_price=(price / (1.0 - discount_pct / 100.0)) if discount_pct > 0 else price,
        discount_percentage=discount_pct,
        discount_intensity=intensity,
        full_price_score=full_price_score,
        premium_score=premium,
    )


def make_profile(
    discount: float = 0.0,
    premium: float = 0.0,
    full_price: float = 0.0,
    confidence: float = 0.8,
    behavior_type: str = BEHAVIOR_MIXED,
    categories: dict = None,
    user_id: str = "user-1",
) -> UserPriceBehaviorProfile:
    return UserPriceBehaviorProfile(
        user_id=user_id,
        discount_affinity=discount,
        premium_affinity=premium,
        full_price_affinity=full_price,
        price_sensitivity=0.0,
        preferred_discount_percentage=0.0,
        average_discount_seen=0.0,
        average_discount_purchased=0.0,
        discount_purchase_ratio=0.0,
        premium_purchase_ratio=0.0,
        full_price_purchase_ratio=0.0,
        confidence=confidence,
        interaction_count=10,
        unique_products_count=5,
        behavior_type=behavior_type,
        last_updated=NOW,
        categories=categories or {},
    )


def cat_stats(prices: list, cat_id: str = "cat-1") -> dict:
    return {
        cat_id: CategoryPriceStats(category_id=cat_id, sorted_prices=sorted(prices))
    }


# ===========================================================================
# TEST 1: NEW USER WITH ZERO INTERACTIONS
# ===========================================================================

def test_1_new_user_zero_interactions():
    mock_db = MagicMock()
    mock_db.query.return_value.join.return_value.filter.return_value.all.return_value = []
    mock_db.query.return_value.filter.return_value.all.return_value = []

    profile = build_user_price_behavior_profile(mock_db, "brand-new-user")
    assert profile.confidence == 0.0
    assert profile.interaction_count == 0
    assert profile.behavior_type == BEHAVIOR_UNKNOWN
    assert not profile.has_preference

    cand = make_product("p1", 500.0)
    res = compute_candidate_price_behavior_score(cand, profile)
    assert res.price_behavior_score == 0.50
    assert res.price_behavior_confidence == 0.0
    assert res.price_behavior_type == BEHAVIOR_UNKNOWN


# ===========================================================================
# TEST 2: REPEATED DISCOUNTED PURCHASES
# ===========================================================================

def test_2_repeated_discounted_purchases():
    obs = [
        make_obs(800.0, discount_pct=30.0, premium=0.1, product_id=f"p{i}")
        for i in range(1, 6)
    ]
    agg = _aggregate_affinities(obs, NOW, PRICE_BEHAVIOR_HALFLIFE_DAYS)
    confidence = _calculate_behavior_confidence(
        effective_count=agg["effective_count"],
        high_intent_weight=agg["high_intent_weight"],
        total_weight=agg["total_weight"],
        unique_products_count=5,
    )

    assert agg["discount_affinity"] > 0.75   # 0.6*1.0 + 0.4*0.6 = 0.84
    assert agg["discount_affinity"] > agg["premium_affinity"]
    assert agg["discount_affinity"] > agg["full_price_affinity"]
    assert 0.3 < confidence < 1.0
    assert classify_behavior_type(
        agg["discount_affinity"], agg["premium_affinity"], agg["full_price_affinity"], confidence
    ) == BEHAVIOR_DISCOUNT


# ===========================================================================
# TEST 3: REPEATED PREMIUM PURCHASES (NO DISCOUNT)
# ===========================================================================

def test_3_repeated_premium_purchases():
    obs = [
        make_obs(9500.0, discount_pct=0.0, premium=0.75, product_id=f"p{i}")
        for i in range(1, 6)
    ]
    agg = _aggregate_affinities(obs, NOW, PRICE_BEHAVIOR_HALFLIFE_DAYS)
    confidence = _calculate_behavior_confidence(
        effective_count=agg["effective_count"],
        high_intent_weight=agg["high_intent_weight"],
        total_weight=agg["total_weight"],
        unique_products_count=5,
    )

    assert agg["premium_affinity"] > 0.6
    assert agg["premium_affinity"] > agg["discount_affinity"]
    # Premium purchases without discounts are also full-price evidence, so the
    # full-price affinity can legitimately be high (spec User B example).
    assert agg["full_price_affinity"] > 0.9
    assert classify_behavior_type(
        agg["discount_affinity"], agg["premium_affinity"], agg["full_price_affinity"], confidence
    ) == BEHAVIOR_PREMIUM


# ===========================================================================
# TEST 4: REPEATED FULL-PRICE PURCHASES
# ===========================================================================

def test_4_repeated_full_price_purchases():
    obs = [
        make_obs(500.0, discount_pct=0.0, premium=0.0, product_id=f"p{i}")
        for i in range(1, 6)
    ]
    agg = _aggregate_affinities(obs, NOW, PRICE_BEHAVIOR_HALFLIFE_DAYS)
    confidence = _calculate_behavior_confidence(
        effective_count=agg["effective_count"],
        high_intent_weight=agg["high_intent_weight"],
        total_weight=agg["total_weight"],
        unique_products_count=5,
    )

    assert agg["full_price_affinity"] > 0.9
    assert agg["discount_affinity"] < 0.1
    assert classify_behavior_type(
        agg["discount_affinity"], agg["premium_affinity"], agg["full_price_affinity"], confidence
    ) == BEHAVIOR_FULL_PRICE


# ===========================================================================
# TEST 5: MIXED BEHAVIOUR
# ===========================================================================

def test_5_mixed_behaviour():
    obs = [
        make_obs(800.0, discount_pct=30.0, premium=0.1, product_id=f"d{i}")
        for i in range(1, 4)
    ] + [
        make_obs(9500.0, discount_pct=0.0, premium=0.8, product_id=f"f{i}")
        for i in range(1, 3)
    ]
    agg = _aggregate_affinities(obs, NOW, PRICE_BEHAVIOR_HALFLIFE_DAYS)

    # 3 discounted + 2 premium full-price: all affinities stay meaningful.
    assert agg["discount_affinity"] > 0.5
    assert agg["premium_affinity"] > 0.3
    assert agg["full_price_affinity"] > 0.3


# ===========================================================================
# TEST 6: ONE EXPENSIVE PURCHASE AMONG MANY INEXPENSIVE
# ===========================================================================

def test_6_one_expensive_purchase_no_extreme_premium():
    obs = [
        make_obs(500.0, discount_pct=0.0, premium=0.0, product_id=f"p{i}")
        for i in range(1, 6)
    ] + [
        make_obs(9900.0, discount_pct=0.0, premium=0.95, product_id="p6")
    ]
    agg = _aggregate_affinities(obs, NOW, PRICE_BEHAVIOR_HALFLIFE_DAYS)
    confidence = _calculate_behavior_confidence(
        effective_count=agg["effective_count"],
        high_intent_weight=agg["high_intent_weight"],
        total_weight=agg["total_weight"],
        unique_products_count=6,
    )

    # ~0.16 weighted premium affinity: no extreme premium classification.
    assert agg["premium_affinity"] < 0.35
    assert agg["premium_affinity"] < agg["full_price_affinity"]
    assert classify_behavior_type(
        agg["discount_affinity"], agg["premium_affinity"], agg["full_price_affinity"], confidence
    ) == BEHAVIOR_FULL_PRICE


# ===========================================================================
# TEST 7: ONE DISCOUNTED PURCHASE AMONG MANY FULL-PRICE
# ===========================================================================

def test_7_one_discounted_purchase_no_extreme_discount():
    obs = [
        make_obs(500.0, discount_pct=0.0, premium=0.0, product_id=f"p{i}")
        for i in range(1, 6)
    ] + [
        make_obs(600.0, discount_pct=40.0, premium=0.0, product_id="p6")
    ]
    agg = _aggregate_affinities(obs, NOW, PRICE_BEHAVIOR_HALFLIFE_DAYS)

    assert agg["discount_affinity"] < 0.6
    assert agg["full_price_affinity"] > agg["discount_affinity"]


# ===========================================================================
# TEST 8: RECENT DISCOUNTED BEHAVIOUR vs OLD PREMIUM BEHAVIOUR
# ===========================================================================

def test_8_recency_decay_favours_recent_behaviour():
    old = NOW - timedelta(days=180)
    obs = [
        make_obs(9500.0, discount_pct=0.0, premium=0.9, timestamp=old, product_id=f"old{i}")
        for i in range(1, 4)
    ] + [
        make_obs(800.0, discount_pct=30.0, premium=0.1, timestamp=NOW - timedelta(days=1), product_id=f"new{i}")
        for i in range(1, 4)
    ]
    agg = _aggregate_affinities(obs, NOW, PRICE_BEHAVIOR_HALFLIFE_DAYS)

    assert agg["discount_affinity"] > agg["premium_affinity"]


def test_decay_factor_half_life():
    # 0 days -> 1.0, one half-life -> ~0.5, long ago -> ~0
    assert _decay_factor(NOW, NOW, 14.0) == 1.0
    assert abs(_decay_factor(NOW - timedelta(days=14), NOW, 14.0) - 0.5) < 0.01
    assert _decay_factor(NOW - timedelta(days=365), NOW, 14.0) < 0.01


# ===========================================================================
# TEST 9: CATEGORY-SPECIFIC BEHAVIOUR
# ===========================================================================

def test_9_category_specific_behaviour():
    cat_a = CategoryPriceBehaviorProfile(
        category_id="cat-a",
        discount_affinity=0.84,
        premium_affinity=0.1,
        full_price_affinity=0.1,
        preferred_discount_percentage=30.0,
        confidence=0.6,
        interaction_count=4,
        behavior_type=BEHAVIOR_DISCOUNT,
    )
    cat_b = CategoryPriceBehaviorProfile(
        category_id="cat-b",
        discount_affinity=0.1,
        premium_affinity=0.1,
        full_price_affinity=0.9,
        preferred_discount_percentage=0.0,
        confidence=0.6,
        interaction_count=4,
        behavior_type=BEHAVIOR_FULL_PRICE,
    )
    profile = make_profile(
        discount=0.5,
        premium=0.2,
        full_price=0.3,
        confidence=0.7,
        behavior_type=BEHAVIOR_MIXED,
        categories={"cat-a": cat_a, "cat-b": cat_b},
    )

    discounted_in_a = make_product("da", 800.0, category_id="cat-a", discount=30.0)
    res_a = compute_candidate_price_behavior_score(discounted_in_a, profile)
    assert res_a.used_category_profile is True
    assert res_a.price_behavior_type == BEHAVIOR_DISCOUNT
    assert res_a.price_behavior_confidence == 0.6

    full_price_in_b = make_product("fb", 500.0, category_id="cat-b", discount=0.0)
    res_b = compute_candidate_price_behavior_score(full_price_in_b, profile)
    assert res_b.used_category_profile is True
    assert res_b.price_behavior_type == BEHAVIOR_FULL_PRICE


# ===========================================================================
# TEST 10: INSUFFICIENT CATEGORY DATA -> GLOBAL FALLBACK
# ===========================================================================

def test_10_category_fallback_to_global():
    weak_cat = CategoryPriceBehaviorProfile(
        category_id="cat-x",
        discount_affinity=0.9,
        premium_affinity=0.0,
        full_price_affinity=0.0,
        preferred_discount_percentage=30.0,
        confidence=0.1,  # below MIN_CATEGORY_CONFIDENCE
        interaction_count=3,
        behavior_type=BEHAVIOR_DISCOUNT,
    )
    profile = make_profile(
        discount=0.2,
        premium=0.6,
        full_price=0.3,
        confidence=0.8,
        behavior_type=BEHAVIOR_PREMIUM,
        categories={"cat-x": weak_cat},
    )
    cand = make_product("px", 9500.0, category_id="cat-x", discount=0.0)
    res = compute_candidate_price_behavior_score(cand, profile)
    assert res.used_category_profile is False
    assert res.price_behavior_type == BEHAVIOR_PREMIUM


# ===========================================================================
# TEST 11: NO DISCOUNT METADATA
# ===========================================================================

def test_11_no_discount_metadata_graceful():
    product = make_product("p1", 500.0, discount=0.0)
    features = get_product_price_features(product)
    assert features is not None
    assert features.discount_percentage == 0.0
    assert features.original_price == 500.0
    assert features.is_full_price is True
    assert features.is_discounted is False
    assert features.full_price_score == 1.0

    # None discount value behaves like 0
    product_none = make_product("p2", 500.0)
    product_none.discount = None
    features_none = get_product_price_features(product_none)
    assert features_none is not None
    assert features_none.discount_percentage == 0.0

    profile = make_profile(full_price=0.9, confidence=0.8, behavior_type=BEHAVIOR_FULL_PRICE)
    res = compute_candidate_price_behavior_score(product, profile)
    assert res.candidate_full_price_score == 1.0
    assert res.candidate_discount_percentage == 0.0
    assert res.price_behavior_score > 0.6


def test_product_price_features_percentage_interpretation():
    # discount column stores a percentage by default: 20% off 800 -> 1000 MRP
    product = make_product("p1", 800.0, discount=20.0)
    features = get_product_price_features(product)
    assert math.isclose(features.discount_percentage, 20.0)
    assert math.isclose(features.original_price, 1000.0)
    assert features.is_discounted is True
    assert features.is_full_price is False


def test_product_price_features_amount_interpretation():
    # discount column stores an absolute amount when configured so
    product = make_product("p1", 800.0, discount=200.0)
    features = get_product_price_features(product, discount_is_percentage=False)
    assert math.isclose(features.discount_percentage, 20.0, rel_tol=1e-3)
    assert math.isclose(features.original_price, 1000.0, rel_tol=1e-3)


# ===========================================================================
# TEST 12: INVALID PRICE VALUES -> NO CRASH
# ===========================================================================

def test_12_invalid_price_values_no_crash():
    profile = make_profile(discount=0.8, confidence=0.8, behavior_type=BEHAVIOR_DISCOUNT)
    for bad_price in (0.0, -5.0, None, float("nan")):
        product = make_product(f"bad-{bad_price}", bad_price)
        res = compute_candidate_price_behavior_score(product, profile)
        assert res.price_behavior_score == 0.50
        assert res.price_behavior_confidence == 0.0
        assert not math.isnan(res.price_behavior_score)


# ===========================================================================
# TEST 13: DISCOUNT INTENSITY AFFECTS THE SCORE
# ===========================================================================

def test_13_discount_intensity_affects_score():
    profile = make_profile(
        discount=0.84,
        premium=0.1,
        full_price=0.1,
        confidence=0.9,
        behavior_type=BEHAVIOR_DISCOUNT,
    )
    deep = make_product("deep", 500.0, discount=50.0)   # intensity 1.0
    shallow = make_product("shallow", 900.0, discount=10.0)  # intensity 0.2

    res_deep = compute_candidate_price_behavior_score(deep, profile)
    res_shallow = compute_candidate_price_behavior_score(shallow, profile)

    assert res_deep.candidate_discount_percentage == 50.0
    assert res_shallow.candidate_discount_percentage == 10.0
    assert res_deep.price_behavior_raw_score > res_shallow.price_behavior_raw_score
    assert res_deep.price_behavior_score > res_shallow.price_behavior_score


# ===========================================================================
# TEST 14: PREMIUM PRODUCT IN A CHEAP CATEGORY
# ===========================================================================

def test_14_premium_score_is_category_relative():
    stats = {
        "cheap": CategoryPriceStats("cheap", list(range(100, 201, 10))),      # 100..200
        "expensive": CategoryPriceStats("expensive", list(range(1000, 100001, 1000))),
    }
    # 190 is near the top of the cheap category; 5000 is mid-low in the expensive one.
    cheap_premium = compute_premium_score(190.0, "cheap", stats)
    expensive_premium = compute_premium_score(5000.0, "expensive", stats)
    assert cheap_premium > 0.4
    assert expensive_premium < cheap_premium

    profile = make_profile(
        discount=0.0,
        premium=0.9,
        full_price=0.1,
        confidence=0.8,
        behavior_type=BEHAVIOR_PREMIUM,
    )
    res = compute_candidate_price_behavior_score(
        make_product("pc", 190.0, category_id="cheap"),
        profile,
        category_stats=stats,
    )
    assert res.candidate_premium_score > 0.4
    assert res.price_behavior_raw_score > 0.3


def test_build_category_price_stats_percentile():
    mock_db = MagicMock()
    rows = [
        ("cat-1", 100.0),
        ("cat-1", 200.0),
        ("cat-1", 300.0),
        ("cat-2", 50.0),
    ]
    mock_db.query.return_value.all.return_value = rows
    stats, global_stats = build_category_price_stats(mock_db)
    assert stats["cat-1"].percentile(200.0) == 2 / 3
    assert stats["cat-1"].percentile(300.0) == 1.0
    assert stats["cat-2"].percentile(50.0) == 1.0
    assert global_stats is not None
    assert global_stats.percentile(100.0) == 0.5


# ===========================================================================
# TEST 15: COLD-START USER -> NEUTRAL SCORE
# ===========================================================================

def test_15_cold_start_user_neutral():
    profile = None
    cand = make_product("p1", 500.0, discount=30.0)
    res = compute_candidate_price_behavior_score(cand, profile)
    assert res.price_behavior_score == 0.50
    assert res.price_behavior_type == BEHAVIOR_UNKNOWN
    assert res.explanation == "Popular choice"


# ===========================================================================
# CONFIDENCE & EXPLANATION FOCUSED TESTS
# ===========================================================================

def test_confidence_single_interaction_is_low():
    obs = [make_obs(500.0, event_type=EVENT_CLICK, product_id="p1")]
    agg = _aggregate_affinities(obs, NOW, PRICE_BEHAVIOR_HALFLIFE_DAYS)
    confidence = _calculate_behavior_confidence(
        effective_count=agg["effective_count"],
        high_intent_weight=agg["high_intent_weight"],
        total_weight=agg["total_weight"],
        unique_products_count=1,
    )
    assert confidence < 0.4


def test_confidence_rich_history_is_higher():
    obs = []
    for i in range(10):
        obs.append(make_obs(500.0, event_type=EVENT_PURCHASE, product_id=f"p{i}"))
    for i in range(10, 20):
        obs.append(make_obs(600.0, event_type=EVENT_CART, product_id=f"p{i}"))
    for i in range(20, 30):
        obs.append(make_obs(550.0, event_type=EVENT_PRODUCT_VIEW, product_id=f"p{i}"))

    agg = _aggregate_affinities(obs, NOW, PRICE_BEHAVIOR_HALFLIFE_DAYS)
    confidence = _calculate_behavior_confidence(
        effective_count=agg["effective_count"],
        high_intent_weight=agg["high_intent_weight"],
        total_weight=agg["total_weight"],
        unique_products_count=30,
    )
    assert confidence > 0.5


def test_explanation_honest_at_low_confidence():
    low = build_price_behavior_explanation(
        behavior_type=BEHAVIOR_DISCOUNT,
        confidence=0.1,
        raw_score=0.9,
        discount_component=0.8,
        premium_component=0.0,
        full_price_component=0.0,
    )
    assert low == "Popular choice"


def test_explanation_claims_learned_preference_when_confident():
    discount_expl = build_price_behavior_explanation(
        behavior_type=BEHAVIOR_DISCOUNT,
        confidence=0.7,
        raw_score=0.9,
        discount_component=0.8,
        premium_component=0.0,
        full_price_component=0.0,
    )
    assert "discount" in discount_expl.lower()

    premium_expl = build_price_behavior_explanation(
        behavior_type=BEHAVIOR_PREMIUM,
        confidence=0.7,
        raw_score=0.8,
        discount_component=0.0,
        premium_component=0.7,
        full_price_component=0.1,
    )
    assert "premium" in premium_expl.lower()

    full_price_expl = build_price_behavior_explanation(
        behavior_type=BEHAVIOR_FULL_PRICE,
        confidence=0.7,
        raw_score=0.8,
        discount_component=0.0,
        premium_component=0.0,
        full_price_component=0.8,
    )
    assert "full-price" in full_price_expl.lower()


# ===========================================================================
# END-TO-END PROFILE BUILDING VIA MOCKED DB
# ===========================================================================

def _chain_mock(rows):
    m = MagicMock()
    m.join.return_value.filter.return_value.all.return_value = rows
    m.join.return_value.join.return_value.filter.return_value.all.return_value = rows
    m.filter.return_value.all.return_value = rows
    m.filter.return_value.in_.return_value.all.return_value = rows
    return m


def test_profile_builder_via_db_discount_user():
    """End-to-end: UserBehaviour PURCHASE rows (with productIds expansion)."""
    user_id = "user-db-1"
    product = make_product("purchase-1", 800.0, category_id="cat-a", discount=30.0)

    behaviour = UserBehaviour(
        id="ub-1",
        userId=user_id,
        eventType=EVENT_PURCHASE,
        productId="purchase-1",
        categoryId="cat-a",
        createdAt=NOW,
        eventMetadata={
            "productIds": ["purchase-1"],
            "itemCount": 1,
        },
    )

    # query() call order in _collect_observations:
    #  1. UserBehaviour+Product join
    #  2. PURCHASE UserBehaviour rows
    #  3. Product.in_(...) expansion (not reached when productIds empty in row 2)
    #  4. ClickEvent+Product join
    #  5. CartItem+Product join
    #  6. Wishlist+Product join
    #  7. OrderItem+Order+Product join
    mock_db = MagicMock()
    mock_db.query.side_effect = [
        _chain_mock([(behaviour, product)]),
        _chain_mock([behaviour]),
        _chain_mock([]),  # expanded Product.in_(...) lookup
        _chain_mock([]),  # ClickEvent
        _chain_mock([]),  # CartItem
        _chain_mock([]),  # Wishlist
        _chain_mock([]),  # OrderItem
    ]

    profile = build_user_price_behavior_profile(
        mock_db,
        user_id,
        category_stats=cat_stats([100.0, 200.0, 800.0, 900.0, 1000.0], "cat-a"),
        global_stats=CategoryPriceStats("__global__", sorted([100.0, 200.0, 800.0, 900.0, 1000.0])),
    )

    assert profile.interaction_count >= 1
    # The affinity itself is learned, but a single interaction must not create
    # a strong, claimable preference: the type stays UNKNOWN at low confidence.
    assert profile.discount_affinity > 0.7
    assert profile.behavior_type == BEHAVIOR_UNKNOWN
    assert profile.confidence < 0.15


# ===========================================================================
# WEIGHT INTEGRATION: price_behavior IS A NORMALIZED 5% SIGNAL
# ===========================================================================

def test_price_behavior_weight_present_and_normalized():
    from app.ml.click_event_recommendation import PERSONALIZED_CLICK_WEIGHTS
    assert PERSONALIZED_CLICK_WEIGHTS["price_behavior"] == 0.05
    assert math.isclose(sum(PERSONALIZED_CLICK_WEIGHTS.values()), 1.0, rel_tol=1e-12)

    from app.ml.recommendation_engine import DEFAULT_WEIGHTS
    assert DEFAULT_WEIGHTS["price_behavior"] == 0.05
    assert math.isclose(sum(DEFAULT_WEIGHTS.values()), 1.0, rel_tol=1e-12)

    from app.ml.learning_to_rank import LTR_FEATURE_KEYS
    assert "price_behavior" in LTR_FEATURE_KEYS

    from app.ml.recommendation_score_logger import FEATURE_SPECS
    assert any(spec[0] == "price_behavior" for spec in FEATURE_SPECS)