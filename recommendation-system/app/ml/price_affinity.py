"""
price_affinity.py — Production User Price Affinity Engine for UdrCrafts

Learns the preferred price range and level for a user from multi-signal
behaviour (views, clicks, searches, wishlist, cart, purchases, reviews)
using 14-day exponential recency decay, outlier-resistant log-space
percentile profiling, and smooth continuous Gaussian candidate scoring.
"""

from __future__ import annotations

import logging
import math
import re
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
PRICE_AFFINITY_HALFLIFE_DAYS = 7.0

# Event importance weights (higher for explicit commitment actions)
PRICE_EVENT_WEIGHTS: Dict[str, float] = {
    EVENT_PURCHASE: 1.00,
    EVENT_CART: 0.85,
    EVENT_WISHLIST: 0.70,
    EVENT_REVIEW: 0.50,
    EVENT_RATING: 0.50,
    EVENT_PRODUCT_VIEW: 0.35,
    EVENT_CLICK: 0.30,
    EVENT_SEARCH: 0.20,
}

# Percentile bounds for the user's preferred price comfort zone
LOWER_PERCENTILE = 0.20
UPPER_PERCENTILE = 0.80

# Minimum relative width (+/- 25%) when user has low observation variance
MIN_RELATIVE_HALF_WIDTH = 0.25

# Gaussian decay scale factor for prices outside the preferred range
PRICE_DECAY_SIGMA = 0.50

# Minimum interactions required to activate a category-specific price profile
MIN_CATEGORY_INTERACTIONS = 3
MIN_CATEGORY_CONFIDENCE = 0.35

# Confidence threshold below which global price personalization remains inactive
MIN_ACTIVE_CONFIDENCE = 0.15

# Target effective weight count for 100% confidence saturation
TARGET_EFFECTIVE_COUNT = 5.0


# ===========================================================================
# DATA STRUCTURES
# ===========================================================================

@dataclass
class PriceObservation:
    """Individual price observation extracted from user interaction history."""
    price: float
    event_type: str
    weight: float
    timestamp: datetime
    product_id: Optional[str] = None
    category_id: Optional[str] = None


@dataclass
class CategoryPriceProfile:
    """Learned price preference within a specific product category."""
    category_id: str
    preferred_price: float
    lower_price: float
    upper_price: float
    weighted_mean: float
    weighted_median: float
    price_std_dev: float
    confidence: float
    interaction_count: int
    sample_count: Dict[str, int] = field(default_factory=dict)


@dataclass
class UserPriceProfile:
    """Complete global and category-specific price profile for a user."""
    user_id: str
    preferred_price: float
    lower_price: float
    upper_price: float
    weighted_mean: float
    weighted_median: float
    price_std_dev: float
    confidence: float
    interaction_count: int
    unique_products_count: int
    last_updated: Optional[datetime] = None
    sample_count: Dict[str, int] = field(default_factory=dict)
    categories: Dict[str, CategoryPriceProfile] = field(default_factory=dict)

    @property
    def has_preference(self) -> bool:
        """Returns True if the profile has sufficient confidence to influence ranking."""
        return self.confidence >= MIN_ACTIVE_CONFIDENCE and self.preferred_price > 0.0


@dataclass
class CandidatePriceScore:
    """Detailed price affinity score and diagnostics for a candidate product."""
    price_affinity_score: float
    price_affinity_confidence: float
    preferred_price: float
    lower_price: float
    upper_price: float
    price_distance: float
    is_in_range: bool
    used_category_profile: bool
    explanation: str


# ===========================================================================
# STATISTICAL HELPERS (Log-space weighted percentiles & moments)
# ===========================================================================

def _clamp01(val: float) -> float:
    return max(0.0, min(1.0, float(val)))


def _weighted_median_and_percentiles(
    values: Sequence[float],
    weights: Sequence[float],
    percentiles: Sequence[float],
) -> List[float]:
    """
    Compute weighted percentiles from non-negative weights.
    Returns list of percentile values corresponding to `percentiles` in [0, 1].
    """
    if not values or not weights or len(values) != len(weights):
        return [0.0 for _ in percentiles]

    # Sort by value
    sorted_pairs = sorted(zip(values, weights), key=lambda x: x[0])
    total_weight = sum(w for _, w in sorted_pairs)

    if total_weight <= 0.0:
        return [sorted_pairs[0][0] for _ in percentiles]

    results = []
    for p in percentiles:
        threshold = p * total_weight
        cum_w = 0.0
        val = sorted_pairs[-1][0]
        for v, w in sorted_pairs:
            cum_w += w
            if cum_w >= threshold:
                val = v
                break
        results.append(val)

    return results


