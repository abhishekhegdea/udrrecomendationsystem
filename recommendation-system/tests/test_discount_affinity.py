import math
from datetime import datetime, timedelta, timezone

from app.ml.discount_affinity import (
    DISCOUNT_AFFINITY_HALFLIFE_DAYS,
    DISCOUNT_EVENT_WEIGHTS,
    DiscountObservation,
    UserDiscountProfile,
    _build_profile_from_observations,
    compute_candidate_discount_affinity,
    compute_discount_recency_weight,
)
from app.ml.click_event_recommendation import (
    PERSONALIZED_CLICK_WEIGHTS,
    ClickAwareScoreBlender,
)
from app.ml.learning_to_rank import (
    LTR_FEATURE_KEYS,
    SEGMENT_WEIGHT_MULTIPLIERS,
    USER_SEGMENTS,
)
from app.ml.recommendation_score_logger import FEATURE_SPECS


def test_discount_event_weights_and_decay():
    now = datetime.now(timezone.utc)
    past_7d = now - timedelta(days=DISCOUNT_AFFINITY_HALFLIFE_DAYS)

    decay_now = compute_discount_recency_weight(now, now)
    decay_7d = compute_discount_recency_weight(past_7d, now)
    assert math.isclose(decay_now, 1.0, rel_tol=1e-5)
    assert math.isclose(decay_7d, 0.5, rel_tol=1e-5)

    # Multi-event hierarchy
    assert DISCOUNT_EVENT_WEIGHTS["PURCHASE"] > DISCOUNT_EVENT_WEIGHTS["CART"]
    assert DISCOUNT_EVENT_WEIGHTS["CART"] > DISCOUNT_EVENT_WEIGHTS["WISHLIST"]
    assert DISCOUNT_EVENT_WEIGHTS["WISHLIST"] > DISCOUNT_EVENT_WEIGHTS["CLICK"]


def test_deal_seeker_profile():
    now = datetime.now(timezone.utc)
    observations = [
        DiscountObservation(
            discount_rate=40.0,
            is_discounted=True,
            price=600.0,
            event_type="PURCHASE",
            weight=1.00 * compute_discount_recency_weight(now - timedelta(hours=2), now),
            timestamp=now - timedelta(hours=2),
            product_id="p1",
            category_id="c1",
        ),
        DiscountObservation(
            discount_rate=30.0,
            is_discounted=True,
            price=700.0,
            event_type="CART",
            weight=0.85 * compute_discount_recency_weight(now - timedelta(hours=5), now),
            timestamp=now - timedelta(hours=5),
            product_id="p2",
            category_id="c1",
        ),
        DiscountObservation(
            discount_rate=50.0,
            is_discounted=True,
            price=500.0,
            event_type="WISHLIST",
            weight=0.70 * compute_discount_recency_weight(now - timedelta(days=1), now),
            timestamp=now - timedelta(days=1),
            product_id="p3",
            category_id="c1",
        ),
    ]

    profile = _build_profile_from_observations(
        user_id="user-deal-seeker",
        observations=observations,
        event_counts={"PURCHASE": 1, "CART": 1, "WISHLIST": 1},
        as_of=now,
    )
    assert profile.discount_sensitivity > 0.85
    assert 30.0 <= profile.preferred_discount_rate <= 45.0
    assert profile.confidence > 0.35
    assert profile.is_deal_seeker is True
    assert profile.interaction_count == 3


def test_full_price_oriented_profile():
    now = datetime.now(timezone.utc)
    observations = [
        DiscountObservation(
            discount_rate=0.0,
            is_discounted=False,
            price=1500.0,
            event_type="PURCHASE",
            weight=1.00 * compute_discount_recency_weight(now - timedelta(hours=1), now),
            timestamp=now - timedelta(hours=1),
            product_id="p1",
        ),
        DiscountObservation(
            discount_rate=0.0,
            is_discounted=False,
            price=2000.0,
            event_type="CART",
            weight=0.85 * compute_discount_recency_weight(now - timedelta(hours=4), now),
            timestamp=now - timedelta(hours=4),
            product_id="p2",
        ),
        DiscountObservation(
            discount_rate=0.0,
            is_discounted=False,
            price=1200.0,
            event_type="PRODUCT_VIEW",
            weight=0.35 * compute_discount_recency_weight(now - timedelta(hours=6), now),
            timestamp=now - timedelta(hours=6),
            product_id="p3",
        ),
    ]

    profile = _build_profile_from_observations(
        user_id="user-full-price",
        observations=observations,
        event_counts={"PURCHASE": 1, "CART": 1, "PRODUCT_VIEW": 1},
        as_of=now,
    )
    assert profile.discount_sensitivity < 0.15
    assert profile.preferred_discount_rate == 0.0
    assert profile.confidence > 0.30
    assert profile.is_deal_seeker is False


