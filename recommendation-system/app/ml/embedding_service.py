"""
embedding_service.py — Product Embedding Generation for UdrCrafts

Uses SentenceTransformer (all-MiniLM-L6-v2, 384 dimensions) to generate
semantic embeddings for every product in the Product table.

Pipeline
────────
1. Fetch all products from PostgreSQL via SQLAlchemy.
2. For each product, build a rich textual representation from:
   - Product Name
   - Description
   - Category name (+ Subcategory name)
   - Materials (list → comma-separated string)
   - Tags (list → comma-separated string)
   - Craft Type
3. Encode the text with SentenceTransformer → 384-dim float vector.
4. Persist the embedding vector back to Product.embedding.
5. Commit all changes in a single transaction for atomicity.
"""

import logging
import sys
from typing import List, Optional

from sqlalchemy.orm import Session, joinedload

# ── Path setup ──────────────────────────────────────────────────────────
# Allows running as `python -m app.ml.embedding_service` from the
# recommendation-system/ directory.
sys.path.insert(0, ".")  # noqa

from app.database import SessionLocal
from app.models import Product

# ---------------------------------------------------------------------------
# Logging configuration
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# 1. Load the SentenceTransformer model (loaded once at module level)
# ---------------------------------------------------------------------------
# all-MiniLM-L6-v2 produces 384-dimensional embeddings.
# It is lightweight (~80 MB) and fast, suitable for CPU or GPU inference.
try:
    from sentence_transformers import SentenceTransformer

    _model: Optional[SentenceTransformer] = None

    def _get_model() -> SentenceTransformer:
        """Lazy-load the model so importing the module doesn't block."""
        global _model
        if _model is None:
            logger.info("Loading SentenceTransformer model: all-MiniLM-L6-v2 ...")
            _model = SentenceTransformer("all-MiniLM-L6-v2")
            logger.info("Model loaded successfully (384 dims).")
        return _model

except ImportError:
    logger.warning(
        "sentence-transformers is not installed. "
        "Run: pip install sentence-transformers"
    )

    def _get_model():  # type: ignore
        raise RuntimeError("sentence-transformers is required to generate embeddings.")


# ---------------------------------------------------------------------------
# 2. Text combiner — builds a rich semantic string from product fields
# ---------------------------------------------------------------------------
def build_product_text(
    name: str,
    description: str = "",
    category_name: str = "",
    subcategory_name: str = "",
    materials: Optional[List[str]] = None,
    tags: Optional[List[str]] = None,
    craft_type: str = "",
) -> str:
    """
    Combine all relevant product fields into a single text string that the
    embedding model can encode.  Each field is separated by a clear label so
    the model learns the semantic role of each piece of information.

    Example output:
        "Product: Handwoven Wool Pashmina Shawl
         Category: Textiles > Pashmina
         Materials: Cashmere, Wool, Natural Dyes
         Tags: Winter, Luxury, Handmade, Kashmir
         Craft Type: Weaving
         Description: Authentic Kashmiri pashmina shawl handcrafted..."
    """
    parts: List[str] = [f"Product: {name}"]

    if category_name:
        if subcategory_name:
            parts.append(f"Category: {category_name} > {subcategory_name}")
        else:
            parts.append(f"Category: {category_name}")

    if materials:
        mats = ", ".join(m.strip() for m in materials if m.strip())
        if mats:
            parts.append(f"Materials: {mats}")

    if tags:
        t = ", ".join(tag.strip() for tag in tags if tag.strip())
        if t:
            parts.append(f"Tags: {t}")

    if craft_type:
        parts.append(f"Craft Type: {craft_type.strip()}")

    if description:
        # Keep description reasonably short — truncate at 512 chars
        desc = description.strip()[:512]
        if desc:
            parts.append(f"Description: {desc}")

    return "\n".join(parts)


