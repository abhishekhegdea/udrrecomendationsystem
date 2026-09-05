"""
test_price_affinity.py — Comprehensive Unit Test Suite for User Price Affinity

Covers all 14 required validation scenarios:
  1.  User with zero history (confidence = 0, neutral score 0.50)
  2.  User with consistent low-price purchases (₹300–₹500)
  3.  User with premium/luxury purchases (₹5,000–₹12,000)
  4.  User with mixed browsing history
  5.  Recency weighting / 14-day exponential decay
  6.  Event type importance weights (purchase > cart > view > click)
  7.  Category-specific price affinity (Jewelry vs Home Decor)
  8.  Category fallback to global price affinity
  9.  Outlier resistance (single ₹25,000 purchase among ₹500 views)
  10. Cold-start user integration
  11. Preserves exploration (smooth Gaussian decay, non-zero outside range)
  12. Missing / None product price safety
  13. Zero / Negative product price safety
  14. Large dynamic price scale stability (₹100 to ₹100,000)
"""

import math
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest

from app.ml.event_tracker import (
    EVENT_CART,
    EVENT_CLICK,
    EVENT_PRODUCT_VIEW,
    EVENT_PURCHASE,
    EVENT_SEARCH,
    EVENT_WISHLIST,
)
from app.ml.price_affinity import (
    CategoryPriceProfile,
    PriceObservation,
    UserPriceProfile,
    _calculate_confidence,
    _calculate_weighted_stats,
    build_price_affinity_explanation,
    build_user_price_profile,
    compute_candidate_price_affinity,
    extract_price_from_search_query,
)
from app.models import Product, UserBehaviour


# ===========================================================================
# FIXTURES & HELPERS
# ===========================================================================

def make_product(product_id: str, price: float, category_id: str = "cat-1", name: str = "Test Product") -> Product:
    p = Product(id=product_id, name=name, price=price, categoryId=category_id)
    return p


# ===========================================================================
# TEST CASE 1: USER WITH ZERO HISTORY
# ===========================================================================

def test_1_user_with_zero_history():
    """User with no interaction history gets neutral score, 0 confidence, no crash."""
    mock_db = MagicMock()
    mock_db.query.return_value.join.return_value.filter.return_value.all.return_value = []
    mock_db.query.return_value.filter.return_value.all.return_value = []

    profile = build_user_price_profile(mock_db, "user-new-zero")
    assert profile.confidence == 0.0
    assert profile.preferred_price == 0.0
    assert not profile.has_preference
    assert profile.interaction_count == 0

    cand = make_product("p1", 500.0)
    score_result = compute_candidate_price_affinity(cand, profile)

    assert score_result.price_affinity_score == 0.50
    assert score_result.price_affinity_confidence == 0.0
    assert not score_result.is_in_range


# ===========================================================================
# TEST CASE 2: LOW-PRICE USER (₹300 - ₹500)
# ===========================================================================

def test_2_low_price_user():
    """Learns budget price preference (~₹400) and scores low-priced items higher."""
    now = datetime.now(timezone.utc)
    obs = [
        PriceObservation(price=300.0, event_type=EVENT_PURCHASE, weight=1.0, timestamp=now, product_id="p1"),
        PriceObservation(price=350.0, event_type=EVENT_CART, weight=0.85, timestamp=now, product_id="p2"),
        PriceObservation(price=450.0, event_type=EVENT_PURCHASE, weight=1.0, timestamp=now, product_id="p3"),
        PriceObservation(price=400.0, event_type=EVENT_WISHLIST, weight=0.70, timestamp=now, product_id="p4"),
        PriceObservation(price=500.0, event_type=EVENT_PRODUCT_VIEW, weight=0.35, timestamp=now, product_id="p5"),
    ]

    pref_p, low_p, up_p, w_mean, w_med, s_dev, _ = _calculate_weighted_stats(obs, now=now)
    confidence = _calculate_confidence(obs, unique_products_count=5, now=now)

    profile = UserPriceProfile(
        user_id="budget-user",
        preferred_price=pref_p,
        lower_price=low_p,
        upper_price=up_p,
        weighted_mean=w_mean,
        weighted_median=w_med,
        price_std_dev=s_dev,
        confidence=confidence,
        interaction_count=5,
        unique_products_count=5,
    )

    assert 300.0 <= profile.preferred_price <= 500.0
    assert profile.confidence > 0.40

    # Low-priced item inside or near range
    budget_cand = make_product("b1", 400.0)
    budget_score = compute_candidate_price_affinity(budget_cand, profile)

    # Luxury item far outside range
    luxury_cand = make_product("l1", 5000.0)
    luxury_score = compute_candidate_price_affinity(luxury_cand, profile)

    assert budget_score.price_affinity_score > luxury_score.price_affinity_score
    assert budget_score.price_affinity_score == 1.0
    assert luxury_score.price_affinity_score < 0.20


