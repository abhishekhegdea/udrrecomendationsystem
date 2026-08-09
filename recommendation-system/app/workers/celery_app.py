from celery import Celery
import os
from dotenv import load_dotenv

load_dotenv()

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "udrcrafts_ml_worker",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=["app.workers.tasks"]
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    # Example periodic tasks (e.g. retrain models every night)
    beat_schedule={
        'update-trending-scores': {
            'task': 'app.workers.tasks.update_trending',
            'schedule': 3600.0, # Every hour
        },
        'retrain-lightfm-model': {
            'task': 'app.workers.tasks.retrain_collaborative_model',
            'schedule': 86400.0, # Every day
        },
        'cleanup-user-behaviour': {
            'task': 'app.workers.tasks.cleanup_user_behaviour',
            'schedule': 604800.0, # Every week (7 * 24 * 60 * 60)
        },
    }
)
