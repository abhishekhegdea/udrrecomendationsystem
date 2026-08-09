"""
test_engagement.py — Standalone tests for the behaviour-engagement signal

Covers the **cart / wishlist / click / search** scoring added to the
recommendation engine:

- The ``engagement`` blending weight exists and the weights sum to 1.0.
- ``FeatureComputer._compute_engagement_score`` maps raw behaviour events
  into a bounded score and applies search-term affinity.

Run with::

    python tests/test_engagement.py

No external dependencies beyond Python 3.10+ and the standard library.
The tests use simple mock objects that mimic the Product attributes
``recommendation_engine.py`` accesses at runtime.
"""

from __future__ import annotations

import math
import os
import sys

# Allow running from the recommendation-system/ directory
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.ml.recommendation_engine import (  # noqa: E402
    DEFAULT_CANDIDATE_LIMITS,
    DEFAULT_WEIGHTS,
    ENGAGEMENT_EVENT_WEIGHTS,
    SEARCH_AFFINITY_MAX,
    FeatureComputer,
)

EXPECTED_EVENT_WEIGHTS = {
    "PURCHASE": 1.0,
    "CART": 0.8,
    "WISHLIST": 0.6,
    "CLICK": 0.4,
    "PRODUCT_VIEW": 0.2,
}


class MockProduct:
    """Minimal stand-in for the SQLAlchemy Product model."""

    def __init__(self, product_id: str, name: str, tags=None, materials=None, brand=None):
        self.id = product_id
        self.name = name
        self.tags = tags or []
        self.materials = materials or []
        self.brand = brand


def compute_engagement(product, engagement=None, search_terms=None):
    """Call the static scoring method with sensible defaults."""
    return FeatureComputer._compute_engagement_score(
        product,
        engagement or {},
        set(search_terms or []),
    )


# ---------------------------------------------------------------------------
# Tests — weights configuration
# ---------------------------------------------------------------------------

def test_default_weights_include_engagement():
    """The engagement signal is part of the default blend."""
    assert "engagement" in DEFAULT_WEIGHTS, "engagement weight missing"
    assert DEFAULT_WEIGHTS["engagement"] > 0, "engagement weight must be positive"
    print("  ✅ test_default_weights_include_engagement")


def test_default_weights_sum_to_one():
    """Blending weights sum to 1.0 (within float tolerance)."""
    total = sum(DEFAULT_WEIGHTS.values())
    assert abs(total - 1.0) < 1e-6, f"Weights sum to {total}, expected 1.0"
    print("  ✅ test_default_weights_sum_to_one")


def test_engagement_event_weights_cover_requested_signals():
    """
    Cart, wishlist and click signals are all weighted per product.

    SEARCH has no productId on its event row, so it is handled through
    search-term affinity instead of the per-product weight table.

    RETURN is a deliberate NEGATIVE signal — returned products are
    demoted for that user — so its weight must be below zero.
    """
    for key in ("CART", "WISHLIST", "CLICK", "PURCHASE", "PRODUCT_VIEW", "RETURN"):
        assert key in ENGAGEMENT_EVENT_WEIGHTS, f"{key} missing from event weights"
    assert ENGAGEMENT_EVENT_WEIGHTS["RETURN"] < 0, "RETURN should be a negative signal"
    print("  ✅ test_engagement_event_weights_cover_requested_signals")


def test_candidate_limits_include_search_affinity():
    """Search affinity is a candidate source."""
    assert "search_affinity" in DEFAULT_CANDIDATE_LIMITS
    assert DEFAULT_CANDIDATE_LIMITS["search_affinity"] > 0
    print("  ✅ test_candidate_limits_include_search_affinity")


# ---------------------------------------------------------------------------
# Tests — engagement score computation
# ---------------------------------------------------------------------------

def test_no_signals_is_zero():
    """A cold user / unrelated product scores 0.0."""
    p = MockProduct("p1", "Handwoven Wool Shawl")
    assert compute_engagement(p) == 0.0
    print("  ✅ test_no_signals_is_zero")


