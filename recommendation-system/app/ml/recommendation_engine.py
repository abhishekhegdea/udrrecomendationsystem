"""
recommendation_engine.py — Unified Recommendation Pipeline for UdrCrafts

Combines Content-Based, Collaborative, Trending, Seasonal, Location,
Category Affinity, Brand Affinity, Rating, Seller Freshness,
7-Day Click Rate and User Engagement into one recommendation score.
"""

from __future__ import annotations

import logging
import math
import random
import re

from dataclasses import (
    dataclass,
    field,
)

from datetime import (
    datetime,
    timedelta,
)

from typing import (
    Dict,
    List,
    Optional,
    Set,
    Tuple,
)

from sqlalchemy import (
    func,
    or_,
)

from sqlalchemy.orm import (
    Session,
    joinedload,
)

from app.core.fairness_config import (
    get_config,
)

from app.ml.collaborative import (
    collaborative_model,
)

from app.ml.content_based import (
    get_similar_products,
)

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

from app.ml.seller_boost import (
    fair_rank,
    CANCEL_PENALTY_WEIGHT,
)

from app.models import (
    CartItem,
    ClickEvent,
    Order,
    OrderItem,
    Product,
    ProductClickHistory,
    ProductView,
    Rating,
    Review,
    Seller,
    UserBehaviour,
    Wishlist,
)


logger = logging.getLogger(
    __name__
)


# ===========================================================================
# RECOMMENDATION WEIGHTS
# ===========================================================================

DEFAULT_WEIGHTS: Dict[str, float] = {
    "content": 0.15,
    "collaborative": 0.10,
    "trending": 0.10,
    "seasonal": 0.07,

    # ----------------------------------------------------------------------
    # PRECISE LOCATION RANKING
    # ----------------------------------------------------------------------
    # Precise seller proximity is now a first-class ranking signal.
    # The raw location score is calculated from seller distance and contributes
    # directly to the recommendation score before business-rule re-ranking.
    #
    # location_score = exp(-seller_distance_km / distance_decay_km)
    # location_contribution = location_score * location_weight
    "location": 0.10,

    "category_affinity": 0.08,
    "brand_affinity": 0.07,
    "rating": 0.07,
    "seller_freshness": 0.06,
    "click_rate": 0.05,
    "engagement": 0.15,
}


# Verify:
# 0.15 + 0.10 + 0.10 + 0.07 + 0.10 +
# 0.08 + 0.07 + 0.07 + 0.06 + 0.05 +
# 0.15 = 1.00


DEFAULT_CANDIDATE_LIMITS: Dict[str, int] = {
    "nearby_sellers": 12,
    "content_based": 40,
    "collaborative": 40,
    "trending": 30,
    "new_arrivals": 20,
    "category_affinity": 30,
    "local_sellers": 20,
    "search_affinity": 15,
    "random_discovery": 10,
}


# Fallback city/state reservation when exact coordinates are unavailable.
DEFAULT_LOCAL_SLOTS = 2

# Precise location ranking defaults.
EARTH_RADIUS_KM = 6371.0088
DEFAULT_NEARBY_RADIUS_KM = 100.0
DEFAULT_DISTANCE_DECAY_KM = 25.0
DEFAULT_NEARBY_SELLER_LIMIT = 25
DEFAULT_LOCATION_PRIORITY_SLOTS = 4
DEFAULT_LOCATION_PRIORITY_MIN_SCORE = 0.15

DEFAULT_MIN_RATING = 0.0

DEFAULT_MIN_INVENTORY = 0

DEFAULT_MAX_PER_CATEGORY = 0.30

DEFAULT_RECENT_VIEW_WINDOW_HOURS = 48


# ===========================================================================
# ENGAGEMENT EVENT WEIGHTS
# ===========================================================================

# CLICK has deliberately been removed from this dictionary.
#
# If CLICK remained here, one click would affect:
#
#   engagement_score
#
# AND
#
#   click_rate_score
#
# which would double-count the same signal.

ENGAGEMENT_EVENT_WEIGHTS: Dict[str, float] = {
    EVENT_PURCHASE: 1.0,
    EVENT_CART: 0.8,
    EVENT_WISHLIST: 0.6,
    EVENT_CLICK: 0.4,
    EVENT_REVIEW: 0.5,
    EVENT_RATING: 0.5,
    EVENT_PRODUCT_VIEW: 0.2,
    EVENT_RETURN: -0.8,
}


ENGAGEMENT_NEGATIVE_ACTIONS: Dict[str, float] = {
    EVENT_CART: -0.6,
    EVENT_WISHLIST: -0.4,
}


ENGAGEMENT_DECAY_HALFLIFE_DAYS = 14.0


# ===========================================================================
# NEW CLICK-RATE CONFIGURATION
# ===========================================================================

CLICK_RATE_WINDOW_DAYS = 7


SEARCH_AFFINITY_MAX = 0.4


SEARCH_STOPWORDS: Set[str] = {
    "the",
    "and",
    "for",
    "with",
    "from",
    "that",
    "this",
    "what",
    "where",
    "when",
    "how",
    "you",
    "your",
    "are",
    "was",
    "not",
    "new",
    "best",
    "buy",
    "shop",
    "online",
    "india",
    "price",
    "under",
    "gift",
    "gifts",
}


SEASONAL_MAP: Dict[
    int,
    Dict[str, float],
] = {
    1: {
        "winter": 0.20,
        "new year": 0.15,
        "cozy": 0.15,
    },

    2: {
        "winter": 0.15,
        "valentine": 0.25,
        "love": 0.15,
    },

    3: {
        "spring": 0.20,
        "easter": 0.15,
    },

    4: {
        "spring": 0.15,
        "earth": 0.10,
    },

    5: {
        "summer": 0.10,
        "wedding": 0.15,
        "gift": 0.10,
    },

    6: {
        "summer": 0.15,
        "wedding": 0.10,
        "pride": 0.10,
    },

    7: {
        "summer": 0.10,
        "vacation": 0.10,
        "travel": 0.10,
    },

    8: {
        "monsoon": 0.15,
        "rain": 0.10,
    },

    9: {
        "autumn": 0.10,
        "fall": 0.10,
    },

    10: {
        "diwali": 0.30,
        "autumn": 0.10,
        "halloween": 0.15,
    },

    11: {
        "diwali": 0.20,
        "christmas": 0.10,
        "gift": 0.15,
    },

    12: {
        "christmas": 0.30,
        "new year": 0.15,
        "winter": 0.10,
        "gift": 0.20,
    },
}


# ===========================================================================
# PRECISE LOCATION HELPERS
# ===========================================================================

def _valid_coordinate_pair(
    latitude: Optional[float],
    longitude: Optional[float],
) -> bool:
    if latitude is None or longitude is None:
        return False

    try:
        lat = float(latitude)
        lon = float(longitude)
    except (TypeError, ValueError):
        return False

    return (
        -90.0 <= lat <= 90.0
        and -180.0 <= lon <= 180.0
    )


def haversine_distance_km(
    latitude_1: float,
    longitude_1: float,
    latitude_2: float,
    longitude_2: float,
) -> float:
    """Great-circle distance between two latitude/longitude points."""

    lat1 = math.radians(float(latitude_1))
    lon1 = math.radians(float(longitude_1))
    lat2 = math.radians(float(latitude_2))
    lon2 = math.radians(float(longitude_2))

    dlat = lat2 - lat1
    dlon = lon2 - lon1

    a = (
        math.sin(dlat / 2.0) ** 2
        + math.cos(lat1)
        * math.cos(lat2)
        * math.sin(dlon / 2.0) ** 2
    )

    c = 2.0 * math.atan2(
        math.sqrt(a),
        math.sqrt(max(0.0, 1.0 - a)),
    )

    return EARTH_RADIUS_KM * c


