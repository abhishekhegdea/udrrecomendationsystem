from sentence_transformers import SentenceTransformer
from sqlalchemy.orm import Session
from app.models import Product
from app.database import SessionLocal

# Load a lightweight pre-trained sentence transformer model
model = SentenceTransformer('all-MiniLM-L6-v2')

def generate_embedding(text: str) -> list:
    """Generates a 384-dimensional embedding for the given text."""
    # Since our schema uses vector(768) but this model outputs 384, 
    # we would normally use a 768-dim model like 'all-mpnet-base-v2'.
    # Assuming 'all-mpnet-base-v2' for production to match schema.
    prod_model = SentenceTransformer('all-mpnet-base-v2')
    embedding = prod_model.encode(text)
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