# ===========================================================================
# TEST CASE 3: PREMIUM / LUXURY USER (₹5,000 - ₹12,000)
# ===========================================================================

def test_3_premium_luxury_user():
    """Learns luxury price preference and scores ₹8,000 products highest."""
    now = datetime.now(timezone.utc)
    obs = [
        PriceObservation(price=6000.0, event_type=EVENT_PURCHASE, weight=1.0, timestamp=now, product_id="p1"),
        PriceObservation(price=8000.0, event_type=EVENT_PURCHASE, weight=1.0, timestamp=now, product_id="p2"),
        PriceObservation(price=10000.0, event_type=EVENT_CART, weight=0.85, timestamp=now, product_id="p3"),
        PriceObservation(price=7500.0, event_type=EVENT_WISHLIST, weight=0.70, timestamp=now, product_id="p4"),
    ]

    pref_p, low_p, up_p, w_mean, w_med, s_dev, _ = _calculate_weighted_stats(obs, now=now)
    confidence = _calculate_confidence(obs, unique_products_count=4, now=now)

    profile = UserPriceProfile(
        user_id="premium-user",
        preferred_price=pref_p,
        lower_price=low_p,
        upper_price=up_p,
        weighted_mean=w_mean,
        weighted_median=w_med,
        price_std_dev=s_dev,
        confidence=confidence,
        interaction_count=4,
        unique_products_count=4,
    )

    assert 6000.0 <= profile.preferred_price <= 10000.0

    premium_cand = make_product("prem1", 8000.0)
    cheap_cand = make_product("cheap1", 300.0)

    score_prem = compute_candidate_price_affinity(premium_cand, profile)
    score_cheap = compute_candidate_price_affinity(cheap_cand, profile)

    assert score_prem.price_affinity_score > score_cheap.price_affinity_score
    assert score_prem.is_in_range


# ===========================================================================
# TEST CASE 4: MIXED BROWSING HISTORY
# ===========================================================================

def test_4_mixed_browsing_history():
    """User with diverse price points maintains robust log-scale spread."""
    now = datetime.now(timezone.utc)
    obs = [
        PriceObservation(price=400.0, event_type=EVENT_PRODUCT_VIEW, weight=0.35, timestamp=now, product_id="p1"),
        PriceObservation(price=800.0, event_type=EVENT_PRODUCT_VIEW, weight=0.35, timestamp=now, product_id="p2"),
        PriceObservation(price=1200.0, event_type=EVENT_CART, weight=0.85, timestamp=now, product_id="p3"),
        PriceObservation(price=1500.0, event_type=EVENT_WISHLIST, weight=0.70, timestamp=now, product_id="p4"),
        PriceObservation(price=2000.0, event_type=EVENT_PURCHASE, weight=1.0, timestamp=now, product_id="p5"),
    ]

    pref_p, low_p, up_p, w_mean, w_med, s_dev, _ = _calculate_weighted_stats(obs, now=now)
    assert low_p <= pref_p <= up_p
    assert low_p < up_p


# ===========================================================================
# TEST CASE 5: RECENCY WEIGHTING / 14-DAY HALF-LIFE DECAY
# ===========================================================================

