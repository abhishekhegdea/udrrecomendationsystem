"""
recommendation_engine.py — Unified Recommendation Pipeline for UdrCrafts

Combines **Content-Based**, **Collaborative**, **Trending**, **Seasonal**,
**Location**, and **Business Rules** into a single pipeline that produces
top-N personalised recommendations.

Pipeline stages
───────────────

   1. **Candidate Generation** — Gather candidate products from multiple
      orthogonal sources (content similarity, collaborative filtering,
      trending, new arrivals, category affinity, random discovery).

   2. **Feature Computation** — Compute individual sub-scores for each
      candidate (semantic similarity, collab score, trend, seasonal,
      location, rating, seller freshness).

   3. **Scoring & Blending** — Weighted linear combination of all sub-
      scores, normalised to [0, 1].

   4. **Business Rules** — Apply seller fairness, diversity caps, rating
      thresholds, inventory checks, and exclusions.

   5. **Ranking & Selection** — Final sort, top-N truncation, and
      explanation attachment.

Usage
─────

    from app.ml.recommendation_engine import RecommendationEngine

    engine = RecommendationEngine(db)
    results = engine.recommend(
        user_id="uuid-...",
        limit=20,
    )

    for r in results:
        print(r.product.name, r.final_score, r.explanation)
"""

from __future__ import annotations

import logging
import math
import random
import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Callable, Dict, List, Optional, Set, Tuple

from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.core.fairness_config import get_config
from app.ml.collaborative import collaborative_model
from app.ml.content_based import get_similar_products
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
from app.ml.seller_boost import fair_rank, CANCEL_PENALTY_WEIGHT
from app.models import Product, ProductView, UserBehaviour, Seller

logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════════════════════════
# Constants
# ═══════════════════════════════════════════════════════════════════════════

# ── Default blending weights (can be overridden per call) ─────────────────
# These sum to 1.0 and control the relative importance of each signal.
DEFAULT_WEIGHTS: Dict[str, float] = {
    "content": 0.15,       # Semantic similarity to products user liked
    "collaborative": 0.12, # Matrix-factorisation (item-item similarity)
    "trending": 0.12,      # Popularity score with time decay
    "seasonal": 0.08,      # Current-season / event boost
    "location": 0.04,      # Seller geography matches user geography
    "category_affinity": 0.08,  # User's preferred categories
    "brand_affinity": 0.07,     # User's preferred brands
    "rating": 0.07,        # Average product rating
    "seller_freshness": 0.07,   # Boost for new / high-quality sellers
    "engagement": 0.20,    # Cart adds, wishlist adds, clicks, views, searches
}

# ── Candidate pool sizes per source ──────────────────────────────────────
# Having separate limits per source ensures diversity even if one source
# dominates the scoring.
DEFAULT_CANDIDATE_LIMITS: Dict[str, int] = {
    "content_based": 40,
    "collaborative": 40,
    "trending": 30,
    "new_arrivals": 20,
    "category_affinity": 30,
    "search_affinity": 15,
    "random_discovery": 10,
}

# ── Business rule thresholds ─────────────────────────────────────────────
DEFAULT_MIN_RATING = 0.0       # No minimum by default
DEFAULT_MIN_INVENTORY = 0      # Allow out-of-stock to show (can be 1 to filter)
DEFAULT_MAX_PER_CATEGORY = 0.30  # At most 30 % of final list from one category
DEFAULT_RECENT_VIEW_WINDOW_HOURS = 48  # Don't re-recommend products viewed in last 48 h

# ── Engagement signal weights ─────────────────────────────────────────────
# Per-product behaviour events that feed the ``engagement`` blending
# signal.  Stronger intent → higher weight; negative weights are
# deliberate demotions (RETURN).  Recency decay means old events fade
# out over ``ENGAGEMENT_DECAY_HALFLIFE_DAYS``.
ENGAGEMENT_EVENT_WEIGHTS: Dict[str, float] = {
    EVENT_PURCHASE: 1.0,      # Completed order — strongest intent
    EVENT_CART: 0.8,          # Added to cart
    EVENT_WISHLIST: 0.6,      # Added to wishlist
    EVENT_CLICK: 0.4,         # Clicked a product card / button
    EVENT_REVIEW: 0.5,        # Wrote a review
    EVENT_RATING: 0.5,        # Assigned a star rating
    EVENT_PRODUCT_VIEW: 0.2,  # Viewed the product
    EVENT_RETURN: -0.8,       # Returned the product (personalised demotion)
}

# Events whose "remove" action flips the sign (a negative signal).
ENGAGEMENT_NEGATIVE_ACTIONS: Dict[str, float] = {
    EVENT_CART: -0.6,
    EVENT_WISHLIST: -0.4,
}

#: Half-life (days) of the exponential recency decay applied to events.
ENGAGEMENT_DECAY_HALFLIFE_DAYS = 14.0

#: Maximum contribution of search-term affinity to the engagement score.
SEARCH_AFFINITY_MAX = 0.4

#: Words too generic to create meaningful search affinity.
SEARCH_STOPWORDS: Set[str] = {
    "the", "and", "for", "with", "from", "that", "this", "what",
    "where", "when", "how", "you", "your", "are", "was", "not",
    "new", "best", "buy", "shop", "online", "india", "price",
    "under", "gift", "gifts",
}

# ── Seasonal boost definitions (month → keywords) ───────────────────────
SEASONAL_MAP: Dict[int, Dict[str, float]] = {
    # Jan / Feb — Winter, New Year
    1:  {"winter": 0.20, "new year": 0.15, "cozy": 0.15},
    2:  {"winter": 0.15, "valentine": 0.25, "love": 0.15},
    # Mar / Apr — Spring
    3:  {"spring": 0.20, "easter": 0.15},
    4:  {"spring": 0.15, "earth": 0.10},
    # May / Jun — Wedding, Summer
    5:  {"summer": 0.10, "wedding": 0.15, "gift": 0.10},
    6:  {"summer": 0.15, "wedding": 0.10, "pride": 0.10},
    # Jul / Aug — Monsoon, Travel
    7:  {"summer": 0.10, "vacation": 0.10, "travel": 0.10},
    8:  {"monsoon": 0.15, "rain": 0.10},
    # Sep / Oct — Diwali, Autumn, Halloween
    9:  {"autumn": 0.10, "fall": 0.10},
    10: {"diwali": 0.30, "autumn": 0.10, "halloween": 0.15},
    # Nov / Dec — Holidays, Christmas, Gift
    11: {"diwali": 0.20, "christmas": 0.10, "gift": 0.15},
    12: {"christmas": 0.30, "new year": 0.15, "winter": 0.10, "gift": 0.20},
}


