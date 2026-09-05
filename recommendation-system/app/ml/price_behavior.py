"""
price_behavior.py — User Price Behaviour Model for UdrCrafts

Learns *how* a user behaves around price — not only *which* numeric price
range they prefer (that is app.ml.price_affinity) but whether they respond
to discounted products, premium (category-relative) products, or full-price
products.

Three continuous affinities are learned from weighted, recency-decayed
behavioural evidence:

    discount_affinity    — how strongly the user engages with discounted items
    premium_affinity     — how strongly the user engages with category-relative
                           premium items
    full_price_affinity  — how strongly the user accepts items at full price

Design rules
------------
* No hard price filtering.  The output is a continuous 0..1 matching score
  that is blended into the existing weighted recommendation score.
* Purchases are the strongest signal; the event weights mirror the existing
  ENGAGEMENT_EVENT_WEIGHTS architecture in recommendation_engine.py.
* Recency uses a configurable exponential half-life (default 14 days).
* Premium status is always relative to the product's category price
  distribution (configurable percentile threshold), never a fixed rupee
  amount.
* Confidence gates everything: a low-confidence profile contributes a neutral
  0.50 (same convention as price_affinity) and never produces a misleading
  behavioural explanation.
* The profile is built once per recommendation request and reused to score
  every candidate (no N+1 queries); category price statistics are computed
  once per request and cached in memory.
"""

from __future__ import annotations

import bisect
import logging
import math
import os
from bisect import bisect_right
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Mapping, Optional, Sequence, Set, Tuple

from sqlalchemy import func
from sqlalchemy.orm import Session

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
    ClickEvent,
    Order,
    OrderItem,
    Product,
    UserBehaviour,
    Wishlist,
)

logger = logging.getLogger(__name__)


# ===========================================================================
# CONFIGURATION (all env-overridable, none hard-coded at point of use)
# ===========================================================================

def _env_float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default


# ---------------------------------------------------------------------------
# Discount definition
# ---------------------------------------------------------------------------

# A product counts as "discounted" when its discount percentage reaches this
# configurable threshold (percent).  Initial value: 10%.
DISCOUNT_THRESHOLD_PERCENT = max(0.0, _env_float("PRICE_BEHAVIOR_DISCOUNT_THRESHOLD", 10.0))

# Discount intensity reference: a product discounted by this percentage
# contributes full discount intensity (1.0).  e.g. 25% -> 0.5, 50% -> 1.0.
DISCOUNT_INTENSITY_REFERENCE_PERCENT = max(1.0, _env_float("PRICE_BEHAVIOR_DISCOUNT_INTENSITY_REF", 50.0))

# Product.discount is interpreted as a discount PERCENTAGE (0..100) by default.
# Set PRICE_BEHAVIOR_DISCOUNT_IS_PERCENTAGE=false when the column stores an
# absolute currency amount instead.
DISCOUNT_FIELD_IS_PERCENTAGE = (
    os.getenv("PRICE_BEHAVIOR_DISCOUNT_IS_PERCENTAGE", "true").strip().lower()
    not in {"0", "false", "no", "off"}
)

# Maximum credible discount percentage; values beyond this are treated as
# missing/invalid rather than crashing recommendation generation.
MAX_CREDIBLE_DISCOUNT_PERCENT = 90.0


# ---------------------------------------------------------------------------
# Full-price definition
# ---------------------------------------------------------------------------

# Products discounted by at most this percentage are considered full price
# (tolerates rounding/storage noise).
FULL_PRICE_TOLERANCE_PERCENT = max(
    0.0, _env_float("PRICE_BEHAVIOR_FULL_PRICE_TOLERANCE", 1.0)
)

# Full-price score falls linearly to zero at this discount percentage.
FULL_PRICE_MAX_PERCENT = max(
    FULL_PRICE_TOLERANCE_PERCENT + 1.0,
    _env_float("PRICE_BEHAVIOR_FULL_PRICE_MAX", 5.0),
)


# ---------------------------------------------------------------------------
# Premium definition (category-relative)
# ---------------------------------------------------------------------------

# A product is a "premium candidate" from the percentile of its category price
# distribution onward.  e.g. 80 = top 20% of the category.
PREMIUM_PERCENTILE = max(50.0, min(99.0, _env_float("PRICE_BEHAVIOR_PREMIUM_PERCENTILE", 80.0)))

# Categories with fewer products than this fall back to the global catalog
# price distribution for the premium score.
MIN_CATEGORY_STATS_COUNT = max(2, _env_int("PRICE_BEHAVIOR_MIN_CATEGORY_STATS", 5))


# ---------------------------------------------------------------------------
# Recency
# ---------------------------------------------------------------------------

# Exponential half-life for price behaviour evidence (days).
PRICE_BEHAVIOR_HALFLIFE_DAYS = max(1.0, _env_float("PRICE_BEHAVIOR_HALFLIFE_DAYS", 14.0))


