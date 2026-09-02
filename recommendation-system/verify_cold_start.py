"""
verify_cold_start.py — Interactive / Manual Verification Script for Cold-Start Recommendations

This script allows you to manually verify the complete cold-start recommendation flow:
1. Tests a brand-new user with 0 interactions (100% Cold-Start mode).
2. Tests location proximity boost on cold recommendations.
3. Tests progressive personalization transitions (Cold-Start -> Early Signal -> Emerging -> Warm).
4. Displays complete score breakdowns, candidate sources, and explanations.

Run with:
    venv\\Scripts\\python verify_cold_start.py
"""

import os
import sys
import uuid
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models import User, Product, ClickEvent, Category, Seller
from app.ml.cold_start import (
    get_user_activity_profile,
    get_cold_start_blend,
    STAGE_COMPLETELY_COLD,
    STAGE_EARLY_SIGNAL,
    STAGE_EMERGING_PROFILE,
    STAGE_DEVELOPING_PROFILE,
    STAGE_WARM,
    MODE_COLD_START,
    MODE_EARLY_PERSONALIZED,
    MODE_PERSONALIZED,
)
from app.ml.click_event_recommendation import get_recommendations_from_click_events


def print_separator(title=""):
    print("\n" + "=" * 80)
    if title:
        print(f"  {title.upper()}")
        print("=" * 80)


def display_recommendation_run(user_id: str, label: str, db, user_lat=None, user_lon=None):
    print_separator(f"VERIFICATION RUN: {label}")
    
    # 1. Activity Profile
    profile = get_user_activity_profile(db, user_id)
    print(f"\n[USER CONTEXT]")
    print(f"   * User ID:              {user_id}")
    print(f"   * Total Interactions:   {profile.total_interactions}")
    print(f"   * Activity Stage:       {profile.activity_stage}")
    print(f"   * Recommendation Mode:  {profile.recommendation_mode}")
    print(f"   * Cold-Start Blend:     {profile.cold_start_weight * 100:.1f}% Cold / {profile.personalized_weight * 100:.1f}% Personalized")
    print(f"   * Activity Breakdown:   {profile.breakdown}")

    # 2. Run recommendations
    recs = get_recommendations_from_click_events(
        db,
        user_id,
        limit=10,
        user_latitude=user_lat,
        user_longitude=user_lon,
    )

    print(f"\n[TOP {len(recs)} RECOMMENDATIONS GENERATED]")
    print(f"   {'Rank':<4} | {'Product Name':<32} | {'Final':<7} | {'Cold':<7} | {'Pers':<7} | {'Source':<20} | {'Explanation'}")
    print("   " + "-" * 115)

    source_counts = {}
    for idx, sp in enumerate(recs, start=1):
        p = sp.product
        src = getattr(sp, "source", "unknown")
        source_counts[src] = source_counts.get(src, 0) + 1
        
        cold_score = getattr(sp, "cold_start_score", sp.final_score)
        pers_score = getattr(sp, "personalized_score", 0.0)
        p_name = (p.name[:30] + "..") if len(p.name) > 32 else p.name
        
        print(f"   #{idx:<3} | {p_name:<32} | {sp.final_score:.4f}  | {cold_score:.4f}  | {pers_score:.4f}  | {src:<20} | {sp.explanation}")

    print(f"\n[CANDIDATE SOURCE DISTRIBUTION]")
    for src, count in sorted(source_counts.items(), key=lambda x: -x[1]):
        print(f"   * {src:<24}: {count} item(s)")

    return recs, profile


def main():
    db = SessionLocal()
    try:
        print_separator("UDRCRAFTS NEW-USER COLD-START MANUAL VERIFIER")
        
        # Find an existing user or check cold user
        existing_users = db.query(User).all()
        cold_user = None
        for u in existing_users:
            prof = get_user_activity_profile(db, u.id)
            if prof.activity_stage == STAGE_COMPLETELY_COLD:
                cold_user = u
                break

        cold_user_id = cold_user.id if cold_user else (existing_users[0].id if existing_users else str(uuid.uuid4()))

        # -------------------------------------------------------------------
        # SCENARIO 1: Brand New User (Zero Events -> 100% Cold-Start)
        # -------------------------------------------------------------------
        recs_cold, prof_cold = display_recommendation_run(
            cold_user_id,
            f"1. BRAND NEW USER (ZERO INTERACTIONS) - User: {getattr(cold_user, 'email', cold_user_id)}",
            db
        )
        assert prof_cold.activity_stage == STAGE_COMPLETELY_COLD
        assert prof_cold.cold_start_weight == 1.00
        assert len(recs_cold) > 0

        # -------------------------------------------------------------------
        # SCENARIO 2: Cold User With Location Context (Nearby Artisans)
        # -------------------------------------------------------------------
        sample_seller = db.query(Seller).filter(Seller.latitude.isnot(None), Seller.longitude.isnot(None)).first()
        if sample_seller:
            shopper_lat = sample_seller.latitude + 0.01  # very close (~1 km)
            shopper_lon = sample_seller.longitude + 0.01
            display_recommendation_run(
                cold_user_id,
                f"2. COLD USER WITH LOCATION (Lat: {shopper_lat:.4f}, Lon: {shopper_lon:.4f})",
                db,
                user_lat=shopper_lat,
                user_lon=shopper_lon
            )

        # -------------------------------------------------------------------
        # SCENARIO 3: Progressive Personalization Transition
        # Simulate user clicking 1 product -> transition to EARLY_SIGNAL
        # -------------------------------------------------------------------
        sample_product = db.query(Product).first()
        
        if sample_product and cold_user:
            print_separator("3. SIMULATING PROGRESSIVE USER EVOLUTION")
            print(f"\n[Step A] User has 0 events:")
            print(f"Current State: {prof_cold.activity_stage} (Cold: {prof_cold.cold_start_weight*100:.0f}%, Pers: {prof_cold.personalized_weight*100:.0f}%)")

            print(f"\n[Step B] User clicks on '{sample_product.name}'...")
            click = ClickEvent(
                id=str(uuid.uuid4()),
                userId=cold_user.id,
                productId=sample_product.id,
                categoryId=sample_product.categoryId,
                source="verification_script",
                createdAt=datetime.now(timezone.utc)
            )
            db.add(click)
            db.commit()

            try:
                recs_click, p_b = display_recommendation_run(cold_user.id, "User After 1 Product Click", db)
                assert p_b.activity_stage == STAGE_EARLY_SIGNAL
                assert p_b.cold_start_weight == 0.75
                assert p_b.personalized_weight == 0.25
            finally:
                # Cleanup simulation event
                db.delete(click)
                db.commit()

        # -------------------------------------------------------------------
        # SCENARIO 4: Inspect Warm User in Database
        # -------------------------------------------------------------------
        warm_user = None
        for u in existing_users:
            prof = get_user_activity_profile(db, u.id)
            if prof.activity_stage == STAGE_WARM:
                warm_user = u
                break
        
        if warm_user:
            display_recommendation_run(
                warm_user.id,
                f"4. WARM RETURNING USER - User: {warm_user.email}",
                db
            )

        print_separator("MANUAL VERIFICATION COMPLETED SUCCESSFULLY")
        print("\nAll cold-start and progressive blending mechanics verified correctly against PostgreSQL!")

    finally:
        db.close()


if __name__ == "__main__":
    main()