# ═══════════════════════════════════════════════════════════════════════════
# Data classes
# ═══════════════════════════════════════════════════════════════════════════

@dataclass
class ScoredProduct:
    """
    A product with its computed sub-scores and final recommendation score.

    Attributes
    ----------
    product : Product
        The SQLAlchemy ORM product instance.
    final_score : float
        Blended score in [0, 1] after all stages.
    content_score : float
        Semantic similarity score from content-based pipeline.
    collab_score : float
        Collaborative filtering prediction score.
    trend_score : float
        Trending popularity score with time decay.
    seasonal_boost : float
        Additive seasonal/event boost.
    location_boost : float
        Geographic affinity boost.
    category_boost : float
        Category-affinity boost.
    brand_boost : float
        Brand-affinity boost.
    rating_score : float
        Normalised average rating score.
    seller_boost : float
        New-seller or high-quality seller boost.
    engagement_score : float
        Behavioural engagement score (cart adds, wishlist adds, clicks,
        views, searches) with recency decay.
    explanation : str
        Human-readable reason for the recommendation.
    source : str
        Which candidate source generated this item
        (e.g. ``\"content_based\"``, ``\"trending\"``).
    """
    product: Product
    final_score: float = 0.0
    content_score: float = 0.0
    collab_score: float = 0.0
    trend_score: float = 0.0
    seasonal_boost: float = 0.0
    location_boost: float = 0.0
    category_boost: float = 0.0
    brand_boost: float = 0.0
    rating_score: float = 0.0
    seller_boost: float = 0.0
    engagement_score: float = 0.0
    explanation: str = "Recommended for you."
    source: str = "unknown"


@dataclass
class EngineConfig:
    """
    Configuration for a single ``recommend()`` call.

    Immutable value object that bundles all tuning knobs.
    """
    #: Blending weights (name → weight, must sum to 1.0 within tolerance)
    weights: Dict[str, float] = field(default_factory=lambda: dict(DEFAULT_WEIGHTS))
    #: Candidate limits per source
    candidate_limits: Dict[str, int] = field(
        default_factory=lambda: dict(DEFAULT_CANDIDATE_LIMITS)
    )
    #: Minimum average rating (0.0–5.0)
    min_rating: float = DEFAULT_MIN_RATING
    #: Minimum inventory count
    min_inventory: int = DEFAULT_MIN_INVENTORY
    #: Max fraction of final list from any single category
    max_per_category: float = DEFAULT_MAX_PER_CATEGORY
    #: Don't re-recommend products viewed within this many hours
    recent_view_window_hours: int = DEFAULT_RECENT_VIEW_WINDOW_HOURS
    #: Total recommendation slots
    total_slots: int = 20
    #: Whether to include random-discovery candidates
    include_random: bool = True
    #: User's location string (legacy)
    user_location: Optional[str] = None
    #: User's City ID
    user_city_id: Optional[str] = None
    #: User's State ID
    user_state_id: Optional[str] = None


# ═══════════════════════════════════════════════════════════════════════════
# Stage 1 — Candidate Generation
# ═══════════════════════════════════════════════════════════════════════════

def _collect_search_terms(db: Session, user_id: str, limit: int = 20) -> Set[str]:
    """
    Return the normalised set of terms from the user's recent searches.

    ``SEARCH`` events carry no ``productId``, so search affinity must be
    applied by matching query terms against candidate products.  This
    helper is shared by candidate generation and feature computation so
    both stages see identical term sets.
    """
    searches = (
        db.query(UserBehaviour)
        .filter(
            UserBehaviour.userId == user_id,
            UserBehaviour.eventType == EVENT_SEARCH,
        )
        .order_by(UserBehaviour.createdAt.desc())
        .limit(limit)
        .all()
    )

    terms: Set[str] = set()
    for s in searches:
        query = (s.eventMetadata or {}).get("query", "")
        if not query:
            continue
        for token in re.split(r"[\s,;&|]+", query.lower()):
            token = token.strip()
            if len(token) >= 3 and token not in SEARCH_STOPWORDS:
                terms.add(token)
    return terms


