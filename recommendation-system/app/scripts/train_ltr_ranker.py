#!/usr/bin/env python3
"""
Train LightGBM/XGBoost Learning-to-Rank models from recommendation audit data.

Training unit
-------------
Each RecommendationRun is one ranking query/group.  Each
RecommendationScoreSnapshot in that run is one candidate document/product.

Features
--------
The exact 12 raw recommendation signals already stored in the snapshot table.
No post-recommendation information is used as a feature.

Relevance labels (within --label-window-days after the recommendation run)
----------------------------------------------------------------------------
0 = no observed interaction
1 = ClickEvent / CLICK / PRODUCT_VIEW
2 = WISHLIST
3 = CART
4 = PURCHASE

The script trains:
  * a global model using all eligible runs
  * one model per user segment when enough segment-specific groups exist

Serving does not need to execute the model for every request.  The ranker's
learned gain feature importance is exported to metadata.json and is consumed
by app.ml.learning_to_rank.DynamicWeightResolver to produce dynamic weights.
"""

from __future__ import annotations

import argparse
import json
import math
import sys

from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.database import SessionLocal  # noqa: E402
from app.ml.learning_to_rank import (  # noqa: E402
    LTR_FEATURE_KEYS,
    USER_SEGMENTS,
    normalize_weights,
)
from app.models import (  # noqa: E402
    ClickEvent,
    RecommendationRun,
    RecommendationScoreSnapshot,
    UserBehaviour,
)


FEATURE_ATTRS: Dict[str, str] = {
    "content": "contentScore",
    "collaborative": "collaborativeScore",
    "trending": "trendingScore",
    "seasonal": "seasonalScore",
    "location": "locationScore",
    "category_affinity": "categoryAffinityScore",
    "brand_affinity": "brandAffinityScore",
    "rating": "ratingScore",
    "seller_freshness": "sellerFreshnessScore",
    "click_rate": "productClickPopularityScore",
    "user_click_affinity": "userClickAffinityScore",
    "engagement": "engagementScore",
}


LABELS = {
    "PRODUCT_VIEW": 1,
    "VIEW": 1,
    "CLICK": 1,
    "WISHLIST": 2,
    "CART": 3,
    "ADD_TO_CART": 3,
    "PURCHASE": 4,
}

# Development-only events created by generate_ltr_test_data.py.
# Production training ignores them unless --include-synthetic is explicitly used.
SYNTHETIC_LTR_SOURCE = "ltr_synthetic_test"


def _safe_float(value: object) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return 0.0
    if not math.isfinite(number):
        return 0.0
    return number


def _feature_row(snapshot: RecommendationScoreSnapshot) -> List[float]:
    return [
        _safe_float(getattr(snapshot, FEATURE_ATTRS[key], 0.0))
        for key in LTR_FEATURE_KEYS
    ]


def _labels_for_run(
    db,
    run: RecommendationRun,
    product_ids: Sequence[str],
    label_window_days: int,
    include_synthetic: bool = False,
) -> Dict[str, int]:
    labels: Dict[str, int] = {
        product_id: 0
        for product_id in product_ids
    }

    start = run.createdAt
    end = start + timedelta(days=label_window_days)

    click_rows = (
        db.query(
            ClickEvent.productId,
            ClickEvent.source,
        )
        .filter(
            ClickEvent.userId == run.userId,
            ClickEvent.productId.in_(product_ids),
            ClickEvent.createdAt >= start,
            ClickEvent.createdAt <= end,
        )
        .all()
    )

    for product_id, source in click_rows:
        if (
            not include_synthetic
            and str(source or "") == SYNTHETIC_LTR_SOURCE
        ):
            continue

        if product_id in labels:
            labels[product_id] = max(labels[product_id], 1)

    behaviour_rows = (
        db.query(
            UserBehaviour.productId,
            UserBehaviour.eventType,
            UserBehaviour.source,
        )
        .filter(
            UserBehaviour.userId == run.userId,
            UserBehaviour.productId.in_(product_ids),
            UserBehaviour.createdAt >= start,
            UserBehaviour.createdAt <= end,
        )
        .all()
    )

    for product_id, event_type, source in behaviour_rows:
        if (
            not include_synthetic
            and str(source or "") == SYNTHETIC_LTR_SOURCE
        ):
            continue

        if product_id not in labels:
            continue
        relevance = LABELS.get(
            str(event_type or "").strip().upper(),
            0,
        )
        labels[product_id] = max(labels[product_id], relevance)

    return labels


def _eligible_group(labels: Sequence[int]) -> bool:
    # Ranking training needs at least two candidates and some relevance
    # variation.  A group of all-zero labels carries no ordering signal.
    return (
        len(labels) >= 2
        and max(labels) > min(labels)
    )


