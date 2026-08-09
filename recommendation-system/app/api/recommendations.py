# pyrefly: ignore [missing-import]
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app.models import Product, Seller, User
from app.ml.content_based import get_similar_products
from app.ml.hybrid_search import hybrid_search, load_products
from app.ml.seller_boost import fair_rank, CANCEL_PENALTY_WEIGHT
from app.core.fairness_config import get_config, update_config

router = APIRouter()

def format_product(p: Product):
    image_url = '/products/product-vase.jpg'
    if getattr(p, 'images', None) and len(p.images) > 0:
        image_url = p.images[0].url

    return {
        "id": p.id,
        "name": p.name,
        "price": getattr(p, 'price', 999),
        "seller_name": p.seller.firstName if getattr(p, 'seller', None) else "UdrCrafts Artisan",
        "seller_new": p.seller.isNewSeller if getattr(p, 'seller', None) else False,
        "image": image_url,
        "popularity": getattr(p, 'popularity', 0),
        "score": round(getattr(p, 'final_score', 0), 2),
        "engagement_score": round(getattr(p, 'engagement_score', 0), 2),
        "explanation": getattr(p, 'explanation', 'Recommended for you.'),
        "score_details": getattr(p, 'score_details', None)
    }

@router.get("/home/{user_id}")
def get_home_recommendations(user_id: str, db: Session = Depends(get_db)):
    """
    Returns hybrid recommendations for the home page, biased by user history.

    Uses the full **RecommendationEngine** pipeline (5 stages):

    1. Candidate generation (content-based, collaborative, trending, new
       arrivals, category affinity, random discovery)
    2. Feature computation (10 sub-scores per candidate, including the
       behaviour-based engagement score)
    3. Score blending (weighted linear combination)
    4. Business rules (rating threshold, inventory, purchase exclusion,
       recently-viewed exclusion, seller fairness, category diversity)
    5. Ranking & selection (final sort, top-N, explanation attachment)

    This replaces the previous manual scoring logic that didn't properly
    use purchase history, UserBehaviour category affinity, or the full
    signal blending pipeline.
    """
    from app.ml.recommendation_engine import get_recommendations
    
    user = db.query(User).filter(User.id == user_id).first()
    seller = db.query(Seller).filter(Seller.id == user_id).first()
    
    user_city_id = getattr(user, 'cityId', None) or getattr(seller, 'cityId', None)
    user_state_id = getattr(user, 'stateId', None) or getattr(seller, 'stateId', None)

    results = get_recommendations(
        db, 
        user_id, 
        limit=20,
        user_city_id=user_city_id,
        user_state_id=user_state_id
    )

    # Attach ScoredProduct fields as transient attributes so we can
    # reuse the existing format_product() helper
    formatted = []
    for sp in results:
        setattr(sp.product, "final_score", sp.final_score)
        setattr(sp.product, "explanation", sp.explanation)
        setattr(sp.product, "engagement_score", sp.engagement_score)
        setattr(sp.product, "score_details", {
            "content": round(sp.content_score, 3),
            "collab": round(sp.collab_score, 3),
            "trend": round(sp.trend_score, 3),
            "seasonal": round(sp.seasonal_boost, 3),
            "location": round(sp.location_boost, 3),
            "category": round(sp.category_boost, 3),
            "brand": round(sp.brand_boost, 3),
            "rating": round(sp.rating_score, 3),
            "seller": round(sp.seller_boost, 3),
            "source": sp.source,
        })
        formatted.append(format_product(sp.product))

    return {
        "user_id": user_id,
        "recommendations": formatted,
    }

@router.get("/product/{product_id}")
def get_similar(product_id: str, db: Session = Depends(get_db)):
    """
    Returns similar products using pgvector cosine similarity.
    """
    similar = get_similar_products(product_id, db, limit=10)
    return {
        "product_id": product_id,
        "similar_products": [format_product(p) for p in similar],
        "explanation": "Because you viewed this product."
    }