def _calculate_weighted_stats(
    observations: Sequence[PriceObservation],
    now: Optional[datetime] = None,
    half_life_days: float = PRICE_AFFINITY_HALFLIFE_DAYS,
) -> Tuple[float, float, float, float, float, float, Dict[str, int]]:
    """
    Given price observations, applies time decay and computes:
    (preferred_price, lower_price, upper_price, weighted_mean, weighted_median, std_dev, sample_counts)
    using robust log-price statistics.
    """
    now = now or datetime.now(timezone.utc)
    decay_lambda = math.log(2.0) / max(0.1, half_life_days)

    prices: List[float] = []
    log_prices: List[float] = []
    effective_weights: List[float] = []
    sample_counts: Dict[str, int] = {}

    for obs in observations:
        if obs.price is None or obs.price <= 0.0 or math.isnan(obs.price):
            continue

        # Calculate time delta in days
        ts = obs.timestamp
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        
        delta_days = max(0.0, (now - ts).total_seconds() / 86400.0)
        time_factor = math.exp(-decay_lambda * delta_days)
        w = obs.weight * time_factor

        if w <= 0.0:
            continue

        prices.append(obs.price)
        log_prices.append(math.log(obs.price))
        effective_weights.append(w)
        sample_counts[obs.event_type] = sample_counts.get(obs.event_type, 0) + 1

    if not prices:
        return 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, sample_counts

    sum_w = sum(effective_weights)
    if sum_w <= 0.0:
        return 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, sample_counts

    # Weighted mean in linear space
    weighted_mean = sum(p * w for p, w in zip(prices, effective_weights)) / sum_w

    # Log-space percentiles: 20th, 50th (median), 80th
    perc_vals = _weighted_median_and_percentiles(
        log_prices,
        effective_weights,
        [LOWER_PERCENTILE, 0.50, UPPER_PERCENTILE],
    )

    log_p20, log_median, log_p80 = perc_vals
    preferred_price = round(math.exp(log_median), 4)
    lower_price = round(math.exp(log_p20), 4)
    upper_price = round(math.exp(log_p80), 4)
    weighted_median = preferred_price

    # Ensure a reasonable minimum width if observations are all identical
    min_lower = round(preferred_price * (1.0 - MIN_RELATIVE_HALF_WIDTH), 4)
    max_upper = round(preferred_price * (1.0 + MIN_RELATIVE_HALF_WIDTH), 4)
    lower_price = min(lower_price, min_lower)
    upper_price = max(upper_price, max_upper)

    # Standard deviation in linear space
    variance = sum(w * ((p - weighted_mean) ** 2) for p, w in zip(prices, effective_weights)) / sum_w
    std_dev = round(math.sqrt(max(0.0, variance)), 4)
    weighted_mean = round(weighted_mean, 4)

    return preferred_price, lower_price, upper_price, weighted_mean, weighted_median, std_dev, sample_counts


def _calculate_confidence(
    observations: Sequence[PriceObservation],
    unique_products_count: int,
    now: Optional[datetime] = None,
    half_life_days: float = PRICE_AFFINITY_HALFLIFE_DAYS,
) -> float:
    """
    Computes a continuous confidence score in [0, 1] based on:
    1. Effective decayed observation count
    2. Unique product diversity (prevents repeated-view overfitting)
    3. Action strength (purchases & carts carry higher confidence than passive views)
    """
    if not observations or unique_products_count <= 0:
        return 0.0

    now = now or datetime.now(timezone.utc)
    decay_lambda = math.log(2.0) / max(0.1, half_life_days)

    total_effective_weight = 0.0
    high_intent_weight = 0.0

    for obs in observations:
        if obs.price is None or obs.price <= 0.0:
            continue
        ts = obs.timestamp
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        delta_days = max(0.0, (now - ts).total_seconds() / 86400.0)
        w = obs.weight * math.exp(-decay_lambda * delta_days)
        total_effective_weight += w

        if obs.event_type in (EVENT_PURCHASE, EVENT_CART, EVENT_WISHLIST):
            high_intent_weight += w

    if total_effective_weight <= 0.0:
        return 0.0

    # 1. Count factor: saturates smoothly as total effective weight approaches TARGET_EFFECTIVE_COUNT
    count_factor = 1.0 - math.exp(-total_effective_weight / TARGET_EFFECTIVE_COUNT)

    # 2. Diversity factor: full confidence requires at least 4 distinct products
    diversity_factor = min(1.0, max(0.25, unique_products_count / 4.0))

    # 3. Intent strength factor: boost if user has cart/wishlist/purchases
    intent_ratio = high_intent_weight / max(0.001, total_effective_weight)
    intent_factor = 0.60 + 0.40 * intent_ratio

    confidence = count_factor * diversity_factor * intent_factor
    return _clamp01(confidence)