class CandidateGenerator:
    """
    Stage 1 of the pipeline: gather candidate products from multiple
    orthogonal sources.

    Each source returns a generator yielding ``(product, source_name)``
    tuples so data never has to be materialised in memory all at once.
    Duplicates are tracked via a set of product IDs and silently skipped.
    """

    def __init__(self, db: Session, config: EngineConfig):
        self.db = db
        self.config = config

    def generate(
        self,
        user_id: str,
    ) -> List[Tuple[Product, str]]:
        """
        Run all candidate sources and return a deduplicated list of
        ``(product, source_name)`` pairs.

        Sources are queried in order of importance; once we have enough
        candidates (>= 2× the requested slots) we can skip the more
        expensive/less-reliable sources.
        """
        seen: Set[str] = set()
        candidates: List[Tuple[Product, str]] = []
        limits = self.config.candidate_limits
        # Target: gather at least 2× total_slots for good blending diversity
        target_count = self.config.total_slots * 2

        # ── 1a. Content-based (semantic similarity to user's recent interactions) ─
        recent_products = self._get_recent_interacted_products(user_id, limit=5)
        for viewed_product in recent_products:
            similar = get_similar_products(
                viewed_product.id, self.db, limit=limits["content_based"] // 2
            )
            for p in similar:
                if p.id not in seen:
                    seen.add(p.id)
                    candidates.append((p, "content_based"))

        if len(candidates) >= target_count:
            return candidates

        # ── 1b. Collaborative filtering (item-item similarity) ─────────────
        if collaborative_model.is_trained:
            # For each product the user has interacted with, find similar items
            user_items = collaborative_model.user_history.get(user_id, {})
            if user_items:
                # Limit to top 3 interacted products to avoid explosion
                top_items = sorted(
                    user_items.items(), key=lambda x: x[1], reverse=True
                )[:3]
                for interacted_id, _ in top_items:
                    similar_from_collab = get_similar_products(
                        interacted_id, self.db, limit=limits["collaborative"] // 3
                    )
                    for p in similar_from_collab:
                        if p.id not in seen:
                            seen.add(p.id)
                            candidates.append((p, "collaborative"))

        if len(candidates) >= target_count:
            return candidates

        # ── 1c. Trending (popularity-based) ────────────────────────────────
        trending = (
            self.db.query(Product)
            .options(joinedload(Product.images))
            .order_by(Product.popularity.desc())
            .limit(limits["trending"])
            .all()
        )
        for p in trending:
            if p.id not in seen:
                seen.add(p.id)
                candidates.append((p, "trending"))

        if len(candidates) >= target_count:
            return candidates

        # ── 1d. New arrivals (new sellers) ─────────────────────────────────
        new_arrivals = (
            self.db.query(Product)
            .options(joinedload(Product.images))
            .join(Seller)
            .filter(Seller.isNewSeller == True)
            .order_by(Product.popularity.desc())
            .limit(limits["new_arrivals"])
            .all()
        )
        for p in new_arrivals:
            if p.id not in seen:
                seen.add(p.id)
                candidates.append((p, "new_arrivals"))

        if len(candidates) >= target_count:
            return candidates

        # ── 1e. Category affinity ──────────────────────────────────────────
        preferred_cats = self._get_preferred_categories(user_id)
        if preferred_cats:
            cat_products = (
                self.db.query(Product)
                .options(joinedload(Product.images))
                .filter(Product.categoryId.in_(preferred_cats))
                .order_by(Product.popularity.desc())
                .limit(limits["category_affinity"])
                .all()
            )
            for p in cat_products:
                if p.id not in seen:
                    seen.add(p.id)
                    candidates.append((p, "category_affinity"))

        if len(candidates) >= target_count:
            return candidates

        # ── 1e.5. Search affinity (products matching recent queries) ───────
        search_products = self._get_search_affinity_products(
            user_id, limit=limits["search_affinity"]
        )
        for p in search_products:
            if p.id not in seen:
                seen.add(p.id)
                candidates.append((p, "search_affinity"))

        if len(candidates) >= target_count:
            return candidates

        # ── 1f. Random discovery (serendipity) ─────────────────────────────
        if self.config.include_random and limits["random_discovery"] > 0:
            random_pool = (
                self.db.query(Product)
                .options(joinedload(Product.images))
                .order_by(Product.id)  # deterministic shake
                .limit(limits["random_discovery"] * 5)
                .all()
            )
            random.shuffle(random_pool)
            for p in random_pool:
                if p.id not in seen:
                    seen.add(p.id)
                    candidates.append((p, "random_discovery"))
                    if len(candidates) >= target_count:
                        break

        logger.info(
            "Candidate generation: %d unique candidates from %d sources for user %s.",
            len(candidates),
            len({s for _, s in candidates}),
            user_id,
        )
        return candidates

    # ── Helpers ──────────────────────────────────────────────────────────

    def _get_recent_interacted_products(self, user_id: str, limit: int = 5) -> List[Product]:
        """Fetch products the user has recently interacted with (views, cart, clicks, etc.) for content seed."""
        recent_interactions = (
            self.db.query(UserBehaviour)
            .filter(
                UserBehaviour.userId == user_id,
                UserBehaviour.productId.isnot(None),
                UserBehaviour.eventType.in_([
                    EVENT_PRODUCT_VIEW,
                    EVENT_CART,
                    EVENT_PURCHASE,
                    EVENT_WISHLIST,
                    EVENT_CLICK,
                ])
            )
            .order_by(UserBehaviour.createdAt.desc())
            .limit(limit * 3) # fetch more in case of duplicates
            .all()
        )
        if not recent_interactions:
            return []

        # Deduplicate while preserving recency order
        viewed_ids = []
        seen_ids = set()
        for v in recent_interactions:
            if v.productId and v.productId not in seen_ids:
                seen_ids.add(v.productId)
                viewed_ids.append(v.productId)
                if len(viewed_ids) >= limit:
                    break

        if not viewed_ids:
            return []

        products = (
            self.db.query(Product)
            .filter(Product.id.in_(viewed_ids))
            .all()
        )
        # Preserve order: most-recently-interacted first
        id_map = {p.id: p for p in products}
        return [id_map[vid] for vid in viewed_ids if vid in id_map]

    def _get_preferred_categories(self, user_id: str) -> List[str]:
        """Infer user's preferred categories from their interaction history."""
        recent_events = (
            self.db.query(UserBehaviour)
            .filter(
                UserBehaviour.userId == user_id,
                UserBehaviour.categoryId.isnot(None),
            )
            .order_by(UserBehaviour.createdAt.desc())
            .limit(50)
            .all()
        )

        # Count category occurrences
        cat_counts: Dict[str, int] = {}
        for e in recent_events:
            if e.categoryId:
                cat_counts[e.categoryId] = cat_counts.get(e.categoryId, 0) + 1

        if not cat_counts:
            return []

        # Return categories sorted by frequency, top 3
        sorted_cats = sorted(cat_counts.keys(), key=lambda c: cat_counts[c], reverse=True)
        return sorted_cats[:3]

    def _get_search_affinity_products(
        self, user_id: str, limit: int = 15
    ) -> List[Product]:
        """
        Fetch popular products whose name or tags match the user's recent
        search terms.

        This turns the user's **search rate** into an actual candidate
        source: when they search "handwoven wool shawl" repeatedly, wool
        shawls start surfacing in their recommendations even if they
        never clicked one yet.
        """
        terms = _collect_search_terms(self.db, user_id)
        if not terms:
            return []

        conditions: List[object] = []
        for t in terms:
            conditions.append(Product.name.ilike(f"%{t}%"))
            conditions.append(Product.tags.any(t))

        return (
            self.db.query(Product)
            .options(joinedload(Product.images))
            .filter(or_(*conditions))
            .order_by(Product.popularity.desc())
            .limit(limit)
            .all()
        )