@router.get("/trending")
def get_trending_products(db: Session = Depends(get_db)):
    """
    Returns trending products based on interaction decay scores.
    """
    trending = db.query(Product).options(joinedload(Product.images)).order_by(Product.popularity.desc()).limit(10).all()
    return {
        "trending_products": [format_product(p) for p in trending],
        "explanation": "Popular among customers recently."
    }

@router.get("/new-arrivals")
def get_new_arrivals(db: Session = Depends(get_db)):
    """
    Returns new products heavily weighted towards new sellers (fairness ranking).
    """
    new_seller_products = (
        db.query(Product)
        .options(joinedload(Product.images))
        .join(Seller)
        .filter(Seller.isNewSeller == True)
        .order_by(Product.createdAt.desc())
        .limit(20)
        .all()
    )
    return {
        "new_arrivals": [format_product(p) for p in new_seller_products],
        "explanation": "Discover new artisans on UdrCrafts."
    }


# ---------------------------------------------------------------------------
# Also-bought — retail-style "Customers who bought this also bought"
# ---------------------------------------------------------------------------
@router.get("/also-bought/{product_id}")
def get_also_bought(product_id: str, limit: int = Query(10, ge=1, le=20), db: Session = Depends(get_db)):
    """
    Returns products frequently purchased together with the given product.

    Algorithm
    ─────────
    1. Find all orders that contain the given product.
    2. Collect every *other* product that appears in those same orders.
    3. Rank co-occurring products by frequency (most common first).
    4. Exclude the seed product itself from results.

    This is a pure **purchase-affinity** signal — no embeddings, no
    collaborative matrix factorisation, just market-basket co-occurrence.
    It works immediately as soon as orders exist in the database, without
    needing any model to be trained.

    Returns an empty list when there are no co-purchases yet.
    """
    from sqlalchemy import func
    from app.models import OrderItem, Order

    # Sub-query: find all order IDs that contain the seed product
    order_ids_subq = (
        db.query(OrderItem.orderId)
        .filter(OrderItem.productId == product_id)
        .subquery()
    )

    # Query: count how many times each other product appears in those orders
    also_bought = (
        db.query(
            OrderItem.productId,
            func.count(OrderItem.id).label("co_purchase_count"),
        )
        .filter(
            OrderItem.orderId.in_(order_ids_subq),
            OrderItem.productId != product_id,  # exclude the seed
        )
        .group_by(OrderItem.productId)
        .order_by(func.count(OrderItem.id).desc())
        .limit(limit)
        .all()
    )

    if not also_bought:
        return {
            "product_id": product_id,
            "also_bought": [],
            "explanation": "No co-purchase data available yet.",
        }

    # Fetch full product records for the matched IDs
    matched_ids = [row.productId for row in also_bought]
    products = (
        db.query(Product)
        .options(joinedload(Product.images))
        .filter(Product.id.in_(matched_ids))
        .all()
    )

    # Preserve the co-occurrence ranking order
    id_map = {p.id: p for p in products}
    ranked = []
    for row in also_bought:
        p = id_map.get(row.productId)
        if p:
            setattr(p, "final_score", min(1.0, row.co_purchase_count / 10.0))
            setattr(p, "explanation", f"Frequently bought together ({row.co_purchase_count} orders).")
            ranked.append(p)

    return {
        "product_id": product_id,
        "also_bought": [format_product(p) for p in ranked],
        "explanation": "Customers who bought this also bought these items.",
    }