def load_training_groups(
    db,
    *,
    lookback_days: int,
    label_window_days: int,
    max_groups: Optional[int],
    include_synthetic: bool = False,
) -> List[Dict[str, object]]:
    """
    Load only fully matured recommendation groups.

    A run is considered only when:
      * it is inside the configured lookback window; and
      * its complete label window has elapsed.

    Example with a 7-day label window:
      training on Aug 30 only uses runs created on or before Aug 23.

    This prevents a recent run from being labelled 0 simply because the user
    has not yet had enough time to click/cart/wishlist/purchase.
    """
    now = datetime.utcnow()

    cutoff = (
        now
        - timedelta(
            days=max(1, lookback_days)
        )
    )

    matured_before = (
        now
        - timedelta(
            days=max(1, label_window_days)
        )
    )

    query = (
        db.query(RecommendationRun)
        .filter(
            RecommendationRun.createdAt >= cutoff,
            RecommendationRun.createdAt <= matured_before,
        )
        .order_by(RecommendationRun.createdAt.asc())
    )

    if max_groups is not None and max_groups > 0:
        query = query.limit(max_groups)

    runs = query.all()
    groups: List[Dict[str, object]] = []

    for run in runs:
        snapshots = (
            db.query(RecommendationScoreSnapshot)
            .filter(RecommendationScoreSnapshot.runId == run.id)
            .order_by(RecommendationScoreSnapshot.rank.asc())
            .all()
        )

        if len(snapshots) < 2:
            continue

        product_ids = [snapshot.productId for snapshot in snapshots]
        label_map = _labels_for_run(
            db,
            run,
            product_ids,
            label_window_days,
            include_synthetic=include_synthetic,
        )

        labels = [label_map.get(product_id, 0) for product_id in product_ids]

        if not _eligible_group(labels):
            continue

        segment = str(
            getattr(run, "userSegment", None)
            or "unknown"
        ).lower()

        groups.append({
            "run_id": run.id,
            "user_id": run.userId,
            "segment": segment,
            "X": [_feature_row(snapshot) for snapshot in snapshots],
            "y": labels,
        })

    return groups


def flatten_groups(
    groups: Sequence[Dict[str, object]],
) -> Tuple[np.ndarray, np.ndarray, List[int]]:
    rows: List[List[float]] = []
    labels: List[int] = []
    sizes: List[int] = []

    for group in groups:
        X = list(group["X"])
        y = list(group["y"])
        rows.extend(X)
        labels.extend(int(value) for value in y)
        sizes.append(len(y))

    return (
        np.asarray(rows, dtype=np.float32),
        np.asarray(labels, dtype=np.int32),
        sizes,
    )


def train_lightgbm(
    X: np.ndarray,
    y: np.ndarray,
    group_sizes: Sequence[int],
):
    try:
        from lightgbm import LGBMRanker
    except ImportError as exc:
        raise RuntimeError(
            "LightGBM is not installed. Run: pip install lightgbm"
        ) from exc

    model = LGBMRanker(
        objective="lambdarank",
        metric="ndcg",
        n_estimators=300,
        learning_rate=0.05,
        num_leaves=31,
        max_depth=-1,
        min_child_samples=10,
        subsample=0.9,
        colsample_bytree=0.9,
        reg_lambda=1.0,
        random_state=42,
        verbosity=-1,
    )

    model.fit(
        X,
        y,
        group=list(group_sizes),
    )

    importance = model.booster_.feature_importance(
        importance_type="gain"
    )

    return model, importance


def train_xgboost(
    X: np.ndarray,
    y: np.ndarray,
    group_sizes: Sequence[int],
):
    try:
        from xgboost import XGBRanker
    except ImportError as exc:
        raise RuntimeError(
            "XGBoost is not installed. Run: pip install xgboost"
        ) from exc

    model = XGBRanker(
        objective="rank:ndcg",
        n_estimators=300,
        learning_rate=0.05,
        max_depth=6,
        min_child_weight=1.0,
        subsample=0.9,
        colsample_bytree=0.9,
        reg_lambda=1.0,
        random_state=42,
        tree_method="hist",
    )

    model.fit(
        X,
        y,
        group=list(group_sizes),
        verbose=False,
    )

    importance = np.asarray(
        getattr(model, "feature_importances_", np.zeros(len(LTR_FEATURE_KEYS))),
        dtype=np.float64,
    )

    return model, importance


def save_model_bundle(
    *,
    model,
    importance: Sequence[float],
    backend: str,
    segment: str,
    groups: Sequence[Dict[str, object]],
    model_dir: Path,
) -> Path:
    target = model_dir / segment
    target.mkdir(parents=True, exist_ok=True)

    importance_map = {
        key: max(0.0, float(value))
        for key, value in zip(LTR_FEATURE_KEYS, importance)
    }
    importance_map = normalize_weights(importance_map)

    model_version = (
        f"{backend}-{segment}-"
        + datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    )

    if backend == "lightgbm":
        model_path = target / "model.txt"
        model.booster_.save_model(str(model_path))
    else:
        model_path = target / "model.json"
        model.save_model(str(model_path))

    row_count = sum(len(group["y"]) for group in groups)
    positive_count = sum(
        sum(1 for value in group["y"] if int(value) > 0)
        for group in groups
    )

    metadata = {
        "model_version": model_version,
        "backend": backend,
        "segment": segment,
        "trained_at": datetime.utcnow().isoformat() + "Z",
        "feature_keys": list(LTR_FEATURE_KEYS),
        "feature_importance": importance_map,
        "training_groups": len(groups),
        "training_rows": row_count,
        "positive_rows": positive_count,
        "model_file": model_path.name,
        "label_definition": {
            "0": "no observed interaction",
            "1": "click / product view",
            "2": "wishlist",
            "3": "cart",
            "4": "purchase",
        },
    }

    metadata_path = target / "metadata.json"
    temp_path = target / "metadata.json.tmp"

    with temp_path.open("w", encoding="utf-8") as handle:
        json.dump(metadata, handle, indent=2, sort_keys=True)
        handle.write("\n")

    temp_path.replace(metadata_path)

    return metadata_path


