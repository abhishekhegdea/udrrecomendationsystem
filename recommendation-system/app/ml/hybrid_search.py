"""
hybrid_search.py — Semantic + Keyword Search for UdrCrafts

Combines two signals for product search:

  1. **Semantic similarity** (pgvector)
     - Encode the user's query with all-MiniLM-L6-v2 (384-dim).
     - Use cosine distance (<=>) against Product.embedding.
     - Convert distance to similarity: 1 - distance.

  2. **Keyword relevance** (PostgreSQL tsvector)
     - Use ``plainto_tsquery('english', :query)`` for parsing the user's
       natural-language query into lexemes.
     - Match against ``to_tsvector('english', name || ' ' || description)``.
     - Score with ``ts_rank()``.

The two scores are normalised and blended with a configurable alpha weight:

    final_score = α · semantic_similarity + (1 − α) · keyword_score
"""

from __future__ import annotations

import logging
from typing import List, Optional, Tuple

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.ml.embedding_service import _get_model

logger = logging.getLogger(__name__)

# ── Defaults ─────────────────────────────────────────────────────────────
DEFAULT_LIMIT = 20
DEFAULT_OFFSET = 0
DEFAULT_ALPHA = 0.7  # Weight for semantic (0 = keyword only, 1 = semantic only)


# ---------------------------------------------------------------------------
# Result container
# ---------------------------------------------------------------------------
class HybridSearchResult:
    """Lightweight container for a single search hit."""

    __slots__ = ("product_id", "semantic_score", "keyword_score", "combined_score")

    def __init__(
        self,
        product_id: str,
        semantic_score: float,
        keyword_score: float,
        combined_score: float,
    ):
        self.product_id = product_id
        self.semantic_score = semantic_score
        self.keyword_score = keyword_score
        self.combined_score = combined_score


# ---------------------------------------------------------------------------
# Core hybrid query
# ---------------------------------------------------------------------------
def hybrid_search(
    db: Session,
    query: str,
    *,
    limit: int = DEFAULT_LIMIT,
    offset: int = DEFAULT_OFFSET,
    alpha: float = DEFAULT_ALPHA,
) -> Tuple[List[HybridSearchResult], int]:
    """
    Run a hybrid search and return ``(results, total_count)``.

    Parameters
    ----------
    db : Session
        Active SQLAlchemy database session.
    query : str
        Free-text search query from the user.
    limit : int
        Maximum number of results to return (pagination page size).
    offset : int
        Number of results to skip (pagination offset).
    alpha : float
        Blend factor between 0.0 (keyword only) and 1.0 (semantic only).

    Returns
    -------
    Tuple[List[HybridSearchResult], int]
        - A list of result containers, sorted by ``combined_score`` descending.
        - Total number of matching products (ignoring pagination).
    """
    query = query.strip()

    # ── Edge case: empty query → semantic-only, no keyword filtering ──
    # If the user sends an empty string we still return results ranked by
    # semantic similarity to the query "".  SentenceTransformer encodes
    # an empty string as a valid (though uninformative) vector, so the
    # semantic arm will still produce a uniform ordering.
    # The keyword arm is skipped entirely.
    if not query:
        return _semantic_only(db, limit=limit, offset=offset)

    # ── Generate query embedding ──────────────────────────────────────
    model = _get_model()
    query_embedding = model.encode(query, show_progress_bar=False).tolist()

    # ── Build and execute the hybrid SQL query ─────────────────────────
    # We use raw SQL via `text()` because pgvector's <=> operator and
    # PostgreSQL's ts_rank / plainto_tsquery are not exposed through the
    # SQLAlchemy ORM query builder.
    sql = text(
        """
        WITH scored AS (
            SELECT
                p.id,
                -- Semantic similarity: convert cosine distance to similarity
                GREATEST(0, 1 - (p.embedding <=> :query_emb::vector(384))) AS semantic_score,
                -- Keyword relevance via tsvector
                COALESCE(
                    ts_rank(
                        to_tsvector('english',
                            COALESCE(p.name, '') || ' ' || COALESCE(p.description, '')
                        ),
                        plainto_tsquery('english', :query)
                    ),
                    0
                ) AS keyword_score
            FROM "Product" p
            WHERE p.embedding IS NOT NULL
              -- Only include rows where the keyword query actually matches
              -- (avoids scoring thousands of irrelevant products)
              AND plainto_tsquery('english', :query) @@ to_tsvector('english',
                      COALESCE(p.name, '') || ' ' || COALESCE(p.description, '')
                  )
        )
        SELECT *,
               (:alpha * semantic_score + (1.0 - :alpha) * keyword_score) AS combined_score
        FROM scored
        ORDER BY combined_score DESC
        OFFSET :offset
        LIMIT :limit
        """
    )

    # ── Count query (same WHERE clause, no ordering/pagination) ──────
    count_sql = text(
        """
        SELECT COUNT(*) AS total
        FROM "Product" p
        WHERE p.embedding IS NOT NULL
          AND plainto_tsquery('english', :query) @@ to_tsvector('english',
                  COALESCE(p.name, '') || ' ' || COALESCE(p.description, '')
              )
        """
    )

    params = {
        "query_emb": str(query_embedding),
        "query": query,
        "alpha": alpha,
        "limit": limit,
        "offset": offset,
    }

    rows = db.execute(sql, params).fetchall()
    total_row = db.execute(count_sql, {"query": query}).one()
    total = total_row.total

    results = [
        HybridSearchResult(
            product_id=row.id,
            semantic_score=float(row.semantic_score),
            keyword_score=float(row.keyword_score),
            combined_score=float(row.combined_score),
        )
        for row in rows
    ]

    logger.debug(
        "Hybrid search (%r) returned %d results (total %d).",
        query,
        len(results),
        total,
    )
    return results, total