# ═══════════════════════════════════════════════════════════════════════════
# Stage 2 — Feature Computation
# ═══════════════════════════════════════════════════════════════════════════

class FeatureComputer:
    """
    Stage 2 of the pipeline: for each candidate product, compute every
    sub-score that contributes to the final ranking.
    """

    def __init__(self, db: Session, config: EngineConfig):
        self.db = db
        self.config = config

    def compute(
        self,
        candidates: List[Tuple[Product, str]],
        user_id: str,
        recent_views: Optional[List[ProductView]] = None,
    ) -> List[ScoredProduct]:
        """
        Take a list of ``(product, source)`` pairs and return a list of
        :class:`ScoredProduct` with every sub-score populated.
        """
        if not candidates:
            return []

        # Pre-fetch user's recent views for content seed
        if recent_views is None:
            recent_views = self._load_recent_views(user_id)

        # Pre-compute a content baseline: pick the most-recent view for scoring
        content_seed_product = None
        if recent_views:
            viewed_ids = [v.productId for v in recent_views if v.productId]
            if viewed_ids:
                seed = (
                    self.db.query(Product)
                    .filter(Product.id == viewed_ids[0])
                    .first()
                )
                if seed and seed.embedding is not None:
                    content_seed_product = seed

        # Pre-compute category / brand preferences
        recent_views = self._load_recent_views(user_id)
        user_cat_ids = self._get_user_category_ids(user_id)
        user_brands = self._get_user_brand_names(user_id)
        returned_brands = self._get_user_quality_returned_brands(user_id)

        # Pre-compute engagement signals (cart / wishlist / click / search)
        user_engagement = self._get_user_engagement(user_id)
        search_terms = _collect_search_terms(self.db, user_id)

        # Current month for seasonal scoring
        current_month = datetime.utcnow().month

        results: List[ScoredProduct] = []
        for product, source in candidates:
            sp = ScoredProduct(product=product, source=source)

            # ── 2a. Content score (source-based, avoids N+1 queries) ────
            sp.content_score = self._compute_content_score(
                product, content_seed_product, source=source
            )

            # ── 2b. Collaborative score ────────────────────────────────
            sp.collab_score = collaborative_model.get_collaborative_score(
                user_id, product.id
            )

            # ── 2c. Trend score ─────────────────────────────────────────
            sp.trend_score = self._compute_trend_score(product)

            # ── 2d. Seasonal boost ─────────────────────────────────────
            sp.seasonal_boost = self._compute_seasonal_boost(
                product, current_month
            )

            # ── 2e. Location boost ─────────────────────────────────────
            if self.config.user_location:
                sp.location_boost = self._compute_location_boost(product)

            # ── 2f. Category affinity boost ────────────────────────────
            if product.categoryId in user_cat_ids:
                sp.category_boost = 0.20

            # ── 2g. Brand affinity boost / quality-return penalty ─────
            sp.brand_boost = self._compute_brand_boost(
                product, user_brands, returned_brands
            )

            # ── 2h. Rating score ───────────────────────────────────────
            sp.rating_score = self._compute_rating_score(product)

            # ── 2i. Seller freshness boost ─────────────────────────────
            sp.seller_boost = self._compute_seller_boost(product)

            # ── 2j. Engagement score (cart / wishlist / click / search) ─
            sp.engagement_score = self._compute_engagement_score(
                product, user_engagement, search_terms
            )

            results.append(sp)

        return results

    # ── Sub-score implementations ───────────────────────────────────────

    # ── Source-based content scores (avoids N+1 queries) ────────────────
    # Content-based candidates were already selected by
    # ``get_similar_products()`` using pgvector cosine similarity, so they
    # are inherently highly similar to the user's most-recently-viewed
    # product.  The source label tells us the expected similarity tier.
    _SOURCE_CONTENT_SCORES: Dict[str, float] = {
        "content_based": 0.80,
        "collaborative": 0.65,
        "trending": 0.50,
        "new_arrivals": 0.50,
        "category_affinity": 0.55,
        "search_affinity": 0.55,
        "random_discovery": 0.30,
    }

    def _compute_content_score(
        self, product: Product, seed: Optional[Product], source: str = "unknown"
    ) -> float:
        """
        Semantic similarity score using the product's candidate source.

        Uses source-based assignment to **avoid N+1 SQL queries** — the
        source label already encodes the expected similarity tier since
        ``get_similar_products()`` used pgvector to select these products.

        Falls back to 0.50 (neutral) when there is no seed, no embedding,
        or an unknown source.
        """
        if seed is None or seed.embedding is None or product.embedding is None:
            return 0.50
        return self._SOURCE_CONTENT_SCORES.get(source, 0.50)

    def _compute_trend_score(self, product: Product) -> float:
        """
        Normalised trending popularity with simulated time decay.

        Uses ``product.popularity`` which we assume has been decayed by
        the background Celery task.  Clamps to [0, 1].
        """
        popularity = getattr(product, "popularity", 0.0) or 0.0
        # Sigmoid-like scaling: popular → 1, unpopular → near 0
        return 1.0 - math.exp(-popularity * 2.0)

    def _compute_seasonal_boost(self, product: Product, month: int) -> float:
        """
        Compute an additive boost based on the current month and the
        product's tags, materials, and craft type.

        Algorithm
        ─────────
        1. Look up ``SEASONAL_MAP[month]`` to get a dict of keyword → weight.
        2. Build a lower-cased set of the product's tags, materials, and
           craft type.
        3. Sum the weights of all matching keywords.

        Returns a float in [0.0, ~0.5) — never more than 0.5 even if all
        keywords match.
        """
        season_keywords = SEASONAL_MAP.get(month, {})
        if not season_keywords:
            return 0.0

        # Build product vocabulary
        product_terms: Set[str] = set()
        for tag in (product.tags or []):
            product_terms.add(tag.lower().strip())
        for mat in (product.materials or []):
            product_terms.add(mat.lower().strip())
        if product.craftType:
            product_terms.add(product.craftType.lower().strip())
        if product.name:
            for word in product.name.lower().split():
                product_terms.add(word.strip())

        # Sum matching keyword weights
        boost = 0.0
        for keyword, weight in season_keywords.items():
            if keyword in product_terms:
                boost += weight

        return min(boost, 0.50)  # cap at 0.5

    def _compute_location_boost(self, product: Product) -> float:
        """
        Boost products whose seller is located near the user.

        Currently a placeholder that returns 0.0.  In a production
        deployment, you would join to a ``Seller.location`` column and
        compare it against ``self.config.user_location`` using a
        pre-computed geographic distance or city/state match.

        Future implementation sketch::

            if product.seller and product.seller.location:
                user_city = self.config.user_location.split(\",\")[0].strip()
                seller_city = product.seller.location.split(\",\")[0].strip()
                if user_city.lower() == seller_city.lower():
                    return 0.15
                # state-level match (weaker signal)
                ...
        """
        return 0.0

    def _compute_rating_score(self, product: Product) -> float:
        """
        Normalise the product's average rating to [0, 1].

        5.0 → 1.0,  4.0 → 0.75,  3.0 → 0.5,  2.0 → 0.25,  1.0 → 0.0.
        Products with no reviews get a neutral 0.5.
        """
        avg_rating = getattr(product, "averageRating", None) or 0.0
        reviews_count = getattr(product, "reviewsCount", 0) or 0
        if reviews_count == 0:
            return 0.5
        return min(1.0, avg_rating / 5.0)

    def _compute_seller_boost(self, product: Product) -> float:
        """
        Boost for new sellers and high-quality sellers.

        - New sellers (``isNewSeller == True``) get +0.15
        - Sellers with 4.5+ rating get an additional +0.05
        """
        boost = 0.0
        if product.seller:
            if product.seller.isNewSeller:
                boost += 0.15
            if getattr(product.seller, "rating", 0.0) >= 4.5:
                boost += 0.05
        return boost

    # ── Helpers ──────────────────────────────────────────────────────────

    def _load_recent_views(self, user_id: str) -> List[ProductView]:
        """Load the user's most recent product views."""
        return (
            self.db.query(ProductView)
            .filter(ProductView.userId == user_id)
            .order_by(ProductView.createdAt.desc())
            .limit(10)
            .all()
        )

    def _get_user_category_ids(self, user_id: str) -> Set[str]:
        """Get the set of category IDs the user has shown interest in."""
        events = (
            self.db.query(UserBehaviour.categoryId)
            .filter(
                UserBehaviour.userId == user_id,
                UserBehaviour.categoryId.isnot(None),
            )
            .distinct()
            .all()
        )
        return {e.categoryId for e in events}

    def _get_user_brand_names(self, user_id: str) -> Set[str]:
        """
        Get the set of brand names the user has shown interest in.

        ``UserBehaviour`` has no brand column — brands live on
        ``Product.brand`` — so we derive preference by joining the
        user's behaviour rows to the products they interacted with and
        collecting the distinct brand names.
        """
        rows = (
            self.db.query(Product.brand)
            .join(UserBehaviour, UserBehaviour.productId == Product.id)
            .filter(
                UserBehaviour.userId == user_id,
                Product.brand.isnot(None),
            )
            .distinct()
            .all()
        )
        return {row.brand for row in rows if row.brand}

    def _get_user_quality_returned_brands(self, user_id: str) -> Set[str]:
        """
        Get the set of brand names the user returned citing a **quality**
        issue.

        A quality return is a strong negative signal: those brands are
        down-weighted in THIS user's recommendations (see
        :meth:`_compute_brand_boost`).  Non-quality returns (mistaken
        order, changed mind) do **not** penalise the brand — only the
        returned product itself, via the engagement score.

        Returns
        -------
        set of str
            Distinct ``Product.brand`` names for the user's quality returns.
        """
        events = (
            self.db.query(UserBehaviour)
            .filter(
                UserBehaviour.userId == user_id,
                UserBehaviour.eventType == EVENT_RETURN,
                UserBehaviour.productId.isnot(None),
            )
            .all()
        )

        brands: Set[str] = set()
        for e in events:
            meta = e.eventMetadata or {}
            if not meta.get("qualityIssue"):
                continue
            if e.product and e.product.brand:
                brands.add(e.product.brand)
        return brands

    def _compute_brand_boost(
        self,
        product: Product,
        user_brands: Set[str],
        returned_brands: Set[str],
    ) -> float:
        """
        Brand-level score contribution for this user.

        - **+0.50** if the product belongs to a brand the user likes.
        - **−0.50** if the product belongs to a brand the user returned
          citing a quality issue (overrides the positive — the negative
          experience is the more recent / stronger signal).
        - **0.0** otherwise.
        """
        brand = getattr(product, "brand", None)
        if not brand:
            return 0.0
        if returned_brands and brand in returned_brands:
            return -0.50
        if user_brands and brand in user_brands:
            return 0.50
        return 0.0

    # ── Engagement scoring helpers ────────────────────────────────────────

    def _get_user_engagement(self, user_id: str) -> Dict[str, float]:
        """
        Aggregate the user's product-level behaviour events into a
        per-product engagement score with recency decay.

        Each event contributes ``EVENT_WEIGHT × decay`` where the decay
        halves every ``ENGAGEMENT_DECAY_HALFLIFE_DAYS`` days, so recent
        cart adds / wishlist adds / clicks weigh much more than old ones.
        Cart / wishlist **removals** contribute a negative amount.
        """
        events = (
            self.db.query(UserBehaviour)
            .filter(
                UserBehaviour.userId == user_id,
                UserBehaviour.productId.isnot(None),
            )
            .order_by(UserBehaviour.createdAt.desc())
            .limit(300)
            .all()
        )

        now = datetime.utcnow()
        scores: Dict[str, float] = {}
        for e in events:
            base = ENGAGEMENT_EVENT_WEIGHTS.get(e.eventType, 0.0)
            if base == 0.0:
                continue

            # "remove" actions on CART / WISHLIST are negative signals
            if e.eventType in ENGAGEMENT_NEGATIVE_ACTIONS:
                action = (e.eventMetadata or {}).get("action", "add")
                if action == "remove":
                    base = ENGAGEMENT_NEGATIVE_ACTIONS[e.eventType]

            # Recency decay — newer events count more
            age_days = 0.0
            if e.createdAt is not None:
                age_days = max(0.0, (now - e.createdAt).total_seconds() / 86400.0)
            decay = 0.5 ** (age_days / ENGAGEMENT_DECAY_HALFLIFE_DAYS)

            scores[e.productId] = scores.get(e.productId, 0.0) + base * decay
        return scores

    @staticmethod
    def _compute_engagement_score(
        product: Product,
        user_engagement: Dict[str, float],
        search_terms: Set[str],
    ) -> float:
        """
        Blend direct product engagement and search-term affinity into a
        single engagement score in [−0.5, 1.0].

        - **Direct engagement**: ``1 − exp(−raw / 1.5)`` maps a raw
          weighted event sum of 0 → 0, 1.5 → ~0.63, 3+ → ~0.86, while
          negative raw (removals) yields a negative score.
        - **Search affinity**: up to ``SEARCH_AFFINITY_MAX`` added when
          the product's name / tags / materials / brand match the terms
          the user recently searched for.
        """
        raw = user_engagement.get(product.id, 0.0)
        event_component = 1.0 - math.exp(-raw / 1.5)

        search_component = 0.0
        if search_terms:
            vocab: Set[str] = set()
            for tag in (product.tags or []):
                vocab.add(tag.lower().strip())
            for mat in (product.materials or []):
                vocab.add(mat.lower().strip())
            if product.name:
                vocab.update(w.strip().lower() for w in product.name.split())
            if product.brand:
                vocab.add(product.brand.lower().strip())

            matches = sum(1 for t in search_terms if t in vocab)
            if matches:
                search_component = min(SEARCH_AFFINITY_MAX, 0.12 * matches)

        return min(1.0, max(-0.5, event_component + search_component))