def distance_location_score(
    distance_km: float,
    decay_km: float = DEFAULT_DISTANCE_DECAY_KM,
) -> float:
    """
    Convert distance into a smooth 0..1 recommendation feature.

    score = exp(-distance / decay)

    With the default 25 km decay:
        0 km  -> 1.00
        5 km  -> 0.82
        10 km -> 0.67
        25 km -> 0.37
        50 km -> 0.14
    """

    distance = max(0.0, float(distance_km))
    decay = max(1.0, float(decay_km))

    return max(
        0.0,
        min(
            1.0,
            math.exp(-distance / decay),
        ),
    )


# ===========================================================================
# DATA CLASSES
# ===========================================================================

@dataclass
class ScoredProduct:
    product: Product

    final_score: float = 0.0

    content_score: float = 0.0

    collab_score: float = 0.0

    trend_score: float = 0.0

    seasonal_boost: float = 0.0

    location_boost: float = 0.0

    seller_distance_km: Optional[float] = None

    nearby_seller: bool = False

    location_priority_applied: bool = False

    category_boost: float = 0.0

    brand_boost: float = 0.0

    rating_score: float = 0.0

    seller_boost: float = 0.0

    # ----------------------------------------------------------------------
    # NEW
    # ----------------------------------------------------------------------
    click_rate_score: float = 0.0

    engagement_score: float = 0.0

    explanation: str = (
        "Recommended for you."
    )

    source: str = "unknown"


@dataclass
class EngineConfig:
    weights: Dict[str, float] = field(
        default_factory=lambda: dict(
            DEFAULT_WEIGHTS
        )
    )

    candidate_limits: Dict[
        str,
        int,
    ] = field(
        default_factory=lambda: dict(
            DEFAULT_CANDIDATE_LIMITS
        )
    )

    min_rating: float = (
        DEFAULT_MIN_RATING
    )

    min_inventory: int = (
        DEFAULT_MIN_INVENTORY
    )

    max_per_category: float = (
        DEFAULT_MAX_PER_CATEGORY
    )

    recent_view_window_hours: int = (
        DEFAULT_RECENT_VIEW_WINDOW_HOURS
    )

    total_slots: int = 20

    #: Number of slots guaranteed to same-city/state products (0 = off)
    local_slots: int = DEFAULT_LOCAL_SLOTS

    include_random: bool = True

    user_location: Optional[str] = None

    user_city_id: Optional[str] = None

    user_state_id: Optional[str] = None

    user_latitude: Optional[float] = None

    user_longitude: Optional[float] = None

    nearby_radius_km: float = DEFAULT_NEARBY_RADIUS_KM

    distance_decay_km: float = DEFAULT_DISTANCE_DECAY_KM

    nearby_seller_limit: int = DEFAULT_NEARBY_SELLER_LIMIT

    location_priority_slots: int = DEFAULT_LOCATION_PRIORITY_SLOTS

    location_priority_min_score: float = DEFAULT_LOCATION_PRIORITY_MIN_SCORE


# ===========================================================================
# SEARCH TERMS
# ===========================================================================

def _collect_search_terms(
    db: Session,
    user_id: str,
    limit: int = 20,
) -> Set[str]:

    searches = (
        db.query(
            UserBehaviour
        )
        .filter(
            UserBehaviour.userId
            == user_id,

            UserBehaviour.eventType
            == EVENT_SEARCH,
        )
        .order_by(
            UserBehaviour.createdAt.desc()
        )
        .limit(limit)
        .all()
    )

    terms: Set[str] = set()

    for search in searches:
        query = (
            search.eventMetadata
            or {}
        ).get(
            "query",
            "",
        )

        if not query:
            continue

        tokens = re.split(
            r"[\s,;&|]+",
            query.lower(),
        )

        for token in tokens:
            token = token.strip()

            if (
                len(token) >= 3
                and token
                not in SEARCH_STOPWORDS
            ):
                terms.add(token)

    return terms


# ===========================================================================
# STAGE 1
# CANDIDATE GENERATION
# ===========================================================================

