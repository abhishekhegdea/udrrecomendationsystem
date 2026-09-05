"""
Dynamic recommendation weights learned from Learning-to-Rank feature importance.

The serving path intentionally keeps the existing recommendation architecture:

    candidate generation
        -> raw recommendation features
        -> dynamic per-user-segment weights
        -> weighted blending
        -> business rules / fairness
        -> final ranking

A LightGBM/XGBoost ranker is trained offline from historical recommendation
snapshots and downstream user actions.  At serving time we use the ranker's
learned *gain feature importance* to update the feature weights.  This keeps
all 12 contributions fully auditable in RecommendationScoreSnapshot while
still allowing the system to learn which signals matter most.

If no trained model exists yet, the engine safely falls back to segment-aware
priors for NEW, ACTIVE, and RETURNING users.  Once a model is trained, learned
importance is blended with the segment prior and becomes the live weight set.
"""

from __future__ import annotations

import json
import os

from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, Mapping, Optional, Tuple

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import ClickEvent, Order, UserBehaviour


# ---------------------------------------------------------------------------
# Feature contract
# ---------------------------------------------------------------------------

LTR_FEATURE_KEYS: Tuple[str, ...] = (
    "content",
    "collaborative",
    "trending",
    "seasonal",
    "location",
    "category_affinity",
    "brand_affinity",
    "rating",
    "seller_freshness",
    "click_rate",
    "user_click_affinity",
    "engagement",
    "price_affinity",
    "price_behavior",
)


# Feature-contract version. In CTR v6 the existing ``click_rate`` key changed
# from click-volume popularity to true recommendation CTR. Model bundles from
# v5 must therefore never supply learned importance to v6 serving.
CTR_ALGORITHM_VERSION = "personalized-click-location-dynamic-ltr-ctr-v6"


USER_SEGMENT_NEW = "new"
USER_SEGMENT_ACTIVE = "active"
USER_SEGMENT_RETURNING = "returning"
USER_SEGMENTS: Tuple[str, ...] = (
    USER_SEGMENT_NEW,
    USER_SEGMENT_ACTIVE,
    USER_SEGMENT_RETURNING,
)


# Multipliers are deliberately moderate.  They are priors, not final weights.
# The result is normalized to 1.0 after applying the multipliers.
SEGMENT_WEIGHT_MULTIPLIERS: Dict[str, Dict[str, float]] = {
    USER_SEGMENT_NEW: {
        "content": 1.15,
        "collaborative": 0.35,
        "trending": 1.35,
        "seasonal": 1.10,
        "location": 1.20,
        "category_affinity": 0.55,
        "brand_affinity": 0.55,
        "rating": 1.25,
        "seller_freshness": 1.20,
        "click_rate": 1.35,
        "user_click_affinity": 0.25,
        "engagement": 0.85,
        "price_affinity": 0.50,
        # New users have little price-behaviour evidence; keep the signal low.
        "price_behavior": 0.50,
    },
    USER_SEGMENT_ACTIVE: {
        "content": 1.05,
        "collaborative": 1.20,
        "trending": 0.85,
        "seasonal": 0.85,
        "location": 0.95,
        "category_affinity": 1.15,
        "brand_affinity": 1.15,
        "rating": 0.85,
        "seller_freshness": 0.80,
        "click_rate": 0.90,
        "user_click_affinity": 1.30,
        "engagement": 1.25,
        "price_affinity": 1.20,
        "price_behavior": 1.20,
    },
    USER_SEGMENT_RETURNING: {
        "content": 1.10,
        "collaborative": 0.95,
        "trending": 1.15,
        "seasonal": 1.05,
        "location": 1.05,
        "category_affinity": 1.00,
        "brand_affinity": 1.00,
        "rating": 1.05,
        "seller_freshness": 0.95,
        "click_rate": 1.15,
        "user_click_affinity": 0.90,
        "engagement": 1.00,
        "price_affinity": 1.05,
        "price_behavior": 1.05,
    },
}


DEFAULT_MODEL_DIR = (
    Path(__file__).resolve().parents[2]
    / "models"
    / "ltr"
)


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() not in {
        "0",
        "false",
        "no",
        "off",
    }


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


DYNAMIC_LTR_ENABLED = _env_bool(
    "LTR_DYNAMIC_WEIGHTS_ENABLED",
    True,
)

# Weight given to learned feature importance once a trained model exists.
# 0.65 means: 65% learned importance + 35% segment prior.
LTR_IMPORTANCE_BLEND = min(
    1.0,
    max(
        0.0,
        _env_float("LTR_IMPORTANCE_BLEND", 0.65),
    ),
)

