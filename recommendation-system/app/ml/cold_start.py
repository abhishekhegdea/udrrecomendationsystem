"""
cold_start.py — Production-Grade New-User Cold-Start Recommendation Engine

Provides multi-source candidate generation, Bayesian quality scoring,
activity classification, and progressive blending for cold and early-stage users.
"""

from __future__ import annotations

import logging
import math
import random
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple

from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from app.core.fairness_config import get_config
from app.ml.event_tracker import (
    EVENT_CART,
    EVENT_CLICK,
    EVENT_PRODUCT_VIEW,
    EVENT_PURCHASE,
    EVENT_RATING,
    EVENT_RETURN,
    EVENT_REVIEW,
    EVENT_SEARCH,
    EVENT_WISHLIST,
)
from app.ml.recommendation_engine import (
    BusinessRuleFilter,
    EngineConfig,
    RankerSelector,
    SEASONAL_MAP,
    ScoredProduct,
    _valid_coordinate_pair,
    haversine_distance_km,
    distance_location_score,
)
from app.ml.seller_boost import CANCEL_PENALTY_WEIGHT, fair_rank
from app.models import (
    CartItem,
    Category,
    ClickEvent,
    Order,
    OrderItem,
    Product,
    ProductClickHistory,
    ProductView,
    Rating,
    Review,
    Seller,
    User,
    UserBehaviour,
    Wishlist,
)

logger = logging.getLogger(__name__)


# ===========================================================================
# STAGE DEFINITIONS & BLENDING CONFIGURATION
# ===========================================================================

STAGE_COMPLETELY_COLD = "COMPLETELY_COLD"
STAGE_EARLY_SIGNAL = "EARLY_SIGNAL"
STAGE_EMERGING_PROFILE = "EMERGING_PROFILE"
STAGE_DEVELOPING_PROFILE = "DEVELOPING_PROFILE"
STAGE_WARM = "WARM"

MODE_COLD_START = "COLD_START"
MODE_EARLY_PERSONALIZED = "EARLY_PERSONALIZED"
MODE_PERSONALIZED = "PERSONALIZED"

ACTIVITY_STAGE_THRESHOLDS: Dict[str, Tuple[int, float]] = {
    STAGE_COMPLETELY_COLD: (0, 0),
    STAGE_EARLY_SIGNAL: (1, 3),
    STAGE_EMERGING_PROFILE: (4, 10),
    STAGE_DEVELOPING_PROFILE: (11, 20),
    STAGE_WARM: (21, math.inf),
}

STAGE_BLEND_MAP: Dict[str, Dict[str, Any]] = {
    STAGE_COMPLETELY_COLD: {
        "cold_start_weight": 1.00,
        "personalized_weight": 0.00,
        "mode": MODE_COLD_START,
    },
    STAGE_EARLY_SIGNAL: {
        "cold_start_weight": 0.75,
        "personalized_weight": 0.25,
        "mode": MODE_EARLY_PERSONALIZED,
    },
    STAGE_EMERGING_PROFILE: {
        "cold_start_weight": 0.50,
        "personalized_weight": 0.50,
        "mode": MODE_EARLY_PERSONALIZED,
    },
    STAGE_DEVELOPING_PROFILE: {
        "cold_start_weight": 0.25,
        "personalized_weight": 0.75,
        "mode": MODE_EARLY_PERSONALIZED,
    },
    STAGE_WARM: {
        "cold_start_weight": 0.00,
        "personalized_weight": 1.00,
        "mode": MODE_PERSONALIZED,
    },
}

# ===========================================================================
# COLD-START SCORE WEIGHTS
# ===========================================================================
# Must sum to 1.00
COLD_START_WEIGHTS: Dict[str, float] = {
    "trending": 0.30,
    "seasonal": 0.20,
    "quality": 0.20,
    "category_popularity": 0.10,
    "location": 0.05,
    "seller_exploration": 0.10,
    "exploration": 0.05,
}