# ---------------------------------------------------------------------------
# Event importance weights
# ---------------------------------------------------------------------------
# Purchase is the strongest signal.  The relative ordering mirrors the
# existing ENGAGEMENT_EVENT_WEIGHTS in recommendation_engine.py (the single
# event-weight architecture of this project), with no competing weight system.
PRICE_BEHAVIOR_EVENT_WEIGHTS: Dict[str, float] = {
    EVENT_PURCHASE: 1.00,
    EVENT_CART: 0.80,
    EVENT_WISHLIST: 0.65,
    EVENT_REVIEW: 0.50,
    EVENT_RATING: 0.50,
    EVENT_CLICK: 0.40,
    EVENT_PRODUCT_VIEW: 0.25,
    EVENT_RETURN: 0.20,
    # SEARCH events carry no product price and are used only for price-intent
    # parsing; the weight is retained for completeness.
    EVENT_SEARCH: 0.10,
}


# ---------------------------------------------------------------------------
# Confidence
# ---------------------------------------------------------------------------

# Effective decayed observation weight needed to saturate the confidence
# count factor.
TARGET_EFFECTIVE_COUNT = max(1.0, _env_float("PRICE_BEHAVIOR_TARGET_EFFECTIVE_COUNT", 6.0))

# Minimum confidence below which price behaviour stays inactive (neutral
# score, no behavioural claim).  Mirrors price_affinity's MIN_ACTIVE_CONFIDENCE.
MIN_ACTIVE_CONFIDENCE = 0.15

# Minimum category confidence before a category-specific profile is used.
MIN_CATEGORY_CONFIDENCE = 0.35

# Minimum raw interactions required to attempt a category-specific profile.
MIN_CATEGORY_INTERACTIONS = max(2, _env_int("PRICE_BEHAVIOR_MIN_CATEGORY_INTERACTIONS", 4))


# ---------------------------------------------------------------------------
# Behaviour-type classification
# ---------------------------------------------------------------------------

BEHAVIOR_UNKNOWN = "UNKNOWN"
BEHAVIOR_MIXED = "MIXED"
BEHAVIOR_DISCOUNT = "DISCOUNT_ORIENTED"
BEHAVIOR_PREMIUM = "PREMIUM_ORIENTED"
BEHAVIOR_FULL_PRICE = "FULL_PRICE_ORIENTED"

# A behaviour is "oriented" only when its affinity is at least this high and
# clearly ahead of the second-strongest affinity.
BEHAVIOR_TYPE_MIN_AFFINITY = 0.40
BEHAVIOR_TYPE_MIN_MARGIN = 0.12


# ===========================================================================
# DATA STRUCTURES
# ===========================================================================

@dataclass
class ProductPriceFeatures:
    """Safe, validated price features for one product."""

    price: float
    original_price: float
    discount_percentage: float  # 0..100
    discount_intensity: float   # 0..1 continuous
    full_price_score: float     # 0..1 continuous
    is_discounted: bool
    is_full_price: bool


@dataclass
class PriceBehaviorObservation:
    """One behavioural observation with its price-behaviour features."""

    product_id: Optional[str]
    category_id: Optional[str]
    event_type: str
    weight: float
    timestamp: datetime
    price: float
    original_price: float
    discount_percentage: float
    discount_intensity: float
    full_price_score: float
    premium_score: float


@dataclass
class CategoryPriceStats:
    """Precomputed category price distribution for percentile lookups."""

    category_id: str
    sorted_prices: List[float]

    @property
    def count(self) -> int:
        return len(self.sorted_prices)

    def percentile(self, price: float) -> float:
        """Fraction of category prices <= `price` (0..1)."""
        if not self.sorted_prices:
            return 0.0
        return bisect_right(self.sorted_prices, price) / len(self.sorted_prices)


@dataclass
class CategoryPriceBehaviorProfile:
    """Learned price behaviour inside one category."""

    category_id: str
    discount_affinity: float
    premium_affinity: float
    full_price_affinity: float
    preferred_discount_percentage: float
    confidence: float
    interaction_count: int
    behavior_type: str


@dataclass
class UserPriceBehaviorProfile:
    """Complete user price-behaviour profile (global + per category)."""

    user_id: str
    discount_affinity: float
    premium_affinity: float
    full_price_affinity: float
    price_sensitivity: float
    preferred_discount_percentage: float
    average_discount_seen: float
    average_discount_purchased: float
    discount_purchase_ratio: float
    premium_purchase_ratio: float
    full_price_purchase_ratio: float
    confidence: float
    interaction_count: int
    unique_products_count: int
    behavior_type: str
    last_updated: Optional[datetime] = None
    sample_count: Dict[str, int] = field(default_factory=dict)
    categories: Dict[str, CategoryPriceBehaviorProfile] = field(default_factory=dict)

    @property
    def has_preference(self) -> bool:
        """True when confidence is sufficient to influence ranking."""
        return self.confidence >= MIN_ACTIVE_CONFIDENCE


@dataclass
class CandidatePriceBehaviorScore:
    """Candidate price-behaviour match score plus full diagnostics."""

    price_behavior_score: float          # effective score (confidence-scaled), 0..1
    price_behavior_raw_score: float      # raw behavioural match, 0..1
    price_behavior_confidence: float     # 0..1
    price_behavior_type: str
    candidate_discount_percentage: float
    candidate_original_price: float
    candidate_premium_score: float
    candidate_full_price_score: float
    discount_contribution: float
    premium_contribution: float
    full_price_contribution: float
    used_category_profile: bool
    explanation: str


# ===========================================================================
# SAFE HELPERS
# ===========================================================================

