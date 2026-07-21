from sentence_transformers import SentenceTransformer
from sqlalchemy.orm import Session
from app.models import Product
from app.database import SessionLocal

# Load a pre-trained 768-dimensional sentence transformer model
model = SentenceTransformer('all-mpnet-base-v2')

def generate_embedding(text: str) -> list:
    """Generates a 768-dimensional embedding for the given text."""
    embedding = model.encode(text)
    return embedding.tolist()

def get_similar_products(product_id: str, db: Session, limit: int = 10):
    """
    Finds similar products using pgvector cosine distance (<=>).
    """
    target_product = db.query(Product).filter(Product.id == product_id).first()
    if not target_product or target_product.embedding is None:
        return []

    # Using pgvector's <=> operator for cosine distance
    similar = db.query(Product).filter(Product.id != product_id).order_by(
        Product.embedding.cosine_distance(target_product.embedding)
    ).limit(limit).all()
    
    return similar
