"""
test_seller_scoring.py — Unit and integration tests for Seller Performance & Trust Scoring.
"""

import pytest
import math
from unittest.mock import MagicMock
from types import SimpleNamespace

from app.ml.seller_scoring import (
    normalize_rating_score,
    compute_fulfilment_score,
    compute_dispatch_sla_score,
    compute_cancellation_score,
    compute_return_quality_score,
    resolve_trust_badge,
    compute_seller_performance,
    SellerPerformanceMetrics,
    WEIGHT_RATING,
    WEIGHT_FULFILMENT,
    WEIGHT_DISPATCH,
    WEIGHT_CANCELLATION,
    WEIGHT_RETURN,
    NEUTRAL_SELLER_SCORE,
    BADGE_TOP_RATED,
    BADGE_FAST_DISPATCH,
    BADGE_RELIABLE,
    BADGE_STANDARD,
    BADGE_AT_RISK,
)
from app.ml.seller_boost import (
    apply_seller_trust_adjustment,
    fair_rank,
)


class TestSellerScoringPillars:
    """Tests the 5 operational pillars and their mathematical formulations."""

    def test_weights_sum_to_one(self):
        total_weight = (
            WEIGHT_RATING
            + WEIGHT_FULFILMENT
            + WEIGHT_DISPATCH
            + WEIGHT_CANCELLATION
            + WEIGHT_RETURN
        )
        assert math.isclose(total_weight, 1.00, rel_tol=1e-6)

    def test_normalize_rating_score_unrated_and_zero(self):
        # Zero / unrated should safely return 0.70 prior baseline
        assert normalize_rating_score(0.0, 0) == 0.70
        assert normalize_rating_score(-1.0, 0) == 0.70

    def test_normalize_rating_score_bayesian_smoothing(self):
        # 1 perfect 5-star review blends with prior (4.0 * 3) -> (5 + 12)/4 = 4.25 -> (4.25-1)/4 = 0.8125
        score_1_review = normalize_rating_score(5.0, 1)
        assert 0.80 <= score_1_review <= 0.85

        # 50 perfect 5-star reviews approach 1.0
        score_many_reviews = normalize_rating_score(5.0, 50)
        assert score_many_reviews > 0.95

        # Poor rating 1.5 with 20 reviews drops significantly
        score_poor = normalize_rating_score(1.5, 20)
        assert score_poor < 0.25

    def test_compute_fulfilment_score(self):
        # Baseline for 0 orders
        assert compute_fulfilment_score(0, 0) == 1.0
        # 10 out of 10 delivered
        assert compute_fulfilment_score(10, 10) == 1.0
        # 8 out of 10 delivered
        assert compute_fulfilment_score(10, 8) == 0.80
        # 0 out of 5 delivered
        assert compute_fulfilment_score(5, 0) == 0.0

    def test_compute_dispatch_sla_score(self):
        # Baseline for 0 dispatches
        assert compute_dispatch_sla_score(0, 0) == 1.0
        # 10 on-time out of 10
        assert compute_dispatch_sla_score(10, 10) == 1.0
        # 7 on-time out of 10
        assert compute_dispatch_sla_score(10, 7) == 0.70
        # 0 on-time out of 5
        assert compute_dispatch_sla_score(5, 0) == 0.0

    def test_compute_cancellation_score(self):
        # 0% cancellations -> 1.0
        assert compute_cancellation_score(0.0) == 1.0
        # 5% cancellations -> 0.85
        assert math.isclose(compute_cancellation_score(0.05), 0.85, rel_tol=1e-5)
        # 33.3% or more cancellations -> 0.0
        assert compute_cancellation_score(0.35) == 0.0
        assert compute_cancellation_score(0.50) == 0.0

    def test_compute_return_quality_score(self):
        # 0% returns -> 1.0
        assert compute_return_quality_score(0.0) == 1.0
        # 5% returns -> 0.75
        assert math.isclose(compute_return_quality_score(0.05), 0.75, rel_tol=1e-5)
        # 20% returns -> 0.0
        assert compute_return_quality_score(0.20) == 0.0
        assert compute_return_quality_score(0.30) == 0.0

    def test_resolve_trust_badge(self):
        # Top Rated requires score >= 0.88 and >= 5 completed
        assert resolve_trust_badge(0.92, 0.90, 0.80, 10) == BADGE_TOP_RATED
        # Top Rated blocked if not enough completed orders (< 5)
        assert resolve_trust_badge(0.92, 0.90, 0.80, 2) == BADGE_RELIABLE

        # Fast Dispatch requires score >= 0.80, SLA >= 0.95, and >= 3 completed
        assert resolve_trust_badge(0.82, 0.98, 0.60, 4) == BADGE_FAST_DISPATCH

        # Reliable for score >= 0.70
        assert resolve_trust_badge(0.72, 0.80, 0.50, 2) == BADGE_RELIABLE

        # Standard for score >= 0.55
        assert resolve_trust_badge(0.60, 0.70, 0.50, 2) == BADGE_STANDARD

        # At Risk for score < 0.55
        assert resolve_trust_badge(0.45, 0.50, 0.50, 2) == BADGE_AT_RISK