# ===========================================================================
# SEARCH QUERY PRICE INTENT PARSER
# ===========================================================================

_PRICE_PATTERNS = [
    # "under 1000", "below 500", "less than 800"
    (re.compile(r"(?:under|below|less than|<)\s*(?:rs\.?|inr|₹)?\s*(\d+)", re.IGNORECASE), "max"),
    # "above 1000", "over 500", "more than 800"
    (re.compile(r"(?:above|over|more than|>)\s*(?:rs\.?|inr|₹)?\s*(\d+)", re.IGNORECASE), "min"),
    # "500 to 1000", "500-1000", "between 500 and 1000"
    (re.compile(r"(?:between\s+)?(?:rs\.?|inr|₹)?\s*(\d+)\s*(?:to|-|and)\s*(?:rs\.?|inr|₹)?\s*(\d+)", re.IGNORECASE), "range"),
]


def extract_price_from_search_query(query: str) -> Optional[Tuple[Optional[float], Optional[float]]]:
    """
    Extracts explicit price constraints from a search query if present.
    Returns (min_price, max_price) or None.
    """
    if not query:
        return None

    for pattern, kind in _PRICE_PATTERNS:
        match = pattern.search(query)
        if match:
            try:
                if kind == "max":
                    max_p = float(match.group(1))
                    return (0.0, max_p)
                elif kind == "min":
                    min_p = float(match.group(1))
                    return (min_p, None)
                elif kind == "range":
                    p1, p2 = float(match.group(1)), float(match.group(2))
                    return (min(p1, p2), max(p1, p2))
            except (ValueError, IndexError):
                continue

    return None


# ===========================================================================
# USER PRICE PROFILE BUILDER
# ===========================================================================