def train_one(
    *,
    groups: Sequence[Dict[str, object]],
    backend: str,
    segment: str,
    model_dir: Path,
) -> Optional[Path]:
    if not groups:
        return None

    X, y, group_sizes = flatten_groups(groups)

    if backend == "lightgbm":
        model, importance = train_lightgbm(X, y, group_sizes)
    else:
        model, importance = train_xgboost(X, y, group_sizes)

    return save_model_bundle(
        model=model,
        importance=importance,
        backend=backend,
        segment=segment,
        groups=groups,
        model_dir=model_dir,
    )


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Train production Learning-to-Rank models from fully matured "
            "recommendation feedback."
        )
    )

    parser.add_argument(
        "--backend",
        choices=("lightgbm", "xgboost"),
        default="lightgbm",
    )

    parser.add_argument(
        "--lookback-days",
        type=int,
        default=90,
    )

    parser.add_argument(
        "--label-window-days",
        type=int,
        default=7,
    )

    parser.add_argument(
        "--min-global-groups",
        type=int,
        default=1000,
    )

    parser.add_argument(
        "--min-segment-groups",
        type=int,
        default=500,
    )

    # Backward-compatible development/test override.
    # Example: --min-groups 5 overrides both production thresholds.
    parser.add_argument(
        "--min-groups",
        type=int,
        default=None,
        help=(
            "Development/test override: use the same minimum for both "
            "global and segment models."
        ),
    )

    parser.add_argument(
        "--max-groups",
        type=int,
        default=None,
    )

    parser.add_argument(
        "--include-synthetic",
        action="store_true",
        help=(
            "Development only: allow ltr_synthetic_test events to create "
            "training labels. Production training ignores them by default."
        ),
    )

    parser.add_argument(
        "--model-dir",
        type=Path,
        default=ROOT / "models" / "ltr",
    )

    args = parser.parse_args()

    lookback_days = max(1, args.lookback_days)
    label_window_days = max(1, args.label_window_days)

    if args.min_groups is not None:
        min_global_groups = max(1, args.min_groups)
        min_segment_groups = max(1, args.min_groups)
    else:
        min_global_groups = max(1, args.min_global_groups)
        min_segment_groups = max(1, args.min_segment_groups)

    matured_before = (
        datetime.utcnow()
        - timedelta(days=label_window_days)
    )

    print("LTR training configuration:")
    print(f"  backend               : {args.backend}")
    print(f"  lookback_days         : {lookback_days}")
    print(f"  label_window_days     : {label_window_days}")
    print(f"  mature_runs_through   : {matured_before.isoformat()}Z")
    print(f"  min_global_groups     : {min_global_groups}")
    print(f"  min_segment_groups    : {min_segment_groups}")
    print(f"  model_dir             : {args.model_dir}")
    print(f"  include_synthetic     : {args.include_synthetic}")

    db = SessionLocal()
    try:
        groups = load_training_groups(
            db,
            lookback_days=lookback_days,
            label_window_days=label_window_days,
            max_groups=args.max_groups,
            include_synthetic=args.include_synthetic,
        )
    finally:
        db.close()

    print(f"Eligible fully-matured groups: {len(groups)}")

    if len(groups) < min_global_groups:
        print(
            "Not enough fully-matured ranking groups for the global model: "
            f"{len(groups)} found, {min_global_groups} required."
        )
        print(
            "The existing model is left unchanged. "
            "Continue collecting real recommendation interactions."
        )
        return 2

    global_path = train_one(
        groups=groups,
        backend=args.backend,
        segment="global",
        model_dir=args.model_dir,
    )
    print(f"Global model metadata: {global_path}")

    grouped_by_segment: Dict[str, List[Dict[str, object]]] = defaultdict(list)
    for group in groups:
        segment = str(group.get("segment") or "unknown").lower()
        if segment in USER_SEGMENTS:
            grouped_by_segment[segment].append(group)

    for segment in USER_SEGMENTS:
        segment_groups = grouped_by_segment.get(segment, [])

        if len(segment_groups) < min_segment_groups:
            print(
                f"Skipping {segment}: {len(segment_groups)} matured groups; "
                f"need {min_segment_groups}. Serving will use the global model."
            )
            continue

        path = train_one(
            groups=segment_groups,
            backend=args.backend,
            segment=segment,
            model_dir=args.model_dir,
        )
        print(f"{segment} model metadata: {path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())