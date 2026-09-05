"""
interactive_price_affinity_demo.py — Interactive Manual Testing Tool for Price Affinity

Allows you to:
1. Test any user ID from your database.
2. Simulate adding interactions at different price points (e.g., budget vs luxury).
3. Observe how the learned price range, confidence, and rankings adapt in real-time.
"""

from datetime import datetime, timezone
from app.database import SessionLocal
from app.models import User, Product, UserBehaviour
from app.ml.price_affinity import (
    build_user_price_profile,
    compute_candidate_price_affinity,
    PriceObservation,
    _calculate_weighted_stats,
    _calculate_confidence,
)
from app.ml.click_event_recommendation import ClickPersonalizedRecommendationEngine


def run_interactive_demo():
    db = SessionLocal()
    try:
        print("=" * 75)
        print("     UdrCrafts User Price Affinity — Interactive Manual Tester")
        print("=" * 75)

        # 1. Fetch some users
        users = db.query(User.id).limit(5).all()
        user_ids = [u[0] for u in users]

        print("\nAvailable User IDs in database:")
        for idx, uid in enumerate(user_ids, 1):
            profile = build_user_price_profile(db, uid)
            conf_str = f"{profile.confidence:.0%}" if profile.has_preference else "No history / Cold"
            pref_str = f"Rs.{profile.preferred_price:,.2f}" if profile.has_preference else "N/A"
            print(f"  [{idx}] {uid} | Preferred Price: {pref_str:<12} | Conf: {conf_str}")

        print("\nOptions:")
        print("  1. Inspect Live API recommendations for a database user")
        print("  2. Simulate a Custom User (Add custom budget/luxury actions & test ranking)")
        print("  3. Test Candidate Product Scoring on custom prices")

        choice = input("\nSelect option [1, 2, or 3] (default 1): ").strip() or "1"

        if choice == "1":
            user_input = input(f"Enter user ID (or press Enter for [{user_ids[0]}]): ").strip()
            target_user = user_input if user_input else user_ids[0]

            profile = build_user_price_profile(db, target_user)
            print("\n" + "-" * 75)
            print(f"USER PRICE PROFILE for: {target_user}")
            print("-" * 75)
            print(f"  • Preferred Price (Median) : Rs. {profile.preferred_price:,.2f}")
            print(f"  • Price Comfort Range      : Rs. {profile.lower_price:,.2f} to Rs. {profile.upper_price:,.2f}")
            print(f"  • Confidence Level         : {profile.confidence:.1%} (Active Personalization: {profile.has_preference})")
            print(f"  • Interactions Analyzed    : {profile.interaction_count} events across {profile.unique_products_count} items")
            print(f"  • Event Breakdown          : {profile.sample_count}")

            engine = ClickPersonalizedRecommendationEngine(db)
            recs = engine.recommend(target_user, limit=6)

            print("\n" + "-" * 75)
            print("TOP RECOMMENDATIONS (With Price Affinity Ranking):")
            print("-" * 75)
            print(f"{'Rank':<5} | {'Product Name':<30} | {'Price':<10} | {'Price Match':<12} | {'Score':<8} | {'Explanation'}")
            print("-" * 95)
            for i, r in enumerate(recs, 1):
                name = (r.product.name[:27] + "...") if len(r.product.name) > 27 else r.product.name
                match_str = "IN RANGE" if r.price_is_in_range else f"{r.price_affinity_score:.2f}"
                print(f"{i:<5} | {name:<30} | Rs.{r.product.price:<7.2f} | {match_str:<12} | {r.final_score:<8.4f} | {r.explanation}")

        elif choice == "2":
            print("\n--- SIMULATION MODE ---")
            print("Let's simulate a user buying/browsing items at different price tiers.")
            print("Scenario A: Budget User (Views Rs.300, Carts Rs.450, Buys Rs.500)")
            print("Scenario B: Luxury User (Views Rs.5000, Carts Rs.8000, Buys Rs.12000)")
            print("Scenario C: Custom Prices")

            scen = input("Choose scenario [A, B, or C] (default A): ").strip().upper() or "A"
            now = datetime.now(timezone.utc)

            if scen == "A":
                prices = [(300.0, "PRODUCT_VIEW", 0.35), (350.0, "CLICK", 0.30), (450.0, "CART", 0.85), (500.0, "PURCHASE", 1.00)]
            elif scen == "B":
                prices = [(5000.0, "PRODUCT_VIEW", 0.35), (8000.0, "CART", 0.85), (12000.0, "PURCHASE", 1.00)]
            else:
                raw_p = input("Enter comma-separated prices (e.g. 500, 700, 1200): ").strip()
                prices = [(float(p.strip()), "PURCHASE", 1.00) for p in raw_p.split(",") if p.strip()]

            obs = [
                PriceObservation(price=p, event_type=ev, weight=w, timestamp=now, product_id=f"sim_{i}")
                for i, (p, ev, w) in enumerate(prices)
            ]

            pref_p, low_p, up_p, w_mean, w_med, s_dev, sample_counts = _calculate_weighted_stats(obs, now=now)
            confidence = _calculate_confidence(obs, unique_products_count=len(obs), now=now)

            print("\n" + "=" * 55)
            print("  LEARNED USER PRICE PROFILE (From Simulation)")
            print("=" * 55)
            print(f"  • Preferred Price (Median) : Rs. {pref_p:,.2f}")
            print(f"  • Learned Range (20%-80%)  : Rs. {low_p:,.2f} to Rs. {up_p:,.2f}")
            print(f"  • Confidence               : {confidence:.1%}")

            print("\nHow this profile scores candidate products across price tiers:")
            test_candidates = [250.0, 450.0, 800.0, 1500.0, 5000.0, 12000.0]
            print(f"{'Candidate Product Price':<25} | {'Affinity Score':<15} | {'Status'}")
            print("-" * 55)
            for cp in test_candidates:
                prod = Product(id=f"p_{cp}", name=f"Product @ Rs.{cp}", price=cp)
                from app.ml.price_affinity import UserPriceProfile
                sim_profile = UserPriceProfile(
                    user_id="sim-user", preferred_price=pref_p, lower_price=low_p, upper_price=up_p,
                    weighted_mean=w_mean, weighted_median=w_med, price_std_dev=s_dev, confidence=confidence,
                    interaction_count=len(obs), unique_products_count=len(obs),
                )
                res = compute_candidate_price_affinity(prod, sim_profile)
                status = "Within Comfort Zone" if res.is_in_range else ("Above Range" if cp > up_p else "Below Range")
                print(f"Rs. {cp:<21.2f} | {res.price_affinity_score:<15.4f} | {status}")

        elif choice == "3":
            print("\n--- SINGLE PRODUCT PRICE SCORER ---")
            p_pref = float(input("Enter user preferred price (e.g. 800): ").strip() or "800")
            p_low = float(input(f"Enter user lower price bound (e.g. {p_pref*0.75:.0f}): ").strip() or str(p_pref*0.75))
            p_up = float(input(f"Enter user upper price bound (e.g. {p_pref*1.35:.0f}): ").strip() or str(p_pref*1.35))
            c_price = float(input("Enter candidate product price to score (e.g. 1000): ").strip() or "1000")

            from app.ml.price_affinity import UserPriceProfile
            prof = UserPriceProfile(
                user_id="test", preferred_price=p_pref, lower_price=p_low, upper_price=p_up,
                weighted_mean=p_pref, weighted_median=p_pref, price_std_dev=100.0, confidence=0.85,
                interaction_count=10, unique_products_count=8,
            )
            prod = Product(id="test_p", name="Test Item", price=c_price)
            res = compute_candidate_price_affinity(prod, prof)
            print("\n" + "=" * 55)
            print(f"Candidate Price  : Rs. {c_price:,.2f}")
            print(f"Affinity Score   : {res.price_affinity_score:.4f} (Max: 1.0000)")
            print(f"In Comfort Range : {'YES' if res.is_in_range else 'NO'}")
            print(f"Distance to Range: Rs. {res.price_distance:,.2f}")
            print(f"Explanation      : {res.explanation}")
            print("=" * 55)

    finally:
        db.close()


if __name__ == "__main__":
    run_interactive_demo()