# ═══════════════════════════════════════════════════════════════════════════
# Stage 3 — Scoring & Blending
# ═══════════════════════════════════════════════════════════════════════════

class ScoreBlender:
    """
    Stage 3 of the pipeline: blend all sub-scores into a single
    ``final_score`` using a weighted linear combination.

    Each sub-score is expected to be in [0, 1] before blending.
    """

    def __init__(self, weights: Dict[str, float]):
        # Normalise weights so they always sum to 1.0
        total = sum(weights.values())
        if total <= 0:
            raise ValueError("Weights must sum to a positive value.")
        self.weights = {k: v / total for k, v in weights.items()}

    def blend(self, candidates: List[ScoredProduct]) -> List[ScoredProduct]:
        """
        For each scored product, compute:

            final_score = Σ w_i · score_i

        Where score_i includes: content, collab, trend, seasonal, location,
        category_affinity, brand_affinity, rating, seller_freshness,
        engagement.
        """
        w = self.weights

        for sp in candidates:
            blended = (
                w.get("content", 0.0) * sp.content_score
                + w.get("collaborative", 0.0) * sp.collab_score
                + w.get("trending", 0.0) * sp.trend_score
                + w.get("seasonal", 0.0) * sp.seasonal_boost
                + w.get("location", 0.0) * sp.location_boost
                + w.get("category_affinity", 0.0) * sp.category_boost
                + w.get("brand_affinity", 0.0) * sp.brand_boost
                + w.get("rating", 0.0) * sp.rating_score
                + w.get("seller_freshness", 0.0) * sp.seller_boost
                + w.get("engagement", 0.0) * sp.engagement_score
            )
            # Clamp to [0, 1] for safety
            sp.final_score = max(0.0, min(1.0, blended))

        return candidates