# ---------------------------------------------------------------------------
# 3. Batch processing — iterate over every product and store its embedding
# ---------------------------------------------------------------------------
def embed_all_products(db: Session, batch_size: int = 50) -> int:
    """
    Fetch **every** product from the database, generate or update its
    embedding, and commit in a single transaction.

    Parameters
    ----------
    db : sqlalchemy.orm.Session
        Active database session.
    batch_size : int
        How many products to load per SQL query (used for pagination).

    Returns
    -------
    int
        Number of products that were updated.
    """
    model = _get_model()

    # ── Step A: Count total products ──────────────────────────────────
    total = db.query(Product).count()
    logger.info("Total products in database: %d", total)

    if total == 0:
        logger.warning("No products found — nothing to embed.")
        return 0

    updated = 0
    offset = 0

    # ── Step B: Paginate through all products ─────────────────────────
    while offset < total:
        # Eagerly load the category and subcategory relationships so we
        # don't issue N+1 queries inside the loop.
        batch = (
            db.query(Product)
            .options(
                joinedload(Product.category),
                joinedload(Product.subcategory),
            )
            .order_by(Product.id)
            .offset(offset)
            .limit(batch_size)
            .all()
        )

        if not batch:
            break  # safety guard

        # ── Step C: Build texts for the entire batch ────────────────
        texts: List[str] = []
        for product in batch:
            category_name = product.category.name if product.category else ""
            subcategory_name = (
                product.subcategory.name if product.subcategory else ""
            )
            texts.append(
                build_product_text(
                    name=product.name,
                    description=product.description or "",
                    category_name=category_name,
                    subcategory_name=subcategory_name,
                    materials=product.materials or [],
                    tags=product.tags or [],
                    craft_type=product.craftType or "",
                )
            )

        # ── Step D: Batch encode — much faster than one-by-one loop ───
        embeddings = model.encode(texts, show_progress_bar=False)

        # ── Step E: Store embeddings back on ORM objects ─────────────
        for product, emb in zip(batch, embeddings):
            product.embedding = emb.tolist()
            updated += 1

        offset += batch_size

        logger.info(
            "  Processed %d / %d products (%.0f%%)",
            min(offset, total),
            total,
            min(offset, total) / total * 100,
        )

    # ── Step F: Commit everything atomically ──────────────────────────
    db.commit()
    logger.info("Successfully embedded %d / %d products.", updated, total)

    return updated


# ---------------------------------------------------------------------------
# 5. Single-product helper (useful for real-time embedding when a new product
#    is created by a seller).
# ---------------------------------------------------------------------------
def embed_single_product(db: Session, product_id: str) -> bool:
    """
    Generate and persist an embedding for a **single** product by its ID.

    Returns True on success, False if the product was not found.
    """
    product = (
        db.query(Product)
        .options(
            joinedload(Product.category),
            joinedload(Product.subcategory),
        )
        .filter(Product.id == product_id)
        .first()
    )

    if not product:
        logger.warning("Product %s not found — skipping.", product_id)
        return False

    category_name = product.category.name if product.category else ""
    subcategory_name = product.subcategory.name if product.subcategory else ""

    text = build_product_text(
        name=product.name,
        description=product.description or "",
        category_name=category_name,
        subcategory_name=subcategory_name,
        materials=product.materials or [],
        tags=product.tags or [],
        craft_type=product.craftType or "",
    )

    embedding_vector = _get_model().encode(text, show_progress_bar=False)
    product.embedding = embedding_vector.tolist()
    db.commit()

    logger.info("✅ Embedded single product: %s (%s)", product.name, product_id)
    return True


# ---------------------------------------------------------------------------
# 6. CLI entry point
# ---------------------------------------------------------------------------
def main():
    """Run the full embedding pipeline from the command line."""
    logger.info("=" * 60)
    logger.info("  UdrCrafts — Product Embedding Generator")
    logger.info("  Model: all-MiniLM-L6-v2 (384 dims)")
    logger.info("=" * 60)

    db = SessionLocal()
    try:
        embed_all_products(db)
    except Exception as exc:
        logger.exception("Fatal error during embedding pipeline.")
        db.rollback()
        sys.exit(1)
    finally:
        db.close()

    logger.info("Done.")


if __name__ == "__main__":
    main()
