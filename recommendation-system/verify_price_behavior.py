"""
verify_price_behavior.py — Live Database Validation for the Price Behaviour Model

Runs end-to-end against the real UdrCrafts PostgreSQL database:

1. Selects the most active users.
2. Prints behaviour counts, the learned price-behaviour profile
   (discount / premium / full-price affinities, confidence, purchase ratios),
   and discount / premium / full-price history.
3. Runs live recommendations and prints the price-behaviour score breakdown
   (discount / premium / full-price contributions) per product.
4. Compares recommendations BEFORE (price_behavior weight = 0) and AFTER
   (weight = 0.05) for the same users, using only real database results.

Usage:
    python verify_price_behavior.py
"""

import sys
from collections import Counter
from typing import List, Optional

from sqlalchemy import func

from app.database import SessionLocal
from app.ml.click_event_recommendation import (
    ClickPersonalizedRecommendationEngine,
    PERSONALIZED_CLICK_WEIGHTS,
)
from app.ml.price_behavior import (
    BEHAVIOR_UNKNOWN,
    build_category_price_stats,
    build_user_price_behavior_profile,
)
from app.ml.price_affinity import build_user_price_profile
from app.models import (
    CartItem,
    ClickEvent,
    Order,
    OrderItem,
    Product,
    User,
    UserBehaviour,
    Wishlist,
)


def print_separator(title: str) -> None:
    print("\n" + "=" * 78)
    print(f"  {title}")
    print("=" * 78)


def _event_counts(db, user_id: str):
    rows = (
        db.query(UserBehaviour.eventType, func.count(UserBehaviour.id))
        .filter(UserBehaviour.userId == user_id)
        .group_by(UserBehaviour.eventType)
        .all()
    )
    counts = {event_type: int(count) for event_type, count in rows}
    return counts


def print_user_behaviour(db, user_id: str) -> None:
    counts = _event_counts(db, user_id)
    click_count = int(
        db.query(func.count(ClickEvent.id)).filter(ClickEvent.userId == user_id).scalar() or 0
    )
    cart_count = int(
        db.query(func.count(CartItem.id)).filter(CartItem.userId == user_id).scalar() or 0
    )
    wishlist_count = int(
        db.query(func.count(Wishlist.id)).filter(Wishlist.userId == user_id).scalar() or 0
    )
    purchase_count = int(
        db.query(func.count(Order.id)).filter(Order.userId == user_id).scalar() or 0
    )

    print(f"  USER: {user_id}")
    print("  BEHAVIOUR:")
    print(f"    interaction_count : {sum(counts.values())}")
    print(f"    purchase_count    : {purchase_count}   (UserBehaviour PURCHASE rows: {counts.get('PURCHASE', 0)})")
    print(f"    click_count       : {click_count}   (UserBehaviour CLICK rows: {counts.get('CLICK', 0)})")
    print(f"    wishlist_count    : {wishlist_count}")
    print(f"    cart_count        : {cart_count}")
    print(f"    event_breakdown   : {dict(counts)}")