# Candidate pool sizes for generating ~100-200 diversified items
COLD_START_CANDIDATE_LIMITS: Dict[str, int] = {
    "trending": 40,
    "seasonal": 30,
    "quality": 35,
    "category_popularity": 35,
    "location": 25,
    "seller_exploration": 25,
    "exploration": 15,
}

# Bayesian Quality Constants
BAYESIAN_MIN_REVIEWS_M = 5
BAYESIAN_PRIOR_RATING_C = 4.0


# ===========================================================================
# DATA STRUCTURES
# ===========================================================================

@dataclass
class UserActivityProfile:
    user_id: str
    total_interactions: int
    activity_stage: str
    recommendation_mode: str
    cold_start_weight: float
    personalized_weight: float
    breakdown: Dict[str, int] = field(default_factory=dict)


@dataclass
class ColdStartProductScores:
    product_id: str
    trending_score: float = 0.0
    seasonal_score: float = 0.0
    quality_score: float = 0.0
    category_popularity_score: float = 0.0
    location_score: float = 0.0
    seller_exploration_score: float = 0.0
    exploration_score: float = 0.0
    cold_start_score: float = 0.0
    primary_source: str = "cold_start"
    explanation: str = "Curated recommendation for you."


# ===========================================================================
# HELPER FUNCTIONS
# ===========================================================================

def _clamp01(val: float) -> float:
    return max(0.0, min(1.0, float(val)))


def classify_user_stage(interaction_count: int) -> str:
    """Map an interaction count to a user activity stage."""
    count = max(0, int(interaction_count))
    if count == 0:
        return STAGE_COMPLETELY_COLD
    if 1 <= count <= 3:
        return STAGE_EARLY_SIGNAL
    if 4 <= count <= 10:
        return STAGE_EMERGING_PROFILE
    if 11 <= count <= 20:
        return STAGE_DEVELOPING_PROFILE
    return STAGE_WARM


def get_cold_start_blend(activity_stage: str) -> Dict[str, Any]:
    """Retrieve the cold-start and personalized weights for a given activity stage."""
    return STAGE_BLEND_MAP.get(
        activity_stage,
        STAGE_BLEND_MAP[STAGE_COMPLETELY_COLD],
    )


def calculate_bayesian_quality_score(
    product: Product,
    min_reviews_m: int = BAYESIAN_MIN_REVIEWS_M,
    prior_rating_c: float = BAYESIAN_PRIOR_RATING_C,
) -> float:
    """
    Confidence-aware Bayesian quality score:
        S_quality = (v * R + m * C) / (v + m) / 5.0

    Prevents 1 review of 5.0 from outranking 100 reviews of 4.7.
    """
    avg_rating = float(getattr(product, "averageRating", 0.0) or 0.0)
    reviews_count = int(getattr(product, "reviewsCount", 0) or 0)

    if reviews_count == 0 and avg_rating == 0.0:
        # Neutral default prior when no reviews exist
        return _clamp01(prior_rating_c / 5.0 * 0.8)

    weighted_val = (reviews_count * avg_rating + min_reviews_m * prior_rating_c) / (
        reviews_count + min_reviews_m
    )
    return _clamp01(weighted_val / 5.0)


# ===========================================================================
# CENTRAL ACTIVITY PROFILER
# ===========================================================================

