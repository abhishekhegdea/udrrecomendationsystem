from app.workers.celery_app import celery_app
import time

@celery_app.task
def update_trending():
    # TODO: Calculate decaying popularity scores
    print("Updating trending scores...")
    return True

@celery_app.task
def retrain_collaborative_model():
    # TODO: Retrain LightFM using latest implicit feedback
    print("Retraining LightFM...")
    return True

@celery_app.task
def generate_product_embedding(product_id: str, text: str):
    # TODO: Generate embedding via sentence_transformers and store in pgvector
    print(f"Generating embedding for {product_id}")
    return True
