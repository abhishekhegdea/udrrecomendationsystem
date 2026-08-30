from app.models import Product, Seller
from sqlalchemy.orm import Session
from app.ml.seller_boost import fair_rank

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

    def apply_fairness_ranking(
        self,
        ranked_products: list,
        total_slots: int = 10,
        *,
        boost_amount: float | None = None,
        new_seller_ratio: float | None = None,
        max_per_seller_ratio: float | None = None,
        penalty_weight: float | None = None,
    ) -> list:
        """
        Applies the full 5-stage seller fairness pipeline (cancel penalty,
        score boost, diversity cap, slot reservation, interleaving).

        Delegates to :func:`app.ml.seller_boost.fair_rank`.

        Parameters
        ----------
        ranked_products : list
            Candidate products sorted by ``final_score`` descending.
        total_slots : int
            How many recommendations to return.
        boost_amount : float, optional
            Score boost for new sellers.  Uses DB config if not provided.
        new_seller_ratio : float, optional
            Fraction of slots reserved for new sellers.
        max_per_seller_ratio : float, optional
            Max fraction of slots one seller can occupy.
        penalty_weight : float, optional
            Multiplier for the seller's cancelPenalty.
        """
        # If dynamic config wasn't passed, read it from the DB
        if boost_amount is None or new_seller_ratio is None or max_per_seller_ratio is None:
            from app.core.fairness_config import get_config
            cfg = get_config(self.db)
            boost_amount = boost_amount if boost_amount is not None else cfg.boost_amount
            new_seller_ratio = new_seller_ratio if new_seller_ratio is not None else cfg.new_seller_ratio
            max_per_seller_ratio = max_per_seller_ratio if max_per_seller_ratio is not None else cfg.max_per_seller_ratio

        return fair_rank(
            ranked_products,
            total_slots=total_slots,
            boost_amount=boost_amount,
            new_seller_ratio=new_seller_ratio,
            max_per_seller_ratio=max_per_seller_ratio,
            attribute="final_score",
            penalty_weight=penalty_weight or 0.02,
        )