def get_user_activity_profile(db: Session, user_id: str) -> UserActivityProfile:
    """
    Central function to calculate a user's total interaction count and activity stage.
    Counts meaningful events across all activity models:
    - ClickEvent
    - ProductView
    - UserBehaviour (SEARCH, CLICK, VIEW, CART, WISHLIST, PURCHASE, REVIEW, RATING)
    - CartItem
    - Wishlist
    - Order / OrderItem
    - Rating
    - Review
    """
    if not user_id:
        return UserActivityProfile(
            user_id="",
            total_interactions=0,
            activity_stage=STAGE_COMPLETELY_COLD,
            recommendation_mode=MODE_COLD_START,
            cold_start_weight=1.0,
            personalized_weight=0.0,
            breakdown={},
        )

    breakdown: Dict[str, int] = {}

    try:
        # 1. ClickEvent
        clicks = (
            db.query(func.count(ClickEvent.id))
            .filter(ClickEvent.userId == user_id)
            .scalar()
            or 0
        )
        breakdown["clicks"] = clicks

        # 2. ProductView
        views = (
            db.query(func.count(ProductView.id))
            .filter(ProductView.userId == user_id)
            .scalar()
            or 0
        )
        breakdown["views"] = views

        # 3. UserBehaviour (views, searches, etc.)
        behaviour_count = (
            db.query(func.count(UserBehaviour.id))
            .filter(UserBehaviour.userId == user_id)
            .scalar()
            or 0
        )
        breakdown["user_behaviour"] = behaviour_count

        # 4. Cart Items
        cart_count = (
            db.query(func.count(CartItem.id))
            .filter(CartItem.userId == user_id)
            .scalar()
            or 0
        )
        breakdown["cart_items"] = cart_count

        # 5. Wishlist
        wishlist_count = (
            db.query(func.count(Wishlist.id))
            .filter(Wishlist.userId == user_id)
            .scalar()
            or 0
        )
        breakdown["wishlist_items"] = wishlist_count

        # 6. Orders
        order_count = (
            db.query(func.count(Order.id))
            .filter(Order.userId == user_id)
            .scalar()
            or 0
        )
        breakdown["orders"] = order_count

        # 7. Ratings
        rating_count = (
            db.query(func.count(Rating.id))
            .filter(Rating.userId == user_id)
            .scalar()
            or 0
        )
        breakdown["ratings"] = rating_count

        # 8. Reviews
        review_count = (
            db.query(func.count(Review.id))
            .filter(Review.userId == user_id)
            .scalar()
            or 0
        )
        breakdown["reviews"] = review_count

    except Exception as exc:
        logger.warning("Error computing user activity profile for %s: %s", user_id, exc)
        breakdown = {
            "clicks": 0,
            "views": 0,
            "user_behaviour": 0,
            "cart_items": 0,
            "wishlist_items": 0,
            "orders": 0,
            "ratings": 0,
            "reviews": 0,
        }

    # Meaningful total interactions.
    # We combine unique action signals to avoid artificial inflation while
    # capturing every meaningful intent (click, search, view, cart, purchase, review, rating).
    total_interactions = (
        breakdown.get("clicks", 0)
        + breakdown.get("views", 0)
        + breakdown.get("cart_items", 0)
        + breakdown.get("wishlist_items", 0)
        + breakdown.get("orders", 0)
        + breakdown.get("ratings", 0)
        + breakdown.get("reviews", 0)
    )
    # If UserBehaviour has searches or other non-view events, add any excess
    extra_behaviour = max(
        0, breakdown.get("user_behaviour", 0) - (breakdown.get("views", 0) + breakdown.get("clicks", 0))
    )
    total_interactions += extra_behaviour

    stage = classify_user_stage(total_interactions)
    blend = get_cold_start_blend(stage)

    return UserActivityProfile(
        user_id=user_id,
        total_interactions=total_interactions,
        activity_stage=stage,
        recommendation_mode=blend["mode"],
        cold_start_weight=blend["cold_start_weight"],
        personalized_weight=blend["personalized_weight"],
        breakdown=breakdown,
    )


# ===========================================================================
# COLD-START CANDIDATE GENERATION (100–200 Diversified Candidates)
# ===========================================================================