def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, float(value)))


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    if not math.isfinite(number):
        return default
    return number


def _utc(value: Optional[datetime]) -> datetime:
    if value is None:
        return datetime.now(timezone.utc)
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _decay_factor(
    timestamp: datetime,
    now: datetime,
    half_life_days: float,
) -> float:
    """Exponential recency decay in [0, 1]; 1.0 for now, 0.5 at one half-life."""
    delta_days = max(0.0, (now - _utc(timestamp)).total_seconds() / 86400.0)
    decay_lambda = math.log(2.0) / max(0.1, half_life_days)
    return math.exp(-decay_lambda * delta_days)


# ===========================================================================
# PRODUCT PRICE FEATURES
# ===========================================================================

def get_product_price_features(
    product: Product,
    *,
    discount_is_percentage: bool = DISCOUNT_FIELD_IS_PERCENTAGE,
) -> Optional[ProductPriceFeatures]:
    """
    Derive validated price features for one product.

    Returns None when the product price is missing/invalid so callers can
    fall back to a neutral score instead of crashing.

    discount_percentage is reused from Product.discount when it is stored as a
    percentage; otherwise it is derived from an absolute amount.  The original
    price is reconstructed as price / (1 - pct/100) when a discount exists.
    """
    price = _safe_float(getattr(product, "price", None), default=0.0)
    if price <= 0.0:
        return None

    discount_value = _safe_float(getattr(product, "discount", None), default=0.0)
    discount_value = max(0.0, discount_value)

    if discount_is_percentage:
        discount_percentage = min(discount_value, MAX_CREDIBLE_DISCOUNT_PERCENT)
        if discount_percentage > 0.0:
            original_price = price / (1.0 - discount_percentage / 100.0)
        else:
            original_price = price
    else:
        # discount column stores an absolute currency amount.
        if discount_value > 0.0:
            original_price = price + discount_value
            discount_percentage = min(
                discount_value / original_price * 100.0,
                MAX_CREDIBLE_DISCOUNT_PERCENT,
            )
        else:
            original_price = price
            discount_percentage = 0.0

    if original_price <= 0.0:
        return None

    discount_percentage = max(0.0, min(discount_percentage, MAX_CREDIBLE_DISCOUNT_PERCENT))

    intensity = _clamp01(discount_percentage / DISCOUNT_INTENSITY_REFERENCE_PERCENT)

    # Full-price score: 1.0 inside the tolerance band, linear decay to 0.
    if discount_percentage <= FULL_PRICE_TOLERANCE_PERCENT:
        full_price_score = 1.0
    else:
        full_price_score = _clamp01(
            (FULL_PRICE_MAX_PERCENT - discount_percentage)
            / max(0.01, FULL_PRICE_MAX_PERCENT - FULL_PRICE_TOLERANCE_PERCENT)
        )

    return ProductPriceFeatures(
        price=price,
        original_price=round(original_price, 4),
        discount_percentage=round(discount_percentage, 4),
        discount_intensity=round(intensity, 6),
        full_price_score=round(full_price_score, 6),
        is_discounted=discount_percentage >= DISCOUNT_THRESHOLD_PERCENT,
        is_full_price=discount_percentage <= FULL_PRICE_TOLERANCE_PERCENT,
    )


# ===========================================================================
# PREMIUM SCORE (category-relative)
# ===========================================================================

def compute_premium_score(
    price: float,
    category_id: Optional[str],
    category_stats: Optional[Mapping[str, CategoryPriceStats]],
    global_stats: Optional[CategoryPriceStats] = None,
) -> float:
    """
    Continuous premium score in [0, 1] relative to the category price
    distribution.  A product at the configured premium percentile scores 0 and
    the most expensive product in the category scores 1.
    """
    if price <= 0.0:
        return 0.0

    stats: Optional[CategoryPriceStats] = None
    if category_id and category_stats and category_id in category_stats:
        candidate = category_stats[category_id]
        if candidate.count >= MIN_CATEGORY_STATS_COUNT:
            stats = candidate

    if stats is None:
        stats = global_stats

    if stats is None or stats.count == 0:
        return 0.0

    percentile = stats.percentile(price)
    # percentile is 0..1; premium ramps from the premium percentile to the top.
    start = PREMIUM_PERCENTILE / 100.0
    return _clamp01((percentile - start) / max(0.01, 1.0 - start))


# ===========================================================================
# CATEGORY PRICE STATS (one query per request, reused for all candidates)
# ===========================================================================

def build_category_price_stats(
    db: Optional[Session],
    *,
    category_ids: Optional[Sequence[str]] = None,
) -> Tuple[Dict[str, CategoryPriceStats], Optional[CategoryPriceStats]]:
    """
    Precompute per-category sorted price lists plus a global fallback.

    Executes exactly one query over the catalog (optionally restricted to the
    supplied category ids) and returns:
        (category_stats, global_stats)
    """
    if db is None:
        return {}, None

    query = db.query(Product.categoryId, Product.price)
    if category_ids:
        query = query.filter(Product.categoryId.in_(category_ids))

    rows = query.all()

    by_category: Dict[str, List[float]] = {}
    global_prices: List[float] = []

    for cat_id, price in rows:
        price = _safe_float(price, default=0.0)
        if price <= 0.0:
            continue
        global_prices.append(price)
        if cat_id:
            by_category.setdefault(str(cat_id), []).append(price)

    category_stats: Dict[str, CategoryPriceStats] = {}
    for cat_id, prices in by_category.items():
        prices.sort()
        category_stats[cat_id] = CategoryPriceStats(
            category_id=cat_id,
            sorted_prices=prices,
        )

    global_stats: Optional[CategoryPriceStats] = None
    if global_prices:
        global_prices.sort()
        global_stats = CategoryPriceStats(
            category_id="__global__",
            sorted_prices=global_prices,
        )

    return category_stats, global_stats