def print_price_profile(profile) -> None:
    print("  PRICE PROFILE:")
    print(f"    discount_affinity      : {profile.discount_affinity:.3f}")
    print(f"    premium_affinity       : {profile.premium_affinity:.3f}")
    print(f"    full_price_affinity    : {profile.full_price_affinity:.3f}")
    print(f"    confidence             : {profile.confidence:.3f}  (active: {profile.has_preference})")
    print(f"    behavior_type          : {profile.behavior_type}")
    print(f"    price_sensitivity      : {profile.price_sensitivity:.3f}")
    print(f"    preferred_discount_pct : {profile.preferred_discount_percentage:.2f}%")
    print(f"    avg discount seen      : {profile.average_discount_seen:.2f}%")
    print(f"    avg discount purchased : {profile.average_discount_purchased:.2f}%")
    print(f"    discount_purchase_ratio: {profile.discount_purchase_ratio:.3f}")
    print(f"    premium_purchase_ratio : {profile.premium_purchase_ratio:.3f}")
    print(f"    full_price_purchase_ratio: {profile.full_price_purchase_ratio:.3f}")
    print(f"    interactions           : {profile.interaction_count}  ({profile.unique_products_count} unique products)")

    # Discount / premium / full-price history derived from the profile builder's
    # own sample counts plus purchase ratios (computed from real purchase rows).
    discounted_purchases = profile.discount_purchase_ratio * profile.interaction_count
    premium_purchases = profile.premium_purchase_ratio * profile.interaction_count
    full_price_purchases = profile.full_price_purchase_ratio * profile.interaction_count

    print("  DISCOUNT HISTORY:")
    print(f"    discounted interactions (est.) : {discounted_purchases:.1f}")
    print(f"    average discount               : {profile.average_discount_seen:.2f}%")
    print(f"    discounted purchases (est.)    : {discounted_purchases:.1f}")

    print("  PREMIUM HISTORY:")
    print(f"    premium interactions (est.) : {premium_purchases:.1f}")
    print(f"    premium purchases (est.)    : {premium_purchases:.1f}")

    print("  FULL PRICE HISTORY:")
    print(f"    full-price interactions (est.) : {full_price_purchases:.1f}")
    print(f"    full-price purchases (est.)    : {full_price_purchases:.1f}")


def print_candidate_scores(db, user_id: str, profile, limit: int = 6) -> None:
    products = (
        db.query(Product)
        .order_by(Product.popularity.desc())
        .limit(limit * 3)
        .all()
    )
    stats, global_stats = build_category_price_stats(
        db,
        category_ids=list({p.categoryId for p in products if p.categoryId}),
    )

    print(
        f"  {'Product':<34} | {'Price':>7} | {'Orig':>7} | {'Disc%':>5} | {'Prem':>5} | "
        f"{'PB Score':>8} | {'D':>5} {'P':>5} {'FP':>5} | {'Type':<18}"
    )
    print("-" * 118)
    for product in products[:limit]:
        from app.ml.price_behavior import compute_candidate_price_behavior_score

        res = compute_candidate_price_behavior_score(
            product, profile, category_stats=stats, global_stats=global_stats
        )
        name = (product.name or "")[:32] + ("..." if len(product.name or "") > 32 else "")
        print(
            f"  {name:<34} | {product.price:>7.2f} | {res.candidate_original_price:>7.2f} | "
            f"{res.candidate_discount_percentage:>5.1f} | {res.candidate_premium_score:>5.2f} | "
            f"{res.price_behavior_score:>8.4f} | {res.discount_contribution:>5.2f} "
            f"{res.premium_contribution:>5.2f} {res.full_price_contribution:>5.2f} | "
            f"{res.price_behavior_type:<18}"
        )


