"""
Celery background tasks for the UdrCrafts recommendation system.
"""

import logging

from app.workers.celery_app import celery_app


logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# TRENDING
# ---------------------------------------------------------------------------

@celery_app.task
def update_trending():
    """
    Recalculate trending scores.

    Existing placeholder retained.
    """

    logger.info(
        "Updating trending scores..."
    )

    # TODO:
    # Implement time-decayed trending calculation.

    return True


# ---------------------------------------------------------------------------
# COLLABORATIVE MODEL
# ---------------------------------------------------------------------------

@celery_app.task
def retrain_collaborative_model():
    """
    Retrain collaborative filtering using latest interaction data.
    """

    from app.database import SessionLocal
    from app.ml.collaborative import collaborative_model

    logger.info(
        "Retraining collaborative model..."
    )

    db = SessionLocal()

    try:
        success = collaborative_model.train(db)

        if success:
            logger.info(
                "Collaborative model successfully retrained."
            )
        else:
            logger.warning(
                "Collaborative model retraining skipped or failed."
            )

    finally:
        db.close()

    return True


# ---------------------------------------------------------------------------
# EXISTING USER-BEHAVIOUR RETENTION
# ---------------------------------------------------------------------------

@celery_app.task
def cleanup_user_behaviour():
    """
    Remove old UserBehaviour records according to existing retention rules.
    """

    from app.database import SessionLocal
    from app.core.retention import retain_user_behaviour

    logger.info(
        "UserBehaviour retention cleanup started..."
    )

    db = SessionLocal()

    try:
        summary = retain_user_behaviour(db)

        logger.info(
            "Cleanup result: %s",
            summary.summary_line,
        )

    except Exception:
        logger.exception(
            "UserBehaviour retention cleanup failed."
        )

    finally:
        db.close()

    return True


# ---------------------------------------------------------------------------
# NEW:
# 7-DAY PRODUCT CLICK HISTORY RETENTION
# ---------------------------------------------------------------------------

@celery_app.task
def cleanup_product_click_history():
    """
    Delete ProductClickHistory records older than seven days.

    This runs every hour through Celery Beat.

    Recommendation queries ALSO explicitly use a seven-day cutoff,
    therefore an old row cannot affect ranking even between cleanup runs.
    """

    from datetime import datetime, timedelta

    from app.database import SessionLocal
    from app.models import ProductClickHistory

    cutoff = (
        datetime.utcnow()
        - timedelta(days=7)
    )

    logger.info(
        "ProductClickHistory cleanup started. cutoff=%s",
        cutoff.isoformat(),
    )

    db = SessionLocal()

    try:
        deleted = (
            db.query(ProductClickHistory)
            .filter(
                ProductClickHistory.createdAt
                < cutoff
            )
            .delete(
                synchronize_session=False
            )
        )

        db.commit()

        logger.info(
            "ProductClickHistory cleanup removed %d records.",
            deleted,
        )

        return deleted

    except Exception:
        db.rollback()

        logger.exception(
            "ProductClickHistory cleanup failed."
        )

        raise

    finally:
        db.close()


# ---------------------------------------------------------------------------
# EXISTING PRODUCT EMBEDDING TASK
# ---------------------------------------------------------------------------

@celery_app.task(
    bind=True,
    max_retries=3,
    default_retry_delay=10,
)
def generate_product_embedding(
    self,
    product_id: str,
) -> bool:
    """
    Generate and persist a 384-dimensional embedding for one product.
    """

    from app.database import SessionLocal
    from app.ml.embedding_service import embed_single_product

    logger.info(
        "Generating embedding for product %s...",
        product_id,
    )

    db = SessionLocal()

    try:
        success = embed_single_product(
            db,
            product_id,
        )

        if success:
            logger.info(
                "Embedding stored for product %s.",
                product_id,
            )
        else:
            logger.warning(
                "Product %s was not found.",
                product_id,
            )

        return success

    except Exception as exc:
        logger.exception(
            "Failed to generate embedding for product %s.",
            product_id,
        )

        raise self.retry(
            exc=exc
        )

    finally:
        db.close()

# ---------------------------------------------------------------------------
# DYNAMIC WEIGHT / LEARNING-TO-RANK RETRAINING
# ---------------------------------------------------------------------------