# ===========================================================================
# PROFILE AGGREGATION
# ===========================================================================

def _weighted_mean(
    values: Sequence[float],
    weights: Sequence[float],
) -> float:
    total = sum(weights)
    if total <= 0.0:
        return 0.0
    return sum(v * w for v, w in zip(values, weights)) / total


def _aggregate_affinities(
    observations: Sequence[PriceBehaviorObservation],
    now: datetime,
    half_life_days: float,
) -> Dict[str, Any]:
    """
    Aggregate decayed behavioural evidence into the three affinities plus
    diagnostic aggregates.
    """
    if not observations:
        return {
            "discount_affinity": 0.0,
            "premium_affinity": 0.0,
            "full_price_affinity": 0.0,
            "preferred_discount_percentage": 0.0,
            "average_discount_seen": 0.0,
            "average_discount_purchased": 0.0,
            "discount_purchase_ratio": 0.0,
            "premium_purchase_ratio": 0.0,
            "full_price_purchase_ratio": 0.0,
            "effective_count": 0.0,
            "high_intent_weight": 0.0,
            "total_weight": 0.0,
        }

    decayed: List[Tuple[float, float, float, float, str]] = []
    for obs in observations:
        w = obs.weight * _decay_factor(obs.timestamp, now, half_life_days)
        if w <= 0.0:
            continue
        decayed.append(
            (w, obs.discount_intensity, obs.premium_score, obs.full_price_score, obs.event_type)
        )

    if not decayed:
        return {
            "discount_affinity": 0.0,
            "premium_affinity": 0.0,
            "full_price_affinity": 0.0,
            "preferred_discount_percentage": 0.0,
            "average_discount_seen": 0.0,
            "average_discount_purchased": 0.0,
            "discount_purchase_ratio": 0.0,
            "premium_purchase_ratio": 0.0,
            "full_price_purchase_ratio": 0.0,
            "effective_count": 0.0,
            "high_intent_weight": 0.0,
            "total_weight": 0.0,
        }

    total_weight = sum(item[0] for item in decayed)
    high_intent_weight = sum(
        item[0] for item in decayed if item[4] in (EVENT_PURCHASE, EVENT_CART, EVENT_WISHLIST)
    )

    premium_affinity = _weighted_mean(
        [item[2] for item in decayed],
        [item[0] for item in decayed],
    )
    full_price_affinity = _weighted_mean(
        [item[3] for item in decayed],
        [item[0] for item in decayed],
    )

    # Discount affinity combines how OFTEN the user engages with discounted
    # items (share of decayed evidence) with HOW DEEP those discounts are
    # (mean intensity among discounted observations).
    discounted = [
        (w, intensity) for w, intensity, _, _, _ in decayed if intensity > 0.0
    ]
    if discounted:
        discounted_weight = sum(w for w, _ in discounted)
        share = discounted_weight / total_weight
        mean_intensity = sum(w * i for w, i in discounted) / discounted_weight
        discount_affinity = _clamp01(0.6 * share + 0.4 * mean_intensity)
    else:
        discount_affinity = 0.0

    # Preferred discount percentage: weighted mean over discounted evidence.
    preferred_discount_percentage = 0.0
    discount_evidence: List[Tuple[float, float]] = []
    for obs in observations:
        w = obs.weight * _decay_factor(obs.timestamp, now, half_life_days)
        if w <= 0.0 or obs.discount_percentage <= 0.0:
            continue
        discount_evidence.append((w, obs.discount_percentage))
    if discount_evidence:
        preferred_discount_percentage = _weighted_mean(
            [d for _, d in discount_evidence],
            [w for w, _ in discount_evidence],
        )

    average_discount_seen = _weighted_mean(
        [obs.discount_percentage for obs in observations],
        [obs.weight * _decay_factor(obs.timestamp, now, half_life_days) for obs in observations],
    )

    # Purchase-only ratios.
    purchases = [obs for obs in observations if obs.event_type == EVENT_PURCHASE]
    purchase_count = len(purchases)
    if purchase_count > 0:
        discount_purchases = sum(1 for o in purchases if o.discount_percentage >= DISCOUNT_THRESHOLD_PERCENT)
        premium_purchases = sum(1 for o in purchases if o.premium_score >= 0.5)
        full_price_purchases = sum(1 for o in purchases if o.full_price_score >= 0.5)
        average_discount_purchased = _weighted_mean(
            [o.discount_percentage for o in purchases],
            [o.weight * _decay_factor(o.timestamp, now, half_life_days) for o in purchases],
        )
    else:
        discount_purchases = 0
        premium_purchases = 0
        full_price_purchases = 0
        average_discount_purchased = 0.0

    return {
        "discount_affinity": round(_clamp01(discount_affinity), 6),
        "premium_affinity": round(_clamp01(premium_affinity), 6),
        "full_price_affinity": round(_clamp01(full_price_affinity), 6),
        "preferred_discount_percentage": round(preferred_discount_percentage, 4),
        "average_discount_seen": round(average_discount_seen, 4),
        "average_discount_purchased": round(average_discount_purchased, 4),
        "discount_purchase_ratio": round(discount_purchases / purchase_count, 6) if purchase_count else 0.0,
        "premium_purchase_ratio": round(premium_purchases / purchase_count, 6) if purchase_count else 0.0,
        "full_price_purchase_ratio": round(full_price_purchases / purchase_count, 6) if purchase_count else 0.0,
        "effective_count": total_weight,
        "high_intent_weight": high_intent_weight,
        "total_weight": total_weight,
    }