def test_positive_engagement_raises_score():
    """Cart/wishlist/click activity pushes the score above zero."""
    p = MockProduct("p1", "Ceramic Vase")
    score = compute_engagement(p, {"p1": 1.5})
    expected = 1.0 - math.exp(-1.5 / 1.5)
    assert abs(score - expected) < 1e-6, f"Expected {expected}, got {score}"
    assert 0.5 < score < 1.0, f"Score should be strongly positive, got {score}"
    print(f"  ✅ test_positive_engagement_raises_score ({score:.3f})")


def test_negative_engagement_lowers_score():
    """Cart/wishlist removals produce a negative (or clamped) score."""
    p = MockProduct("p1", "Ceramic Vase")
    score = compute_engagement(p, {"p1": -0.4})
    assert score < 0.0, f"Expected negative score, got {score}"
    print(f"  ✅ test_negative_engagement_lowers_score ({score:.3f})")


def test_search_affinity_matches_product_terms():
    """Products matching the user's recent searches get a boost."""
    p = MockProduct("p1", "Handwoven Wool Shawl", tags=["shawl", "wool"])
    score = compute_engagement(p, search_terms=["wool", "shawl"])
    assert score > 0.0, f"Expected search boost, got {score}"
    assert score <= SEARCH_AFFINITY_MAX, f"Search boost exceeds cap: {score}"
    print(f"  ✅ test_search_affinity_matches_product_terms ({score:.3f})")


def test_search_affinity_no_match():
    """Unrelated products get no search boost."""
    p = MockProduct("p1", "Ceramic Vase", tags=["pottery"])
    score = compute_engagement(p, search_terms=["wool", "shawl"])
    assert score == 0.0, f"Expected 0.0, got {score}"
    print("  ✅ test_search_affinity_no_match")


def test_search_affinity_is_capped():
    """Many matching terms never exceed the cap."""
    p = MockProduct(
        "p1",
        "wool shawl scarf winter warm cozy knit handmade gift",
        tags=["wool", "shawl", "scarf", "winter", "warm", "cozy", "knit", "handmade", "gift"],
    )
    terms = {"wool", "shawl", "scarf", "winter", "warm", "cozy", "knit", "handmade"}
    score = compute_engagement(p, search_terms=terms)
    assert abs(score - SEARCH_AFFINITY_MAX) < 1e-6, f"Expected cap {SEARCH_AFFINITY_MAX}, got {score}"
    print(f"  ✅ test_search_affinity_is_capped ({score:.3f})")


def test_engagement_and_search_combine():
    """Direct engagement and search affinity add together (bounded at 1.0)."""
    p = MockProduct("p1", "Handwoven Wool Shawl", tags=["shawl"])
    score = compute_engagement(p, {"p1": 1.5}, ["wool"])
    assert score > 0.632 and score <= 1.0, f"Unexpected combined score {score}"
    print(f"  ✅ test_engagement_and_search_combine ({score:.3f})")


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------

def run_all():
    """Execute every test_* function in this module."""
    tests = [
        test_default_weights_include_engagement,
        test_default_weights_sum_to_one,
        test_engagement_event_weights_cover_requested_signals,
        test_candidate_limits_include_search_affinity,
        test_no_signals_is_zero,
        test_positive_engagement_raises_score,
        test_negative_engagement_lowers_score,
        test_search_affinity_matches_product_terms,
        test_search_affinity_no_match,
        test_search_affinity_is_capped,
        test_engagement_and_search_combine,
    ]

    passed = 0
    failed = 0
    for test_fn in tests:
        name = test_fn.__name__
        try:
            test_fn()
            passed += 1
        except Exception as e:
            print(f"  ❌ {name} FAILED: {e}")
            failed += 1

    print(f"\n{'=' * 50}")
    print(f"  Results: {passed} passed, {failed} failed, {len(tests)} total")
    print(f"{'=' * 50}")
    return failed == 0


if __name__ == "__main__":
    success = run_all()
    sys.exit(0 if success else 1)