class CandidateGenerator:

    def __init__(
        self,
        db: Session,
        config: EngineConfig,
    ):
        self.db = db

        self.config = config


    def _get_nearby_seller_distances(
        self,
    ) -> Dict[str, float]:
        """Return nearest seller IDs mapped to distance in kilometres."""

        if not _valid_coordinate_pair(
            self.config.user_latitude,
            self.config.user_longitude,
        ):
            return {}

        sellers = (
            self.db.query(Seller)
            .filter(
                Seller.latitude.isnot(None),
                Seller.longitude.isnot(None),
            )
            .all()
        )

        ranked: List[Tuple[str, float]] = []

        for seller in sellers:
            if not _valid_coordinate_pair(
                getattr(seller, "latitude", None),
                getattr(seller, "longitude", None),
            ):
                continue

            distance = haversine_distance_km(
                float(self.config.user_latitude),
                float(self.config.user_longitude),
                float(seller.latitude),
                float(seller.longitude),
            )

            # Nearby candidate generation is intentionally radius bounded.
            if distance <= max(0.0, self.config.nearby_radius_km):
                ranked.append((seller.id, distance))

        ranked.sort(key=lambda item: item[1])

        return dict(
            ranked[: max(1, self.config.nearby_seller_limit)]
        )


    def generate(
        self,
        user_id: str,
    ) -> List[
        Tuple[
            Product,
            str,
        ]
    ]:

        seen: Set[str] = set()

        candidates: List[
            Tuple[
                Product,
                str,
            ]
        ] = []

        limits = (
            self.config
            .candidate_limits
        )

        target_count = (
            self.config.total_slots
            * 2
        )

        # ------------------------------------------------------------------
        # PRECISE NEARBY SELLERS
        # ------------------------------------------------------------------
        # Browser geolocation gives the shopper coordinates. Seller coordinates
        # are stored in PostgreSQL. We calculate Haversine distance locally so
        # recommendation requests do not make a paid Maps call per product.
        if _valid_coordinate_pair(
            self.config.user_latitude,
            self.config.user_longitude,
        ):
            seller_distances = self._get_nearby_seller_distances()

            if seller_distances:
                seller_ids = list(seller_distances.keys())

                nearby_products = (
                    self.db.query(Product)
                    .options(
                        joinedload(Product.images),
                        joinedload(Product.seller),
                    )
                    .filter(Product.sellerId.in_(seller_ids))
                    .limit(max(limits["nearby_sellers"] * 4, 60))
                    .all()
                )

                nearby_products.sort(
                    key=lambda product: (
                        seller_distances.get(
                            product.sellerId,
                            float("inf"),
                        ),
                        -(getattr(product, "popularity", 0.0) or 0.0),
                    )
                )

                for product in nearby_products[: limits["nearby_sellers"]]:
                    if product.id in seen:
                        continue

                    seen.add(product.id)
                    candidates.append((product, "nearby_sellers"))

        # ------------------------------------------------------------------
        # CITY / STATE LOCAL SELLERS (fallback and complementary candidates)
        # ------------------------------------------------------------------
        if self.config.user_city_id or self.config.user_state_id:
            local_conditions = []
            if self.config.user_city_id:
                local_conditions.append(
                    Seller.cityId == self.config.user_city_id
                )
            if self.config.user_state_id:
                local_conditions.append(
                    Seller.stateId == self.config.user_state_id
                )
            local_products = (
                self.db.query(Product)
                .options(joinedload(Product.images))
                .join(Seller)
                .filter(or_(*local_conditions))
                .order_by(Product.popularity.desc())
                .limit(limits["local_sellers"])
                .all()
            )
            for p in local_products:
                if p.id not in seen:
                    seen.add(p.id)
                    candidates.append((p, "local_sellers"))

        if len(candidates) >= target_count:
            return candidates

        # ------------------------------------------------------------------
        # CONTENT BASED
        # ------------------------------------------------------------------

        recent_products = (
            self
            ._get_recent_interacted_products(
                user_id,
                limit=5,
            )
        )

        for viewed_product in recent_products:

            similar = (
                get_similar_products(
                    viewed_product.id,
                    self.db,
                    limit=(
                        limits[
                            "content_based"
                        ]
                        // 2
                    ),
                )
            )

            for product in similar:

                if product.id in seen:
                    continue

                seen.add(
                    product.id
                )

                candidates.append(
                    (
                        product,
                        "content_based",
                    )
                )

        if len(candidates) >= target_count:
            return candidates

        # ------------------------------------------------------------------
        # COLLABORATIVE
        # ------------------------------------------------------------------

        if collaborative_model.is_trained:

            user_items = (
                collaborative_model
                .user_history
                .get(
                    user_id,
                    {},
                )
            )

            if user_items:

                top_items = sorted(
                    user_items.items(),
                    key=lambda x: x[1],
                    reverse=True,
                )[:3]

                for (
                    interacted_id,
                    _,
                ) in top_items:

                    similar_from_collab = (
                        get_similar_products(
                            interacted_id,
                            self.db,
                            limit=(
                                limits[
                                    "collaborative"
                                ]
                                // 3
                            ),
                        )
                    )

                    for product in (
                        similar_from_collab
                    ):

                        if (
                            product.id
                            in seen
                        ):
                            continue

                        seen.add(
                            product.id
                        )

                        candidates.append(
                            (
                                product,
                                "collaborative",
                            )
                        )

        if len(candidates) >= target_count:
            return candidates

        # ------------------------------------------------------------------
        # TRENDING
        # ------------------------------------------------------------------

        trending = (
            self.db
            .query(Product)
            .options(
                joinedload(
                    Product.images
                )
            )
            .order_by(
                Product
                .popularity
                .desc()
            )
            .limit(
                limits[
                    "trending"
                ]
            )
            .all()
        )

        for product in trending:

            if product.id in seen:
                continue

            seen.add(
                product.id
            )

            candidates.append(
                (
                    product,
                    "trending",
                )
            )

        if len(candidates) >= target_count:
            return candidates

        # ------------------------------------------------------------------
        # NEW ARRIVALS
        # ------------------------------------------------------------------

        new_arrivals = (
            self.db
            .query(Product)
            .options(
                joinedload(
                    Product.images
                )
            )
            .join(Seller)
            .filter(
                Seller.isNewSeller
                == True
            )
            .order_by(
                Product
                .popularity
                .desc()
            )
            .limit(
                limits[
                    "new_arrivals"
                ]
            )
            .all()
        )

        for product in new_arrivals:

            if product.id in seen:
                continue

            seen.add(
                product.id
            )

            candidates.append(
                (
                    product,
                    "new_arrivals",
                )
            )

        if len(candidates) >= target_count:
            return candidates

        # ------------------------------------------------------------------
        # CATEGORY AFFINITY
        # ------------------------------------------------------------------

        preferred_categories = (
            self
            ._get_preferred_categories(
                user_id
            )
        )

        if preferred_categories:

            category_products = (
                self.db
                .query(Product)
                .options(
                    joinedload(
                        Product.images
                    )
                )
                .filter(
                    Product.categoryId.in_(
                        preferred_categories
                    )
                )
                .order_by(
                    Product
                    .popularity
                    .desc()
                )
                .limit(
                    limits[
                        "category_affinity"
                    ]
                )
                .all()
            )

            for product in (
                category_products
            ):

                if product.id in seen:
                    continue

                seen.add(
                    product.id
                )

                candidates.append(
                    (
                        product,
                        "category_affinity",
                    )
                )

        if len(candidates) >= target_count:
            return candidates

        # ------------------------------------------------------------------
        # SEARCH AFFINITY
        # ------------------------------------------------------------------

        search_products = (
            self
            ._get_search_affinity_products(
                user_id,

                limit=limits[
                    "search_affinity"
                ],
            )
        )

        for product in search_products:

            if product.id in seen:
                continue

            seen.add(
                product.id
            )

            candidates.append(
                (
                    product,
                    "search_affinity",
                )
            )

        if len(candidates) >= target_count:
            return candidates

        # ------------------------------------------------------------------
        # RANDOM DISCOVERY
        # ------------------------------------------------------------------

        if (
            self.config.include_random
            and limits[
                "random_discovery"
            ] > 0
        ):

            random_pool = (
                self.db
                .query(Product)
                .options(
                    joinedload(
                        Product.images
                    )
                )
                .order_by(
                    Product.id
                )
                .limit(
                    limits[
                        "random_discovery"
                    ]
                    * 5
                )
                .all()
            )

            random.shuffle(
                random_pool
            )

            for product in random_pool:

                if product.id in seen:
                    continue

                seen.add(
                    product.id
                )

                candidates.append(
                    (
                        product,
                        "random_discovery",
                    )
                )

                if (
                    len(candidates)
                    >= target_count
                ):
                    break

        logger.info(
            (
                "Candidate generation: "
                "%d unique candidates "
                "from %d sources "
                "for user %s."
            ),
            len(candidates),
            len({
                source
                for _,
                source
                in candidates
            }),
            user_id,
        )

        return candidates


    def _get_recent_interacted_products(
        self,
        user_id: str,
        limit: int = 5,
    ) -> List[Product]:

        recent_interactions = (
            self.db
            .query(
                UserBehaviour
            )
            .filter(
                UserBehaviour.userId
                == user_id,

                UserBehaviour.productId
                .isnot(None),

                UserBehaviour.eventType.in_(
                    [
                        EVENT_PRODUCT_VIEW,
                        EVENT_CART,
                        EVENT_PURCHASE,
                        EVENT_WISHLIST,
                        EVENT_CLICK,
                    ]
                ),
            )
            .order_by(
                UserBehaviour
                .createdAt
                .desc()
            )
            .limit(
                limit * 3
            )
            .all()
        )

        if not recent_interactions:
            return []

        product_ids: List[str] = []

        seen_ids: Set[str] = set()

        for interaction in (
            recent_interactions
        ):

            if (
                interaction.productId
                and interaction.productId
                not in seen_ids
            ):
                seen_ids.add(
                    interaction.productId
                )

                product_ids.append(
                    interaction.productId
                )

                if (
                    len(product_ids)
                    >= limit
                ):
                    break

        if not product_ids:
            return []

        products = (
            self.db
            .query(Product)
            .filter(
                Product.id.in_(
                    product_ids
                )
            )
            .all()
        )

        id_map = {
            product.id: product
            for product in products
        }

        return [
            id_map[product_id]
            for product_id
            in product_ids
            if product_id
            in id_map
        ]


    def _get_preferred_categories(
        self,
        user_id: str,
    ) -> List[str]:

        recent_events = (
            self.db
            .query(
                UserBehaviour
            )
            .filter(
                UserBehaviour.userId
                == user_id,

                UserBehaviour.categoryId
                .isnot(None),
            )
            .order_by(
                UserBehaviour
                .createdAt
                .desc()
            )
            .limit(50)
            .all()
        )

        category_counts: Dict[
            str,
            int,
        ] = {}

        for event in recent_events:

            if not event.categoryId:
                continue

            category_counts[
                event.categoryId
            ] = (
                category_counts.get(
                    event.categoryId,
                    0,
                )
                + 1
            )

        sorted_categories = sorted(
            category_counts.keys(),

            key=lambda category:
                category_counts[
                    category
                ],

            reverse=True,
        )

        return sorted_categories[:3]


    def _get_search_affinity_products(
        self,
        user_id: str,
        limit: int = 15,
    ) -> List[Product]:

        terms = _collect_search_terms(
            self.db,
            user_id,
        )

        if not terms:
            return []

        conditions = []

        for term in terms:

            conditions.append(
                Product.name.ilike(
                    f"%{term}%"
                )
            )

            conditions.append(
                Product.tags.any(
                    term
                )
            )

        return (
            self.db
            .query(Product)
            .options(
                joinedload(
                    Product.images
                )
            )
            .filter(
                or_(
                    *conditions
                )
            )
            .order_by(
                Product
                .popularity
                .desc()
            )
            .limit(limit)
            .all()
        )


