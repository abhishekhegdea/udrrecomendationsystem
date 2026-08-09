"""
Celery tasks for the UdrCrafts ML recommendation engine.

These tasks are picked up automatically by the Celery worker because
``celery_app.conf.include`` contains ``"app.workers.tasks"``.

Run the worker with:
    celery -A app.workers.celery_app worker --loglevel=info -P solo
"""

import logging

from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Trending scores (periodic — every hour)
# ---------------------------------------------------------------------------
@celery_app.task
def update_trending():
    """
    Recalculate decaying popularity scores for trending products.
    Called every hour via ``beat_schedule``.
    """
    logger.info("Updating trending scores...")
    # TODO: Implement score decay based on recent click/view events
    return True


# ---------------------------------------------------------------------------
# Collaborative model retraining (periodic — every day)
# ---------------------------------------------------------------------------
@celery_app.task
def retrain_collaborative_model():
    """
    Retrain the LightFM matrix-factorisation model using fresh interaction data.
    Called every day via ``beat_schedule``.
    """
    from app.database import SessionLocal
    from app.ml.collaborative import collaborative_model

    logger.info("Retraining Matrix Factorization model...")
    db = SessionLocal()
    try:
        success = collaborative_model.train(db)
        if success:
            logger.info("Successfully retrained Collaborative Filter.")
        else:
            logger.warning("Failed to retrain (possibly not enough data).")
    finally:
        db.close()
    return True


# ---------------------------------------------------------------------------
# Data retention — purge stale UserBehaviour rows (periodic — weekly)
# ---------------------------------------------------------------------------
@celery_app.task
def cleanup_user_behaviour():
    """
    Delete ``UserBehaviour`` rows that exceed their event type's retention
    period (90 / 180 / 365 days depending on event type).

    Runs weekly via ``beat_schedule``.
    """
    from app.database import SessionLocal
    from app.core.retention import retain_user_behaviour

    logger.info("UserBehaviour retention cleanup started...")
    db = SessionLocal()
    try:
        summary = retain_user_behaviour(db)
        logger.info("Cleanup result: %s", summary.summary_line)
    except Exception:
        logger.exception("Retention cleanup failed.")
    finally:
        db.close()
    return True


# ---------------------------------------------------------------------------
# On-demand: generate embedding for a single product
# ---------------------------------------------------------------------------
@celery_app.task(bind=True, max_retries=3, default_retry_delay=10)
def generate_product_embedding(self, product_id: str) -> bool:
    """
    Generate and persist the 384-dim pgvector embedding for a single product.

    This task is designed to be called from the backend API whenever a
    seller creates or updates a product.  Because SentenceTransformer
    models are lazy-loaded, the first invocation will be slightly slower
    (~2 s) while the model downloads / loads; subsequent calls reuse the
    cached model.

    Parameters
    ----------
    product_id : str
        UUID of the Product row to embed.

    Returns
    -------
    bool
        ``True`` on success, ``False`` if the product was not found.

    Retries
    -------
    Up to 3 times with a 10-second delay between attempts.
    """
    from app.database import SessionLocal
    from app.ml.embedding_service import embed_single_product

    logger.info("Generating embedding for product %s ...", product_id)

    db = SessionLocal()
    try:
        success = embed_single_product(db, product_id)
        if success:
            logger.info("Embedding stored for product %s.", product_id)
        else:
            logger.warning("Product %s not found — no embedding generated.", product_id)
        return success
    except Exception as exc:
        logger.exception("Failed to generate embedding for product %s.", product_id)
        # Retry up to max_retries times with exponential backoff
        raise self.retry(exc=exc)
    finally:
        db.close()
