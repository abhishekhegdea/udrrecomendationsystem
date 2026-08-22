"""
Tests for location-based recommendation boost and local-seller slot reservation.
"""

from __future__ import annotations

import sys
import os
from dataclasses import dataclass, field
from typing import Optional

# Ensure the app package is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.ml.recommendation_engine import (
    DEFAULT_LOCAL_SLOTS,
    EngineConfig,
    FeatureComputer,
    ScoredProduct,
)


# ---------------------------------------------------------------------------
# Minimal stubs so we can test without a real DB session
# ---------------------------------------------------------------------------

class _StubSeller:
    def __init__(self, city_id: str | None = None, state_id: str | None = None):
        self.cityId = city_id
        self.stateId = state_id


class _StubCategory:
    def __init__(self, name: str = "General"):
        self.name = name


class _StubProduct:
    def __init__(
        self,
        pid: str = "p1",
        name: str = "Test Product",
        popularity: float = 10.0,
        average_rating: float = 4.0,
        reviews_count: int = 5,
        seller_city: str | None = None,
        seller_state: str | None = None,
        category_name: str = "General",
    ):
        self.id = pid
        self.name = name
        self.popularity = popularity
        self.averageRating = average_rating
        self.reviewsCount = reviews_count
        self.seller = _StubSeller(seller_city, seller_state)
        self.category = _StubCategory(category_name)
        self.categoryId = "cat1"


class _StubScoredProduct:
    """Minimal stand-in for ScoredProduct used in reserve_local_slots."""
    def __init__(self, pid: str, final_score: float, location_boost: float = 0.0):
        self.product = _StubProduct(pid=pid)
        self.final_score = final_score
        self.location_boost = location_boost


# ---------------------------------------------------------------------------
# Tests: FeatureComputer._compute_location_boost
# ---------------------------------------------------------------------------

class _FakeFeatureComputer:
    """Bypass the real FeatureComputer.__init__ (needs DB) to test the boost method."""

    def __init__(self, config: EngineConfig):
        self.config = config

    # Bind the unbound method to our fake instance
    _compute_location_boost = FeatureComputer._compute_location_boost


def _make_config(**kwargs) -> EngineConfig:
    defaults = dict(
        user_city_id=None,
        user_state_id=None,
        user_location=None,
    )
    defaults.update(kwargs)
    return EngineConfig(**defaults)


def test_same_city_gives_20_pct_boost():
    cfg = _make_config(user_city_id="CITY-1")
    fc = _FakeFeatureComputer(cfg)
    product = _StubProduct(seller_city="CITY-1")
    assert fc._compute_location_boost(product) == 0.20


def test_same_state_different_city_gives_10_pct_boost():
    cfg = _make_config(user_state_id="STATE-1")
    fc = _FakeFeatureComputer(cfg)
    product = _StubProduct(seller_state="STATE-1")
    assert fc._compute_location_boost(product) == 0.10


def test_no_match_gives_zero():
    cfg = _make_config(user_city_id="CITY-99", user_state_id="STATE-99")
    fc = _FakeFeatureComputer(cfg)
    product = _StubProduct(seller_city="OTHER-CITY", seller_state="OTHER-STATE")
    assert fc._compute_location_boost(product) == 0.0


def test_no_location_config_gives_zero():
    cfg = _make_config()
    fc = _FakeFeatureComputer(cfg)
    product = _StubProduct(seller_city="CITY-1")
    assert fc._compute_location_boost(product) == 0.0


def test_city_match_takes_priority_over_state():
    cfg = _make_config(user_city_id="CITY-1", user_state_id="STATE-1")
    fc = _FakeFeatureComputer(cfg)
    product = _StubProduct(seller_city="CITY-1", seller_state="STATE-1")
    # City match wins (0.20 > 0.10)
    assert fc._compute_location_boost(product) == 0.20


def test_no_seller_gives_zero():
    cfg = _make_config(user_city_id="CITY-1")
    fc = _FakeFeatureComputer(cfg)
    product = _StubProduct()
    product.seller = None
    assert fc._compute_location_boost(product) == 0.0


# ---------------------------------------------------------------------------
# Tests: local_slots default
# ---------------------------------------------------------------------------