@celery_app.task
def retrain_ltr_models():
    """
    Retrain the global and segment-specific Learning-to-Rank models.

    Celery Beat runs this daily.

    Production safeguards:
      * 90-day lookback by default;
      * full 7-day feedback maturation;
      * 1000 groups for the global model;
      * 500 groups for each segment-specific model;
      * existing model is preserved when thresholds are not met.
    """

    import os

    from collections import defaultdict
    from pathlib import Path

    from app.database import SessionLocal
    from app.ml.learning_to_rank import USER_SEGMENTS
    from app.scripts.train_ltr_ranker import (
        load_training_groups,
        train_one,
    )

    backend = os.getenv(
        "LTR_BACKEND",
        "lightgbm",
    ).strip().lower()

    if backend not in {
        "lightgbm",
        "xgboost",
    }:
        backend = "lightgbm"

    lookback_days = int(
        os.getenv(
            "LTR_TRAIN_LOOKBACK_DAYS",
            "90",
        )
    )

    label_window_days = int(
        os.getenv(
            "LTR_LABEL_WINDOW_DAYS",
            "7",
        )
    )

    # Production thresholds.
    # LTR_MIN_TRAINING_GROUPS remains supported as a legacy override.
    legacy_min_groups = os.getenv(
        "LTR_MIN_TRAINING_GROUPS"
    )

    min_global_groups = int(
        os.getenv(
            "LTR_MIN_GLOBAL_GROUPS",
            legacy_min_groups or "1000",
        )
    )

    min_segment_groups = int(
        os.getenv(
            "LTR_MIN_SEGMENT_GROUPS",
            legacy_min_groups or "500",
        )
    )

    model_dir = Path(
        os.getenv(
            "LTR_MODEL_DIR",
            str(
                Path(__file__).resolve().parents[2]
                / "models"
                / "ltr"
            ),
        )
    )

    db = SessionLocal()

    try:
        groups = load_training_groups(
            db,
            lookback_days=max(1, lookback_days),
            label_window_days=max(1, label_window_days),
            max_groups=None,
            include_synthetic=False,
        )
    finally:
        db.close()

    min_global_groups = max(1, min_global_groups)
    min_segment_groups = max(1, min_segment_groups)

    logger.info(
        (
            "LTR daily retraining check. "
            "backend=%s lookback_days=%d label_window_days=%d "
            "eligible_matured_groups=%d min_global_groups=%d "
            "min_segment_groups=%d"
        ),
        backend,
        lookback_days,
        label_window_days,
        len(groups),
        min_global_groups,
        min_segment_groups,
    )

    if len(groups) < min_global_groups:
        logger.info(
            (
                "LTR retraining skipped: %d fully-matured eligible groups; "
                "%d required for global model."
            ),
            len(groups),
            min_global_groups,
        )
        return {
            "trained": False,
            "reason": "insufficient_matured_global_groups",
            "eligible_groups": len(groups),
            "required_global_groups": min_global_groups,
            "required_segment_groups": min_segment_groups,
            "lookback_days": lookback_days,
            "label_window_days": label_window_days,
        }

    trained = {}

    global_path = train_one(
        groups=groups,
        backend=backend,
        segment="global",
        model_dir=model_dir,
    )

    trained["global"] = (
        str(global_path)
        if global_path is not None
        else None
    )

    grouped_by_segment = defaultdict(list)

    for group in groups:
        segment = str(
            group.get("segment")
            or "unknown"
        ).lower()

        if segment in USER_SEGMENTS:
            grouped_by_segment[segment].append(group)

    for segment in USER_SEGMENTS:
        segment_groups = grouped_by_segment.get(
            segment,
            [],
        )

        if len(segment_groups) < min_segment_groups:
            logger.info(
                (
                    "Skipping LTR segment %s: %d fully-matured groups; "
                    "%d required. Serving will fall back to the global model."
                ),
                segment,
                len(segment_groups),
                min_segment_groups,
            )
            continue

        path = train_one(
            groups=segment_groups,
            backend=backend,
            segment=segment,
            model_dir=model_dir,
        )

        trained[segment] = (
            str(path)
            if path is not None
            else None
        )

    segment_group_counts = {
        segment: len(
            grouped_by_segment.get(
                segment,
                [],
            )
        )
        for segment in USER_SEGMENTS
    }

    logger.info(
        (
            "LTR retraining complete. backend=%s matured_groups=%d "
            "segment_groups=%s models=%s"
        ),
        backend,
        len(groups),
        segment_group_counts,
        trained,
    )

    return {
        "trained": True,
        "backend": backend,
        "eligible_matured_groups": len(groups),
        "segment_group_counts": segment_group_counts,
        "min_global_groups": min_global_groups,
        "min_segment_groups": min_segment_groups,
        "lookback_days": lookback_days,
        "label_window_days": label_window_days,
        "models": trained,
    }