def run_before_after(db, user_id: str, limit: int = 5) -> None:
    engine = ClickPersonalizedRecommendationEngine(db)

    baseline_weights = dict(PERSONALIZED_CLICK_WEIGHTS)
    baseline_weights["price_behavior"] = 0.0

    try:
        before = engine.recommend(
            user_id, limit=limit, weights=baseline_weights, dynamic_weights_enabled=False
        )
    except Exception as exc:
        print(f"  BEFORE run failed: {exc}")
        before = []

    try:
        after = engine.recommend(user_id, limit=limit)
    except Exception as exc:
        print(f"  AFTER run failed: {exc}")
        after = []

    print(f"  {'Rank':<5} | {'Product':<34} | {'Price':>8} | {'Disc%':>5} | {'Prem':>5} | "
          f"{'Before':>8} | {'After':>8} | {'PB Type':<18}")
    print("-" * 108)

    max_len = max(len(before), len(after))
    before_by_id = {r.product.id: r for r in before}
    after_by_id = {r.product.id: r for r in after}

    for idx in range(1, max_len + 1):
        b = before[idx - 1] if idx <= len(before) else None
        a = after[idx - 1] if idx <= len(after) else None
        product = (b or a).product
        name = (product.name or "")[:32] + ("..." if len(product.name or "") > 32 else "")
        disc = getattr(product, "discount", 0.0) or 0.0
        premium = getattr(a, "candidate_premium_score", 0.0) if a else 0.0
        pb_type = getattr(a, "price_behavior_type", BEHAVIOR_UNKNOWN) if a else BEHAVIOR_UNKNOWN
        b_score = f"{b.final_score:>8.4f}" if b else " " * 8
        a_score = f"{a.final_score:>8.4f}" if a else " " * 8
        print(
            f"  {idx:<5} | {name:<34} | {product.price:>8.2f} | {disc:>5.1f} | {premium:>5.2f} | "
            f"{b_score} | {a_score} | {pb_type:<18}"
        )

    if before and after:
        before_ids = [r.product.id for r in before]
        after_ids = [r.product.id for r in after]
        moved = sum(1 for pid in before_ids if pid not in after_ids)
        print(f"  Rank changes (BEFORE vs AFTER): {moved}/{len(before_ids)} products swapped in/out.")


def verify_price_behavior() -> None:
    db = SessionLocal()
    try:
        print_separator("1. SELECTING ACTIVE USERS FROM THE DATABASE")
        user_counts = (
            db.query(UserBehaviour.userId, func.count(UserBehaviour.id))
            .group_by(UserBehaviour.userId)
            .order_by(func.count(UserBehaviour.id).desc())
            .limit(5)
            .all()
        )

        if not user_counts:
            print("  No user behaviour found. Falling back to any User rows...")
            users = db.query(User).limit(3).all()
            user_ids = [u.id for u in users]
        else:
            user_ids = [uid for uid, _ in user_counts]
            for uid, count in user_counts:
                print(f"  - user {uid}  events: {count}")

        if not user_ids:
            print("  No users found in the database!")
            return

        print_separator("2. LEARNED PRICE-BEHAVIOUR PROFILES")
        profiles = {}
        for user_id in user_ids:
            print()
            print_user_behaviour(db, user_id)
            profile = build_user_price_behavior_profile(db, user_id)
            profiles[user_id] = profile
            print_price_profile(profile)

        print_separator("3. CANDIDATE PRICE-BEHAVIOUR SCORING (LIVE PRODUCTS)")
        target_user = user_ids[0]
        print(f"\n  Scoring popular catalog products for user: {target_user}\n")
        print_candidate_scores(db, target_user, profiles[target_user], limit=6)

        print_separator("4. LIVE RECOMMENDATIONS: BEFORE vs AFTER PRICE BEHAVIOUR")
        for user_id in user_ids[:3]:
            print(f"\n  USER: {user_id}  (type={profiles[user_id].behavior_type}, "
                  f"confidence={profiles[user_id].confidence:.2f})")
            run_before_after(db, user_id, limit=5)

        print_separator("5. MONITORING SUMMARY (real database)")
        sufficient = sum(1 for p in profiles.values() if p.has_preference)
        types = Counter(p.behavior_type for p in profiles.values())
        print(f"  users analysed            : {len(profiles)}")
        print(f"  sufficient confidence     : {sufficient}")
        print(f"  behaviour-type distribution: {dict(types)}")
        print("  (Recommendation CTR / conversion by behaviour require accumulated")
        print("   RecommendationScoreSnapshot history; the snapshot now records")
        print("   priceBehaviorScore/Confidence/Contribution per recommendation.)")

        print_separator("VERIFICATION COMPLETED — RESULTS FROM THE REAL DATABASE")

    except Exception as exc:
        print(f"Verification encountered an error: {exc}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()


if __name__ == "__main__":
    verify_price_behavior()