# ---------------------------------------------------------------------------
# Hybrid semantic + keyword search
# ---------------------------------------------------------------------------
@router.get("/search")
def search_products(
    q: str = Query("...", min_length=0, description="Free-text search query"),
    limit: int = Query(20, ge=1, le=100, description="Results per page"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    alpha: float = Query(
        0.7,
        ge=0.0,
        le=1.0,
        description="Semantic weight (0 = keyword only, 1 = semantic only)",
    ),
    db: Session = Depends(get_db),
):
    """
    Hybrid product search combining pgvector semantic similarity with
    PostgreSQL full-text search (tsvector).

    **Query parameters**

    - ``q`` — Free text (e.g. "handwoven wool shawl").  Empty string returns
      products ordered by popularity.
    - ``limit`` / ``offset`` — Standard pagination.
    - ``alpha`` — Blend between 0.0 (keyword-only) and 1.0 (semantic-only).
      Default 0.7 biases toward semantic meaning, which is usually better
      for natural-language queries like "warm winter gift".

    **Response**

    .. code-block:: json

        {
          "query": "handwoven wool shawl",
          "alpha": 0.7,
          "total": 42,
          "results": [ { "id": "...", "name": "...", ... } ],
          "explanation": "Results blended from semantic similarity and keyword matching."
        }
    """
    scored_results, total = hybrid_search(
        db, q, limit=limit, offset=offset, alpha=alpha
    )
    products = load_products(db, scored_results)

    # Apply seller fairness boost so new artisans get visibility in search
    cfg = get_config(db)
    products = fair_rank(
        products,
        total_slots=limit,
        boost_amount=cfg.boost_amount,
        new_seller_ratio=cfg.new_seller_ratio,
        max_per_seller_ratio=cfg.max_per_seller_ratio,
        attribute="final_score",
        penalty_weight=CANCEL_PENALTY_WEIGHT,
    )

    return {
        "query": q,
        "alpha": alpha,
        "total": total,
        "results": [format_product(p) for p in products],
        "explanation": "Results blended from semantic similarity and keyword matching, boosted for seller fairness.",
    }


# ---------------------------------------------------------------------------
# Fairness configuration — admin tuning
# ---------------------------------------------------------------------------


class FairnessConfigResponse(BaseModel):
    """Current fairness settings returned to the admin."""
    boost_amount: float
    new_seller_ratio: float
    max_per_seller_ratio: float


class FairnessConfigUpdate(BaseModel):
    """Fields an admin can update.  All are optional — omitted fields stay."""
    boost_amount: float | None = Field(None, ge=0.0, le=1.0, description="Score boost for new sellers")
    new_seller_ratio: float | None = Field(None, ge=0.0, le=1.0, description="Fraction of slots reserved for new sellers")
    max_per_seller_ratio: float | None = Field(None, ge=0.0, le=1.0, description="Max fraction of slots per seller")


@router.get("/fairness-config", response_model=FairnessConfigResponse, summary="Read seller fairness config")
def get_fairness_config(db: Session = Depends(get_db)):
    """
    Return the current seller fairness parameters.

    These values are used by the home page and search endpoints to
    promote new artisans and prevent seller dominance.
    """
    cfg = get_config(db)
    return FairnessConfigResponse(
        boost_amount=cfg.boost_amount,
        new_seller_ratio=cfg.new_seller_ratio,
        max_per_seller_ratio=cfg.max_per_seller_ratio,
    )


@router.put("/fairness-config", response_model=FairnessConfigResponse, summary="Update seller fairness config")
def update_fairness_config(
    body: FairnessConfigUpdate,
    db: Session = Depends(get_db),
):
    """
    Update one or more seller fairness parameters.

    Only the fields included in the request body are changed; omitted
    fields keep their current values.  Changes take effect immediately
    on the next recommendation call.

    **Example request** (raise new-seller boost from 0.15 to 0.25):

    .. code-block:: json

        {"boost_amount": 0.25}
    """
    cfg = update_config(
        db,
        boost_amount=body.boost_amount,
        new_seller_ratio=body.new_seller_ratio,
        max_per_seller_ratio=body.max_per_seller_ratio,
    )
    return FairnessConfigResponse(
        boost_amount=cfg.boost_amount,
        new_seller_ratio=cfg.new_seller_ratio,
        max_per_seller_ratio=cfg.max_per_seller_ratio,
    )