# ═══════════════════════════════════════════════════════════════════════════
# Stage 4 — Business Rules
# ═══════════════════════════════════════════════════════════════════════════

class BusinessRuleFilter:
    """
    Stage 4 of the pipeline: apply business constraints and fairness rules.

    Steps
    ─────
    4a. **Hard filters** — remove candidates that fail non-negotiable
        thresholds (min rating, min inventory, already purchased, too
        recently viewed).

    4b. **Seller fairness** — apply the 4-phase fairness pipeline
        (boost → cap → reserve → interleave) from ``seller_boost.py``
        so new artisans get visibility.

    4c. **Category diversity cap** — ensure no single category dominates
        the final list by capping each category's representation.
        Applied **after** fairness so interleaving doesn't undo the limit.
    """

    def __init__(self, db: Session, config: EngineConfig):
        self.db = db
        self.config = config

    def apply(
        self,
        scored: List[ScoredProduct],
        user_id: str,
    ) -> List[ScoredProduct]:
        """
        Run all business-rule filters and return the refined list.
        """
        if not scored:
            return scored

        # ── 4a. Hard filters ──────────────────────────────────────────

        # Filter by rating threshold
        if self.config.min_rating > 0:
            scored = [
                sp
                for sp in scored
                if (getattr(sp.product, "averageRating", 0.0) or 0.0)
                >= self.config.min_rating
            ]

        # Filter by inventory threshold
        if self.config.min_inventory > 0:
            scored = [
                sp
                for sp in scored
                if (getattr(sp.product, "inventory", 0) or 0)
                >= self.config.min_inventory
            ]

        # Exclude already-purchased products
        purchased_ids = self._get_purchased_product_ids(user_id)
        if purchased_ids:
            scored = [sp for sp in scored if sp.product.id not in purchased_ids]

        # Exclude products viewed very recently (e.g. last 48 hours)
        recently_viewed_ids = self._get_recently_viewed_ids(
            user_id, hours=self.config.recent_view_window_hours
        )
        if recently_viewed_ids:
            scored = [
                sp for sp in scored if sp.product.id not in recently_viewed_ids
            ]

        # Sort by final_score descending before fairness ranking
        scored.sort(key=lambda sp: sp.final_score, reverse=True)

        # ── 4b. Seller fairness (applied BEFORE category diversity cap
        #     so fairness interleaving doesn't undo the diversity limit) ─
        cfg = get_config(self.db)
        products_with_scores: List[Product] = []
        for sp in scored:
            p = sp.product
            p.final_score = sp.final_score
            products_with_scores.append(p)

        fair_products = fair_rank(
            products_with_scores,
            total_slots=self.config.total_slots,
            boost_amount=cfg.boost_amount,
            new_seller_ratio=cfg.new_seller_ratio,
            max_per_seller_ratio=cfg.max_per_seller_ratio,
            attribute="final_score",
            penalty_weight=CANCEL_PENALTY_WEIGHT,
        )

        # Map back to ScoredProduct preserving the fair ranking order
        scored_map = {sp.product.id: sp for sp in scored}
        final_after_fairness: List[ScoredProduct] = []
        for p in fair_products:
            sp = scored_map.get(p.id)
            if sp:
                sp.final_score = getattr(p, "final_score", sp.final_score)
                final_after_fairness.append(sp)

        # ── 4c. Category diversity cap (after fairness, so it's the
        #     final gate before selection) ───────────────────────────────
        return self._apply_category_diversity_cap(final_after_fairness)

    # ── Helpers ──────────────────────────────────────────────────────────

    def _get_purchased_product_ids(self, user_id: str) -> Set[str]:
        """Return IDs of all products the user has already purchased."""
        from app.models import Order, OrderItem

        order_ids = (
            self.db.query(Order.id)
            .filter(Order.userId == user_id)
            .subquery()
        )
        purchased = (
            self.db.query(OrderItem.productId)
            .filter(OrderItem.orderId.in_(order_ids))
            .distinct()
            .all()
        )
        return {row.productId for row in purchased if row.productId}

    def _get_recently_viewed_ids(
        self, user_id: str, hours: int = 48
    ) -> Set[str]:
        """Return IDs of products viewed within the last *hours* hours."""
        from datetime import timedelta

        cutoff = datetime.utcnow() - timedelta(hours=hours)
        recent = (
            self.db.query(ProductView.productId)
            .filter(
                ProductView.userId == user_id,
                ProductView.createdAt >= cutoff,
            )
            .distinct()
            .all()
        )
        return {row.productId for row in recent if row.productId}

    def _apply_category_diversity_cap(
        self, scored: List[ScoredProduct]
    ) -> List[ScoredProduct]:
        """
        Ensure no single category exceeds ``config.max_per_category``
        of the total candidate pool.

        Works by sorting candidates by score descending, then walking the
        list and counting per category.  Once a category hits its cap,
        subsequent products from that category are dropped.
        """
        if not scored:
            return []

        max_per_cat = max(
            1,
            math.ceil(len(scored) * self.config.max_per_category),
        )
        cat_counts: Dict[str, int] = {}
        filtered: List[ScoredProduct] = []

        # Sort by current final_score (might be zero for scoring-less items)
        scored_sorted = sorted(scored, key=lambda sp: sp.final_score, reverse=True)

        for sp in scored_sorted:
            cat_id = sp.product.categoryId or "__none__"
            current = cat_counts.get(cat_id, 0)
            if current >= max_per_cat:
                logger.debug(
                    "Category %s capped at %d products (diversity).",
                    cat_id,
                    max_per_cat,
                )
                continue
            cat_counts[cat_id] = current + 1
            filtered.append(sp)

        return filtered