def test_5_recency_weighting_shifts_preference():
    """Recent actions dominate old actions due to 14-day exponential decay."""
    now = datetime.now(timezone.utc)
    sixty_days_ago = now - timedelta(days=60)
    one_day_ago = now - timedelta(days=1)

    # 4 old low-price views 60 days ago
    obs_old = [
        PriceObservation(price=300.0, event_type=EVENT_PRODUCT_VIEW, weight=0.35, timestamp=sixty_days_ago, product_id=f"old_{i}")
        for i in range(4)
    ]
    # 2 recent high-price purchases 1 day ago
    obs_recent = [
        PriceObservation(price=5000.0, event_type=EVENT_PURCHASE, weight=1.0, timestamp=one_day_ago, product_id=f"rec_{i}")
        for i in range(2)
    ]

    all_obs = obs_old + obs_recent
    pref_p, low_p, up_p, w_mean, w_med, s_dev, _ = _calculate_weighted_stats(all_obs, now=now)

    # Because 60 days is > 4 half-lives (decay factor < 0.05), recent ₹5,000 purchases dominate
    assert pref_p > 3000.0


# ===========================================================================
# TEST CASE 6: EVENT TYPE IMPORTANCE WEIGHTS
# ===========================================================================

def test_6_event_importance_weights():
    """Purchase (weight 1.0) has stronger pull than view (weight 0.35) at equal timestamp."""
    now = datetime.now(timezone.utc)
    obs = [
        PriceObservation(price=1000.0, event_type=EVENT_PURCHASE, weight=1.00, timestamp=now, product_id="p1"),
        PriceObservation(price=200.0, event_type=EVENT_PRODUCT_VIEW, weight=0.35, timestamp=now, product_id="p2"),
    ]

    pref_p, low_p, up_p, w_mean, w_med, s_dev, _ = _calculate_weighted_stats(obs, now=now)
    # The weighted median is pulled to the purchase price (1000.0)
    assert pref_p == 1000.0


# ===========================================================================
# TEST CASE 7: CATEGORY-SPECIFIC PRICE AFFINITY
# ===========================================================================

def test_7_category_specific_price_affinity():
    """Evaluates separate profiles for Jewelry (₹5,000) and Pottery (₹400)."""
    now = datetime.now(timezone.utc)
    jewelry_obs = [
        PriceObservation(price=4500.0, event_type=EVENT_PURCHASE, weight=1.0, timestamp=now, product_id="j1", category_id="cat-jewelry"),
        PriceObservation(price=5500.0, event_type=EVENT_CART, weight=0.85, timestamp=now, product_id="j2", category_id="cat-jewelry"),
        PriceObservation(price=6000.0, event_type=EVENT_WISHLIST, weight=0.70, timestamp=now, product_id="j3", category_id="cat-jewelry"),
    ]
    pottery_obs = [
        PriceObservation(price=350.0, event_type=EVENT_PURCHASE, weight=1.0, timestamp=now, product_id="p1", category_id="cat-pottery"),
        PriceObservation(price=400.0, event_type=EVENT_CART, weight=0.85, timestamp=now, product_id="p2", category_id="cat-pottery"),
        PriceObservation(price=450.0, event_type=EVENT_WISHLIST, weight=0.70, timestamp=now, product_id="p3", category_id="cat-pottery"),
    ]

    all_obs = jewelry_obs + pottery_obs
    pref_p, low_p, up_p, w_mean, w_med, s_dev, _ = _calculate_weighted_stats(all_obs, now=now)

    j_pref, j_low, j_up, j_mean, j_med, j_dev, _ = _calculate_weighted_stats(jewelry_obs, now=now)
    p_pref, p_low, p_up, p_mean, p_med, p_dev, _ = _calculate_weighted_stats(pottery_obs, now=now)

    categories = {
        "cat-jewelry": CategoryPriceProfile(
            category_id="cat-jewelry",
            preferred_price=j_pref,
            lower_price=j_low,
            upper_price=j_up,
            weighted_mean=j_mean,
            weighted_median=j_med,
            price_std_dev=j_dev,
            confidence=0.80,
            interaction_count=3,
        ),
        "cat-pottery": CategoryPriceProfile(
            category_id="cat-pottery",
            preferred_price=p_pref,
            lower_price=p_low,
            upper_price=p_up,
            weighted_mean=p_mean,
            weighted_median=p_med,
            price_std_dev=p_dev,
            confidence=0.80,
            interaction_count=3,
        ),
    }

    profile = UserPriceProfile(
        user_id="cat-user",
        preferred_price=pref_p,
        lower_price=low_p,
        upper_price=up_p,
        weighted_mean=w_mean,
        weighted_median=w_med,
        price_std_dev=s_dev,
        confidence=0.85,
        interaction_count=6,
        unique_products_count=6,
        categories=categories,
    )

    # 1. ₹5,000 Jewelry item matches jewelry profile
    jewelry_item = make_product("item-j", 5000.0, category_id="cat-jewelry")
    j_res = compute_candidate_price_affinity(jewelry_item, profile)
    assert j_res.used_category_profile
    assert j_res.is_in_range
    assert j_res.price_affinity_score == 1.0

    # 2. ₹400 Pottery item matches pottery profile
    pottery_item = make_product("item-p", 400.0, category_id="cat-pottery")
    p_res = compute_candidate_price_affinity(pottery_item, profile)
    assert p_res.used_category_profile
    assert p_res.is_in_range
    assert p_res.price_affinity_score == 1.0