# ---------------------------------------------------------------------------
# Fallback: semantic-only (used when query is empty)
# ---------------------------------------------------------------------------
def _semantic_only(
    db: Session,
    limit: int = DEFAULT_LIMIT,
    offset: int = DEFAULT_OFFSET,
) -> Tuple[List[HybridSearchResult], int]:
    """Rank all products by embedding similarity to a zero vector."""
    sql = text(
        """
        SELECT
            p.id,
            0.0 AS semantic_score,
            0.0 AS keyword_score,
            p.popularity AS combined_score
        FROM "Product" p
        WHERE p.embedding IS NOT NULL
        ORDER BY p.popularity DESC
        OFFSET :offset
        LIMIT :limit
        """
    )
    count_sql = text(
        "SELECT COUNT(*) AS total FROM \"Product\" WHERE embedding IS NOT NULL"
    )

    rows = db.execute(sql, {"offset": offset, "limit": limit}).fetchall()
    total = db.execute(count_sql).one().total

    return [
        HybridSearchResult(
            product_id=row.id,
            semantic_score=float(row.semantic_score),
            keyword_score=float(row.keyword_score),
            combined_score=float(row.combined_score),
        )
        for row in rows
    ], total


# ---------------------------------------------------------------------------
# Load full Product ORM objects from a list of HybridSearchResult
# ---------------------------------------------------------------------------
def load_products(
    db: Session, results: List[HybridSearchResult]
) -> List[Product]:
    """
    Fetch the full ``Product`` ORM objects (with eager-loaded relationships)
    for a set of hybrid search results, preserving the ordering.

    Parameters
    ----------
    db : Session
        Active database session.
    results : List[HybridSearchResult]
        Results from ``hybrid_search()``, sorted by combined_score.

    Returns
    -------
    List[Product]
        Product ORM instances in the same order as *results*.
    """
    from app.models import Product  # avoid circular import

    if not results:
        return []

    product_ids = [r.product_id for r in results]

    # Fetch all products in one query, then re-sort to match the order
    products = (
        db.query(Product)
        .options(
            joinedload(Product.images),
            joinedload(Product.category),
            joinedload(Product.seller),
        )
        .filter(Product.id.in_(product_ids))
        .all()
    )

    # Re-sort results to match the original ordering from hybrid_search
    product_map = {p.id: p for p in products}
    ordered = []
    for rid in product_ids:
        p = product_map.get(rid)
        if p:
            # Attach the combined score as a transient attribute for the API
            p.final_score = next(
                r.combined_score for r in results if r.product_id == rid
            )
            ordered.append(p)

    return ordered
