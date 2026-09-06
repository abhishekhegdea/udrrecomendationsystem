"""
discount_affinity.py — Production User Discount Affinity Engine for UdrCrafts

Learns how a user behaves with respect to discounts, price markdowns, and promotional deals
from multi-signal historical behaviour (purchases, carts, wishlists, reviews, views, clicks)
using 7-day exponential recency decay, discount sensitivity profiling, and continuous
non-filtering candidate scoring.
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Mapping, Optional, Sequence, Set, Tuple

from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

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
from app.models import (
    CartItem,
    Category,
    ClickEvent,
    OrderItem,
    Product,
    ProductView,
    UserBehaviour,
    Wishlist,
)

logger = logging.getLogger(__name__)


# ===========================================================================
# CONFIGURATION CONSTANTS
# ===========================================================================

# 7-day exponential recency decay half-life
DISCOUNT_AFFINITY_HALFLIFE_DAYS = 7.0

# Event importance weights (higher for explicit commitment actions)
DISCOUNT_EVENT_WEIGHTS: Dict[str, float] = {
    EVENT_PURCHASE: 1.00,
    EVENT_CART: 0.85,
    EVENT_WISHLIST: 0.70,
    EVENT_REVIEW: 0.50,
    EVENT_RATING: 0.50,
    EVENT_PRODUCT_VIEW: 0.35,
    EVENT_CLICK: 0.30,
    EVENT_SEARCH: 0.20,
}

# Neutral fallback score for cold-start or zero-confidence candidates
NEUTRAL_DISCOUNT_SCORE = 0.50

# Minimum interactions required to activate category-level discount affinity
MIN_CATEGORY_INTERACTIONS = 3
MIN_CATEGORY_CONFIDENCE = 0.30

# Minimum active confidence threshold for global discount personalization
MIN_ACTIVE_CONFIDENCE = 0.15

# Target effective weight sum for 100% confidence saturation
TARGET_EFFECTIVE_COUNT = 5.0

# Gaussian bandwidth for discount rate matching (in percentage points)
DISCOUNT_BANDWIDTH_SIGMA = 15.0


# ===========================================================================
# DATA STRUCTURES
# ===========================================================================

@dataclass
class DiscountObservation:
    """Individual discount observation extracted from user interaction history."""
    discount_rate: float        # Discount percentage (e.g. 0.0, 10.0, 25.0, 50.0)
    is_discounted: bool        # True if discount_rate > 0
    price: float               # Nominal price
    event_type: str
    weight: float              # Recency-decayed effective weight
    timestamp: datetime
    product_id: Optional[str] = None
    category_id: Optional[str] = None


@dataclass
class UserDiscountProfile:
    """
    Learned discount affinity profile for a user.
    """
    user_id: str
    discount_sensitivity: float       # 0.0 (deal-averse/uninterested) to 1.0 (deal-seeker)
    preferred_discount_rate: float    # Weighted median discount percentage preferred (e.g. 20%)
    weighted_mean_discount: float     # Weighted mean discount percentage
    lower_discount: float             # 20th percentile of interacted discounts
    upper_discount: float             # 80th percentile of interacted discounts
    confidence: float                 # 0.0 to 1.0 based on sample size and recency
    has_preference: bool              # True if confidence >= MIN_ACTIVE_CONFIDENCE
    interaction_count: int            # Total raw interaction count
    discounted_interaction_count: int # Total interactions on discounted items
    total_effective_weight: float     # Sum of recency-decayed observation weights
    category_profiles: Dict[str, UserDiscountProfile] = field(default_factory=dict)
    sample_counts_by_event: Dict[str, int] = field(default_factory=dict)
    as_of: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    @property
    def is_deal_seeker(self) -> bool:
        """True if user demonstrates significant discount affinity (> 0.55)."""
        return self.has_preference and self.discount_sensitivity >= 0.55

    @property
    def is_discount_agnostic(self) -> bool:
        """True if user buys across both full-price and discounted goods equally."""
        return not self.has_preference or (0.35 <= self.discount_sensitivity <= 0.65)

    def get_category_profile(self, category_id: Optional[str]) -> UserDiscountProfile:
        """Returns category-specific profile if reliable, otherwise falls back to self."""
        if category_id and category_id in self.category_profiles:
            cat_prof = self.category_profiles[category_id]
            if cat_prof.has_preference and cat_prof.confidence >= MIN_CATEGORY_CONFIDENCE:
                return cat_prof
        return self


# ===========================================================================
# RECENCY DECAY HELPER
# ===========================================================================

def compute_discount_recency_weight(
    event_time: Optional[datetime],
    as_of: datetime,
    half_life_days: float = DISCOUNT_AFFINITY_HALFLIFE_DAYS,
) -> float:
    """Computes exponential recency decay weight: 2^(-age / half_life)."""
    if event_time is None:
        return 0.50

    if event_time.tzinfo is None:
        event_time = event_time.replace(tzinfo=timezone.utc)
    if as_of.tzinfo is None:
        as_of = as_of.replace(tzinfo=timezone.utc)

    age_days = max(0.0, (as_of - event_time).total_seconds() / 86400.0)
    return math.pow(2.0, -age_days / half_life_days)


# ===========================================================================
# PROFILE BUILDER
# ===========================================================================

def build_user_discount_profile(
    db: Session,
    user_id: str,
    as_of: Optional[datetime] = None,
    half_life_days: float = DISCOUNT_AFFINITY_HALFLIFE_DAYS,
) -> UserDiscountProfile:
    """
    Builds a robust, recency-weighted UserDiscountProfile for a user from database interactions.
    """
    if as_of is None:
        as_of = datetime.now(timezone.utc)
    elif as_of.tzinfo is None:
        as_of = as_of.replace(tzinfo=timezone.utc)

    observations: List[DiscountObservation] = []
    event_counts: Dict[str, int] = {}

    # 1. UserBehaviour table (comprehensive event log)
    try:
        behaviours = (
            db.query(
                UserBehaviour.eventType,
                UserBehaviour.createdAt,
                UserBehaviour.productId,
                Product.price,
                Product.discount,
                Product.categoryId,
            )
            .join(Product, UserBehaviour.productId == Product.id)
            .filter(UserBehaviour.userId == user_id)
            .all()
        )

        for event_type, created_at, prod_id, price, discount_val, cat_id in behaviours:
            if price is None or price <= 0:
                continue

            base_w = DISCOUNT_EVENT_WEIGHTS.get(event_type, 0.30)
            recency_w = compute_discount_recency_weight(created_at, as_of, half_life_days)
            eff_w = base_w * recency_w

            discount_rate = max(0.0, float(discount_val or 0.0))
            is_disc = discount_rate > 0.0

            observations.append(
                DiscountObservation(
                    discount_rate=discount_rate,
                    is_discounted=is_disc,
                    price=float(price),
                    event_type=event_type,
                    weight=eff_w,
                    timestamp=created_at or as_of,
                    product_id=prod_id,
                    category_id=cat_id,
                )
            )
            event_counts[event_type] = event_counts.get(event_type, 0) + 1
    except Exception as exc:
        logger.warning("Error querying UserBehaviour for user %s: %s", user_id, exc)

    # 2. Orders & OrderItems
    try:
        order_items = (
            db.query(
                OrderItem.price,
                Product.discount,
                Product.categoryId,
                OrderItem.productId,
                OrderItem.createdAt,
            )
            .join(Product, OrderItem.productId == Product.id)
            .filter(OrderItem.userId == user_id)
            .all()
        )
        for item_price, discount_val, cat_id, prod_id, created_at in order_items:
            if item_price and item_price > 0:
                base_w = DISCOUNT_EVENT_WEIGHTS[EVENT_PURCHASE]
                recency_w = compute_discount_recency_weight(created_at, as_of, half_life_days)
                eff_w = base_w * recency_w
                discount_rate = max(0.0, float(discount_val or 0.0))
                observations.append(
                    DiscountObservation(
                        discount_rate=discount_rate,
                        is_discounted=(discount_rate > 0.0),
                        price=float(item_price),
                        event_type=EVENT_PURCHASE,
                        weight=eff_w,
                        timestamp=created_at or as_of,
                        product_id=prod_id,
                        category_id=cat_id,
                    )
                )
                event_counts[EVENT_PURCHASE] = event_counts.get(EVENT_PURCHASE, 0) + 1
    except Exception as exc:
        logger.debug("Error querying OrderItems for discount profile: %s", exc)

    # 3. Cart items
    try:
        cart_items = (
            db.query(
                Product.price,
                Product.discount,
                Product.categoryId,
                CartItem.productId,
                CartItem.createdAt,
            )
            .join(Product, CartItem.productId == Product.id)
            .filter(CartItem.userId == user_id)
            .all()
        )
        for c_price, discount_val, cat_id, prod_id, created_at in cart_items:
            if c_price and c_price > 0:
                base_w = DISCOUNT_EVENT_WEIGHTS[EVENT_CART]
                recency_w = compute_discount_recency_weight(created_at, as_of, half_life_days)
                eff_w = base_w * recency_w
                discount_rate = max(0.0, float(discount_val or 0.0))
                observations.append(
                    DiscountObservation(
                        discount_rate=discount_rate,
                        is_discounted=(discount_rate > 0.0),
                        price=float(c_price),
                        event_type=EVENT_CART,
                        weight=eff_w,
                        timestamp=created_at or as_of,
                        product_id=prod_id,
                        category_id=cat_id,
                    )
                )
                event_counts[EVENT_CART] = event_counts.get(EVENT_CART, 0) + 1
    except Exception as exc:
        logger.debug("Error querying CartItems for discount profile: %s", exc)

    # 4. Wishlist items
    try:
        wishlist_items = (
            db.query(
                Product.price,
                Product.discount,
                Product.categoryId,
                Wishlist.productId,
                Wishlist.createdAt,
            )
            .join(Product, Wishlist.productId == Product.id)
            .filter(Wishlist.userId == user_id)
            .all()
        )
        for w_price, discount_val, cat_id, prod_id, created_at in wishlist_items:
            if w_price and w_price > 0:
                base_w = DISCOUNT_EVENT_WEIGHTS[EVENT_WISHLIST]
                recency_w = compute_discount_recency_weight(created_at, as_of, half_life_days)
                eff_w = base_w * recency_w
                discount_rate = max(0.0, float(discount_val or 0.0))
                observations.append(
                    DiscountObservation(
                        discount_rate=discount_rate,
                        is_discounted=(discount_rate > 0.0),
                        price=float(w_price),
                        event_type=EVENT_WISHLIST,
                        weight=eff_w,
                        timestamp=created_at or as_of,
                        product_id=prod_id,
                        category_id=cat_id,
                    )
                )
                event_counts[EVENT_WISHLIST] = event_counts.get(EVENT_WISHLIST, 0) + 1
    except Exception as exc:
        logger.debug("Error querying Wishlist for discount profile: %s", exc)

    return _build_profile_from_observations(
        user_id=user_id,
        observations=observations,
        event_counts=event_counts,
        as_of=as_of,
    )


def _build_profile_from_observations(
    user_id: str,
    observations: List[DiscountObservation],
    event_counts: Dict[str, int],
    as_of: datetime,
    build_category_profiles: bool = True,
) -> UserDiscountProfile:
    """Computes weighted discount statistics from raw observations."""
    if not observations:
        return UserDiscountProfile(
            user_id=user_id,
            discount_sensitivity=0.50,
            preferred_discount_rate=0.0,
            weighted_mean_discount=0.0,
            lower_discount=0.0,
            upper_discount=0.0,
            confidence=0.0,
            has_preference=False,
            interaction_count=0,
            discounted_interaction_count=0,
            total_effective_weight=0.0,
            as_of=as_of,
        )

    total_effective_weight = sum(o.weight for o in observations)
    discounted_observations = [o for o in observations if o.is_discounted]
    discounted_weight = sum(o.weight for o in discounted_observations)

    # Discount sensitivity: ratio of discounted interactions to total weighted interactions
    if total_effective_weight > 0:
        discount_sensitivity = discounted_weight / total_effective_weight
    else:
        discount_sensitivity = 0.50

    # Confidence calculation based on effective sample weight
    confidence = min(1.0, 1.0 - math.exp(-total_effective_weight / TARGET_EFFECTIVE_COUNT))
    has_pref = confidence >= MIN_ACTIVE_CONFIDENCE

    # Preferred discount rate calculation (from discounted interactions if available, else overall)
    target_obs = discounted_observations if discounted_observations else observations
    target_weight_sum = sum(o.weight for o in target_obs)

    if target_weight_sum > 0:
        weighted_mean = sum(o.discount_rate * o.weight for o in target_obs) / target_weight_sum
        
        # Compute weighted percentiles
        sorted_obs = sorted(target_obs, key=lambda x: x.discount_rate)
        cum_w = 0.0
        median_val = weighted_mean
        p20_val = weighted_mean
        p80_val = weighted_mean

        for o in sorted_obs:
            cum_w += o.weight
            fraction = cum_w / target_weight_sum
            if fraction >= 0.20 and p20_val == weighted_mean:
                p20_val = o.discount_rate
            if fraction >= 0.50 and median_val == weighted_mean:
                median_val = o.discount_rate
            if fraction >= 0.80 and p80_val == weighted_mean:
                p80_val = o.discount_rate
    else:
        weighted_mean = 0.0
        median_val = 0.0
        p20_val = 0.0
        p80_val = 0.0

    # Build category-specific profiles
    category_profiles: Dict[str, UserDiscountProfile] = {}
    if build_category_profiles:
        cat_obs: Dict[str, List[DiscountObservation]] = {}
        for o in observations:
            if o.category_id:
                cat_obs.setdefault(o.category_id, []).append(o)

        for cat_id, c_obs in cat_obs.items():
            if len(c_obs) >= MIN_CATEGORY_INTERACTIONS:
                category_profiles[cat_id] = _build_profile_from_observations(
                    user_id=user_id,
                    observations=c_obs,
                    event_counts={},
                    as_of=as_of,
                    build_category_profiles=False,
                )

    return UserDiscountProfile(
        user_id=user_id,
        discount_sensitivity=round(discount_sensitivity, 4),
        preferred_discount_rate=round(median_val, 2),
        weighted_mean_discount=round(weighted_mean, 2),
        lower_discount=round(p20_val, 2),
        upper_discount=round(p80_val, 2),
        confidence=round(confidence, 4),
        has_preference=has_pref,
        interaction_count=len(observations),
        discounted_interaction_count=len(discounted_observations),
        total_effective_weight=round(total_effective_weight, 4),
        category_profiles=category_profiles,
        sample_counts_by_event=event_counts,
        as_of=as_of,
    )


# ===========================================================================
# CANDIDATE SCORER
# ===========================================================================

def compute_candidate_discount_affinity(
    profile: Optional[UserDiscountProfile],
    candidate: Any,
    category_id: Optional[str] = None,
) -> float:
    """
    Computes a continuous [0.0, 1.0] discount affinity ranking score for a candidate product.

    Design constraints:
    - Never acts as a hard filter (products without discount are never dropped to 0).
    - If user is deal-oriented (sensitivity > 0.5), candidates with discounts receive a boost
      proportional to discount presence and match with preferred discount depth.
    - If user is discount-agnostic or cold-start, returns smooth neutral baseline (0.50).
    - Soft continuous Gaussian decay for discounts far above or below preferred range.
    """
    if profile is None or not profile.has_preference or profile.confidence <= 0.0:
        return NEUTRAL_DISCOUNT_SCORE

    # Use category-specific profile if available
    effective_profile = profile.get_category_profile(category_id)
    confidence = effective_profile.confidence
    sensitivity = effective_profile.discount_sensitivity
    preferred_rate = effective_profile.preferred_discount_rate

    # Extract candidate product discount rate
    if hasattr(candidate, "discount"):
        cand_discount = float(candidate.discount or 0.0)
    elif isinstance(candidate, dict):
        cand_discount = float(candidate.get("discount", 0.0) or 0.0)
    else:
        cand_discount = 0.0

    cand_discount = max(0.0, min(100.0, cand_discount))
    has_discount = cand_discount > 0.0

    # 1. Compute raw affinity score based on user sensitivity
    if sensitivity >= 0.50:
        # User prefers discounts
        if has_discount:
            # Closeness to preferred discount rate (Gaussian similarity)
            if preferred_rate > 0.0:
                diff = abs(cand_discount - preferred_rate)
                depth_match = math.exp(-0.5 * (diff / DISCOUNT_BANDWIDTH_SIGMA) ** 2)
            else:
                depth_match = min(1.0, cand_discount / 25.0)

            # High score for matching discount: 0.70 + 0.30 * depth_match
            raw_score = 0.70 + 0.30 * depth_match
        else:
            # Non-discounted item for a discount-sensitive user
            # Receives lower but non-zero baseline (0.35 to 0.45)
            raw_score = max(0.20, 0.50 - 0.30 * sensitivity)
    else:
        # User is full-price / quality oriented (sensitivity < 0.50)
        if not has_discount:
            raw_score = 0.75 + 0.25 * (1.0 - sensitivity * 2.0)
        else:
            # Discounted item for full-price shopper receives neutral score
            raw_score = 0.50

    # 2. Soft blend with confidence against neutral baseline
    final_score = confidence * raw_score + (1.0 - confidence) * NEUTRAL_DISCOUNT_SCORE
    return max(0.0, min(1.0, round(final_score, 6)))
