import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.workers.tasks import retrain_collaborative_model
from app.ml.collaborative import collaborative_model
from app.database import SessionLocal
from app.models import Product

def test():
    print("Running retrain task...")
    retrain_collaborative_model()
    
    if collaborative_model.is_trained:
        print(f"Model is trained. Similarity matrix shape: {collaborative_model.item_similarity_df.shape}")
        
        db = SessionLocal()
        product = db.query(Product).first()
        if product:
            print(f"Testing score for random user and product {product.id}...")
            score = collaborative_model.get_collaborative_score("test_user_id", product.id)
            print(f"Score: {score}")
        db.close()
    else:
        print("Model is NOT trained. Not enough data.")

if __name__ == "__main__":
    test()
