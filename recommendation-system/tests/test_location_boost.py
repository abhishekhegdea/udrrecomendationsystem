"""Tests for precise distance scoring and nearby-first re-ranking."""

from __future__ import annotations

import math

from app.ml.click_event_recommendation import (
    PERSONALIZED_CLICK_WEIGHTS,
)
from app.ml.recommendation_engine import (
    DEFAULT_DISTANCE_DECAY_KM,
    DEFAULT_LOCAL_SLOTS,
    DEFAULT_LOCATION_PRIORITY_SLOTS,
    EngineConfig,
    FeatureComputer,
    RankerSelector,
    ScoredProduct,
    distance_location_score,
    haversine_distance_km,
)


class _StubSeller:
    def __init__(
        self,
        city_id: str | None = None,
        state_id: str | None = None,
        latitude: float | None = None,
        longitude: float | None = None,
    ):
        self.cityId = city_id
        self.stateId = state_id
        self.latitude = latitude
        self.longitude = longitude


class _StubCategory:
    def __init__(self, name: str = "General"):
        self.name = name


class _StubProduct:
    def __init__(
        self,
        pid: str,
        seller: _StubSeller | None = None,
    ):
        self.id = pid
        self.name = pid
        self.popularity = 1.0
        self.averageRating = 4.5
        self.reviewsCount = 10
        self.seller = seller
        self.category = _StubCategory()
        self.categoryId = "cat"


class _FakeFeatureComputer:
    def __init__(self, config: EngineConfig):
        self.config = config

    _compute_location_features = FeatureComputer._compute_location_features
    _compute_location_boost = FeatureComputer._compute_location_boost


def test_haversine_same_point_is_zero():
    assert haversine_distance_km(24.5854, 73.7125, 24.5854, 73.7125) == 0.0


def test_distance_score_decreases_with_distance():
    zero = distance_location_score(0.0)
    ten = distance_location_score(10.0)
    fifty = distance_location_score(50.0)

    assert zero == 1.0
    assert zero > ten > fifty > 0.0
    assert math.isclose(
        distance_location_score(DEFAULT_DISTANCE_DECAY_KM),
        math.exp(-1.0),
        rel_tol=1e-9,
    )


def test_precise_coordinates_produce_distance_and_nearby_flag():
    cfg = EngineConfig(
        user_latitude=24.5854,
        user_longitude=73.7125,
        nearby_radius_km=100.0,
    )
    computer = _FakeFeatureComputer(cfg)
    product = _StubProduct(
        "p1",
        _StubSeller(
            latitude=24.6000,
            longitude=73.7200,
        ),
    )

    score, distance, nearby = computer._compute_location_features(product)

    assert distance is not None
    assert distance < 5.0
    assert 0.0 < score <= 1.0
    assert nearby is True


def test_city_fallback_when_seller_has_no_coordinates():
    cfg = EngineConfig(user_city_id="CITY-1")
    computer = _FakeFeatureComputer(cfg)
    product = _StubProduct(
        "p1",
        _StubSeller(city_id="CITY-1"),
    )

    score, distance, nearby = computer._compute_location_features(product)

    assert score == 0.75
    assert distance is None
    assert nearby is True


def test_state_fallback_when_seller_has_no_coordinates():
    cfg = EngineConfig(user_state_id="STATE-1")
    computer = _FakeFeatureComputer(cfg)
    product = _StubProduct(
        "p1",
        _StubSeller(state_id="STATE-1"),
    )

    score, distance, nearby = computer._compute_location_features(product)

    assert score == 0.40
    assert distance is None
    assert nearby is False


def test_nearest_products_receive_priority_slots():
    cfg = EngineConfig(
        total_slots=4,
        user_latitude=24.58,
        user_longitude=73.68,
        location_priority_slots=2,
        location_priority_min_score=0.1,
    )

    items = []
    for pid, score, distance, nearby in [
        ("high-far", 0.95, 80.0, True),
        ("near-2", 0.50, 2.0, True),
        ("near-1", 0.40, 1.0, True),
        ("non-local", 0.90, None, False),
    ]:
        sp = ScoredProduct(product=_StubProduct(pid))
        sp.final_score = score
        sp.seller_distance_km = distance
        sp.nearby_seller = nearby
        items.append(sp)

    ranked = RankerSelector(4, config=cfg).select(items)

    assert [sp.product.id for sp in ranked[:2]] == ["near-1", "near-2"]
    assert ranked[0].location_priority_applied is True
    assert ranked[1].location_priority_applied is True


def test_default_location_configuration():
    cfg = EngineConfig()
    assert cfg.local_slots == DEFAULT_LOCAL_SLOTS
    assert cfg.location_priority_slots == DEFAULT_LOCATION_PRIORITY_SLOTS


def test_personalized_location_weight_is_rebalanced():
    # Location stayed near its original weight but was rebalanced when the
    # price_behavior signal (0.05) joined the weight set.
    assert math.isclose(
        PERSONALIZED_CLICK_WEIGHTS["location"],
        0.095,
        rel_tol=1e-12,
    )
    assert math.isclose(
        sum(PERSONALIZED_CLICK_WEIGHTS.values()),
        1.0,
        rel_tol=1e-12,
    )


def test_location_contribution_is_score_times_weight():
    score = distance_location_score(5.0)
    contribution = score * PERSONALIZED_CLICK_WEIGHTS["location"]
    assert contribution > 0.0
    assert contribution < PERSONALIZED_CLICK_WEIGHTS["location"]
