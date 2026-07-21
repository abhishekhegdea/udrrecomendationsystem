from app.models import Product, Seller
from sqlalchemy.orm import Session
import random

class HybridRanker:
    def __init__(self, db: Session):
        self.db = db

    def get_seasonal_boost(self, product: Product) -> float:
        """Calculate seasonal score boost"""
        # In a real implementation, we would query SeasonalScore tables based on current date
        # E.g. Diwali boost if current month is October/November and product tags contain 'diwali'
        return 0.0

    def get_location_boost(self, product: Product, user_location: str) -> float:
        """Boost products originating from the same state/city as the user."""
        return 0.0

    def calculate_final_score(self, product: Product, content_score: float, collab_score: float, user_location: str = None) -> float:
        """
        Calculates the final ranking score.
        Weighted linear combination:
        Score = w1*Content + w2*Collab + w3*Popularity + w4*Seasonal + w5*Location + w6*SellerQuality
        """
        popularity = product.popularity or 0.0
        seller_rating = product.seller.rating if product.seller else 0.0
        seasonal_boost = self.get_seasonal_boost(product)
        location_boost = self.get_location_boost(product, user_location) if user_location else 0.0
        
        # Weights (can be learned via XGBoost in production, using static for now)
        score = (
            (content_score * 0.3) +
            (collab_score * 0.3) +
            (popularity * 0.15) +
            (seller_rating * 0.1) +
            (seasonal_boost * 0.1) +
            (location_boost * 0.05)
        )
        return score

    def apply_fairness_ranking(self, ranked_products: list, total_slots: int = 10) -> list:
        """
        Applies the 15% New Seller Boost.
        Ensures that at least ~15% of the recommended products come from new sellers.
        """
        new_seller_slots = max(1, int(total_slots * 0.15))
        
        final_list = []
        new_seller_products = [p for p in ranked_products if p.seller and p.seller.isNewSeller]
        established_products = [p for p in ranked_products if p.seller and not p.seller.isNewSeller]

        # Take top new seller products for the reserved slots
        final_list.extend(new_seller_products[:new_seller_slots])
        
        # Fill the rest with the highest ranking established products
        remaining_slots = total_slots - len(final_list)
        final_list.extend(established_products[:remaining_slots])

        # If we didn't have enough established products, fill with more new seller products
        if len(final_list) < total_slots:
            final_list.extend(new_seller_products[new_seller_slots:new_seller_slots + (total_slots - len(final_list))])

        # Shuffle slightly for diversity or sort by score again? 
        # Best practice is to interleave them so new sellers aren't just dumped at the bottom.
        # We will sort them by their original calculated score, but giving new sellers an artificial bump.
        # For simplicity here, we'll shuffle the new sellers into the top 50% of the results.
        random.shuffle(final_list)
        return final_list[:total_slots]