def _calculate_behavior_confidence(
    *,
    effective_count: float,
    high_intent_weight: float,
    total_weight: float,
    unique_products_count: int,
) -> float:
    """
    Continuous confidence in [0, 1] from:
      1. effective decayed observation weight (count factor)
      2. diversity of distinct products
      3. intent strength (purchase/cart/wishlist share of evidence)
    One interaction can never create a strong preference.
    """
    if effective_count <= 0.0 or unique_products_count <= 0:
        return 0.0

    count_factor = 1.0 - math.exp(-effective_count / TARGET_EFFECTIVE_COUNT)

    # Full confidence needs at least 5 distinct products; floor prevents a
    # single-product history from reaching high confidence.
    diversity_factor = min(1.0, max(0.25, unique_products_count / 5.0))

    intent_ratio = high_intent_weight / max(0.001, total_weight)
    intent_factor = 0.60 + 0.40 * intent_ratio

    return _clamp01(count_factor * diversity_factor * intent_factor)


def classify_behavior_type(
    discount_affinity: float,
    premium_affinity: float,
    full_price_affinity: float,
    confidence: float,
) -> str:
    """
    Return the dominant behaviour label; never misleads at low confidence.

    Premium evidence almost always coexists with full-price evidence (premium
    products are usually sold without discounts), so premium is preferred over
    full-price whenever the two are close.  Discount evidence is exclusive and
    always wins when it clearly dominates.
    """
    if confidence < MIN_ACTIVE_CONFIDENCE:
        return BEHAVIOR_UNKNOWN

    if (
        discount_affinity >= BEHAVIOR_TYPE_MIN_AFFINITY
        and (discount_affinity - max(premium_affinity, full_price_affinity))
        >= BEHAVIOR_TYPE_MIN_MARGIN
    ):
        return BEHAVIOR_DISCOUNT

    if (
        premium_affinity >= BEHAVIOR_TYPE_MIN_AFFINITY
        and premium_affinity >= discount_affinity
        and (full_price_affinity - premium_affinity) < BEHAVIOR_TYPE_MIN_MARGIN * 2.5
    ):
        return BEHAVIOR_PREMIUM

    if (
        full_price_affinity >= BEHAVIOR_TYPE_MIN_AFFINITY
        and (full_price_affinity - max(discount_affinity, premium_affinity))
        >= BEHAVIOR_TYPE_MIN_MARGIN
    ):
        return BEHAVIOR_FULL_PRICE

    return BEHAVIOR_MIXED


# ===========================================================================
# OBSERVATION COLLECTION
# ===========================================================================