# ===========================================================================
# STAGE 2
# FEATURE COMPUTATION
# ===========================================================================

class FeatureComputer:

    _SOURCE_CONTENT_SCORES = {
        "content_based": 0.80,
        "collaborative": 0.65,
        "trending": 0.50,
        "new_arrivals": 0.50,
        "category_affinity": 0.55,
        "nearby_sellers": 0.60,
        "local_sellers": 0.45,
        "search_affinity": 0.55,
        "random_discovery": 0.30,
    }


    def __init__(
        self,
        db: Session,
        config: EngineConfig,
    ):
        self.db = db

        self.config = config


    def compute(
        self,
        candidates: List[
            Tuple[
                Product,
                str,
            ]
        ],
        user_id: str,
        recent_views: Optional[
            List[ProductView]
        ] = None,
    ) -> List[ScoredProduct]:

        if not candidates:
            return []

        if recent_views is None:

            recent_views = (
                self
                ._load_recent_views(
                    user_id
                )
            )

        content_seed_product = None

        if recent_views:

            viewed_ids = [
                view.productId
                for view
                in recent_views
                if view.productId
            ]

            if viewed_ids:

                seed = (
                    self.db
                    .query(Product)
                    .filter(
                        Product.id
                        == viewed_ids[0]
                    )
                    .first()
                )

                if (
                    seed
                    and seed.embedding
                    is not None
                ):
                    content_seed_product = seed

        user_category_affinity = (
            self
            ._get_user_category_affinity_scores(
                user_id
            )
        )

        user_category_ids = (
            set(
                user_category_affinity
                .keys()
            )
        )

        user_brands = (
            self
            ._get_user_brand_names(
                user_id
            )
        )

        returned_brands = (
            self
            ._get_user_quality_returned_brands(
                user_id
            )
        )

        # ------------------------------------------------------------------
        # NEW:
        # One database query calculates click-rate scores for all candidates.
        # ------------------------------------------------------------------

        candidate_ids = [
            product.id
            for product,
            _
            in candidates
        ]

        click_rate_scores = (
            self
            ._get_product_click_rate_scores(
                candidate_ids
            )
        )

        # CLICK is deliberately excluded from engagement.
        user_engagement = (
            self
            ._get_user_engagement(
                user_id
            )
        )

        search_terms = (
            _collect_search_terms(
                self.db,
                user_id,
            )
        )

        current_month = (
            datetime.utcnow().month
        )

        results: List[
            ScoredProduct
        ] = []

        for (
            product,
            source,
        ) in candidates:

            scored_product = (
                ScoredProduct(
                    product=product,
                    source=source,
                )
            )

            # Content
            scored_product.content_score = (
                self
                ._compute_content_score(
                    product,
                    content_seed_product,
                    source,
                )
            )

            # Collaborative
            scored_product.collab_score = (
                collaborative_model
                .get_collaborative_score(
                    user_id,
                    product.id,
                )
            )

            # Trending
            scored_product.trend_score = (
                self
                ._compute_trend_score(
                    product
                )
            )

            # Seasonal
            scored_product.seasonal_boost = (
                self
                ._compute_seasonal_boost(
                    product,
                    current_month,
                )
            )

            # Location
            if (
                _valid_coordinate_pair(
                    self.config.user_latitude,
                    self.config.user_longitude,
                )
                or self.config.user_city_id
                or self.config.user_state_id
            ):
                (
                    location_score,
                    seller_distance_km,
                    nearby_seller,
                ) = self._compute_location_features(product)

                scored_product.location_boost = location_score
                scored_product.seller_distance_km = seller_distance_km
                scored_product.nearby_seller = nearby_seller

            # Category
            if (
                product.categoryId
                and product.categoryId
                in user_category_affinity
            ):
                scored_product.category_boost = (
                    user_category_affinity[
                        product.categoryId
                    ]
                )

            # Brand
            scored_product.brand_boost = (
                self
                ._compute_brand_boost(
                    product,
                    user_brands,
                    returned_brands,
                )
            )

            # Rating
            scored_product.rating_score = (
                self
                ._compute_rating_score(
                    product
                )
            )

            # Seller
            scored_product.seller_boost = (
                self
                ._compute_seller_boost(
                    product
                )
            )

            # --------------------------------------------------------------
            # NEW CLICK-RATE FEATURE
            # --------------------------------------------------------------

            scored_product.click_rate_score = (
                click_rate_scores.get(
                    product.id,
                    0.0,
                )
            )

            # Engagement
            scored_product.engagement_score = (
                self
                ._compute_engagement_score(
                    product,
                    user_engagement,
                    search_terms,
                )
            )

            results.append(
                scored_product
            )

        return results


    def _compute_content_score(
        self,
        product: Product,
        seed: Optional[Product],
        source: str = "unknown",
    ) -> float:

        if (
            seed is None
            or seed.embedding is None
            or product.embedding is None
        ):
            return 0.50

        return (
            self
            ._SOURCE_CONTENT_SCORES
            .get(
                source,
                0.50,
            )
        )


    def _compute_trend_score(
        self,
        product: Product,
    ) -> float:

        popularity = (
            getattr(
                product,
                "popularity",
                0.0,
            )
            or 0.0
        )

        return (
            1.0
            - math.exp(
                -popularity
                * 2.0
            )
        )


    def _compute_seasonal_boost(
        self,
        product: Product,
        month: int,
    ) -> float:

        season_keywords = (
            SEASONAL_MAP.get(
                month,
                {},
            )
        )

        if not season_keywords:
            return 0.0

        product_terms: Set[
            str
        ] = set()

        for tag in (
            product.tags
            or []
        ):
            product_terms.add(
                tag.lower().strip()
            )

        for material in (
            product.materials
            or []
        ):
            product_terms.add(
                material
                .lower()
                .strip()
            )

        if product.craftType:
            product_terms.add(
                product
                .craftType
                .lower()
                .strip()
            )

        if product.name:

            for word in (
                product
                .name
                .lower()
                .split()
            ):
                product_terms.add(
                    word.strip()
                )

        boost = 0.0

        for (
            keyword,
            weight,
        ) in season_keywords.items():

            if keyword in product_terms:

                boost += weight

        return min(
            boost,
            0.50,
        )


    def _compute_location_features(
        self,
        product: Product,
    ) -> Tuple[float, Optional[float], bool]:
        """
        Compute the continuous distance-based location score.

        Precise coordinates are preferred. City/state matching remains as a
        fallback for sellers that have not yet been geocoded.
        """

        seller = getattr(product, "seller", None)

        if seller is None:
            return 0.0, None, False

        if (
            _valid_coordinate_pair(
                self.config.user_latitude,
                self.config.user_longitude,
            )
            and _valid_coordinate_pair(
                getattr(seller, "latitude", None),
                getattr(seller, "longitude", None),
            )
        ):
            distance_km = haversine_distance_km(
                float(self.config.user_latitude),
                float(self.config.user_longitude),
                float(seller.latitude),
                float(seller.longitude),
            )

            score = distance_location_score(
                distance_km,
                self.config.distance_decay_km,
            )

            is_nearby = (
                distance_km
                <= max(0.0, self.config.nearby_radius_km)
            )

            return score, distance_km, is_nearby

        # Coordinate fallback keeps the pre-existing behaviour meaningful while
        # sellers are progressively backfilled with precise coordinates.
        if (
            self.config.user_city_id
            and getattr(seller, "cityId", None)
            == self.config.user_city_id
        ):
            return 0.75, None, True

        if (
            self.config.user_state_id
            and getattr(seller, "stateId", None)
            == self.config.user_state_id
        ):
            return 0.40, None, False

        return 0.0, None, False


    def _compute_location_boost(
        self,
        product: Product,
    ) -> float:
        """Backward-compatible wrapper retained for existing tests/callers."""

        score, _, _ = self._compute_location_features(product)
        return score


    def _compute_rating_score(
        self,
        product: Product,
    ) -> float:

        average_rating = (
            getattr(
                product,
                "averageRating",
                None,
            )
            or 0.0
        )

        reviews_count = (
            getattr(
                product,
                "reviewsCount",
                0,
            )
            or 0
        )

        if reviews_count == 0:
            return 0.5

        return min(
            1.0,
            average_rating
            / 5.0,
        )


    def _compute_seller_boost(
        self,
        product: Product,
    ) -> float:

        boost = 0.0

        if product.seller:

            if product.seller.isNewSeller:
                boost += 0.15

            if (
                getattr(
                    product.seller,
                    "rating",
                    0.0,
                )
                >= 4.5
            ):
                boost += 0.05

        return boost


    def _load_recent_views(
        self,
        user_id: str,
    ) -> List[ProductView]:

        return (
            self.db
            .query(
                ProductView
            )
            .filter(
                ProductView.userId
                == user_id
            )
            .order_by(
                ProductView
                .createdAt
                .desc()
            )
            .limit(10)
            .all()
        )


    def _get_user_category_affinity_scores(
        self,
        user_id: str,
    ) -> Dict[str, float]:
        category_weights: Dict[str, float] = {}

        # 1. UserBehaviour
        behaviour_events = (
            self.db.query(
                UserBehaviour.categoryId,
                UserBehaviour.eventType,
            )
            .filter(
                UserBehaviour.userId == user_id,
                UserBehaviour.categoryId.isnot(None),
            )
            .all()
        )
        for cat_id, event_type in behaviour_events:
            w = ENGAGEMENT_EVENT_WEIGHTS.get(event_type, 0.3)
            category_weights[cat_id] = category_weights.get(cat_id, 0.0) + w

        # 2. ClickEvent
        click_rows = (
            self.db.query(ClickEvent.categoryId)
            .filter(
                ClickEvent.userId == user_id,
                ClickEvent.categoryId.isnot(None),
            )
            .all()
        )
        for row in click_rows:
            category_weights[row[0]] = category_weights.get(row[0], 0.0) + 0.3

        # 3. ProductView
        view_rows = (
            self.db.query(ProductView.categoryId)
            .filter(
                ProductView.userId == user_id,
                ProductView.categoryId.isnot(None),
            )
            .all()
        )
        for row in view_rows:
            category_weights[row[0]] = category_weights.get(row[0], 0.0) + 0.3

        # 4. OrderItem
        order_rows = (
            self.db.query(OrderItem.categoryId)
            .join(Order, Order.id == OrderItem.orderId)
            .filter(
                Order.userId == user_id,
                OrderItem.categoryId.isnot(None),
            )
            .all()
        )
        for row in order_rows:
            category_weights[row[0]] = category_weights.get(row[0], 0.0) + 1.0

        # 5. CartItem
        cart_rows = (
            self.db.query(CartItem.categoryId)
            .filter(
                CartItem.userId == user_id,
                CartItem.categoryId.isnot(None),
            )
            .all()
        )
        for row in cart_rows:
            category_weights[row[0]] = category_weights.get(row[0], 0.0) + 0.8

        # 6. Wishlist
        wishlist_rows = (
            self.db.query(Wishlist.categoryId)
            .filter(
                Wishlist.userId == user_id,
                Wishlist.categoryId.isnot(None),
            )
            .all()
        )
        for row in wishlist_rows:
            category_weights[row[0]] = category_weights.get(row[0], 0.0) + 0.6

        # 7. Rating
        rating_rows = (
            self.db.query(Rating.categoryId)
            .filter(
                Rating.userId == user_id,
                Rating.categoryId.isnot(None),
            )
            .all()
        )
        for row in rating_rows:
            category_weights[row[0]] = category_weights.get(row[0], 0.0) + 0.5

        if not category_weights:
            return {}

        max_w = max(category_weights.values(), default=1.0)
        return {
            cat_id: min(1.0, w / max_w)
            for cat_id, w in category_weights.items()
        }

    def _get_user_category_ids(
        self,
        user_id: str,
    ) -> Set[str]:
        return set(
            self._get_user_category_affinity_scores(user_id).keys()
        )


    def _get_user_brand_names(
        self,
        user_id: str,
    ) -> Set[str]:

        rows = (
            self.db
            .query(
                Product.brand
            )
            .join(
                UserBehaviour,

                UserBehaviour.productId
                == Product.id,
            )
            .filter(
                UserBehaviour.userId
                == user_id,

                Product.brand
                .isnot(None),
            )
            .distinct()
            .all()
        )

        return {
            row.brand
            for row in rows
            if row.brand
        }


    def _get_user_quality_returned_brands(
        self,
        user_id: str,
    ) -> Set[str]:

        events = (
            self.db
            .query(
                UserBehaviour
            )
            .filter(
                UserBehaviour.userId
                == user_id,

                UserBehaviour.eventType
                == EVENT_RETURN,

                UserBehaviour.productId
                .isnot(None),
            )
            .all()
        )

        brands: Set[str] = set()

        for event in events:

            metadata = (
                event.eventMetadata
                or {}
            )

            if not metadata.get(
                "qualityIssue"
            ):
                continue

            if (
                event.product
                and event.product.brand
            ):
                brands.add(
                    event.product.brand
                )

        return brands


    def _compute_brand_boost(
        self,
        product: Product,
        user_brands: Set[str],
        returned_brands: Set[str],
    ) -> float:

        brand = getattr(
            product,
            "brand",
            None,
        )

        if not brand:
            return 0.0

        if (
            returned_brands
            and brand
            in returned_brands
        ):
            return -0.50

        if (
            user_brands
            and brand
            in user_brands
        ):
            return 0.50

        return 0.0


    # ======================================================================
    # NEW CLICK-RATE CALCULATION
    # ======================================================================

    def _get_product_click_rate_scores(
        self,
        product_ids: List[str],
    ) -> Dict[str, float]:
        """
        Calculate a 0-to-1 click-rate score for candidate products using
        ProductClickHistory from ONLY the latest seven days.

        IMPORTANT:
        ---------
        This is currently "click velocity", not true CTR.

        True CTR requires:

            clicks / recommendation impressions

        The existing project does not reliably store impressions yet.

        For now:

            click_rate =
                number_of_clicks_in_last_7_days
                / 7

        Then candidates are log-normalised:

            score =
                log(1 + product_click_rate)
                /
                log(1 + maximum_candidate_click_rate)

        This keeps the final score between 0 and 1 and prevents a highly
        popular product from dominating linearly.
        """

        if not product_ids:
            return {}

        cutoff = (
            datetime.utcnow()
            - timedelta(
                days=
                    CLICK_RATE_WINDOW_DAYS
            )
        )

        rows = (
            self.db
            .query(
                ProductClickHistory.productId,

                func.count(
                    ProductClickHistory.id
                ).label(
                    "click_count"
                ),
            )
            .filter(
                ProductClickHistory.productId.in_(
                    product_ids
                ),

                ProductClickHistory.createdAt
                >= cutoff,
            )
            .group_by(
                ProductClickHistory.productId
            )
            .all()
        )

        click_counts: Dict[
            str,
            int,
        ] = {
            row.productId:
                int(
                    row.click_count
                )

            for row
            in rows
        }

        if not click_counts:
            return {}

        rates_per_day: Dict[
            str,
            float,
        ] = {
            product_id:
                click_count
                / float(
                    CLICK_RATE_WINDOW_DAYS
                )

            for (
                product_id,
                click_count,
            )
            in click_counts.items()
        }

        max_rate = max(
            rates_per_day.values(),
            default=0.0,
        )

        if max_rate <= 0.0:
            return {}

        denominator = (
            math.log1p(
                max_rate
            )
        )

        if denominator <= 0.0:
            return {}

        result: Dict[
            str,
            float,
        ] = {}

        for (
            product_id,
            rate,
        ) in rates_per_day.items():

            score = (
                math.log1p(
                    rate
                )
                / denominator
            )

            result[
                product_id
            ] = min(
                1.0,
                max(
                    0.0,
                    score,
                ),
            )

        return result


    # ======================================================================
    # ENGAGEMENT
    # ======================================================================

    def _get_user_engagement(
        self,
        user_id: str,
    ) -> Dict[str, float]:

        events = (
            self.db
            .query(
                UserBehaviour
            )
            .filter(
                UserBehaviour.userId
                == user_id,

                UserBehaviour.productId
                .isnot(None),
            )
            .order_by(
                UserBehaviour
                .createdAt
                .desc()
            )
            .limit(300)
            .all()
        )

        now = datetime.utcnow()

        scores: Dict[
            str,
            float,
        ] = {}

        for event in events:

            base = (
                ENGAGEMENT_EVENT_WEIGHTS
                .get(
                    event.eventType,
                    0.0,
                )
            )

            if base == 0.0:
                continue

            if (
                event.eventType
                in ENGAGEMENT_NEGATIVE_ACTIONS
            ):

                action = (
                    event.eventMetadata
                    or {}
                ).get(
                    "action",
                    "add",
                )

                if action == "remove":

                    base = (
                        ENGAGEMENT_NEGATIVE_ACTIONS[
                            event.eventType
                        ]
                    )

            age_days = 0.0

            if event.createdAt:

                age_days = max(
                    0.0,

                    (
                        now
                        - event.createdAt
                    ).total_seconds()
                    / 86400.0,
                )

            decay = (
                0.5
                ** (
                    age_days
                    / ENGAGEMENT_DECAY_HALFLIFE_DAYS
                )
            )

            scores[
                event.productId
            ] = (
                scores.get(
                    event.productId,
                    0.0,
                )
                + base
                * decay
            )

        return scores


    @staticmethod
    def _compute_engagement_score(
        product: Product,
        user_engagement: Dict[
            str,
            float,
        ],
        search_terms: Set[str],
    ) -> float:

        raw = (
            user_engagement.get(
                product.id,
                0.0,
            )
        )

        event_component = (
            1.0
            - math.exp(
                -raw
                / 1.5
            )
        )

        search_component = 0.0

        if search_terms:

            vocabulary: Set[
                str
            ] = set()

            for tag in (
                product.tags
                or []
            ):
                vocabulary.add(
                    tag
                    .lower()
                    .strip()
                )

            for material in (
                product.materials
                or []
            ):
                vocabulary.add(
                    material
                    .lower()
                    .strip()
                )

            if product.name:

                vocabulary.update(
                    word
                    .strip()
                    .lower()

                    for word
                    in product
                    .name
                    .split()
                )

            if product.brand:

                vocabulary.add(
                    product
                    .brand
                    .lower()
                    .strip()
                )

            matches = sum(
                1

                for term
                in search_terms

                if term
                in vocabulary
            )

            if matches:

                search_component = min(
                    SEARCH_AFFINITY_MAX,

                    0.12
                    * matches,
                )

        return min(
            1.0,

            max(
                -0.5,

                event_component
                + search_component,
            ),
        )