# ===========================================================================
# TEST CASE 8: CATEGORY FALLBACK TO GLOBAL PROFILE
# ===========================================================================

def test_8_category_fallback_to_global():
    """When a category has < 3 interactions, falls back to the user's global profile."""
    profile = UserPriceProfile(
        user_id="user-fallback",
        preferred_price=1000.0,
        lower_price=700.0,
        upper_price=1400.0,
        weighted_mean=1000.0,
        weighted_median=1000.0,
        price_std_dev=200.0,
        confidence=0.75,
        interaction_count=10,
        unique_products_count=8,
        categories={},  # No category-specific profile
    )

    # Product in novel category "cat-woodwork"
    cand = make_product("wood-1", 950.0, category_id="cat-woodwork")
    res = compute_candidate_price_affinity(cand, profile)

    assert not res.used_category_profile
    assert res.is_in_range
    assert res.price_affinity_score == 1.0


# ===========================================================================
# TEST CASE 9: OUTLIER RESISTANCE
# ===========================================================================

def test_9_outlier_resistance():
    """Single ₹25,000 outlier among many ₹500 items does not skew median."""
    now = datetime.now(timezone.utc)
    obs = [
        PriceObservation(price=500.0, event_type=EVENT_PRODUCT_VIEW, weight=0.35, timestamp=now, product_id=f"p_{i}")
        for i in range(8)
    ]
    # Add one ₹25,000 purchase outlier
    obs.append(
        PriceObservation(price=25000.0, event_type=EVENT_PURCHASE, weight=1.0, timestamp=now, product_id="outlier")
    )

    pref_p, low_p, up_p, w_mean, w_med, s_dev, _ = _calculate_weighted_stats(obs, now=now)

    # Preferred price (weighted median) remains anchored near ₹500
    assert pref_p <= 650.0


# ===========================================================================
# TEST CASE 10: COLD START USER INTEGRATION
# ===========================================================================

def test_10_cold_start_user_integration():
    """Cold user has no preference, score remains neutral 0.50 with 0.0 confidence."""
    profile = UserPriceProfile(
        user_id="cold-user",
        preferred_price=0.0,
        lower_price=0.0,
        upper_price=0.0,
        weighted_mean=0.0,
        weighted_median=0.0,
        price_std_dev=0.0,
        confidence=0.0,
        interaction_count=0,
        unique_products_count=0,
    )

    assert not profile.has_preference
    cand = make_product("p1", 850.0)
    res = compute_candidate_price_affinity(cand, profile)

    assert res.price_affinity_score == 0.50
    assert res.price_affinity_confidence == 0.0


# ===========================================================================
# TEST CASE 11: PRESERVES EXPLORATION (SMOOTH DECAY, NON-BINARY)
# ===========================================================================

def test_11_preserves_exploration_smooth_decay():
    """Candidates outside preferred range get smooth non-zero scores (not filtered out)."""
    profile = UserPriceProfile(
        user_id="user-explore",
        preferred_price=1000.0,
        lower_price=800.0,
        upper_price=1200.0,
        weighted_mean=1000.0,
        weighted_median=1000.0,
        price_std_dev=200.0,
        confidence=0.80,
        interaction_count=10,
        unique_products_count=8,
    )

    # 1. Product at ₹1,500 (25% above upper bound)
    cand_1500 = make_product("p1500", 1500.0)
    res_1500 = compute_candidate_price_affinity(cand_1500, profile)
    assert 0.70 <= res_1500.price_affinity_score < 1.0

    # 2. Product at ₹2,400 (100% above upper bound)
    cand_2400 = make_product("p2400", 2400.0)
    res_2400 = compute_candidate_price_affinity(cand_2400, profile)
    assert 0.05 < res_2400.price_affinity_score < 0.30

    # Never zero or hard-filtered
    assert res_2400.price_affinity_score > 0.0


