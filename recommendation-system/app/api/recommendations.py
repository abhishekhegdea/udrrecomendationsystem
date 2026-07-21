from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app.models import Product, Seller
from app.ranking.ranker import HybridRanker
from app.ml.content_based import get_similar_products
from app.ml.collaborative import collaborative_model

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
        "explanation": getattr(p, 'explanation', 'Recommended for you.')
    }

@router.get("/home/{user_id}")
def get_home_recommendations(user_id: str, db: Session = Depends(get_db)):
    """
    Returns hybrid recommendations for the home page, biased by user history.
    """
    from app.models import ProductView
    
    # Get user's recent views
    recent_views = db.query(ProductView).filter(ProductView.userId == user_id).order_by(ProductView.createdAt.desc()).limit(10).all()
    viewed_product_ids = [v.productId for v in recent_views]
    
    # Find categories of viewed products
    viewed_products = db.query(Product).filter(Product.id.in_(viewed_product_ids)).all()
    preferred_categories = set([p.categoryId for p in viewed_products if p.categoryId])
    
    candidates = db.query(Product).options(joinedload(Product.images)).limit(100).all()
    ranker = HybridRanker(db)
    
    for p in candidates:
        # Get matrix factorization score for this specific user/product combo
        collab_score = collaborative_model.get_collaborative_score(user_id, p.id)
        
        base_score = ranker.calculate_final_score(p, 0.5, collab_score)
        explanation = "Trending among customers."
        
        # Boost score if it matches user's preferred categories
        if getattr(p, 'categoryId', None) in preferred_categories:
            base_score += 0.5 # category affinity boost
            explanation = "Based on your recent viewing history."
            
        setattr(p, 'final_score', base_score)
        setattr(p, 'explanation', explanation)
    
    candidates.sort(key=lambda x: getattr(x, 'final_score', 0), reverse=True)
    
    final_recs = ranker.apply_fairness_ranking(candidates, total_slots=20)

    return {
        "user_id": user_id,
        "recommendations": [format_product(p) for p in final_recs]
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
    new_seller_products = db.query(Product).options(joinedload(Product.images)).join(Seller).filter(Seller.isNewSeller == True).limit(20).all()
    return {
        "new_arrivals": [format_product(p) for p in new_seller_products],
        "explanation": "Discover new artisans on UdrCrafts."
    }