class TestSellerScoringColdStartAndDB:
    """Tests cold start protection, confidence gating, and mock DB performance calculation."""

    def test_cold_start_new_seller_fallback(self):
        # Mock DB session with no seller
        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = None

        metrics = compute_seller_performance(mock_db, "non-existent-seller")
        assert metrics.final_trust_score == NEUTRAL_SELLER_SCORE
        assert metrics.confidence == 0.0
        assert metrics.total_orders == 0

    def test_cold_start_seller_with_no_products(self):
        mock_seller = MagicMock()
        mock_seller.id = "seller-123"
        mock_seller.rating = 4.8
        mock_seller.isNewSeller = True

        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = mock_seller
        # No product IDs returned
        mock_db.query.return_value.filter.return_value.all.return_value = []

        metrics = compute_seller_performance(mock_db, "seller-123")
        assert metrics.final_trust_score == NEUTRAL_SELLER_SCORE
        assert metrics.confidence == 0.0
        assert metrics.trust_badge == BADGE_RELIABLE


class TestSellerTrustRecommendationIntegration:
    """Tests seller trust boost in recommendation ranking."""

    def test_apply_seller_trust_adjustment(self):
        p_high = SimpleNamespace(
            id="p1", 
            sellerId="s_high", 
            final_score=1.0, 
            seller=SimpleNamespace(sellerTrustScore=0.95)
        )
        p_neutral = SimpleNamespace(
            id="p2", 
            sellerId="s_neutral", 
            final_score=1.0, 
            seller=SimpleNamespace(sellerTrustScore=0.70)
        )
        p_low = SimpleNamespace(
            id="p3", 
            sellerId="s_low", 
            final_score=1.0, 
            seller=SimpleNamespace(sellerTrustScore=0.45)
        )

        products = [p_high, p_neutral, p_low]
        apply_seller_trust_adjustment(products, attribute="final_score")

        assert p_high.final_score > 1.01
        assert p_neutral.final_score == 1.00
        assert p_low.final_score < 0.99

    def test_fair_rank_includes_seller_trust(self):
        p1 = SimpleNamespace(
            id="p1",
            sellerId="s1",
            final_score=0.80,
            seller=SimpleNamespace(id="s1", isNewSeller=False, sellerTrustScore=0.95, cancelPenalty=0, returnPenalty=0)
        )
        p2 = SimpleNamespace(
            id="p2",
            sellerId="s2",
            final_score=0.80,
            seller=SimpleNamespace(id="s2", isNewSeller=False, sellerTrustScore=0.45, cancelPenalty=2, returnPenalty=0)
        )
        p3 = SimpleNamespace(
            id="p3",
            sellerId="s3",
            final_score=0.80,
            seller=SimpleNamespace(id="s3", isNewSeller=True, sellerTrustScore=0.70, cancelPenalty=0, returnPenalty=0)
        )

        ranked = fair_rank([p1, p2, p3], total_slots=3, new_seller_ratio=0.15)
        assert len(ranked) == 3
        # p2 (low trust + cancel penalty) should rank last
        assert ranked[-1].id == "p2"
