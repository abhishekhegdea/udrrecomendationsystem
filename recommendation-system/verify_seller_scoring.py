"""
verify_seller_scoring.py — End-to-end verification of the 5-pillar Seller Performance & Trust Scoring.
"""

import os
import sys
from types import SimpleNamespace

# Ensure recommendation-system root is in path
sys.path.insert(0, os.path.dirname(__file__))

from app.database import SessionLocal
from app.ml.seller_scoring import (
    compute_seller_performance,
    recalculate_all_seller_scores,
    update_seller_scores_in_db,
    normalize_rating_score,
    compute_fulfilment_score,
    compute_dispatch_sla_score,
    compute_cancellation_score,
    compute_return_quality_score,
    resolve_trust_badge,
)
from app.ml.seller_boost import apply_seller_trust_adjustment, fair_rank
from app.models import Seller, Product, OrderItem


def main():
    print("=" * 70)
    print("VERIFYING 5-PILLAR SELLER PERFORMANCE & TRUST SCORING")
    print("=" * 70)

    # 1. Test isolated pillar calculations
    print("\n[1] Testing Mathematical Formulation of Pillars...")
    rating_norm = normalize_rating_score(4.8, 15)
    fulfil_rate = compute_fulfilment_score(20, 19)
    dispatch_sla = compute_dispatch_sla_score(20, 18)
    cancel_score = compute_cancellation_score(0.02)
    return_score = compute_return_quality_score(0.01)

    print(f"  - Rating Score (4.8 / 15 rev): {rating_norm:.4f} (Weight 30%)")
    print(f"  - Fulfilment Score (19/20):    {fulfil_rate:.4f} (Weight 25%)")
    print(f"  - Dispatch SLA Score (18/20):  {dispatch_sla:.4f} (Weight 20%)")
    print(f"  - Cancel Control (2% rate):    {cancel_score:.4f} (Weight 15%)")
    print(f"  - Return Quality (1% rate):    {return_score:.4f} (Weight 10%)")

    badge = resolve_trust_badge(0.91, 0.95, 0.85, 15)
    print(f"  - Trust Badge Resolved:        {badge}")
    assert badge == "TOP_RATED", f"Expected TOP_RATED, got {badge}"

    # 2. Test Recommendation Boost Integration
    print("\n[2] Testing Recommendation Boost Integration...")
    # Mock products with sellers
    p_high = SimpleNamespace(
        id="p1", 
        sellerId="s_high", 
        final_score=1.0, 
        seller=SimpleNamespace(sellerTrustScore=0.92, isNewSeller=False, cancelPenalty=0, returnPenalty=0)
    )
    p_neutral = SimpleNamespace(
        id="p2", 
        sellerId="s_neutral", 
        final_score=1.0, 
        seller=SimpleNamespace(sellerTrustScore=0.70, isNewSeller=False, cancelPenalty=0, returnPenalty=0)
    )
    p_low = SimpleNamespace(
        id="p3", 
        sellerId="s_low", 
        final_score=1.0, 
        seller=SimpleNamespace(sellerTrustScore=0.40, isNewSeller=False, cancelPenalty=2, returnPenalty=0)
    )

    products = [p_high, p_neutral, p_low]
    apply_seller_trust_adjustment(products, attribute="final_score")

    print(f"  - High Trust Seller (0.92): Final score = {p_high.final_score:.4f}")
    print(f"  - Neutral Trust Seller (0.70): Final score = {p_neutral.final_score:.4f}")
    print(f"  - Low Trust Seller (0.40): Final score = {p_low.final_score:.4f}")

    assert p_high.final_score > 1.01
    assert p_neutral.final_score == 1.0
    assert p_low.final_score < 0.99

    # 3. Test Database Connection & Live Calculation
    print("\n[3] Testing Database Sync with Active Sellers...")
    db = SessionLocal()
    try:
        sellers = db.query(Seller).limit(5).all()
        print(f"  - Found {len(sellers)} sample sellers in PostgreSQL database.")
        for s in sellers:
            metrics = update_seller_scores_in_db(db, s.id)
            print(f"    * Seller: {s.businessName or s.firstName or s.id[:8]} "
                  f"| Trust: {metrics.final_trust_score:.2f} "
                  f"| Badge: {metrics.trust_badge} "
                  f"| Orders: {metrics.total_completed} "
                  f"| Expl: {metrics.explanation}")
    finally:
        db.close()

    print("\n" + "=" * 70)
    print("ALL SELLER PERFORMANCE & TRUST SCORING CHECKS PASSED SUCCESSFULLY!")
    print("=" * 70)


if __name__ == "__main__":
    main()