# ═══════════════════════════════════════════════════════════════════════════
# Stage 5 — Ranking & Selection
# ═══════════════════════════════════════════════════════════════════════════

class RankerSelector:
    """
    Stage 5 of the pipeline: final sort, top-N truncation, and explanation
    attachment.
    """

    def __init__(self, total_slots: int):
        self.total_slots = total_slots

    def select(
        self, scored: List[ScoredProduct]
    ) -> List[ScoredProduct]:
        """
        Sort by ``final_score`` descending, attach human-readable
        explanations, and truncate to ``total_slots``.
        """
        if not scored:
            return []

        # Sort by final score
        scored.sort(key=lambda sp: sp.final_score, reverse=True)

        # Take top N
        top = scored[: self.total_slots]

        # Attach explanations
        for sp in top:
            sp.explanation = self._build_explanation(sp)

        return top

    @staticmethod
    def _build_explanation(sp: ScoredProduct) -> str:
        """
        Generate a human-readable reason for the recommendation.

        Picks the strongest signal and phrases it naturally.
        """
        # Find the dominant signal
        signals: List[Tuple[float, str, str]] = [
            (sp.content_score, "content", "Similar to what you viewed."),
            (sp.collab_score, "collab", "Customers like you also liked this."),
            (sp.trend_score, "trending", "Trending among customers."),
            (sp.seasonal_boost, "seasonal", "Perfect for this season."),
            (sp.location_boost, "location", "From a seller near you."),
            (sp.category_boost, "category", "From a category you love."),
            (sp.rating_score, "rating", "Highly rated by customers."),
            (sp.seller_boost, "seller", "From a top-rated artisan."),
        ]
        # Only a *positive* engagement signal deserves an explanation —
        # negative engagement (removals) is a demotion, not a reason.
        if sp.engagement_score > 0.01:
            signals.append(
                (
                    sp.engagement_score,
                    "engagement",
                    "From your recent activity (cart, wishlist, clicks, searches).",
                )
            )

        if sp.source == "new_arrivals":
            return "Discover a new artisan on UdrCrafts."

        if sp.source == "random_discovery":
            return "Something new you might like."

        # Pick the strongest non-zero signal
        best_signal = max(signals, key=lambda s: s[0])
        score, _, explanation = best_signal

        if score <= 0.01 and sp.source == "trending":
            return "Popular among customers recently."
        elif score <= 0.01:
            return "Recommended for you."

        return explanation


