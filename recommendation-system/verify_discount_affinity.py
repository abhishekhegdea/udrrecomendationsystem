"""
Live Verification Script for User Discount Affinity Signal.

Verifies:
1. Discount presence across products in database.
2. Discount affinity module profile generation with real database interactions.
3. Recommendation engine candidate scoring with continuous discount affinity.
4. ML Weights budget: sum equals 1.000 with 5% discount affinity.
"""

import math
from datetime import datetime, timedelta, timezone
from app.database import SessionLocal
from app.models import Product, User
from app.ml.discount_affinity import (
    DiscountObservation,
    _build_profile_from_observations,
    build_user_discount_profile,
    compute_candidate_discount_affinity,
)
from app.ml.click_event_recommendation import (
    PERSONALIZED_CLICK_WEIGHTS,
)


def verify_discount_affinity():
    db = SessionLocal()
    print("=" * 60)
    print("VERIFYING USER DISCOUNT AFFINITY FEATURE")
    print("=" * 60)

    try:
        # 1. Verify discount presence in database
        discount_count = db.query(Product).filter(Product.discount > 0).count()
        total_products = db.query(Product).count()
        print(f"[*] Database Products: {total_products:,} total | {discount_count:,} with discounts ({discount_count/max(1, total_products)*100:.1f}%)")
        assert discount_count > 0, "No discounted products found in DB!"

        # 2. Check weights budget
        print("\n[*] Checking ML Weights Budget:")
        total_weight = sum(PERSONALIZED_CLICK_WEIGHTS.values())
        print(f"    - Total Weights: {total_weight:.6f}")
        for k, v in PERSONALIZED_CLICK_WEIGHTS.items():
            print(f"      • {k:25s}: {v*100:.1f}%")
        assert math.isclose(total_weight, 1.0, rel_tol=1e-6), f"Weights sum to {total_weight} instead of 1.0"
        assert "discount_affinity" in PERSONALIZED_CLICK_WEIGHTS
        assert PERSONALIZED_CLICK_WEIGHTS["discount_affinity"] == 0.05

        # 3. Test discount profile for a sample user
        sample_user = db.query(User).first()
        if sample_user:
            print(f"\n[*] Testing user discount profile for user {sample_user.id} ({sample_user.email})...")
            profile = build_user_discount_profile(db, sample_user.id)
            print(f"    - Sensitivity: {profile.discount_sensitivity:.4f}")
            print(f"    - Preferred discount rate: {profile.preferred_discount_rate:.1f}%")
            print(f"    - Confidence: {profile.confidence:.4f}")
            print(f"    - Total interactions: {profile.interaction_count}")

        # 4. Test candidate scoring for deal-seeker vs full-price buyer
        now = datetime.now(timezone.utc)
        deal_seeker_obs = [
            DiscountObservation(40.0, True, 600, "PURCHASE", 1.0, now - timedelta(hours=1), "p1"),
            DiscountObservation(30.0, True, 700, "CART", 0.85, now - timedelta(hours=3), "p2"),
        ]
        deal_seeker_profile = _build_profile_from_observations("u-deal", deal_seeker_obs, {"PURCHASE": 1, "CART": 1}, now)

        discount_product = db.query(Product).filter(Product.discount >= 30).first()
        full_price_product = db.query(Product).filter((Product.discount == 0) | (Product.discount == None)).first()

        if discount_product and full_price_product:
            score_disc = compute_candidate_discount_affinity(deal_seeker_profile, discount_product)
            score_full = compute_candidate_discount_affinity(deal_seeker_profile, full_price_product)

            print(f"\n[*] Candidate scoring for Deal Seeker (sensitivity {deal_seeker_profile.discount_sensitivity:.2f}):")
            print(f"    - Product '{discount_product.name[:30]}...' ({discount_product.discount}% off): score = {score_disc:.4f}")
            print(f"    - Product '{full_price_product.name[:30]}...' (0% off): score = {score_full:.4f}")
            assert score_disc > score_full, "Deal seeker should score discounted item higher!"
            assert score_full > 0.15, "Full price item must receive a continuous non-zero score!"

        print("\n" + "=" * 60)
        print("ALL DISCOUNT AFFINITY VERIFICATIONS PASSED SUCCESSFULLY!")
        print("=" * 60)

    finally:
        db.close()


if __name__ == "__main__":
    verify_discount_affinity()