LTR_MIN_FEATURE_WEIGHT = max(
    0.0,
    _env_float("LTR_MIN_FEATURE_WEIGHT", 0.01),
)

# Serving will not use an LTR metadata bundle until it was trained with enough
# eligible groups. This prevents small development/synthetic models from
# overriding stable segment priors in production.
LTR_MIN_GLOBAL_GROUPS = max(
    1,
    _env_int("LTR_MIN_GLOBAL_GROUPS", 1000),
)

LTR_MIN_SEGMENT_GROUPS = max(
    1,
    _env_int("LTR_MIN_SEGMENT_GROUPS", 500),
)

NEW_USER_MAX_INTERACTIONS = max(
    0,
    _env_int("LTR_NEW_USER_MAX_INTERACTIONS", 4),
)

ACTIVE_USER_MIN_INTERACTIONS_7D = max(
    1,
    _env_int("LTR_ACTIVE_USER_MIN_INTERACTIONS_7D", 5),
)

ACTIVE_USER_MIN_INTERACTIONS_30D = max(
    1,
    _env_int("LTR_ACTIVE_USER_MIN_INTERACTIONS_30D", 10),
)


@dataclass(frozen=True)
class UserActivityProfile:
    """Small serving-time profile used to choose a ranking segment."""

    segment: str
    lifetime_interactions: int
    recent_interactions_7d: int
    recent_interactions_30d: int
    total_orders: int
    last_activity_at: Optional[datetime]

    def as_dict(self) -> Dict[str, object]:
        return {
            "segment": self.segment,
            "lifetime_interactions": self.lifetime_interactions,
            "recent_interactions_7d": self.recent_interactions_7d,
            "recent_interactions_30d": self.recent_interactions_30d,
            "total_orders": self.total_orders,
            "last_activity_at": (
                self.last_activity_at.isoformat()
                if self.last_activity_at is not None
                else None
            ),
        }


@dataclass(frozen=True)
class DynamicWeightContext:
    """Exact weight decision used for one recommendation request."""

    weights: Dict[str, float]
    user_segment: str
    strategy: str
    ltr_model_version: Optional[str]
    ltr_backend: Optional[str]
    model_source: Optional[str]
    activity_profile: UserActivityProfile


# ---------------------------------------------------------------------------
# Pure weight helpers
# ---------------------------------------------------------------------------

def normalize_weights(
    weights: Mapping[str, float],
    *,
    feature_keys: Tuple[str, ...] = LTR_FEATURE_KEYS,
    floor: float = 0.0,
) -> Dict[str, float]:
    """Return non-negative weights that sum to exactly 1.0."""

    cleaned: Dict[str, float] = {}

    for key in feature_keys:
        try:
            value = float(weights.get(key, 0.0))
        except (TypeError, ValueError):
            value = 0.0

        cleaned[key] = max(float(floor), value, 0.0)

    total = sum(cleaned.values())

    if total <= 0.0:
        equal = 1.0 / float(len(feature_keys))
        return {
            key: equal
            for key in feature_keys
        }

    normalized = {
        key: value / total
        for key, value in cleaned.items()
    }

    # Make the sum numerically stable at 1.0 by assigning any tiny remainder
    # to the largest weight.
    remainder = 1.0 - sum(normalized.values())
    if normalized and abs(remainder) > 1e-15:
        largest = max(normalized, key=normalized.get)
        normalized[largest] += remainder

    return normalized


def apply_segment_prior(
    base_weights: Mapping[str, float],
    segment: str,
) -> Dict[str, float]:
    """Adjust base weights for NEW/ACTIVE/RETURNING behavior, then normalize."""

    normalized_base = normalize_weights(base_weights)

    multipliers = SEGMENT_WEIGHT_MULTIPLIERS.get(
        segment,
        SEGMENT_WEIGHT_MULTIPLIERS[USER_SEGMENT_RETURNING],
    )

    adjusted = {
        key: (
            normalized_base.get(key, 0.0)
            * multipliers.get(key, 1.0)
        )
        for key in LTR_FEATURE_KEYS
    }

    return normalize_weights(adjusted)