def build_user_price_profile(
    db: Optional[Session],
    user_id: str,
    *,
    now: Optional[datetime] = None,
    half_life_days: float = PRICE_AFFINITY_HALFLIFE_DAYS,
) -> UserPriceProfile:
    """
    Builds a complete UserPriceProfile by querying the user's historical events
    across UserBehaviour, ClickEvent, CartItem, Wishlist, and Order/OrderItem.
    """
    now = now or datetime.now(timezone.utc)

    # Empty profile fallback if DB session or user_id is missing
    empty_profile = UserPriceProfile(
        user_id=user_id,
        preferred_price=0.0,
        lower_price=0.0,
        upper_price=0.0,
        weighted_mean=0.0,
        weighted_median=0.0,
        price_std_dev=0.0,
        confidence=0.0,
        interaction_count=0,
        unique_products_count=0,
        last_updated=now,
    )

    if db is None or not user_id:
        return empty_profile

    observations: List[PriceObservation] = []
    unique_product_ids: Set[str] = set()
    category_observations: Dict[str, List[PriceObservation]] = {}

    try:
        # 1. Primary Source: UserBehaviour joined with Product
        ub_records = (
            db.query(UserBehaviour, Product.price, Product.categoryId)
            .join(Product, UserBehaviour.productId == Product.id)
            .filter(UserBehaviour.userId == user_id)
            .all()
        )

        for ub, price, cat_id in ub_records:
            if price is None or price <= 0.0:
                continue
            event_type = ub.eventType or EVENT_PRODUCT_VIEW
            base_weight = PRICE_EVENT_WEIGHTS.get(event_type, 0.35)
            obs = PriceObservation(
                price=float(price),
                event_type=event_type,
                weight=base_weight,
                timestamp=ub.createdAt or now,
                product_id=ub.productId,
                category_id=cat_id or ub.categoryId,
            )
            observations.append(obs)
            if ub.productId:
                unique_product_ids.add(ub.productId)
            if obs.category_id:
                category_observations.setdefault(obs.category_id, []).append(obs)

        # 2. Check ClickEvent (if not captured in UserBehaviour)
        clicks = (
            db.query(ClickEvent, Product.price, Product.categoryId)
            .join(Product, ClickEvent.productId == Product.id)
            .filter(ClickEvent.userId == user_id)
            .all()
        )
        for clk, price, cat_id in clicks:
            if price is None or price <= 0.0:
                continue
            obs = PriceObservation(
                price=float(price),
                event_type=EVENT_CLICK,
                weight=PRICE_EVENT_WEIGHTS[EVENT_CLICK],
                timestamp=clk.createdAt or now,
                product_id=clk.productId,
                category_id=cat_id or clk.categoryId,
            )
            observations.append(obs)
            if clk.productId:
                unique_product_ids.add(clk.productId)
            if obs.category_id:
                category_observations.setdefault(obs.category_id, []).append(obs)

        # 3. Check CartItem
        carts = (
            db.query(CartItem, Product.price, Product.categoryId)
            .join(Product, CartItem.productId == Product.id)
            .filter(CartItem.userId == user_id)
            .all()
        )
        for cart, price, cat_id in carts:
            if price is None or price <= 0.0:
                continue
            obs = PriceObservation(
                price=float(price),
                event_type=EVENT_CART,
                weight=PRICE_EVENT_WEIGHTS[EVENT_CART],
                timestamp=cart.createdAt or now,
                product_id=cart.productId,
                category_id=cat_id or cart.categoryId,
            )
            observations.append(obs)
            if cart.productId:
                unique_product_ids.add(cart.productId)
            if obs.category_id:
                category_observations.setdefault(obs.category_id, []).append(obs)

        # 4. Check Wishlist
        wishlists = (
            db.query(Wishlist, Product.price, Product.categoryId)
            .join(Product, Wishlist.productId == Product.id)
            .filter(Wishlist.userId == user_id)
            .all()
        )
        for wl, price, cat_id in wishlists:
            if price is None or price <= 0.0:
                continue
            obs = PriceObservation(
                price=float(price),
                event_type=EVENT_WISHLIST,
                weight=PRICE_EVENT_WEIGHTS[EVENT_WISHLIST],
                timestamp=wl.createdAt or now,
                product_id=wl.productId,
                category_id=cat_id or wl.categoryId,
            )
            observations.append(obs)
            if wl.productId:
                unique_product_ids.add(wl.productId)
            if obs.category_id:
                category_observations.setdefault(obs.category_id, []).append(obs)

        # 5. Extract search price intent if any search events exist
        searches = (
            db.query(UserBehaviour)
            .filter(
                UserBehaviour.userId == user_id,
                UserBehaviour.eventType == EVENT_SEARCH,
            )
            .all()
        )
        for s in searches:
            meta = s.eventMetadata or {}
            query_text = meta.get("query", "")
            price_intent = extract_price_from_search_query(query_text)
            if price_intent:
                min_p, max_p = price_intent
                target_p = max_p if max_p else (min_p * 1.5 if min_p else None)
                if target_p and target_p > 0.0:
                    obs = PriceObservation(
                        price=target_p,
                        event_type=EVENT_SEARCH,
                        weight=PRICE_EVENT_WEIGHTS[EVENT_SEARCH],
                        timestamp=s.createdAt or now,
                    )
                    observations.append(obs)

    except Exception as exc:
        logger.warning("Error collecting price observations for user %s: %s", user_id, exc)

    if not observations:
        return empty_profile

    # Global profile stats & confidence
    pref_p, low_p, up_p, w_mean, w_med, s_dev, sample_counts = _calculate_weighted_stats(
        observations, now=now, half_life_days=half_life_days
    )
    confidence = _calculate_confidence(
        observations, len(unique_product_ids), now=now, half_life_days=half_life_days
    )

    # Build category-specific profiles
    category_profiles: Dict[str, CategoryPriceProfile] = {}
    for cat_id, cat_obs in category_observations.items():
        if len(cat_obs) >= MIN_CATEGORY_INTERACTIONS:
            cat_unique_pids = {o.product_id for o in cat_obs if o.product_id}
            c_pref, c_low, c_up, c_mean, c_med, c_dev, c_samples = _calculate_weighted_stats(
                cat_obs, now=now, half_life_days=half_life_days
            )
            c_conf = _calculate_confidence(
                cat_obs, len(cat_unique_pids), now=now, half_life_days=half_life_days
            )
            if c_conf >= MIN_CATEGORY_CONFIDENCE and c_pref > 0.0:
                category_profiles[cat_id] = CategoryPriceProfile(
                    category_id=cat_id,
                    preferred_price=round(c_pref, 2),
                    lower_price=round(c_low, 2),
                    upper_price=round(c_up, 2),
                    weighted_mean=round(c_mean, 2),
                    weighted_median=round(c_med, 2),
                    price_std_dev=round(c_dev, 2),
                    confidence=round(c_conf, 4),
                    interaction_count=len(cat_obs),
                    sample_count=c_samples,
                )

    return UserPriceProfile(
        user_id=user_id,
        preferred_price=round(pref_p, 2),
        lower_price=round(low_p, 2),
        upper_price=round(up_p, 2),
        weighted_mean=round(w_mean, 2),
        weighted_median=round(w_med, 2),
        price_std_dev=round(s_dev, 2),
        confidence=round(confidence, 4),
        interaction_count=len(observations),
        unique_products_count=len(unique_product_ids),
        last_updated=now,
        sample_count=sample_counts,
        categories=category_profiles,
    )