# ===========================================================================
# STAGE 3
# SCORE BLENDING
# ===========================================================================

class ScoreBlender:

    def __init__(
        self,
        weights: Dict[
            str,
            float,
        ],
    ):
        total = sum(
            weights.values()
        )

        if total <= 0:
            raise ValueError(
                "Weights must sum to a positive value."
            )

        self.weights = {
            key:
                value
                / total

            for (
                key,
                value,
            )
            in weights.items()
        }


    def blend(
        self,
        candidates: List[
            ScoredProduct
        ],
    ) -> List[
        ScoredProduct
    ]:

        weights = (
            self.weights
        )

        for scored_product in (
            candidates
        ):

            blended = (
                weights.get(
                    "content",
                    0.0,
                )
                * scored_product.content_score

                + weights.get(
                    "collaborative",
                    0.0,
                )
                * scored_product.collab_score

                + weights.get(
                    "trending",
                    0.0,
                )
                * scored_product.trend_score

                + weights.get(
                    "seasonal",
                    0.0,
                )
                * scored_product.seasonal_boost

                + weights.get(
                    "location",
                    0.0,
                )
                * scored_product.location_boost

                + weights.get(
                    "category_affinity",
                    0.0,
                )
                * scored_product.category_boost

                + weights.get(
                    "brand_affinity",
                    0.0,
                )
                * scored_product.brand_boost

                + weights.get(
                    "rating",
                    0.0,
                )
                * scored_product.rating_score

                + weights.get(
                    "seller_freshness",
                    0.0,
                )
                * scored_product.seller_boost

                # ----------------------------------------------------------
                # NEW
                # ----------------------------------------------------------
                + weights.get(
                    "click_rate",
                    0.0,
                )
                * scored_product.click_rate_score

                + weights.get(
                    "engagement",
                    0.0,
                )
                * scored_product.engagement_score
            )

            scored_product.final_score = max(
                0.0,

                min(
                    1.0,
                    blended,
                ),
            )

        return candidates


