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