def _collect_observations(
    db: Session,
    user_id: str,
    now: datetime,
) -> List[PriceBehaviorObservation]:
    """
    Load the user's behavioural history and attach validated price features.

    Sources (mirroring build_user_price_profile):
      1. UserBehaviour joined with Product (all event types); PURCHASE rows
         are expanded through metadata.productIds so every bought product
         counts, not only the first.
      2. ClickEvent (deduped against UserBehaviour CLICK rows).
      3. CartItem (deduped against UserBehaviour CART rows).
      4. Wishlist (deduped against UserBehaviour WISHLIST rows).
      5. OrderItem joined through Order (purchase evidence not already seen).
    """
    observations: List[PriceBehaviorObservation] = []
    seen_keys: Set[Tuple[str, str]] = set()
    unique_product_ids: Set[str] = set()

    def add_observation(
        product: Product,
        event_type: str,
        weight: float,
        timestamp: datetime,
    ) -> None:
        features = get_product_price_features(product)
        if features is None:
            return
        key = (str(product.id), event_type)
        if key in seen_keys:
            return
        seen_keys.add(key)
        unique_product_ids.add(str(product.id))
        observations.append(
            PriceBehaviorObservation(
                product_id=str(product.id),
                category_id=getattr(product, "categoryId", None),
                event_type=event_type,
                weight=weight,
                timestamp=timestamp,
                price=features.price,
                original_price=features.original_price,
                discount_percentage=features.discount_percentage,
                discount_intensity=features.discount_intensity,
                full_price_score=features.full_price_score,
                premium_score=0.0,  # filled in later once category stats exist
            )
        )

    # ------------------------------------------------------------------
    # 1. UserBehaviour (primary source with accurate timestamps)
    # ------------------------------------------------------------------
    behaviour_rows = (
        db.query(UserBehaviour, Product)
        .join(Product, UserBehaviour.productId == Product.id)
        .filter(UserBehaviour.userId == user_id)
        .all()
    )

    purchase_product_ids: Set[str] = set()
    for ub, product in behaviour_rows:
        event_type = ub.eventType or EVENT_PRODUCT_VIEW
        weight = PRICE_BEHAVIOR_EVENT_WEIGHTS.get(event_type, 0.25)
        add_observation(product, event_type, weight, _utc(ub.createdAt))
        if event_type == EVENT_PURCHASE:
            purchase_product_ids.add(str(product.id))

    # Expand PURCHASE metadata.productIds so every product in an order counts.
    purchase_rows = (
        db.query(UserBehaviour)
        .filter(
            UserBehaviour.userId == user_id,
            UserBehaviour.eventType == EVENT_PURCHASE,
        )
        .all()
    )
    expanded_product_ids: Set[str] = set()
    for purchase in purchase_rows:
        meta = purchase.eventMetadata or {}
        product_ids = meta.get("productIds") or []
        if product_ids:
            expanded_product_ids.update(str(pid) for pid in product_ids)

    if expanded_product_ids:
        expanded_products = (
            db.query(Product)
            .filter(Product.id.in_(expanded_product_ids))
            .all()
        )
        by_id = {p.id: p for p in expanded_products}
        for purchase in purchase_rows:
            meta = purchase.eventMetadata or {}
            product_ids = meta.get("productIds") or []
            for pid in product_ids:
                product = by_id.get(str(pid))
                if product is None:
                    continue
                add_observation(
                    product,
                    EVENT_PURCHASE,
                    PRICE_BEHAVIOR_EVENT_WEIGHTS[EVENT_PURCHASE],
                    _utc(purchase.createdAt),
                )
                purchase_product_ids.add(str(pid))

    # ------------------------------------------------------------------
    # 2. ClickEvent (supplementary clicks)
    # ------------------------------------------------------------------
    click_rows = (
        db.query(ClickEvent, Product)
        .join(Product, ClickEvent.productId == Product.id)
        .filter(ClickEvent.userId == user_id)
        .all()
    )
    for clk, product in click_rows:
        add_observation(
            product,
            EVENT_CLICK,
            PRICE_BEHAVIOR_EVENT_WEIGHTS[EVENT_CLICK],
            _utc(clk.createdAt),
        )

    # ------------------------------------------------------------------
    # 3. CartItem
    # ------------------------------------------------------------------
    cart_rows = (
        db.query(CartItem, Product)
        .join(Product, CartItem.productId == Product.id)
        .filter(CartItem.userId == user_id)
        .all()
    )
    for cart, product in cart_rows:
        add_observation(
            product,
            EVENT_CART,
            PRICE_BEHAVIOR_EVENT_WEIGHTS[EVENT_CART],
            _utc(cart.createdAt),
        )

    # ------------------------------------------------------------------
    # 4. Wishlist
    # ------------------------------------------------------------------
    wishlist_rows = (
        db.query(Wishlist, Product)
        .join(Product, Wishlist.productId == Product.id)
        .filter(Wishlist.userId == user_id)
        .all()
    )
    for wl, product in wishlist_rows:
        add_observation(
            product,
            EVENT_WISHLIST,
            PRICE_BEHAVIOR_EVENT_WEIGHTS[EVENT_WISHLIST],
            _utc(wl.createdAt),
        )

    # ------------------------------------------------------------------
    # 5. OrderItem (purchases not already captured via UserBehaviour)
    # ------------------------------------------------------------------
    order_rows = (
        db.query(OrderItem, Order, Product)
        .join(Order, Order.id == OrderItem.orderId)
        .join(Product, OrderItem.productId == Product.id)
        .filter(Order.userId == user_id)
        .all()
    )
    for order_item, order, product in order_rows:
        if str(product.id) in purchase_product_ids:
            continue
        add_observation(
            product,
            EVENT_PURCHASE,
            PRICE_BEHAVIOR_EVENT_WEIGHTS[EVENT_PURCHASE],
            _utc(getattr(order, "createdAt", None)) if getattr(order, "createdAt", None) else now,
        )

    return observations


# ===========================================================================
# PROFILE BUILDER
# ===========================================================================