# ===========================================================================
# STAGE 4
# BUSINESS RULES
# ===========================================================================

class BusinessRuleFilter:

    def __init__(
        self,
        db: Session,
        config: EngineConfig,
    ):
        self.db = db

        self.config = config


    def apply(
        self,
        scored: List[
            ScoredProduct
        ],
        user_id: str,
    ) -> List[
        ScoredProduct
    ]:

        if not scored:
            return scored

        # ------------------------------------------------------------------
        # RATING
        # ------------------------------------------------------------------

        if (
            self.config.min_rating
            > 0
        ):

            scored = [
                scored_product

                for scored_product
                in scored

                if (
                    getattr(
                        scored_product.product,
                        "averageRating",
                        0.0,
                    )
                    or 0.0
                )
                >= self.config.min_rating
            ]

        # ------------------------------------------------------------------
        # INVENTORY
        # ------------------------------------------------------------------

        if (
            self.config.min_inventory
            > 0
        ):

            scored = [
                scored_product

                for scored_product
                in scored

                if (
                    getattr(
                        scored_product.product,
                        "inventory",
                        0,
                    )
                    or 0
                )
                >= self.config.min_inventory
            ]

        # ------------------------------------------------------------------
        # PURCHASE EXCLUSION
        # ------------------------------------------------------------------

        purchased_ids = (
            self
            ._get_purchased_product_ids(
                user_id
            )
        )

        if purchased_ids:

            scored = [
                scored_product

                for scored_product
                in scored

                if (
                    scored_product
                    .product
                    .id
                    not in purchased_ids
                )
            ]

        # ------------------------------------------------------------------
        # RECENT VIEW EXCLUSION
        # ------------------------------------------------------------------

        recently_viewed_ids = (
            self
            ._get_recently_viewed_ids(
                user_id,

                hours=
                    self
                    .config
                    .recent_view_window_hours,
            )
        )

        if recently_viewed_ids:

            scored = [
                scored_product

                for scored_product
                in scored

                if (
                    scored_product
                    .product
                    .id
                    not in recently_viewed_ids
                )
            ]

        scored.sort(
            key=lambda scored_product:
                scored_product.final_score,

            reverse=True,
        )

        # ------------------------------------------------------------------
        # SELLER FAIRNESS
        # ------------------------------------------------------------------

        config = (
            get_config(
                self.db
            )
        )

        products_with_scores: List[
            Product
        ] = []

        for scored_product in scored:

            product = (
                scored_product.product
            )

            product.final_score = (
                scored_product.final_score
            )

            products_with_scores.append(
                product
            )

        fair_products = fair_rank(
            products_with_scores,

            total_slots=
                self.config.total_slots,

            boost_amount=
                config.boost_amount,

            new_seller_ratio=
                config.new_seller_ratio,

            max_per_seller_ratio=
                config.max_per_seller_ratio,

            attribute=
                "final_score",

            penalty_weight=
                CANCEL_PENALTY_WEIGHT,
        )

        scored_map = {
            scored_product.product.id:
                scored_product

            for scored_product
            in scored
        }

        final_after_fairness: List[
            ScoredProduct
        ] = []

        for product in fair_products:

            scored_product = (
                scored_map.get(
                    product.id
                )
            )

            if not scored_product:
                continue

            scored_product.final_score = (
                getattr(
                    product,
                    "final_score",
                    scored_product.final_score,
                )
            )

            final_after_fairness.append(
                scored_product
            )

        # Keep the full (pre-fairness) list so location-matched products
        # can be re-inserted after ranking trims them out.
        all_scored = list(scored)

        final = (
            self
            ._apply_category_diversity_cap(
                final_after_fairness
            )
        )

        # Local-seller slot reservation
        if (
            self.config.local_slots > 0
            and (
                _valid_coordinate_pair(
                    self.config.user_latitude,
                    self.config.user_longitude,
                )
                or self.config.user_city_id
                or self.config.user_state_id
            )
        ):
            final = self._reserve_local_slots(final, all_scored)

        return final


    def _reserve_local_slots(
        self,
        final: List[ScoredProduct],
        pool: List[ScoredProduct],
    ) -> List[ScoredProduct]:
        """Guarantee nearby/same-city products survive diversity/fairness trimming."""

        if not final:
            return final

        def is_local(sp: ScoredProduct) -> bool:
            return bool(
                getattr(
                    sp,
                    "nearby_seller",
                    False,
                )
                or (
                    getattr(
                        sp,
                        "seller_distance_km",
                        None,
                    ) is None
                    and sp.location_boost > 0
                )
            )

        locals_by_score = sorted(
            (sp for sp in pool if is_local(sp)),
            key=lambda sp: sp.final_score,
            reverse=True,
        )

        if not locals_by_score:
            return final

        target_len = len(final)
        final_ids = {sp.product.id for sp in final}
        existing_local = [sp for sp in final if is_local(sp)]

        required_total = min(
            self.config.local_slots,
            target_len,
        )

        need = max(
            0,
            required_total - len(existing_local),
        )

        if need == 0:
            return final

        missing = [
            sp
            for sp in locals_by_score
            if sp.product.id not in final_ids
        ][:need]

        if not missing:
            return final

        remove_count = len(missing)
        non_local = sorted(
            (sp for sp in final if not is_local(sp)),
            key=lambda sp: sp.final_score,
        )

        remove_ids = {
            sp.product.id
            for sp in non_local[:remove_count]
        }

        kept = [
            sp
            for sp in final
            if sp.product.id not in remove_ids
        ]

        kept.extend(missing)
        kept.sort(
            key=lambda sp: sp.final_score,
            reverse=True,
        )

        return kept[:target_len]

    def _get_purchased_product_ids(
        self,
        user_id: str,
    ) -> Set[str]:

        from app.models import (
            Order,
            OrderItem,
        )

        order_ids = (
            self.db
            .query(
                Order.id
            )
            .filter(
                Order.userId
                == user_id
            )
            .subquery()
        )

        purchased = (
            self.db
            .query(
                OrderItem.productId
            )
            .filter(
                OrderItem.orderId.in_(
                    order_ids
                )
            )
            .distinct()
            .all()
        )

        return {
            row.productId

            for row
            in purchased

            if row.productId
        }


    def _get_recently_viewed_ids(
        self,
        user_id: str,
        hours: int = 48,
    ) -> Set[str]:

        cutoff = (
            datetime.utcnow()
            - timedelta(
                hours=hours
            )
        )

        recent = (
            self.db
            .query(
                ProductView.productId
            )
            .filter(
                ProductView.userId
                == user_id,

                ProductView.createdAt
                >= cutoff,
            )
            .distinct()
            .all()
        )

        return {
            row.productId

            for row
            in recent

            if row.productId
        }


    def _apply_category_diversity_cap(
        self,
        scored: List[
            ScoredProduct
        ],
    ) -> List[
        ScoredProduct
    ]:

        if not scored:
            return []

        max_per_category = max(
            1,

            math.ceil(
                len(scored)
                * self
                .config
                .max_per_category
            ),
        )

        category_counts: Dict[
            str,
            int,
        ] = {}

        filtered: List[
            ScoredProduct
        ] = []

        scored_sorted = sorted(
            scored,

            key=lambda scored_product:
                scored_product.final_score,

            reverse=True,
        )

        for scored_product in (
            scored_sorted
        ):

            category_id = (
                scored_product
                .product
                .categoryId

                or "__none__"
            )

            current_count = (
                category_counts.get(
                    category_id,
                    0,
                )
            )

            if (
                current_count
                >= max_per_category
            ):
                continue

            category_counts[
                category_id
            ] = (
                current_count
                + 1
            )

            filtered.append(
                scored_product
            )

        return filtered