# ===========================================================================
# TEST CASE 12: MISSING / NONE PRODUCT PRICE SAFETY
# ===========================================================================

def test_12_missing_none_product_price_safety():
    """Product with price=None returns neutral score 0.50 without raising exception."""
    profile = UserPriceProfile(
        user_id="user-test",
        preferred_price=1000.0,
        lower_price=800.0,
        upper_price=1200.0,
        weighted_mean=1000.0,
        weighted_median=1000.0,
        price_std_dev=200.0,
        confidence=0.80,
        interaction_count=5,
        unique_products_count=5,
    )

    cand_none = make_product("p_none", None)
    res = compute_candidate_price_affinity(cand_none, profile)

    assert res.price_affinity_score == 0.50
    assert res.price_affinity_confidence == 0.0


# ===========================================================================
# TEST CASE 13: ZERO OR NEGATIVE PRODUCT PRICE SAFETY
# ===========================================================================

def test_13_zero_or_negative_product_price_safety():
    """Product with price=0.0 or price < 0 returns neutral score 0.50 safely."""
    profile = UserPriceProfile(
        user_id="user-test",
        preferred_price=1000.0,
        lower_price=800.0,
        upper_price=1200.0,
        weighted_mean=1000.0,
        weighted_median=1000.0,
        price_std_dev=200.0,
        confidence=0.80,
        interaction_count=5,
        unique_products_count=5,
    )

    cand_zero = make_product("p_zero", 0.0)
    res_zero = compute_candidate_price_affinity(cand_zero, profile)
    assert res_zero.price_affinity_score == 0.50

    cand_neg = make_product("p_neg", -150.0)
    res_neg = compute_candidate_price_affinity(cand_neg, profile)
    assert res_neg.price_affinity_score == 0.50


# ===========================================================================
# TEST CASE 14: LARGE DYNAMIC RANGE STABILITY (₹100 to ₹100,000)
# ===========================================================================

def test_14_large_dynamic_range_numerical_stability():
    """Handles extreme price ranges without math overflow, NaN, or crash."""
    now = datetime.now(timezone.utc)
    obs = [
        PriceObservation(price=100.0, event_type=EVENT_PRODUCT_VIEW, weight=0.35, timestamp=now, product_id="p1"),
        PriceObservation(price=100000.0, event_type=EVENT_PURCHASE, weight=1.0, timestamp=now, product_id="p2"),
    ]

    pref_p, low_p, up_p, w_mean, w_med, s_dev, _ = _calculate_weighted_stats(obs, now=now)
    assert not math.isnan(pref_p)
    assert not math.isinf(pref_p)
    assert pref_p > 0.0

    profile = UserPriceProfile(
        user_id="wide-user",
        preferred_price=pref_p,
        lower_price=low_p,
        upper_price=up_p,
        weighted_mean=w_mean,
        weighted_median=w_med,
        price_std_dev=s_dev,
        confidence=0.60,
        interaction_count=2,
        unique_products_count=2,
    )

    cand_extreme = make_product("p_huge", 500000.0)
    res = compute_candidate_price_affinity(cand_extreme, profile)
    assert not math.isnan(res.price_affinity_score)
    assert 0.0 <= res.price_affinity_score <= 1.0


# ===========================================================================
# SEARCH INTENT HELPER TEST
# ===========================================================================

def test_search_price_extraction():
    """Extracts explicit price intent from user queries."""
    res1 = extract_price_from_search_query("wooden toys under 1000")
    assert res1 == (0.0, 1000.0)

    res2 = extract_price_from_search_query("silk saree 2000 to 5000")
    assert res2 == (2000.0, 5000.0)

    res3 = extract_price_from_search_query("brass lamps")
    assert res3 is None
