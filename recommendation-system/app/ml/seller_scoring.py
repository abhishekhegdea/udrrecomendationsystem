"""
seller_scoring.py — Comprehensive Seller Trust & Performance Scoring for UdrCrafts

Evaluates artisans across 5 core operational pillars:
1. Customer Rating (30%): Bayesian-smoothed review ratings normalized from 1..5 to 0..1.
2. Fulfilment History (25%): Successful delivery completion rate.
3. Dispatch Reliability (20%): Orders dispatched within promised SLA.
4. Cancellation Control (15%): Low seller-initiated cancellation rate.
5. Return Quality Control (10%): Low quality/damage return rate.

Cold-start confidence gating protects new sellers from being unfairly penalized for low volume.
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Order, OrderItem, Product, Rating, Review, Seller

logger = logging.getLogger(__name__)

# ===========================================================================
# WEIGHT CONSTANTS & CONFIGURATION
# ===========================================================================

WEIGHT_RATING = 0.30
WEIGHT_FULFILMENT = 0.25
WEIGHT_DISPATCH = 0.20
WEIGHT_CANCELLATION = 0.15
WEIGHT_RETURN = 0.10

# Total check
assert math.isclose(
    WEIGHT_RATING + WEIGHT_FULFILMENT + WEIGHT_DISPATCH + WEIGHT_CANCELLATION + WEIGHT_RETURN,
    1.00,
    rel_tol=1e-6,
)

# Neutral prior score for brand new sellers with 0 historical orders
NEUTRAL_SELLER_SCORE = 0.70

# Orders needed for 100% empirical saturation (confidence = 1 - exp(-N / SATURATION_ORDERS))
SATURATION_ORDERS = 10.0

# Trust Badge Thresholds
BADGE_TOP_RATED = "TOP_RATED"
BADGE_FAST_DISPATCH = "FAST_DISPATCH"
BADGE_RELIABLE = "RELIABLE"
BADGE_STANDARD = "STANDARD"
BADGE_AT_RISK = "AT_RISK"


@dataclass
class SellerPerformanceMetrics:
    """Comprehensive performance and trust metrics for a seller."""
    seller_id: str
    raw_trust_score: float            # Weighted sum of 5 pillars (0.0 to 1.0)
    final_trust_score: float          # Confidence-gated final score (0.0 to 1.0)
    confidence: float                 # Sample volume confidence (0.0 to 1.0)
    rating_score: float               # Normalized rating (0.0 to 1.0)
    average_rating: float             # Raw average rating (1.0 to 5.0)
    fulfilment_rate: float            # Delivery completion rate (0.0 to 1.0)
    dispatch_sla_score: float         # On-time dispatch rate (0.0 to 1.0)
    cancellation_rate: float          # Seller cancellation rate (0.0 to 1.0)
    return_rate: float                # Quality return rate (0.0 to 1.0)
    total_orders: int                 # Total orders in evaluation window
    total_completed: int              # Total successfully completed orders
    total_cancelled: int              # Total seller-cancelled orders
    total_returned: int               # Total quality-returned orders
    trust_badge: str                  # TOP_RATED, FAST_DISPATCH, RELIABLE, STANDARD, AT_RISK
    explanation: str = ""


# ===========================================================================
# METRIC COMPUTATIONS
# ===========================================================================

def normalize_rating_score(avg_rating: float, rating_count: int = 0) -> float:
    """
    Normalizes a 1..5 star rating to [0.0, 1.0] with Bayesian smoothing.
    
    If rating_count is 0 or unrated, returns a solid baseline 0.70 (equivalent to 3.8/5.0).
    """
    if avg_rating <= 0.0 or rating_count == 0:
        return 0.70

    # Bayesian smoothing: blend with prior mean of 4.0 over 3 pseudo-reviews
    prior_mean = 4.0
    prior_weight = 3.0
    smoothed = (avg_rating * rating_count + prior_mean * prior_weight) / (rating_count + prior_weight)
    
    # Scale from [1.0, 5.0] to [0.0, 1.0]
    return max(0.0, min(1.0, (smoothed - 1.0) / 4.0))


def compute_fulfilment_score(total_orders: int, delivered_orders: int) -> float:
    """Calculates successful delivery completion rate."""
    if total_orders <= 0:
        return 1.0  # Perfect baseline for new sellers
    return max(0.0, min(1.0, delivered_orders / total_orders))


def compute_dispatch_sla_score(dispatched_orders: int, on_time_dispatches: int) -> float:
    """Calculates on-time dispatch rate according to SLA."""
    if dispatched_orders <= 0:
        return 1.0  # Perfect baseline for new sellers
    return max(0.0, min(1.0, on_time_dispatches / dispatched_orders))


def compute_cancellation_score(cancellation_rate: float) -> float:
    """
    Scores cancellation control.
    0% cancellations = 1.0
    5% cancellations = 0.85
    >33% cancellations = 0.0
    """
    return max(0.0, min(1.0, 1.0 - 3.0 * cancellation_rate))


def compute_return_quality_score(return_rate: float) -> float:
    """
    Scores return quality control (quality/damaged defect rate).
    0% returns = 1.0
    5% returns = 0.75
    >20% returns = 0.0
    """
    return max(0.0, min(1.0, 1.0 - 5.0 * return_rate))


def resolve_trust_badge(
    final_score: float,
    dispatch_sla_score: float,
    confidence: float,
    total_completed: int,
) -> str:
    """Assigns an earned trust badge based on comprehensive performance."""
    if final_score >= 0.88 and total_completed >= 5:
        return BADGE_TOP_RATED
    if final_score >= 0.80 and dispatch_sla_score >= 0.95 and total_completed >= 3:
        return BADGE_FAST_DISPATCH
    if final_score >= 0.70:
        return BADGE_RELIABLE
    if final_score >= 0.55:
        return BADGE_STANDARD
    return BADGE_AT_RISK


# ===========================================================================
# CORE SELLER PERFORMANCE CALCULATION
# ===========================================================================

def compute_seller_performance(
    db: Session,
    seller_id: str,
    window_days: int = 90,
) -> SellerPerformanceMetrics:
    """
    Computes a seller's multi-pillar performance metrics from live database records.
    """
    seller = db.query(Seller).filter(Seller.id == seller_id).first()
    if not seller:
        return SellerPerformanceMetrics(
            seller_id=seller_id,
            raw_trust_score=NEUTRAL_SELLER_SCORE,
            final_trust_score=NEUTRAL_SELLER_SCORE,
            confidence=0.0,
            rating_score=0.70,
            average_rating=seller.rating if seller else 0.0,
            fulfilment_rate=1.0,
            dispatch_sla_score=1.0,
            cancellation_rate=0.0,
            return_rate=0.0,
            total_orders=0,
            total_completed=0,
            total_cancelled=0,
            total_returned=0,
            trust_badge=BADGE_STANDARD,
            explanation="New artisan with no previous order history.",
        )

    # 1. Gather all product IDs owned by this seller
    product_ids = [p.id for p in db.query(Product.id).filter(Product.sellerId == seller_id).all()]
    if not product_ids:
        raw_rating = float(seller.rating or 0.0)
        norm_rating = normalize_rating_score(raw_rating, rating_count=0)
        return SellerPerformanceMetrics(
            seller_id=seller_id,
            raw_trust_score=NEUTRAL_SELLER_SCORE,
            final_trust_score=NEUTRAL_SELLER_SCORE,
            confidence=0.0,
            rating_score=round(norm_rating, 4),
            average_rating=round(raw_rating, 2),
            fulfilment_rate=1.0,
            dispatch_sla_score=1.0,
            cancellation_rate=0.0,
            return_rate=0.0,
            total_orders=0,
            total_completed=0,
            total_cancelled=0,
            total_returned=0,
            trust_badge=BADGE_RELIABLE if getattr(seller, 'isNewSeller', True) else BADGE_STANDARD,
            explanation="New artisan protected by cold-start fairness policy.",
        )

    # 2. Query order items for seller's products within evaluation window
    order_items = (
        db.query(OrderItem)
        .filter(OrderItem.productId.in_(product_ids))
        .all()
    )

    total_orders = len(order_items)
    cancelled_items = [i for i in order_items if i.cancelled or (i.cancelledBy == "SELLER")]
    returned_items = [i for i in order_items if i.returned or (i.returnReason in ("QUALITY", "DAMAGED"))]
    dispatched_items = [i for i in order_items if i.dispatchedAt is not None or not i.cancelled]
    on_time_items = [i for i in dispatched_items if getattr(i, "isDispatchedOnTime", True)]
    completed_items = [i for i in order_items if not i.cancelled and not i.returned]

    # Incorporate cumulative penalties from Seller model
    seller_cancel_penalty = float(getattr(seller, "cancelPenalty", 0.0) or 0.0)
    seller_return_penalty = float(getattr(seller, "returnPenalty", 0.0) or 0.0)

    # 3. Calculate Rates
    cancel_count = len(cancelled_items) + int(seller_cancel_penalty)
    return_count = len(returned_items) + int(seller_return_penalty)
    effective_total = max(total_orders, cancel_count + len(completed_items))

    cancellation_rate = cancel_count / max(1, effective_total)
    return_rate = return_count / max(1, len(completed_items) + return_count)
    fulfilment_rate = compute_fulfilment_score(effective_total, len(completed_items))
    dispatch_sla_score = compute_dispatch_sla_score(len(dispatched_items), len(on_time_items))

    # Rating calculation
    raw_rating = float(seller.rating or 4.5 if getattr(seller, "isNewSeller", False) else 0.0)
    rating_score = normalize_rating_score(raw_rating, rating_count=total_orders)

    # 4. Pillar scores
    s_rating = rating_score
    s_fulfilment = fulfilment_rate
    s_dispatch = dispatch_sla_score
    s_cancel = compute_cancellation_score(cancellation_rate)
    s_return = compute_return_quality_score(return_rate)

    raw_trust_score = (
        WEIGHT_RATING * s_rating
        + WEIGHT_FULFILMENT * s_fulfilment
        + WEIGHT_DISPATCH * s_dispatch
        + WEIGHT_CANCELLATION * s_cancel
        + WEIGHT_RETURN * s_return
    )

    # 5. Volume confidence gating
    confidence = min(1.0, 1.0 - math.exp(-max(0, total_orders) / SATURATION_ORDERS))
    final_trust_score = confidence * raw_trust_score + (1.0 - confidence) * NEUTRAL_SELLER_SCORE

    trust_badge = resolve_trust_badge(
        final_score=final_trust_score,
        dispatch_sla_score=dispatch_sla_score,
        confidence=confidence,
        total_completed=len(completed_items),
    )

    # Human-readable explanation
    if confidence < 0.30:
        explanation = f"New artisan with {total_orders} orders; protected by cold-start fairness baseline ({final_trust_score*100:.0f}% trust)."
    elif final_trust_score >= 0.85:
        explanation = f"Outstanding reliability with {fulfilment_rate*100:.0f}% fulfilment and {dispatch_sla_score*100:.0f}% on-time dispatch."
    else:
        explanation = f"Solid operational history ({len(completed_items)} completed orders, {cancellation_rate*100:.1f}% cancel rate)."

    return SellerPerformanceMetrics(
        seller_id=seller_id,
        raw_trust_score=round(raw_trust_score, 4),
        final_trust_score=round(final_trust_score, 4),
        confidence=round(confidence, 4),
        rating_score=round(s_rating, 4),
        average_rating=round(raw_rating, 2),
        fulfilment_rate=round(fulfilment_rate, 4),
        dispatch_sla_score=round(dispatch_sla_score, 4),
        cancellation_rate=round(cancellation_rate, 4),
        return_rate=round(return_rate, 4),
        total_orders=total_orders,
        total_completed=len(completed_items),
        total_cancelled=cancel_count,
        total_returned=return_count,
        trust_badge=trust_badge,
        explanation=explanation,
    )


# ===========================================================================
# DATABASE SYNCHRONIZATION
# ===========================================================================

def update_seller_scores_in_db(
    db: Session,
    seller_id: str,
) -> SellerPerformanceMetrics:
    """Computes and persists the updated trust score on the Seller database record."""
    metrics = compute_seller_performance(db, seller_id)
    seller = db.query(Seller).filter(Seller.id == seller_id).first()
    if seller:
        seller.sellerTrustScore = metrics.final_trust_score
        seller.ratingScore = metrics.rating_score
        seller.fulfilmentRate = metrics.fulfilment_rate
        seller.dispatchSlaScore = metrics.dispatch_sla_score
        seller.cancellationRate = metrics.cancellation_rate
        seller.returnRate = metrics.return_rate
        seller.totalCompletedOrders = metrics.total_completed
        seller.trustBadge = metrics.trust_badge
        db.commit()
    return metrics


def recalculate_all_seller_scores(
    db: Session,
) -> Dict[str, SellerPerformanceMetrics]:
    """Batch recalculation of trust scores across all active sellers in the database."""
    sellers = db.query(Seller).all()
    results: Dict[str, SellerPerformanceMetrics] = {}
    for s in sellers:
        try:
            m = update_seller_scores_in_db(db, s.id)
            results[s.id] = m
        except Exception as exc:
            logger.warning("Failed to calculate seller score for %s: %s", s.id, exc)
    return results