def blend_with_learned_importance(
    segment_weights: Mapping[str, float],
    learned_importance: Mapping[str, float],
    *,
    learned_blend: float = LTR_IMPORTANCE_BLEND,
    min_feature_weight: float = LTR_MIN_FEATURE_WEIGHT,
) -> Dict[str, float]:
    """
    Blend segment prior weights with ranker gain importance.

    A floor prevents one training cycle from completely disabling a feature.
    """

    blend = min(1.0, max(0.0, float(learned_blend)))

    prior = normalize_weights(segment_weights)
    learned = normalize_weights(learned_importance)

    combined = {
        key: (
            (1.0 - blend) * prior.get(key, 0.0)
            + blend * learned.get(key, 0.0)
        )
        for key in LTR_FEATURE_KEYS
    }

    return normalize_weights(
        combined,
        floor=min_feature_weight,
    )


# ---------------------------------------------------------------------------
# User segmentation
# ---------------------------------------------------------------------------

def _count_clicks(
    db: Session,
    user_id: str,
    cutoff: Optional[datetime] = None,
) -> int:
    query = db.query(func.count(ClickEvent.id)).filter(
        ClickEvent.userId == user_id
    )
    if cutoff is not None:
        query = query.filter(ClickEvent.createdAt >= cutoff)
    return int(query.scalar() or 0)


def _count_behaviour(
    db: Session,
    user_id: str,
    cutoff: Optional[datetime] = None,
) -> int:
    query = db.query(func.count(UserBehaviour.id)).filter(
        UserBehaviour.userId == user_id
    )
    if cutoff is not None:
        query = query.filter(UserBehaviour.createdAt >= cutoff)
    return int(query.scalar() or 0)


def _last_activity(
    db: Session,
    user_id: str,
) -> Optional[datetime]:
    last_click = (
        db.query(func.max(ClickEvent.createdAt))
        .filter(ClickEvent.userId == user_id)
        .scalar()
    )

    last_behaviour = (
        db.query(func.max(UserBehaviour.createdAt))
        .filter(UserBehaviour.userId == user_id)
        .scalar()
    )

    values = [
        value
        for value in (last_click, last_behaviour)
        if value is not None
    ]

    return max(values) if values else None


def profile_user_activity(
    db: Session,
    user_id: str,
    *,
    now: Optional[datetime] = None,
) -> UserActivityProfile:
    """Classify a user into NEW, ACTIVE, or RETURNING for dynamic weights."""

    now = now or datetime.utcnow()
    cutoff_7d = now - timedelta(days=7)
    cutoff_30d = now - timedelta(days=30)

    lifetime_interactions = (
        _count_clicks(db, user_id)
        + _count_behaviour(db, user_id)
    )

    recent_interactions_7d = (
        _count_clicks(db, user_id, cutoff_7d)
        + _count_behaviour(db, user_id, cutoff_7d)
    )

    recent_interactions_30d = (
        _count_clicks(db, user_id, cutoff_30d)
        + _count_behaviour(db, user_id, cutoff_30d)
    )

    total_orders = int(
        db.query(func.count(Order.id))
        .filter(Order.userId == user_id)
        .scalar()
        or 0
    )

    if (
        lifetime_interactions <= NEW_USER_MAX_INTERACTIONS
        and total_orders == 0
    ):
        segment = USER_SEGMENT_NEW
    elif (
        recent_interactions_7d >= ACTIVE_USER_MIN_INTERACTIONS_7D
        or recent_interactions_30d >= ACTIVE_USER_MIN_INTERACTIONS_30D
    ):
        segment = USER_SEGMENT_ACTIVE
    else:
        segment = USER_SEGMENT_RETURNING

    return UserActivityProfile(
        segment=segment,
        lifetime_interactions=lifetime_interactions,
        recent_interactions_7d=recent_interactions_7d,
        recent_interactions_30d=recent_interactions_30d,
        total_orders=total_orders,
        last_activity_at=_last_activity(db, user_id),
    )


# ---------------------------------------------------------------------------
# Learned-importance metadata loading
# ---------------------------------------------------------------------------

def _read_metadata(path: Path) -> Optional[Dict[str, object]]:
    if not path.is_file():
        return None

    try:
        with path.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except (OSError, json.JSONDecodeError, TypeError, ValueError):
        return None

    if not isinstance(payload, dict):
        return None

    return payload


def _metadata_importance(
    payload: Mapping[str, object],
) -> Optional[Dict[str, float]]:
    raw = payload.get("feature_importance")
    if not isinstance(raw, Mapping):
        return None

    parsed: Dict[str, float] = {}
    for key in LTR_FEATURE_KEYS:
        try:
            parsed[key] = max(0.0, float(raw.get(key, 0.0)))
        except (TypeError, ValueError):
            parsed[key] = 0.0

    if sum(parsed.values()) <= 0.0:
        return None

    return normalize_weights(parsed)


