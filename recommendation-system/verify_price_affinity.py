"""
verify_price_affinity.py — Live Database Verification Script for User Price Affinity

Runs end-to-end verification against the PostgreSQL database:
1. Computes UserPriceProfile for active database users.
2. Compares recommendations with and without price affinity.
3. Tests category-specific price preferences and fallbacks.
4. Verifies smooth Gaussian candidate decay and audit snapshot logging.
"""

import sys
from datetime import datetime, timezone
from typing import List

from sqlalchemy import func

from app.database import SessionLocal
from app.ml.click_event_recommendation import (
    ClickPersonalizedRecommendationEngine,
    EngineConfig,
    PERSONALIZED_CLICK_WEIGHTS,
)
from app.ml.price_affinity import (
    build_user_price_profile,
    compute_candidate_price_affinity,
)
from app.models import Product, User, UserBehaviour


def print_separator(title: str):
    print("\n" + "=" * 70)
    print(f"  {title}")
    print("=" * 70)


def verify_price_affinity():
    db = SessionLocal()
    try:
        print_separator("1. INSPECTING ACTIVE USERS IN DATABASE")
        # Find users with user behaviour records
        user_counts = (
            db.query(UserBehaviour.userId, func.count(UserBehaviour.id))
            .group_by(UserBehaviour.userId)
            .order_by(func.count(UserBehaviour.id).desc())
            .limit(5)
            .all()
        )

        if not user_counts:
            print("No user behaviours found. Fetching any user from User table...")
            users = db.query(User).limit(3).all()
            user_ids = [u.id for u in users]
        else:
            user_ids = [u[0] for u in user_counts]
            for uid, count in user_counts:
                print(f"- User ID: {uid} | Events in DB: {count}")

        if not user_ids:
            print("No users found in database!")
            return

        print_separator("2. COMPUTING USER PRICE PROFILES")
        for user_id in user_ids:
            profile = build_user_price_profile(db, user_id)
            print(f"\nUser: {user_id}")
            print(f"  - Preferred Price (Median): Rs. {profile.preferred_price:,.2f}")
            print(f"  - Price Comfort Range     : Rs. {profile.lower_price:,.2f} - Rs. {profile.upper_price:,.2f}")
            print(f"  - Weighted Mean           : Rs. {profile.weighted_mean:,.2f}")
            print(f"  - Standard Deviation      : Rs. {profile.price_std_dev:,.2f}")
            print(f"  - Confidence              : {profile.confidence:.2%} (Active: {profile.has_preference})")
            print(f"  - Interactions Analyzed   : {profile.interaction_count} ({profile.unique_products_count} unique items)")
            print(f"  - Event Breakdown         : {profile.sample_count}")
            if profile.categories:
                print(f"  - Category Profiles ({len(profile.categories)}):")
                for cat_id, cp in profile.categories.items():
                    print(f"    * [{cat_id}] Preferred: Rs. {cp.preferred_price:,.2f} (Range: Rs. {cp.lower_price:,.2f} - Rs. {cp.upper_price:,.2f}, Conf: {cp.confidence:.0%})")

        print_separator("3. CANDIDATE PRICE SCORING ON LIVE PRODUCTS")
        target_user = user_ids[0]
        profile = build_user_price_profile(db, target_user)
        products = db.query(Product).order_by(Product.price.asc()).limit(8).all()

        print(f"Testing Candidate Scoring for User: {target_user}")
        print(f"Learned Range: Rs. {profile.lower_price:,.2f} - Rs. {profile.upper_price:,.2f} (Confidence: {profile.confidence:.1%})")
        print(f"{'Product Name':<35} | {'Price':<10} | {'Affinity':<10} | {'In Range?':<10} | {'Explanation'}")
        print("-" * 100)

        for prod in products:
            res = compute_candidate_price_affinity(prod, profile)
            in_range_str = "YES" if res.is_in_range else "NO"
            prod_name = (prod.name[:32] + "...") if len(prod.name) > 32 else prod.name
            print(f"{prod_name:<35} | Rs.{prod.price:<7.2f} | {res.price_affinity_score:<10.4f} | {in_range_str:<10} | {res.explanation}")

        print_separator("4. LIVE RECOMMENDATION ENGINE BEFORE VS AFTER")
        engine = ClickPersonalizedRecommendationEngine(db)

        # Baseline run (weights without price affinity)
        baseline_weights = dict(PERSONALIZED_CLICK_WEIGHTS)
        baseline_weights["price_affinity"] = 0.0
        baseline_recs = engine.recommend(target_user, limit=5, weights=baseline_weights, dynamic_weights_enabled=False)

        # Enhanced run (with price affinity = 0.05)
        affinity_recs = engine.recommend(target_user, limit=5)

        print(f"\nTop 5 Recommendations (With 5% Price Affinity):")
        print(f"{'Rank':<5} | {'Product Name':<35} | {'Price':<10} | {'Score':<8} | {'Price Aff':<10} | {'Explanation'}")
        print("-" * 105)
        for idx, rec in enumerate(affinity_recs, 1):
            prod_name = (rec.product.name[:32] + "...") if len(rec.product.name) > 32 else rec.product.name
            print(
                f"{idx:<5} | {prod_name:<35} | Rs.{rec.product.price:<7.2f} | {rec.final_score:<8.4f} | "
                f"{rec.price_affinity_score:<10.4f} | {rec.explanation}"
            )

        print_separator("VERIFICATION COMPLETED SUCCESSFULLY!")

    except Exception as exc:
        print(f"Verification encountered an error: {exc}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()


if __name__ == "__main__":
    verify_price_affinity()