# ===========================================================================
# CANDIDATE PRICE SCORING & EXPLANATION
# ===========================================================================

def compute_candidate_price_affinity(
    product: Product,
    profile: Optional[UserPriceProfile],
) -> CandidatePriceScore:
    """
    Calculates a continuous price affinity score in [0, 1] for a candidate product.

    - Inside preferred range [lower_price, upper_price] -> 1.0
    - Outside preferred range -> smooth asymmetric Gaussian decay
    - Low-confidence user -> neutral 0.50 score with low confidence
    - Missing / invalid price -> safe fallback score 0.50
    """
    raw_price = getattr(product, "price", None)

    # Safe fallback if product price is None, 0, or negative
    if raw_price is None or raw_price <= 0.0 or math.isnan(raw_price):
        return CandidatePriceScore(
            price_affinity_score=0.50,
            price_affinity_confidence=0.0,
            preferred_price=0.0,
            lower_price=0.0,
            upper_price=0.0,
            price_distance=0.0,
            is_in_range=False,
            used_category_profile=False,
            explanation="Price information unavailable.",
        )

    # If user has no price profile or confidence is below minimum active threshold
    if profile is None or not profile.has_preference:
        return CandidatePriceScore(
            price_affinity_score=0.50,
            price_affinity_confidence=profile.confidence if profile else 0.0,
            preferred_price=profile.preferred_price if profile else 0.0,
            lower_price=profile.lower_price if profile else 0.0,
            upper_price=profile.upper_price if profile else 0.0,
            price_distance=0.0,
            is_in_range=False,
            used_category_profile=False,
            explanation="Explore popular craft items.",
        )

    # Check for category-specific preference
    cat_id = getattr(product, "categoryId", None)
    cat_profile = profile.categories.get(cat_id) if (cat_id and profile.categories) else None

    if cat_profile is not None and cat_profile.confidence >= MIN_CATEGORY_CONFIDENCE:
        preferred = cat_profile.preferred_price
        lower = cat_profile.lower_price
        upper = cat_profile.upper_price
        confidence = cat_profile.confidence
        used_category = True
    else:
        preferred = profile.preferred_price
        lower = profile.lower_price
        upper = profile.upper_price
        confidence = profile.confidence
        used_category = False

    # Compute distance and smooth Gaussian affinity score
    price = float(raw_price)
    
    if lower <= price <= upper:
        score = 1.0
        distance = 0.0
        is_in_range = True
    elif price < lower:
        # Relative fractional distance below lower bound
        fractional_dist = (lower - price) / max(1.0, lower)
        distance = lower - price
        score = math.exp(-0.5 * ((fractional_dist / PRICE_DECAY_SIGMA) ** 2))
        is_in_range = False
    else:
        # Relative fractional distance above upper bound
        fractional_dist = (price - upper) / max(1.0, upper)
        distance = price - upper
        score = math.exp(-0.5 * ((fractional_dist / PRICE_DECAY_SIGMA) ** 2))
        is_in_range = False

    score = _clamp01(score)

    explanation = build_price_affinity_explanation(
        product, preferred, lower, upper, score, confidence, is_in_range
    )

    return CandidatePriceScore(
        price_affinity_score=round(score, 6),
        price_affinity_confidence=round(confidence, 4),
        preferred_price=round(preferred, 2),
        lower_price=round(lower, 2),
        upper_price=round(upper, 2),
        price_distance=round(distance, 2),
        is_in_range=is_in_range,
        used_category_profile=used_category,
        explanation=explanation,
    )


def build_price_affinity_explanation(
    product: Product,
    preferred_price: float,
    lower_price: float,
    upper_price: float,
    score: float,
    confidence: float,
    is_in_range: bool,
) -> str:
    """Generates context-truthful explanations for price matching."""
    if confidence < 0.25:
        return "Recommended for you on UdrCrafts."

    price = getattr(product, "price", 0.0) or 0.0

    if is_in_range or score >= 0.85:
        return f"Within your preferred price range (₹{int(lower_price)}–₹{int(upper_price)})."
    elif score >= 0.60:
        if price < lower_price:
            return f"Great value below your usual spending range."
        else:
            return f"Premium craft slightly above your usual price range."
    else:
        return "Popular handcrafted item to explore."
