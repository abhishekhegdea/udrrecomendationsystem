import os

from celery import Celery
from dotenv import load_dotenv


load_dotenv()


REDIS_URL = os.getenv(
    "REDIS_URL",
    "redis://localhost:6379/0",
)


celery_app = Celery(
    "udrcrafts_ml_worker",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=[
        "app.workers.tasks",
    ],
)


celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,

    beat_schedule={
        # ---------------------------------------------------------------
        # Existing trending update
        # ---------------------------------------------------------------
        "update-trending-scores": {
            "task": "app.workers.tasks.update_trending",
            "schedule": 3600.0,
        },

        # ---------------------------------------------------------------
        # Existing collaborative retraining
        # ---------------------------------------------------------------
        "retrain-lightfm-model": {
            "task": "app.workers.tasks.retrain_collaborative_model",
            "schedule": 86400.0,
        },

        # ---------------------------------------------------------------
        # Dynamic recommendation weights / Learning-to-Rank retraining
        # ---------------------------------------------------------------
        # Runs every 24 hours.
        # The task itself enforces 90-day lookback, 7-day maturation,
        # and production minimum training-data thresholds.
        "retrain-ltr-ranking-models": {
            "task": "app.workers.tasks.retrain_ltr_models",
            "schedule": 86400.0,
        },

        # ---------------------------------------------------------------
        # Existing general behaviour retention
        # ---------------------------------------------------------------
        "cleanup-user-behaviour": {
            "task": "app.workers.tasks.cleanup_user_behaviour",
            "schedule": 604800.0,
        },

        # ---------------------------------------------------------------
        # NEW:
        # Delete ProductClickHistory records older than seven days.
        #
        # Runs hourly.
        # ---------------------------------------------------------------
        "cleanup-product-click-history": {
            "task": "app.workers.tasks.cleanup_product_click_history",
            "schedule": 3600.0,
        },
    },
)