def generate_cold_start_candidates(
    db: Session,
    config: EngineConfig,
    user_id: Optional[str] = None,
) -> List[Tuple[Product, str]]:
    """
    Generate a diversified pool of 100-200 candidate products across:
    A. Trending (popular items + 7-day click popularity)
    B. Seasonal (current month keywords from SEASONAL_MAP)
    C. Quality / Highly-Rated (Bayesian quality score)
    D. Category Popularity (top items distributed across all categories)
    E. Location (nearby sellers based on user lat/long or city/state)
    F. Seller Exploration / New Artisans (isNewSeller == True)
    G. Exploration (curated high-inventory diverse items)
    """
    seen: Set[str] = set()
    candidates: List[Tuple[Product, str]] = []
    limits = COLD_START_CANDIDATE_LIMITS

    # ------------------------------------------------------------------
    # A. TRENDING (Recent popularity & general popularity)
    # ------------------------------------------------------------------
    try:
        trending_products = (
            db.query(Product)
            .options(
                joinedload(Product.images),
                joinedload(Product.seller),
                joinedload(Product.category),
            )
            .filter(Product.inventory > 0)
            .order_by(Product.popularity.desc(), Product.averageRating.desc())
            .limit(limits["trending"])
            .all()
        )
        for p in trending_products:
            if p.id not in seen:
                seen.add(p.id)
                candidates.append((p, "cold_trending"))
    except Exception as exc:
        logger.warning("Error fetching cold-start trending candidates: %s", exc)

    # ------------------------------------------------------------------
    # B. SEASONAL (Current month match)
    # ------------------------------------------------------------------
    try:
        current_month = datetime.utcnow().month
        seasonal_keywords = SEASONAL_MAP.get(current_month, {})
        if seasonal_keywords:
            keyword_list = list(seasonal_keywords.keys())
            # Match tags, name or description containing seasonal keyword
            tag_conditions = []
            for kw in keyword_list:
                kw_lower = f"%{kw.lower()}%"
                tag_conditions.append(func.lower(Product.name).like(kw_lower))
                tag_conditions.append(func.lower(Product.description).like(kw_lower))
                tag_conditions.append(func.lower(Product.craftType).like(kw_lower))

            if tag_conditions:
                seasonal_products = (
                    db.query(Product)
                    .options(
                        joinedload(Product.images),
                        joinedload(Product.seller),
                        joinedload(Product.category),
                    )
                    .filter(Product.inventory > 0)
                    .filter(or_(*tag_conditions))
                    .order_by(Product.popularity.desc())
                    .limit(limits["seasonal"])
                    .all()
                )
                for p in seasonal_products:
                    if p.id not in seen:
                        seen.add(p.id)
                        candidates.append((p, "cold_seasonal"))
    except Exception as exc:
        logger.warning("Error fetching cold-start seasonal candidates: %s", exc)

    # ------------------------------------------------------------------
    # C. QUALITY / HIGHLY RATED (Quality threshold)
    # ------------------------------------------------------------------
    try:
        quality_products = (
            db.query(Product)
            .options(
                joinedload(Product.images),
                joinedload(Product.seller),
                joinedload(Product.category),
            )
            .filter(
                Product.inventory > 0,
                Product.averageRating >= 4.0,
                Product.reviewsCount >= 2,
            )
            .order_by(
                Product.averageRating.desc(),
                Product.reviewsCount.desc(),
                Product.popularity.desc(),
            )
            .limit(limits["quality"])
            .all()
        )
        for p in quality_products:
            if p.id not in seen:
                seen.add(p.id)
                candidates.append((p, "cold_quality"))
    except Exception as exc:
        logger.warning("Error fetching cold-start quality candidates: %s", exc)

    # ------------------------------------------------------------------
    # D. CATEGORY POPULARITY (Top items per distinct category)
    # ------------------------------------------------------------------
    try:
        categories = db.query(Category).limit(15).all()
        per_category_limit = max(2, limits["category_popularity"] // max(1, len(categories)))
        for cat in categories:
            cat_products = (
                db.query(Product)
                .options(
                    joinedload(Product.images),
                    joinedload(Product.seller),
                    joinedload(Product.category),
                )
                .filter(Product.categoryId == cat.id, Product.inventory > 0)
                .order_by(Product.popularity.desc(), Product.averageRating.desc())
                .limit(per_category_limit)
                .all()
            )
            for p in cat_products:
                if p.id not in seen:
                    seen.add(p.id)
                    candidates.append((p, "cold_category_popularity"))
    except Exception as exc:
        logger.warning("Error fetching cold-start category popularity candidates: %s", exc)

    # ------------------------------------------------------------------
    # E. LOCATION (Nearby Artisans if coordinates / city / state present)
    # ------------------------------------------------------------------
    try:
        if _valid_coordinate_pair(config.user_latitude, config.user_longitude):
            sellers = (
                db.query(Seller)
                .filter(
                    Seller.latitude.isnot(None),
                    Seller.longitude.isnot(None),
                )
                .all()
            )
            ranked_sellers: List[Tuple[str, float]] = []
            for s in sellers:
                if _valid_coordinate_pair(getattr(s, "latitude", None), getattr(s, "longitude", None)):
                    d = haversine_distance_km(
                        float(config.user_latitude),
                        float(config.user_longitude),
                        float(s.latitude),
                        float(s.longitude),
                    )
                    if d <= max(100.0, config.nearby_radius_km):
                        ranked_sellers.append((s.id, d))

            ranked_sellers.sort(key=lambda x: x[1])
            nearby_seller_ids = [s_id for s_id, _ in ranked_sellers[:15]]
            if nearby_seller_ids:
                loc_products = (
                    db.query(Product)
                    .options(
                        joinedload(Product.images),
                        joinedload(Product.seller),
                        joinedload(Product.category),
                    )
                    .filter(Product.sellerId.in_(nearby_seller_ids), Product.inventory > 0)
                    .order_by(Product.popularity.desc())
                    .limit(limits["location"])
                    .all()
                )
                for p in loc_products:
                    if p.id not in seen:
                        seen.add(p.id)
                        candidates.append((p, "cold_location"))
        elif config.user_city_id or config.user_state_id:
            local_conditions = []
            if config.user_city_id:
                local_conditions.append(Seller.cityId == config.user_city_id)
            if config.user_state_id:
                local_conditions.append(Seller.stateId == config.user_state_id)
            loc_products = (
                db.query(Product)
                .options(
                    joinedload(Product.images),
                    joinedload(Product.seller),
                    joinedload(Product.category),
                )
                .join(Seller)
                .filter(or_(*local_conditions), Product.inventory > 0)
                .order_by(Product.popularity.desc())
                .limit(limits["location"])
                .all()
            )
            for p in loc_products:
                if p.id not in seen:
                    seen.add(p.id)
                    candidates.append((p, "cold_location"))
    except Exception as exc:
        logger.warning("Error fetching cold-start location candidates: %s", exc)

    # ------------------------------------------------------------------
    # F. NEW ARTISANS / SELLER EXPLORATION (isNewSeller == True)
    # ------------------------------------------------------------------
    try:
        new_artisan_products = (
            db.query(Product)
            .options(
                joinedload(Product.images),
                joinedload(Product.seller),
                joinedload(Product.category),
            )
            .join(Seller)
            .filter(
                Seller.isNewSeller == True,
                Product.inventory > 0,
            )
            .order_by(Product.popularity.desc(), Product.averageRating.desc())
            .limit(limits["seller_exploration"])
            .all()
        )
        for p in new_artisan_products:
            if p.id not in seen:
                seen.add(p.id)
                candidates.append((p, "cold_new_artisan"))
    except Exception as exc:
        logger.warning("Error fetching cold-start new artisan candidates: %s", exc)

    # ------------------------------------------------------------------
    # G. EXPLORATION (Curated high-inventory variety)
    # ------------------------------------------------------------------
    try:
        exploration_products = (
            db.query(Product)
            .options(
                joinedload(Product.images),
                joinedload(Product.seller),
                joinedload(Product.category),
            )
            .filter(Product.inventory >= 3)
            .order_by(Product.id.desc())
            .limit(limits["exploration"] * 2)
            .all()
        )
        # Random sample to give diverse serendipitous items
        random.seed(42)  # Deterministic base seed for stability
        shuffled = list(exploration_products)
        random.shuffle(shuffled)
        for p in shuffled[: limits["exploration"]]:
            if p.id not in seen:
                seen.add(p.id)
                candidates.append((p, "cold_exploration"))
    except Exception as exc:
        logger.warning("Error fetching cold-start exploration candidates: %s", exc)

    # Fallback if candidates pool is still small
    if len(candidates) < 20:
        try:
            fallback = (
                db.query(Product)
                .options(
                    joinedload(Product.images),
                    joinedload(Product.seller),
                    joinedload(Product.category),
                )
                .filter(Product.inventory > 0)
                .order_by(Product.popularity.desc())
                .limit(50)
                .all()
            )
            for p in fallback:
                if p.id not in seen:
                    seen.add(p.id)
                    candidates.append((p, "cold_fallback"))
        except Exception as exc:
            logger.warning("Error fetching cold-start fallback candidates: %s", exc)

    return candidates


# ===========================================================================
# COLD-START SCORE COMPUTATION
# ===========================================================================

def compute_cold_start_scores(
    candidates: Sequence[Any],  # Product or ScoredProduct or (Product, source)
    db: Session,
    config: EngineConfig,
    weights: Optional[Dict[str, float]] = None,
) -> Dict[str, ColdStartProductScores]:
    """
    Computes normalized cold-start score components for each candidate:
      ColdStartScore = 0.30 * trending
                     + 0.20 * seasonal
                     + 0.20 * quality
                     + 0.10 * category_popularity
                     + 0.05 * location
                     + 0.10 * seller_exploration
                     + 0.05 * exploration
    """
    w = dict(COLD_START_WEIGHTS)
    if weights:
        w.update(weights)

    current_month = datetime.now(timezone.utc).month
    seasonal_keywords = SEASONAL_MAP.get(current_month, {})

    # 1. Normalize popularity across candidate pool
    raw_products: List[Product] = []
    source_map: Dict[str, str] = {}
    for item in candidates:
        if isinstance(item, tuple):
            prod, src = item
            raw_products.append(prod)
            source_map[prod.id] = src
        elif hasattr(item, "product"):
            prod = item.product
            raw_products.append(prod)
            source_map[prod.id] = getattr(item, "source", "unknown")
        else:
            raw_products.append(item)
            source_map[item.id] = getattr(item, "source", "unknown")

    if not raw_products:
        return {}

    max_popularity = max((float(getattr(p, "popularity", 0.0) or 0.0) for p in raw_products), default=1.0)
    if max_popularity <= 0.0:
        max_popularity = 1.0

    # 2. Compute category counts to normalize category popularity
    category_counts: Dict[str, int] = {}
    for p in raw_products:
        cid = p.categoryId or "__none__"
        category_counts[cid] = category_counts.get(cid, 0) + 1

    scores_map: Dict[str, ColdStartProductScores] = {}

    for product in raw_products:
        pid = product.id

        # A. Trending Score [0, 1]
        pop = float(getattr(product, "popularity", 0.0) or 0.0)
        trending_score = _clamp01(pop / max_popularity)

        # B. Seasonal Score [0, 1]
        seasonal_score = 0.0
        if seasonal_keywords:
            text = f"{product.name or ''} {product.description or ''} {product.craftType or ''}".lower()
            tags = [t.lower() for t in (getattr(product, "tags", []) or [])]
            for kw, boost in seasonal_keywords.items():
                if kw in text or any(kw in t for t in tags):
                    seasonal_score = max(seasonal_score, boost * 3.0)  # scale to 0..1 range
            seasonal_score = _clamp01(seasonal_score)

        # C. Quality Score [0, 1] (Bayesian)
        quality_score = calculate_bayesian_quality_score(product)

        # D. Category Popularity [0, 1]
        cid = product.categoryId or "__none__"
        cat_items_count = category_counts.get(cid, 1)
        category_popularity_score = _clamp01((pop / max_popularity) * (1.0 - (cat_items_count / len(raw_products))))

        # E. Location Score [0, 1]
        location_score = 0.0
        seller = getattr(product, "seller", None)
        if seller:
            if _valid_coordinate_pair(config.user_latitude, config.user_longitude) and _valid_coordinate_pair(
                getattr(seller, "latitude", None), getattr(seller, "longitude", None)
            ):
                dist_km = haversine_distance_km(
                    float(config.user_latitude),
                    float(config.user_longitude),
                    float(seller.latitude),
                    float(seller.longitude),
                )
                location_score = distance_location_score(dist_km, decay_km=config.distance_decay_km)
            elif config.user_city_id and getattr(seller, "cityId", None) == config.user_city_id:
                location_score = 0.8
            elif config.user_state_id and getattr(seller, "stateId", None) == config.user_state_id:
                location_score = 0.5

        # F. Seller Exploration Score [0, 1]
        seller_exploration_score = 0.0
        if seller and getattr(seller, "isNewSeller", False):
            seller_exploration_score = 0.9
        elif seller and (getattr(seller, "rating", 0.0) or 0.0) >= 4.5:
            seller_exploration_score = 0.6

        # G. Exploration Score [0, 1]
        # Promotes products with good inventory and moderate popularity (non-obvious winners)
        inv = int(getattr(product, "inventory", 0) or 0)
        inv_factor = _clamp01(inv / 20.0)
        serendipity_factor = 1.0 - (pop / max_popularity)
        exploration_score = _clamp01(0.5 * inv_factor + 0.5 * serendipity_factor)

        # Combine into ColdStartScore
        combined_score = (
            w.get("trending", 0.30) * trending_score
            + w.get("seasonal", 0.20) * seasonal_score
            + w.get("quality", 0.20) * quality_score
            + w.get("category_popularity", 0.10) * category_popularity_score
            + w.get("location", 0.05) * location_score
            + w.get("seller_exploration", 0.10) * seller_exploration_score
            + w.get("exploration", 0.05) * exploration_score
        )
        combined_score = _clamp01(combined_score)

        # Determine primary candidate origin / explanation
        primary_source = source_map.get(pid, "cold_start")

        entry = ColdStartProductScores(
            product_id=pid,
            trending_score=round(trending_score, 6),
            seasonal_score=round(seasonal_score, 6),
            quality_score=round(quality_score, 6),
            category_popularity_score=round(category_popularity_score, 6),
            location_score=round(location_score, 6),
            seller_exploration_score=round(seller_exploration_score, 6),
            exploration_score=round(exploration_score, 6),
            cold_start_score=round(combined_score, 6),
            primary_source=primary_source,
        )
        entry.explanation = build_cold_start_explanation(product, entry)
        scores_map[pid] = entry

    return scores_map


# ===========================================================================
# COLD-START EXPLANATION GENERATOR
# ===========================================================================

def build_cold_start_explanation(product: Product, scores: ColdStartProductScores) -> str:
    """
    Generate clear, truthful recommendations reasons without claiming
    fictitious user-history (e.g. avoiding 'Because you liked X' for cold users).
    """
    seller = getattr(product, "seller", None)
    category = getattr(product, "category", None)

    # Location
    if scores.location_score >= 0.5:
        return "From a local artisan near you."

    # Seasonal
    if scores.seasonal_score >= 0.3:
        return "Seasonal favorite for this month."

    # New Artisan
    if seller and getattr(seller, "isNewSeller", False) and scores.seller_exploration_score >= 0.7:
        return "Discover a new artisan on UdrCrafts."

    # Highly Rated Quality
    if scores.quality_score >= 0.75 and (getattr(product, "reviewsCount", 0) or 0) >= 3:
        return "Highly rated by shoppers."

    # Category Popularity
    if category and getattr(category, "name", None) and scores.category_popularity_score >= 0.4:
        return f"Popular in {category.name}."

    # Trending
    if scores.trending_score >= 0.4:
        return "Trending among shoppers."

    # Exploration / Serendipity
    if scores.primary_source in ("cold_exploration", "random_discovery"):
        return "Curated artisan find for you."

    return "Popular craft recommendation."


# ===========================================================================
# COMPLETE COLD-START PIPELINE HELPER
# ===========================================================================

def get_cold_start_recommendations(
    db: Session,
    user_id: str,
    *,
    limit: int = 20,
    user_location: Optional[str] = None,
    user_city_id: Optional[str] = None,
    user_state_id: Optional[str] = None,
    user_latitude: Optional[float] = None,
    user_longitude: Optional[float] = None,
    weights: Optional[Dict[str, float]] = None,
    include_random: bool = True,
    **rule_overrides,
) -> List[ScoredProduct]:
    """
    Generate end-to-end cold-start recommendations obeying business rules,
    fairness, diversity caps, and local slot reservations.
    """
    config = EngineConfig(
        total_slots=limit,
        include_random=include_random,
        user_location=user_location,
        user_city_id=user_city_id,
        user_state_id=user_state_id,
        user_latitude=user_latitude,
        user_longitude=user_longitude,
        **rule_overrides,
    )

    # 1. Candidate generation
    candidates_with_source = generate_cold_start_candidates(db, config, user_id)

    # 2. Score computation
    cold_scores_map = compute_cold_start_scores(candidates_with_source, db, config, weights)

    scored_products: List[ScoredProduct] = []
    for prod, src in candidates_with_source:
        sc = cold_scores_map.get(prod.id)
        if not sc:
            continue

        sp = ScoredProduct(
            product=prod,
            final_score=sc.cold_start_score,
            trend_score=sc.trending_score,
            seasonal_boost=sc.seasonal_score,
            rating_score=sc.quality_score,
            category_boost=sc.category_popularity_score,
            location_boost=sc.location_score,
            seller_boost=sc.seller_exploration_score,
            explanation=sc.explanation,
            source=src,
        )
        setattr(sp, "cold_start_score", sc.cold_start_score)
        setattr(sp, "cold_start_scores", sc)

        # Distance diagnostics
        seller = getattr(prod, "seller", None)
        if (
            seller
            and _valid_coordinate_pair(config.user_latitude, config.user_longitude)
            and _valid_coordinate_pair(getattr(seller, "latitude", None), getattr(seller, "longitude", None))
        ):
            d_km = haversine_distance_km(
                float(config.user_latitude),
                float(config.user_longitude),
                float(seller.latitude),
                float(seller.longitude),
            )
            sp.seller_distance_km = round(d_km, 2)
            sp.nearby_seller = d_km <= config.nearby_radius_km

        scored_products.append(sp)

    # 3. Apply Business Rules, Fairness & Diversity Cap
    rule_filter = BusinessRuleFilter(db, config)
    filtered = rule_filter.apply(scored_products, user_id)

    # 4. Ranker Selection
    selector = RankerSelector(config.total_slots, config=config)
    selected = selector.select(filtered)

    # Ensure explanations stay cold-start truthful
    for sp in selected:
        sc = getattr(sp, "cold_start_scores", None)
        if sc and hasattr(sc, "explanation"):
            sp.explanation = sc.explanation

    return selected
