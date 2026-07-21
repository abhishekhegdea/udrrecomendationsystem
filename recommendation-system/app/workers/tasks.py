from app.workers.celery_app import celery_app
import time

@celery_app.task
def update_trending():
    # TODO: Calculate decaying popularity scores
    print("Updating trending scores...")
    return True

@celery_app.task
def retrain_collaborative_model():
    from app.database import SessionLocal
    from app.ml.collaborative import collaborative_model
    
    print("Retraining Matrix Factorization model...")
    db = SessionLocal()
    try:
        success = collaborative_model.train(db)
        if success:
            print("Successfully retrained Collaborative Filter.")
        else:
            print("Failed to retrain (possibly not enough data).")
    finally:
        db.close()
    return True

@celery_app.task
def generate_product_embedding(product_id: str, text: str):
    # TODO: Generate embedding via sentence_transformers and store in pgvector
    print(f"Generating embedding for {product_id}")
    return True
