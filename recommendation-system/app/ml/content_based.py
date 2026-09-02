from __future__ import annotations

import logging
from typing import Optional

from sqlalchemy.orm import Session, joinedload
from app.models import Product

logger = logging.getLogger(__name__)

# Lazy-load SentenceTransformer so the module can be imported without it
# (get_similar_products uses pgvector directly and doesn't need the model)
_model: Optional[object] = None


def _get_model():
    """Lazy-load the SentenceTransformer model on first use."""
    global _model
    if _model is None:
        try:
            # pyrefly: ignore [missing-import]
            from sentence_transformers import SentenceTransformer

            _model = SentenceTransformer("all-MiniLM-L6-v2")
            logger.info("Loaded SentenceTransformer model (384 dims) in content_based.py")
        except ImportError:
            raise RuntimeError(
                "sentence-transformers is required for generate_embedding. "
                "Run: pip install sentence-transformers"
            )
    return _model


def generate_embedding(text: str) -> list:
    """Generates a 384-dimensional embedding for the given text."""
    model = _get_model()
    embedding = model.encode(text)
    return embedding.tolist()

def get_similar_products(product_id: str, db: Session, limit: int = 10):
    """
    Finds similar products using pgvector cosine distance (<=>).

    Because pgvector's cosine_distance works with vectors of any dimension,
    the query is identical regardless of whether the store holds 384- or
    768-dimensional embeddings.
    """
    # Eagerly load relationships to avoid N+1 queries in serializers
    target_product = (
        db.query(Product)
        .options(joinedload(Product.images))
        .filter(Product.id == product_id)
        .first()
    )

    if not target_product or target_product.embedding is None:
        return []

    # Using pgvector's <=> operator for cosine distance.
    # Distance is defined as 1 - cosine_similarity, so lower = more similar.
    similar = (
        db.query(Product)
        .options(joinedload(Product.images))
        .filter(
            Product.id != product_id,
            Product.categoryId == target_product.categoryId
        )
        .order_by(Product.embedding.cosine_distance(target_product.embedding))
        .limit(limit)
        .all()
    )

    return similar