# ═══════════════════════════════════════════════════════════════════════════
# Main Engine — Orchestrator
# ═══════════════════════════════════════════════════════════════════════════

class RecommendationEngine:
    """
    Top-level orchestrator that runs the full 5-stage recommendation
    pipeline.

    Usage
    -----

        engine = RecommendationEngine(db)
        results = engine.recommend(
            user_id="uuid-...",
            limit=20,
            user_location="New Delhi, India",
        )

        # results is a list of ScoredProduct, each with:
        #   .product        — Product ORM instance
        #   .final_score    — blended score [0, 1]
        #   .explanation    — human-readable reason

    Pipeline overview
    -----------------

    +------------+         +------------------+         +----------------+
    |  Stage 1   | ──────▶ |   Stage 2        | ──────▶ |  Stage 3       |
    | Candidates |         | Feature Compute   |         | Score Blending |
    +------------+         +------------------+         +----------------+
                                                              │
                                                              ▼
    +------------+         +------------------+         +----------------+
    |  Stage 5   | ◀────── |   Stage 4        | ◀────── |                |
    | Rank/Select|         | Business Rules    |         |                |
    +------------+         +------------------+         +----------------+
    """

    def __init__(self, db: Session):
        self.db = db

    def recommend(
        self,
        user_id: str,
        *,
        limit: int = 20,
        user_location: Optional[str] = None,
        user_city_id: Optional[str] = None,
        user_state_id: Optional[str] = None,
        weights: Optional[Dict[str, float]] = None,
        include_random: bool = True,
        **rule_overrides,
    ) -> List[ScoredProduct]:
        """
        Generate top-N personalised recommendations for a user.

        Parameters
        ----------
        user_id : str
            UUID of the target user.
        limit : int
            Number of recommendations to return (default 20).
        user_location : str, optional
            Free-form location string (e.g. ``\"Mumbai, India\"``).
            Used for location-based boosting.
        weights : dict, optional
            Override the default blending weights.  Only the keys
            provided are changed; omitted keys keep their defaults.
        include_random : bool
            Whether to include serendipitous random-discovery items.
        **rule_overrides
            Any additional :class:`EngineConfig` field to override
            (e.g. ``min_rating=4.0``, ``min_inventory=1``).

        Returns
        -------
        List[ScoredProduct]
            At most *limit* products, sorted by ``final_score`` descending,
            each with an attached ``explanation`` string.
        """
        # ── Build config ────────────────────────────────────────────────
        merged_weights = dict(DEFAULT_WEIGHTS)
        if weights:
            merged_weights.update(weights)

        config = EngineConfig(
            weights=merged_weights,
            total_slots=limit,
            include_random=include_random,
            user_location=user_location,
            **rule_overrides,
        )

        # ── Run pipeline stages ─────────────────────────────────────────
        # Stage 1: Candidate generation
        generator = CandidateGenerator(self.db, config)
        candidates = generator.generate(user_id)

        # Stage 2: Feature computation
        computer = FeatureComputer(self.db, config)
        scored = computer.compute(candidates, user_id)

        # Stage 3: Score blending
        blender = ScoreBlender(config.weights)
        scored = blender.blend(scored)

        # Stage 4: Business rules & fairness
        rule_filter = BusinessRuleFilter(self.db, config)
        scored = rule_filter.apply(scored, user_id)

        # Stage 5: Final ranking & selection
        selector = RankerSelector(config.total_slots)
        final = selector.select(scored)

        logger.info(
            "RecommendationEngine: user=%s → %d recommendations (from %d candidates).",
            user_id,
            len(final),
            len(candidates),
        )
        return final

    def recommend_for_product(
        self,
        product_id: str,
        *,
        limit: int = 10,
        user_id: Optional[str] = None,
    ) -> List[ScoredProduct]:
        """
        Convenience: get recommendations **similar to a specific product**
        using the content-based pipeline, then run through the full engine.

        If ``user_id`` is provided, collaborative and trending signals are
        also blended in for personalisation.

        Parameters
        ----------
        product_id : str
            UUID of the seed product.
        limit : int
            Max similar products to return.
        user_id : str, optional
            If provided, blend in personalisation signals.

        Returns
        -------
        List[ScoredProduct]
            Similar products with explanations.
        """
        similar_products = get_similar_products(product_id, self.db, limit=limit)
        if not similar_products:
            return []

        # Build ScoredProduct list from similar products
        scored: List[ScoredProduct] = [
            ScoredProduct(
                product=p,
                content_score=1.0,  # maximally similar by definition
                source="content_based",
            )
            for p in similar_products
        ]

        # If we have a user, blend in personalised signals
        if user_id:
            computer = FeatureComputer(self.db, EngineConfig())
            scored = computer.compute(
                [(sp.product, sp.source) for sp in scored],
                user_id,
            )
            config = EngineConfig(total_slots=limit)
            blender = ScoreBlender(config.weights)
            scored = blender.blend(scored)
            rule_filter = BusinessRuleFilter(self.db, config)
            scored = rule_filter.apply(scored, user_id)

        selector = RankerSelector(limit)
        return selector.select(scored)


# ═══════════════════════════════════════════════════════════════════════════
# Convenience: direct function call (for simple use cases)
# ═══════════════════════════════════════════════════════════════════════════

def get_recommendations(
    db: Session,
    user_id: str,
    *,
    limit: int = 20,
    user_location: Optional[str] = None,
    **kwargs,
) -> List[ScoredProduct]:
    """
    One-liner convenience wrapper around :class:`RecommendationEngine`.

    Usage::

        results = get_recommendations(db, user_id, limit=10)
        for r in results:
            print(r.product.name, r.final_score)
    """
    engine = RecommendationEngine(db)
    return engine.recommend(
        user_id,
        limit=limit,
        user_location=user_location,
        **kwargs,
    )
