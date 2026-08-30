"""
events.py — FastAPI event tracker endpoints

All endpoints accept a JSON body and return the created
:class:`~app.models.UserBehaviour` record.

The frontend (or any internal service) can call these from JavaScript:

.. code-block:: javascript

    fetch(\"/api/v1/events/view\", {
      method: \"POST\",
      headers: { \"Content-Type\": \"application/json\" },
      body: JSON.stringify({
        user_id: \"uuid-...\",
        product_id: \"uuid-...\",
        source: \"home_page\",
        time_spent: 42,
      }),
    });

Each endpoint returns a 201 status on success and a 422 on validation
failure (handled automatically by Pydantic via FastAPI).
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.database import get_db
from app.ml import event_tracker as et

router = APIRouter()


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class EventResponse(BaseModel):
    """Shape returned by every event endpoint."""

    id: str
    userId: str
    eventType: str
    productId: str | None = None
    categoryId: str | None = None
    sellerId: str | None = None
    source: str | None = None
    metadata: Dict[str, Any] = {}
    createdAt: str  # ISO-8601

    class Config:
        from_attributes = True


def _to_response(record) -> EventResponse:
    """Convert a UserBehaviour ORM object to a Pydantic response model."""
    return EventResponse(
        id=record.id,
        userId=record.userId,
        eventType=record.eventType,
        productId=record.productId,
        categoryId=record.categoryId,
        sellerId=record.sellerId,
        source=record.source,
        metadata=record.eventMetadata or {},
        createdAt=record.createdAt.isoformat() if record.createdAt else "",
    )


# ---------------------------------------------------------------------------
# 1. PRODUCT_VIEW
# ---------------------------------------------------------------------------

class ProductViewRequest(BaseModel):
    user_id: str = Field(..., min_length=1, description="UUID of the viewing user")
    product_id: str = Field(..., min_length=1, description="UUID of the viewed product")
    source: str | None = Field(None, description="Page where the view occurred")
    time_spent: int | None = Field(None, ge=0, description="Seconds spent on the page")
    scroll_depth: int | None = Field(None, ge=0, le=100, description="Scroll depth percentage")
    metadata: Dict[str, Any] | None = None


@router.post("/view", status_code=201, summary="Track a product view")
def api_track_product_view(body: ProductViewRequest, db: Session = Depends(get_db)):
    """
    Log that a user viewed a product.

    This is the most frequent event.  Call it whenever the product detail
    page loads, or when a product card enters the viewport on the home /
    search page.
    """
    record = et.track_product_view(
        db,
        user_id=body.user_id,
        product_id=body.product_id,
        source=body.source,
        time_spent=body.time_spent,
        scroll_depth=body.scroll_depth,
        metadata=body.metadata,
    )
    return _to_response(record)


# ---------------------------------------------------------------------------
# 2. SEARCH
# ---------------------------------------------------------------------------

class SearchRequest(BaseModel):
    user_id: str = Field(..., min_length=1, description="UUID of the searching user")
    query: str = Field(..., min_length=1, description="The raw search text")
    source: str | None = Field(None, description="Where the search was initiated")
    result_count: int | None = Field(None, ge=0, description="Number of results returned")
    metadata: Dict[str, Any] | None = None


@router.post("/search", status_code=201, summary="Track a search query")
def api_track_search(body: SearchRequest, db: Session = Depends(get_db)):
    """
    Log that a user submitted a search query.

    Include ``result_count`` so the ML pipeline can infer query
    specificity and recall quality.
    """
    record = et.track_search(
        db,
        user_id=body.user_id,
        query=body.query,
        source=body.source,
        result_count=body.result_count,
        metadata=body.metadata,
    )
    return _to_response(record)


# ---------------------------------------------------------------------------
# 3. CLICK
# ---------------------------------------------------------------------------

class ClickRequest(BaseModel):
    user_id: str = Field(..., min_length=1, description="UUID of the clicking user")
    product_id: str = Field(..., min_length=1, description="UUID of the clicked product")
    source: str | None = Field(None, description="Where the click happened")
    element_clicked: str | None = Field(None, description="UI element that was clicked")
    metadata: Dict[str, Any] | None = None


@router.post("/click", status_code=201, summary="Track a product click")
def api_track_click(body: ClickRequest, db: Session = Depends(get_db)):
    """
    Log that a user clicked on a product card, button, or link.

    ``element_clicked`` helps distinguish *where* the click landed,
    e.g. ``\"product_card\"`` vs ``\"add_to_cart_button\"`` vs
    ``\"favorite_icon\"``.
    """
    record = et.track_click(
        db,
        user_id=body.user_id,
        product_id=body.product_id,
        source=body.source,
        element_clicked=body.element_clicked,
        metadata=body.metadata,
    )
    return _to_response(record)


# ---------------------------------------------------------------------------
# 4. WISHLIST
# ---------------------------------------------------------------------------

class WishlistRequest(BaseModel):
    user_id: str = Field(..., min_length=1, description="UUID of the user")
    product_id: str = Field(..., min_length=1, description="UUID of the product")
    action: str = Field("add", pattern=r"^(add|remove)$", description="'add' or 'remove'")
    source: str | None = Field(None, description="Where the wishlist action occurred")
    metadata: Dict[str, Any] | None = None


@router.post("/wishlist", status_code=201, summary="Track a wishlist add/remove")
def api_track_wishlist(body: WishlistRequest, db: Session = Depends(get_db)):
    """
    Log that a user added or removed a product from their wishlist.
    """
    record = et.track_wishlist(
        db,
        user_id=body.user_id,
        product_id=body.product_id,
        action=body.action,
        source=body.source,
        metadata=body.metadata,
    )
    return _to_response(record)


# ---------------------------------------------------------------------------
# 5. CART
# ---------------------------------------------------------------------------

class CartRequest(BaseModel):
    user_id: str = Field(..., min_length=1, description="UUID of the user")
    product_id: str = Field(..., min_length=1, description="UUID of the product")
    action: str = Field("add", pattern=r"^(add|remove|update)$", description="Cart action")
    quantity: int = Field(1, ge=1, description="Quantity involved")
    source: str | None = Field(None, description="Where the cart action occurred")
    cart_item_id: str | None = Field(None, description="UUID of the CartItem record")
    metadata: Dict[str, Any] | None = None


@router.post("/cart", status_code=201, summary="Track a cart add/remove/update")
def api_track_cart(body: CartRequest, db: Session = Depends(get_db)):
    """
    Log that a user added, removed, or updated a product in their cart.
    """
    record = et.track_cart(
        db,
        user_id=body.user_id,
        product_id=body.product_id,
        action=body.action,
        quantity=body.quantity,
        source=body.source,
        cart_item_id=body.cart_item_id,
        metadata=body.metadata,
    )
    return _to_response(record)


# ---------------------------------------------------------------------------
# 6. PURCHASE
# ---------------------------------------------------------------------------

class PurchaseRequest(BaseModel):
    user_id: str = Field(..., min_length=1, description="UUID of the purchasing user")
    order_id: str = Field(..., min_length=1, description="UUID of the completed Order")
    product_ids: List[str] = Field(..., min_length=1, description="UUIDs of all products in the order")
    total_amount: float = Field(..., ge=0, description="Total order value")
    source: str | None = Field(None, description="Where the purchase originated")
    metadata: Dict[str, Any] | None = None


@router.post("/purchase", status_code=201, summary="Track a completed purchase")
def api_track_purchase(body: PurchaseRequest, db: Session = Depends(get_db)):
    """
    Log that a user completed an order (purchase).

    A single row is created for the entire order, with the first product
    referenced in the FK columns and all product IDs stored in metadata.
    """
    record = et.track_purchase(
        db,
        user_id=body.user_id,
        order_id=body.order_id,
        product_ids=body.product_ids,
        total_amount=body.total_amount,
        source=body.source,
        metadata=body.metadata,
    )
    return _to_response(record)


# ---------------------------------------------------------------------------
# 6.5. RETURN
# ---------------------------------------------------------------------------

class ReturnRequest(BaseModel):
    user_id: str = Field(..., min_length=1, description="UUID of the returning user")
    product_id: str = Field(..., min_length=1, description="UUID of the returned product")
    order_id: str | None = Field(None, description="UUID of the related Order")
    quantity: int = Field(1, ge=1, description="Quantity returned")
    reason: str | None = Field(
        None,
        pattern=r"^(QUALITY|DAMAGED|MISTAKE|OTHER)$",
        description="Return reason — QUALITY/DAMAGED count as quality issues",
    )
    review_text: str | None = Field(None, max_length=5000, description="Private return feedback")
    rating: int | None = Field(None, ge=1, le=5, description="Optional 1-5 rating at return time")
    source: str | None = Field(None, description="Where the return originated")
    metadata: Dict[str, Any] | None = None


@router.post("/return", status_code=201, summary="Track a product return")
def api_track_return(body: ReturnRequest, db: Session = Depends(get_db)):
    """
    Log that a user returned an order item.

    ``reason`` drives scoring: quality-issue returns (``QUALITY`` /
    ``DAMAGED``) down-weight the brand for this user and accumulate a
    global seller penalty.
    """
    record = et.track_return(
        db,
        user_id=body.user_id,
        product_id=body.product_id,
        order_id=body.order_id,
        quantity=body.quantity,
        reason=body.reason,
        review_text=body.review_text,
        rating=body.rating,
        source=body.source,
        metadata=body.metadata,
    )
    return _to_response(record)


# ---------------------------------------------------------------------------
# 7. REVIEW
# ---------------------------------------------------------------------------

class ReviewRequest(BaseModel):
    user_id: str = Field(..., min_length=1, description="UUID of the reviewing user")
    product_id: str = Field(..., min_length=1, description="UUID of the reviewed product")
    review_text: str = Field(..., min_length=1, max_length=5000, description="The review text (stored as 500-char snippet in metadata)")
    source: str | None = Field(None, description="Where the review was submitted")
    review_id: str | None = Field(None, description="UUID of the Review record")
    metadata: Dict[str, Any] | None = None


@router.post("/review", status_code=201, summary="Track a product review")
def api_track_review(body: ReviewRequest, db: Session = Depends(get_db)):
    """
    Log that a user wrote a text review for a product.
    """
    record = et.track_review(
        db,
        user_id=body.user_id,
        product_id=body.product_id,
        review_text=body.review_text,
        source=body.source,
        review_id=body.review_id,
        metadata=body.metadata,
    )
    return _to_response(record)


# ---------------------------------------------------------------------------
# 8. RATING
# ---------------------------------------------------------------------------

class RatingRequest(BaseModel):
    user_id: str = Field(..., min_length=1, description="UUID of the rating user")
    product_id: str = Field(..., min_length=1, description="UUID of the rated product")
    rating_value: int = Field(..., ge=1, le=5, description="1–5 star rating")
    source: str | None = Field(None, description="Where the rating was submitted")
    metadata: Dict[str, Any] | None = None


@router.post("/rating", status_code=201, summary="Track a product rating")
def api_track_rating(body: RatingRequest, db: Session = Depends(get_db)):
    """
    Log that a user assigned a 1‑5 star rating to a product.
    """
    record = et.track_rating(
        db,
        user_id=body.user_id,
        product_id=body.product_id,
        rating_value=body.rating_value,
        source=body.source,
        metadata=body.metadata,
    )
    return _to_response(record)


# ---------------------------------------------------------------------------
# 9. Generic event — for custom event types
# ---------------------------------------------------------------------------

class TrackEventRequest(BaseModel):
    user_id: str = Field(..., min_length=1, description="UUID of the user")
    event_type: str = Field(..., min_length=1, description="Custom event label, e.g. 'SHARE'")
    product_id: str | None = None
    source: str | None = None
    metadata: Dict[str, Any] | None = None


@router.post("/track", status_code=201, summary="Track a custom event type")
def api_track_event(body: TrackEventRequest, db: Session = Depends(get_db)):
    """
    Log a custom event type that doesn't fit the 8 standard types.

    Use this for e.g. ``\"SHARE\"``, ``\"REPEAT_VISIT\"``, ``\"WALLET_CONNECT\"``,
    or any other future interaction.
    """
    record = et.track_event(
        db,
        user_id=body.user_id,
        event_type=body.event_type.upper(),
        product_id=body.product_id,
        source=body.source,
        metadata=body.metadata,
    )
    return _to_response(record)