def build_user_price_behavior_profile(
    db: Optional[Session],
    user_id: str,
    *,
    now: Optional[datetime] = None,
    half_life_days: float = PRICE_BEHAVIOR_HALFLIFE_DAYS,
    category_stats: Optional[Mapping[str, CategoryPriceStats]] = None,
    global_stats: Optional[CategoryPriceStats] = None,
) -> UserPriceBehaviorProfile:
    """
    Build the user's price-behaviour profile once per request.

    Loads observations, computes category-relative premium scores, aggregates
    the three affinities, and derives per-category profiles when sufficient
    data exists.
    """
    now = now or datetime.now(timezone.utc)

    def empty_profile() -> UserPriceBehaviorProfile:
        return UserPriceBehaviorProfile(
            user_id=user_id,
            discount_affinity=0.0,
            premium_affinity=0.0,
            full_price_affinity=0.0,
            price_sensitivity=0.0,
            preferred_discount_percentage=0.0,
            average_discount_seen=0.0,
            average_discount_purchased=0.0,
            discount_purchase_ratio=0.0,
            premium_purchase_ratio=0.0,
            full_price_purchase_ratio=0.0,
            confidence=0.0,
            interaction_count=0,
            unique_products_count=0,
            behavior_type=BEHAVIOR_UNKNOWN,
            last_updated=now,
        )

    if db is None or not user_id:
        return empty_profile()

    try:
        observations = _collect_observations(db, user_id, now)
    except Exception as exc:  # never crash recommendation generation
        logger.warning("Error collecting price behaviour observations for user %s: %s", user_id, exc)
        return empty_profile()

    if not observations:
        return empty_profile()

    # Build category stats for the observed categories when not supplied.
    local_category_stats: Dict[str, CategoryPriceStats] = {}
    local_global_stats: Optional[CategoryPriceStats] = None
    if category_stats is None or global_stats is None:
        observed_cats = {obs.category_id for obs in observations if obs.category_id}
        local_category_stats, local_global_stats = build_category_price_stats(
            db,
            category_ids=list(observed_cats) if observed_cats else None,
        )

    effective_category_stats = category_stats or local_category_stats
    effective_global_stats = global_stats or local_global_stats

    # Fill premium scores now that category distributions are known.
    for obs in observations:
        obs.premium_score = compute_premium_score(
            obs.price,
            obs.category_id,
            effective_category_stats,
            effective_global_stats,
        )

    unique_product_ids = {obs.product_id for obs in observations if obs.product_id}
    sample_counts: Dict[str, int] = {}
    for obs in observations:
        sample_counts[obs.event_type] = sample_counts.get(obs.event_type, 0) + 1

    agg = _aggregate_affinities(observations, now, half_life_days)
    confidence = _calculate_behavior_confidence(
        effective_count=agg["effective_count"],
        high_intent_weight=agg["high_intent_weight"],
        total_weight=agg["total_weight"],
        unique_products_count=len(unique_product_ids),
    )
    behavior_type = classify_behavior_type(
        agg["discount_affinity"],
        agg["premium_affinity"],
        agg["full_price_affinity"],
        confidence,
    )
    price_sensitivity = _clamp01(agg["discount_affinity"] - 0.5 * agg["premium_affinity"])

    # ------------------------------------------------------------------
    # Category-specific profiles (only when enough evidence exists)
    # ------------------------------------------------------------------
    category_profiles: Dict[str, CategoryPriceBehaviorProfile] = {}
    by_category: Dict[str, List[PriceBehaviorObservation]] = {}
    for obs in observations:
        if obs.category_id:
            by_category.setdefault(obs.category_id, []).append(obs)

    for cat_id, cat_obs in by_category.items():
        if len(cat_obs) < MIN_CATEGORY_INTERACTIONS:
            continue
        cat_unique = {o.product_id for o in cat_obs if o.product_id}
        cat_agg = _aggregate_affinities(cat_obs, now, half_life_days)
        cat_confidence = _calculate_behavior_confidence(
            effective_count=cat_agg["effective_count"],
            high_intent_weight=cat_agg["high_intent_weight"],
            total_weight=cat_agg["total_weight"],
            unique_products_count=len(cat_unique),
        )
        if cat_confidence < MIN_CATEGORY_CONFIDENCE:
            continue
        cat_type = classify_behavior_type(
            cat_agg["discount_affinity"],
            cat_agg["premium_affinity"],
            cat_agg["full_price_affinity"],
            cat_confidence,
        )
        category_profiles[cat_id] = CategoryPriceBehaviorProfile(
            category_id=cat_id,
            discount_affinity=cat_agg["discount_affinity"],
            premium_affinity=cat_agg["premium_affinity"],
            full_price_affinity=cat_agg["full_price_affinity"],
            preferred_discount_percentage=cat_agg["preferred_discount_percentage"],
            confidence=round(cat_confidence, 4),
            interaction_count=len(cat_obs),
            behavior_type=cat_type,
        )

    return UserPriceBehaviorProfile(
        user_id=user_id,
        discount_affinity=agg["discount_affinity"],
        premium_affinity=agg["premium_affinity"],
        full_price_affinity=agg["full_price_affinity"],
        price_sensitivity=round(price_sensitivity, 6),
        preferred_discount_percentage=agg["preferred_discount_percentage"],
        average_discount_seen=agg["average_discount_seen"],
        average_discount_purchased=agg["average_discount_purchased"],
        discount_purchase_ratio=agg["discount_purchase_ratio"],
        premium_purchase_ratio=agg["premium_purchase_ratio"],
        full_price_purchase_ratio=agg["full_price_purchase_ratio"],
        confidence=round(confidence, 4),
        interaction_count=len(observations),
        unique_products_count=len(unique_product_ids),
        behavior_type=behavior_type,
        last_updated=now,
        sample_count=sample_counts,
        categories=category_profiles,
    )


# ===========================================================================
# CANDIDATE PRICE BEHAVIOUR SCORING & EXPLANATION
# ===========================================================================

