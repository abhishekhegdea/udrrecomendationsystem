import os
import sys

# Add parent directory to path so we can import app modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.database import SessionLocal
from app.models import Product
from app.ml.content_based import generate_embedding

def seed_all_products():
    db = SessionLocal()
    try:
        products = db.query(Product).all()
        print(f"Found {len(products)} total products.")
        
        updated = 0
        for p in products:
            if p.embedding is None:
                # Combine name and description to create a rich semantic text
                text_to_embed = f"{p.name}. {p.description}"
                embedding = generate_embedding(text_to_embed)
                p.embedding = embedding
                updated += 1
                print(f"[{updated}] Generated embedding for: {p.name}")
        
        if updated > 0:
            db.commit()
            print(f"Successfully seeded {updated} products with embeddings!")
        else:
            print("All products already have embeddings.")
    except Exception as e:
        print(f"Error during seeding: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_all_products()