def test_cold_start_profile_fallback():
    now = datetime.now(timezone.utc)
    profile = _build_profile_from_observations(
        user_id="user-cold-start",
        observations=[],
        event_counts={},
        as_of=now,
    )
    assert profile.discount_sensitivity == 0.50
    assert profile.preferred_discount_rate == 0.0
    assert profile.confidence == 0.0
    assert profile.interaction_count == 0


def test_candidate_scoring_deal_seeker():
    # Deal seeker profile
    profile = UserDiscountProfile(
        user_id="u1",
        discount_sensitivity=0.90,
        preferred_discount_rate=35.0,
        weighted_mean_discount=35.0,
        lower_discount=25.0,
        upper_discount=45.0,
        confidence=0.85,
        has_preference=True,
        interaction_count=10,
        discounted_interaction_count=9,
        total_effective_weight=8.5,
    )

    class MockProduct:
        def __init__(self, discount):
            self.discount = discount

    prod_matching = MockProduct(35.0)
    prod_low_disc = MockProduct(10.0)
    prod_no_disc = MockProduct(0.0)

    score_match = compute_candidate_discount_affinity(profile, prod_matching)
    score_low_discount = compute_candidate_discount_affinity(profile, prod_low_disc)
    score_no_discount = compute_candidate_discount_affinity(profile, prod_no_disc)

    assert score_match > score_low_discount
    assert score_low_discount > score_no_discount
    assert score_no_discount > 0.15  # Continuous non-zero baseline
    assert 0.0 <= score_match <= 1.0


def test_candidate_scoring_full_price_buyer():
    profile = UserDiscountProfile(
        user_id="u2",
        discount_sensitivity=0.10,
        preferred_discount_rate=0.0,
        weighted_mean_discount=0.0,
        lower_discount=0.0,
        upper_discount=0.0,
        confidence=0.85,
        has_preference=True,
        interaction_count=10,
        discounted_interaction_count=1,
        total_effective_weight=8.5,
    )

    class MockProduct:
        def __init__(self, discount):
            self.discount = discount

    score_full_price = compute_candidate_discount_affinity(profile, MockProduct(0.0))
    score_discounted = compute_candidate_discount_affinity(profile, MockProduct(50.0))

    assert score_full_price > score_discounted
    assert score_full_price > 0.70


def test_candidate_scoring_cold_start_agnostic():
    profile = UserDiscountProfile(
        user_id="u3",
        discount_sensitivity=0.50,
        preferred_discount_rate=0.0,
        weighted_mean_discount=0.0,
        lower_discount=0.0,
        upper_discount=0.0,
        confidence=0.0,
        has_preference=False,
        interaction_count=0,
        discounted_interaction_count=0,
        total_effective_weight=0.0,
    )

    class MockProduct:
        def __init__(self, discount):
            self.discount = discount

    score_discount = compute_candidate_discount_affinity(profile, MockProduct(30.0))
    score_full_price = compute_candidate_discount_affinity(profile, MockProduct(0.0))

    assert math.isclose(score_discount, 0.50, rel_tol=1e-5)
    assert math.isclose(score_full_price, 0.50, rel_tol=1e-5)


def test_blender_weights_sum_to_one():
    assert "discount_affinity" in PERSONALIZED_CLICK_WEIGHTS
    assert PERSONALIZED_CLICK_WEIGHTS["discount_affinity"] == 0.05
    total = sum(PERSONALIZED_CLICK_WEIGHTS.values())
    assert math.isclose(total, 1.0, rel_tol=1e-12)

    blender = ClickAwareScoreBlender(PERSONALIZED_CLICK_WEIGHTS)
    assert math.isclose(sum(blender.weights.values()), 1.0, rel_tol=1e-12)


def test_ltr_and_feature_specs_include_discount_affinity():
    assert "discount_affinity" in LTR_FEATURE_KEYS
    assert any(spec[0] == "discount_affinity" for spec in FEATURE_SPECS)

    for segment in USER_SEGMENTS:
        assert "discount_affinity" in SEGMENT_WEIGHT_MULTIPLIERS[segment]