# ===========================================================================
# STAGE 5
# RANKING
# ===========================================================================

class RankerSelector:

    def __init__(
        self,
        total_slots: int,
        config: Optional[EngineConfig] = None,
    ):
        self.total_slots = (
            total_slots
        )

        self.config = config


    def select(
        self,
        scored: List[
            ScoredProduct
        ],
    ) -> List[
        ScoredProduct
    ]:

        if not scored:
            return []

        scored.sort(
            key=lambda scored_product:
                scored_product.final_score,

            reverse=True,
        )

        # Location-priority re-ranking. The nearest qualified products receive
        # a small, bounded number of top slots; the rest of the list continues
        # to follow the full recommendation score. This satisfies nearby-first
        # UX without turning the entire recommender into a distance-only sort.
        if (
            self.config is not None
            and _valid_coordinate_pair(
                self.config.user_latitude,
                self.config.user_longitude,
            )
            and self.config.location_priority_slots > 0
        ):
            priority_candidates = [
                sp
                for sp in scored
                if sp.nearby_seller
                and sp.seller_distance_km is not None
                and sp.final_score
                >= self.config.location_priority_min_score
            ]

            priority_candidates.sort(
                key=lambda sp: (
                    sp.seller_distance_km,
                    -sp.final_score,
                )
            )

            priority = priority_candidates[
                : min(
                    self.config.location_priority_slots,
                    self.total_slots,
                )
            ]

            priority_ids = {
                sp.product.id
                for sp in priority
            }

            for sp in priority:
                sp.location_priority_applied = True

            remainder = [
                sp
                for sp in scored
                if sp.product.id not in priority_ids
            ]

            ranked = priority + remainder
        else:
            ranked = scored

        top = (
            ranked[
                :self.total_slots
            ]
        )

        for scored_product in top:

            scored_product.explanation = (
                self
                ._build_explanation(
                    scored_product
                )
            )

        return top


    @staticmethod
    def _build_explanation(
        scored_product: ScoredProduct,
    ) -> str:

        signals: List[
            Tuple[
                float,
                str,
                str,
            ]
        ] = [
            (
                scored_product.content_score,
                "content",
                "Similar to what you viewed.",
            ),

            (
                scored_product.collab_score,
                "collaborative",
                "Customers like you also liked this.",
            ),

            (
                scored_product.trend_score,
                "trending",
                "Trending among customers.",
            ),

            (
                scored_product.seasonal_boost,
                "seasonal",
                "Perfect for this season.",
            ),

            (
                scored_product.location_boost,
                "location",
                (
                    f"Nearby seller — {scored_product.seller_distance_km:.1f} km away."
                    if scored_product.seller_distance_km is not None
                    else "From a seller near you."
                ),
            ),

            (
                scored_product.category_boost,
                "category",
                "From a category you love.",
            ),

            (
                scored_product.rating_score,
                "rating",
                "Highly rated by customers.",
            ),

            (
                scored_product.seller_boost,
                "seller",
                "From a top-rated artisan.",
            ),

            # --------------------------------------------------------------
            # NEW
            # --------------------------------------------------------------
            (
                scored_product.click_rate_score,
                "click_rate",
                "Getting more product clicks this week.",
            ),
        ]

        if (
            scored_product.engagement_score
            > 0.01
        ):

            signals.append(
                (
                    scored_product
                    .engagement_score,

                    "engagement",

                    (
                        "From your recent activity "
                        "(cart, wishlist, views, searches)."
                    ),
                )
            )

        if (
            scored_product.source
            == "new_arrivals"
        ):
            return (
                "Discover a new artisan on UdrCrafts."
            )

        if (
            scored_product.source
            == "random_discovery"
        ):
            return (
                "Something new you might like."
            )

        best_signal = max(
            signals,

            key=lambda signal:
                signal[0],
        )

        score = (
            best_signal[0]
        )

        explanation = (
            best_signal[2]
        )

        if (
            score <= 0.01
            and scored_product.source
            == "trending"
        ):
            return (
                "Popular among customers recently."
            )

        if score <= 0.01:
            return (
                "Recommended for you."
            )

        return explanation