def compute_candidate_price_behavior_score(
    product: Product,
    profile: Optional[UserPriceBehaviorProfile],
    *,
    category_stats: Optional[Mapping[str, CategoryPriceStats]] = None,
    global_stats: Optional[CategoryPriceStats] = None,
) -> CandidatePriceBehaviorScore:
    """
    Continuous 0..1 match between the candidate's price characteristics and
    the user's learned behaviour.

    The returned ``price_behavior_score`` is the *effective* score used by the
    engine: it is the raw behavioural match pulled toward the neutral 0.50 by
    ``price_behavior_confidence``.  At zero confidence it is exactly 0.50
    (same convention as the existing price_affinity feature), so a
    low-confidence profile can never dominate ranking.  The raw match,
    confidence, and per-component contributions are returned separately for
    logging and debugging.
    """
    features = get_product_price_features(product)

    if features is None:
        return CandidatePriceBehaviorScore(
            price_behavior_score=0.50,
            price_behavior_raw_score=0.50,
            price_behavior_confidence=0.0,
            price_behavior_type=BEHAVIOR_UNKNOWN,
            candidate_discount_percentage=0.0,
            candidate_original_price=0.0,
            candidate_premium_score=0.0,
            candidate_full_price_score=0.0,
            discount_contribution=0.0,
            premium_contribution=0.0,
            full_price_contribution=0.0,
            used_category_profile=False,
            explanation="Price information unavailable.",
        )

    if profile is None or not profile.has_preference:
        return CandidatePriceBehaviorScore(
            price_behavior_score=0.50,
            price_behavior_raw_score=0.50,
            price_behavior_confidence=profile.confidence if profile else 0.0,
            price_behavior_type=BEHAVIOR_UNKNOWN,
            candidate_discount_percentage=features.discount_percentage,
            candidate_original_price=features.original_price,
            candidate_premium_score=0.0,
            candidate_full_price_score=features.full_price_score,
            discount_contribution=0.0,
            premium_contribution=0.0,
            full_price_contribution=0.0,
            used_category_profile=False,
            explanation="Popular choice",
        )

    # ------------------------------------------------------------------
    # Category fallback: use the category profile when it is confident
    # enough, otherwise the global profile.
    # ------------------------------------------------------------------
    cat_id = getattr(product, "categoryId", None)
    cat_profile = None
    if cat_id and cat_id in profile.categories:
        candidate_cat = profile.categories[cat_id]
        if candidate_cat.confidence >= MIN_CATEGORY_CONFIDENCE:
            cat_profile = candidate_cat

    if cat_profile is not None:
        discount_affinity = cat_profile.discount_affinity
        premium_affinity = cat_profile.premium_affinity
        full_price_affinity = cat_profile.full_price_affinity
        confidence = cat_profile.confidence
        behavior_type = cat_profile.behavior_type
        used_category = True
    else:
        discount_affinity = profile.discount_affinity
        premium_affinity = profile.premium_affinity
        full_price_affinity = profile.full_price_affinity
        confidence = profile.confidence
        behavior_type = profile.behavior_type
        used_category = False

    premium_score = compute_premium_score(
        features.price,
        cat_id,
        category_stats,
        global_stats,
    )

    discount_component = _clamp01(discount_affinity * features.discount_intensity)
    premium_component = _clamp01(premium_affinity * premium_score)
    full_price_component = _clamp01(full_price_affinity * features.full_price_score)

    raw_score = _clamp01(
        discount_component + premium_component + full_price_component
    )

    # Progressive personalization: pull the raw match toward neutral 0.50 by
    # (1 - confidence).  Low confidence => minimal influence.
    effective_score = _clamp01(0.5 + (raw_score - 0.5) * confidence)

    explanation = build_price_behavior_explanation(
        behavior_type=behavior_type,
        confidence=confidence,
        raw_score=raw_score,
        discount_component=discount_component,
        premium_component=premium_component,
        full_price_component=full_price_component,
    )

    return CandidatePriceBehaviorScore(
        price_behavior_score=round(effective_score, 6),
        price_behavior_raw_score=round(raw_score, 6),
        price_behavior_confidence=round(confidence, 4),
        price_behavior_type=behavior_type,
        candidate_discount_percentage=round(features.discount_percentage, 4),
        candidate_original_price=round(features.original_price, 4),
        candidate_premium_score=round(premium_score, 6),
        candidate_full_price_score=round(features.full_price_score, 6),
        discount_contribution=round(discount_component, 6),
        premium_contribution=round(premium_component, 6),
        full_price_contribution=round(full_price_component, 6),
        used_category_profile=used_category,
        explanation=explanation,
    )


def build_price_behavior_explanation(
    *,
    behavior_type: str,
    confidence: float,
    raw_score: float,
    discount_component: float,
    premium_component: float,
    full_price_component: float,
) -> str:
    """
    Truthful explanation.  Never claims a learned preference when confidence
    is insufficient; for low-confidence users it falls back to generic
    popularity phrasing.
    """
    if confidence < 0.25:
        return "Popular choice"

    if behavior_type == BEHAVIOR_DISCOUNT and discount_component >= 0.25:
        return "Recommended because you often shop discounted products."
    if behavior_type == BEHAVIOR_PREMIUM and premium_component >= 0.25:
        return "Recommended because you frequently explore premium products."
    if behavior_type == BEHAVIOR_FULL_PRICE and full_price_component >= 0.25:
        return "Matches your usual full-price shopping behaviour."

    if raw_score >= 0.70:
        return "A good match for your usual shopping behaviour."
    if raw_score >= 0.55:
        return "Popular handcrafted item to explore."

    return "Popular choice"