def test_default_local_slots():
    cfg = EngineConfig()
    assert cfg.local_slots == DEFAULT_LOCAL_SLOTS
    assert DEFAULT_LOCAL_SLOTS == 2


# ---------------------------------------------------------------------------
# Tests: BusinessRuleFilter._reserve_local_slots
# ---------------------------------------------------------------------------

class _FakeBusinessRuleFilter:
    def __init__(self, config: EngineConfig):
        self.config = config

    _reserve_local_slots = None  # set below after import


def _make_br_filter(config: EngineConfig):
    from app.ml.recommendation_engine import BusinessRuleFilter
    f = _FakeBusinessRuleFilter(config)
    # Bind the real method
    f._reserve_local_slots = BusinessRuleFilter._reserve_local_slots.__get__(f, type(f))
    return f


def test_local_slot_replaces_lowest_non_local():
    cfg = _make_config(user_city_id="CITY-1", local_slots=1)
    brf = _make_br_filter(cfg)

    # 3 products in final: 2 non-local + 1 local already present
    final = [
        _StubScoredProduct("p-high", 0.90, location_boost=0.0),
        _StubScoredProduct("p-mid", 0.60, location_boost=0.0),
        _StubScoredProduct("p-local-in", 0.50, location_boost=0.20),
    ]
    # Pool has 1 local product that was trimmed from final
    pool = final + [_StubScoredProduct("p-local-missing", 0.30, location_boost=0.20)]

    result = brf._reserve_local_slots(final, pool)

    ids = [sp.product.id for sp in result]
    # The missing local product should be injected
    assert "p-local-missing" in ids
    # The lowest non-local (p-mid, 0.60) should be dropped
    assert "p-mid" not in ids
    # High-scoring non-local and existing local stay
    assert "p-high" in ids
    assert "p-local-in" in ids


def test_local_slot_no_op_when_no_missing():
    cfg = _make_config(user_city_id="CITY-1", local_slots=2)
    brf = _make_br_filter(cfg)

    final = [
        _StubScoredProduct("p1", 0.90, location_boost=0.20),
        _StubScoredProduct("p2", 0.60, location_boost=0.20),
    ]
    pool = list(final)

    result = brf._reserve_local_slots(final, pool)
    ids = [sp.product.id for sp in result]
    assert ids == ["p1", "p2"]


def test_local_slot_no_op_when_no_locals():
    cfg = _make_config(user_city_id="CITY-1", local_slots=2)
    brf = _make_br_filter(cfg)

    final = [
        _StubScoredProduct("p1", 0.90, location_boost=0.0),
        _StubScoredProduct("p2", 0.60, location_boost=0.0),
    ]

    result = brf._reserve_local_slots(final, final)
    ids = [sp.product.id for sp in result]
    assert ids == ["p1", "p2"]


def test_local_slot_empty_final():
    cfg = _make_config(user_city_id="CITY-1", local_slots=2)
    brf = _make_br_filter(cfg)
    result = brf._reserve_local_slots([], [])
    assert result == []


def test_local_slots_respects_limit():
    cfg = _make_config(user_city_id="CITY-1", local_slots=2)
    brf = _make_br_filter(cfg)

    # final has 2 non-local products; pool has 3 local missing
    final = [
        _StubScoredProduct("p1", 0.90, location_boost=0.0),
        _StubScoredProduct("p2", 0.80, location_boost=0.0),
    ]
    pool = final + [
        _StubScoredProduct("p-local-a", 0.10, location_boost=0.20),
        _StubScoredProduct("p-local-b", 0.08, location_boost=0.20),
        _StubScoredProduct("p-local-c", 0.06, location_boost=0.20),
    ]

    result = brf._reserve_local_slots(final, pool)
    local_count = sum(1 for sp in result if sp.location_boost > 0)
    # Should inject exactly local_slots (2) locals
    assert local_count == 2
    # The 2 lowest non-locals (p1 at 0.90 stays, p2 at 0.80 gets dropped)
    # Actually p2 (0.80) is the lowest, so p1 stays + 2 locals
    assert len(result) == 2


if __name__ == "__main__":
    import pytest
    sys.exit(pytest.main([__file__, "-v"]))