# ===========================================================================
# RECOMMENDATION ENGINE
# ===========================================================================

class RecommendationEngine:

    def __init__(
        self,
        db: Session,
    ):
        self.db = db


    def recommend(
        self,
        user_id: str,
        *,
        limit: int = 20,
        user_location: Optional[str] = None,
        user_city_id: Optional[str] = None,
        user_state_id: Optional[str] = None,
        user_latitude: Optional[float] = None,
        user_longitude: Optional[float] = None,
        weights: Optional[
            Dict[
                str,
                float,
            ]
        ] = None,
        include_random: bool = True,
        **rule_overrides,
    ) -> List[
        ScoredProduct
    ]:

        merged_weights = dict(
            DEFAULT_WEIGHTS
        )

        if weights:

            merged_weights.update(
                weights
            )

        config = EngineConfig(
            weights=
                merged_weights,

            total_slots=
                limit,

            include_random=
                include_random,

            user_location=
                user_location,

            user_city_id=
                user_city_id,

            user_state_id=
                user_state_id,

            user_latitude=
                user_latitude,

            user_longitude=
                user_longitude,

            **rule_overrides,
        )

        # ------------------------------------------------------------------
        # STAGE 1
        # ------------------------------------------------------------------

        generator = (
            CandidateGenerator(
                self.db,
                config,
            )
        )

        candidates = (
            generator.generate(
                user_id
            )
        )

        # ------------------------------------------------------------------
        # STAGE 2
        # ------------------------------------------------------------------

        computer = (
            FeatureComputer(
                self.db,
                config,
            )
        )

        scored = (
            computer.compute(
                candidates,
                user_id,
            )
        )

        # ------------------------------------------------------------------
        # STAGE 3
        # ------------------------------------------------------------------

        blender = (
            ScoreBlender(
                config.weights
            )
        )

        scored = (
            blender.blend(
                scored
            )
        )

        # ------------------------------------------------------------------
        # STAGE 4
        # ------------------------------------------------------------------

        rule_filter = (
            BusinessRuleFilter(
                self.db,
                config,
            )
        )

        scored = (
            rule_filter.apply(
                scored,
                user_id,
            )
        )

        # ------------------------------------------------------------------
        # STAGE 5
        # ------------------------------------------------------------------

        selector = (
            RankerSelector(
                config.total_slots,
                config=config,
            )
        )

        final = (
            selector.select(
                scored
            )
        )

        logger.info(
            (
                "RecommendationEngine: "
                "user=%s -> "
                "%d recommendations "
                "from %d candidates."
            ),
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
    ) -> List[
        ScoredProduct
    ]:

        similar_products = (
            get_similar_products(
                product_id,
                self.db,
                limit=limit,
            )
        )

        if not similar_products:
            return []

        scored = [
            ScoredProduct(
                product=product,
                content_score=1.0,
                source="content_based",
            )

            for product
            in similar_products
        ]

        if user_id:

            config = EngineConfig(
                total_slots=limit
            )

            computer = (
                FeatureComputer(
                    self.db,
                    config,
                )
            )

            scored = (
                computer.compute(
                    [
                        (
                            scored_product.product,
                            scored_product.source,
                        )

                        for scored_product
                        in scored
                    ],
                    user_id,
                )
            )

            blender = (
                ScoreBlender(
                    config.weights
                )
            )

            scored = (
                blender.blend(
                    scored
                )
            )

            rule_filter = (
                BusinessRuleFilter(
                    self.db,
                    config,
                )
            )

            scored = (
                rule_filter.apply(
                    scored,
                    user_id,
                )
            )

        selector = (
            RankerSelector(
                limit
            )
        )

        return (
            selector.select(
                scored
            )
        )


# ===========================================================================
# CONVENIENCE FUNCTION
# ===========================================================================

def get_recommendations(
    db: Session,
    user_id: str,
    *,
    limit: int = 20,
    user_location: Optional[str] = None,
    **kwargs,
) -> List[
    ScoredProduct
]:

    engine = (
        RecommendationEngine(
            db
        )
    )

    return (
        engine.recommend(
            user_id,
            limit=limit,
            user_location=user_location,
            **kwargs,
        )
    )