class DynamicWeightResolver:
    """Resolve the exact serving weights for a user."""

    def __init__(
        self,
        *,
        model_dir: Optional[Path] = None,
        enabled: Optional[bool] = None,
        learned_blend: float = LTR_IMPORTANCE_BLEND,
        min_feature_weight: float = LTR_MIN_FEATURE_WEIGHT,
    ):
        self.model_dir = Path(
            model_dir
            or os.getenv("LTR_MODEL_DIR", str(DEFAULT_MODEL_DIR))
        )
        self.enabled = (
            DYNAMIC_LTR_ENABLED
            if enabled is None
            else bool(enabled)
        )
        self.learned_blend = min(
            1.0,
            max(0.0, float(learned_blend)),
        )
        self.min_feature_weight = max(
            0.0,
            float(min_feature_weight),
        )

    def _load_best_metadata(
        self,
        segment: str,
    ) -> Tuple[Optional[Dict[str, object]], Optional[Path]]:
        # Prefer a segment-specific model.  Fall back to a global ranker so
        # the system can learn immediately from old RecommendationRun data.
        for name in (segment, "global"):
            path = self.model_dir / name / "metadata.json"
            payload = _read_metadata(path)

            if payload is None:
                continue

            # Reject a model bundle trained under a different feature meaning.
            # Old v5 metadata has no algorithm_version and is intentionally
            # treated as incompatible with true-CTR serving.
            if str(
                payload.get("algorithm_version")
                or ""
            ) != CTR_ALGORITHM_VERSION:
                continue

            try:
                training_groups = int(
                    payload.get("training_groups", 0)
                    or 0
                )
            except (TypeError, ValueError):
                training_groups = 0

            required_groups = (
                LTR_MIN_GLOBAL_GROUPS
                if name == "global"
                else LTR_MIN_SEGMENT_GROUPS
            )

            if training_groups < required_groups:
                # Ignore under-trained model bundles. The resolver will try the
                # global model next, then fall back to segment priors.
                continue

            return payload, path

        return None, None

    def resolve(
        self,
        db: Session,
        user_id: str,
        base_weights: Mapping[str, float],
    ) -> DynamicWeightContext:
        profile = profile_user_activity(db, user_id)

        normalized_base = normalize_weights(base_weights)

        if not self.enabled:
            return DynamicWeightContext(
                weights=normalized_base,
                user_segment=profile.segment,
                strategy="static_weights",
                ltr_model_version=None,
                ltr_backend=None,
                model_source=None,
                activity_profile=profile,
            )

        segment_weights = apply_segment_prior(
            normalized_base,
            profile.segment,
        )

        metadata, metadata_path = self._load_best_metadata(
            profile.segment
        )

        if metadata is None:
            return DynamicWeightContext(
                weights=segment_weights,
                user_segment=profile.segment,
                strategy="segment_prior_fallback",
                ltr_model_version=None,
                ltr_backend=None,
                model_source=None,
                activity_profile=profile,
            )

        learned_importance = _metadata_importance(metadata)

        if learned_importance is None:
            return DynamicWeightContext(
                weights=segment_weights,
                user_segment=profile.segment,
                strategy="segment_prior_fallback_invalid_ltr_metadata",
                ltr_model_version=(
                    str(metadata.get("model_version"))
                    if metadata.get("model_version") is not None
                    else None
                ),
                ltr_backend=(
                    str(metadata.get("backend"))
                    if metadata.get("backend") is not None
                    else None
                ),
                model_source=(
                    str(metadata_path)
                    if metadata_path is not None
                    else None
                ),
                activity_profile=profile,
            )

        dynamic_weights = blend_with_learned_importance(
            segment_weights,
            learned_importance,
            learned_blend=self.learned_blend,
            min_feature_weight=self.min_feature_weight,
        )

        return DynamicWeightContext(
            weights=dynamic_weights,
            user_segment=profile.segment,
            strategy="ltr_feature_importance",
            ltr_model_version=(
                str(metadata.get("model_version"))
                if metadata.get("model_version") is not None
                else None
            ),
            ltr_backend=(
                str(metadata.get("backend"))
                if metadata.get("backend") is not None
                else None
            ),
            model_source=(
                str(metadata_path)
                if metadata_path is not None
                else None
            ),
            activity_profile=profile,
        )
