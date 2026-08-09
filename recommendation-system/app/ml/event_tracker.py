"""
event_tracker.py — Unified User Behaviour Event Tracker

Every user-facing action on UdrCrafts is logged as a row in the
``UserBehaviour`` table.  This module provides one function per event
type, all of which funnel into the same ``track_event()`` core so the
recommendation pipeline has a single, consistent source of truth.

Events tracked
──────────────

+-----------------+------------------------------------------------------+
| Event           | Description                                          |
+=================+======================================================+
| PRODUCT_VIEW    | User viewed a product detail page / card             |
| SEARCH          | User submitted a search query                        |
| CLICK           | User clicked a product card, button, or link         |
| WISHLIST        | User added or removed a product from their wishlist  |
| CART            | User added / removed / updated a cart item           |
| PURCHASE        | User completed an order (one row per purchase)       |
| REVIEW          | User wrote a text review for a product               |
| RATING          | User assigned a 1‑5 star rating to a product         |
+-----------------+------------------------------------------------------+

Metadata shapes by event type
──────────────────────────────

**PRODUCT_VIEW**::
    { "timeSpent": <int|null>, "scrollDepth": <int|null> }

**SEARCH**::
    { "query": "<string>", "resultCount": <int> }

**CLICK**::
    { "elementClicked": "<string>|null" }

**WISHLIST**::
    { "action": "add" | "remove" }

**CART**::
    { "action": "add" | "remove" | "update", "quantity": <int>, "cartItemId": "<str>|null" }

**PURCHASE**::
    { "orderId": "<string>", "totalAmount": <float>, "itemCount": <int>, "productIds": ["<str>", ...] }

**REVIEW**::
    { "reviewText": "<string>", "reviewId": "<string>" }

**RATING**::
    { "ratingValue": <int> }   (* 1‑5 *)

**RETURN**::
    { "orderId": "<str>|null", "quantity": <int>,
      "reason": "QUALITY|DAMAGED|MISTAKE|OTHER|null",
      "reviewText": "<str>|null", "rating": <int>|null,
      "qualityIssue": <bool> }

    Quality-issue returns (``QUALITY`` / ``DAMAGED``) set
    ``qualityIssue: true`` — the engine down-weights that brand for the
    returning user and the seller accumulates a global return penalty.

"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime
from typing import Any, Dict, List, Tuple

from sqlalchemy.orm import Session

from app.models import Product, UserBehaviour

logger = logging.getLogger(__name__)

# ── Supported event types (constants) ───────────────────────────────────
EVENT_PRODUCT_VIEW = "PRODUCT_VIEW"
EVENT_SEARCH = "SEARCH"
EVENT_CLICK = "CLICK"
EVENT_WISHLIST = "WISHLIST"
EVENT_CART = "CART"
EVENT_PURCHASE = "PURCHASE"
EVENT_RETURN = "RETURN"
EVENT_REVIEW = "REVIEW"
EVENT_RATING = "RATING"


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _new_id() -> str:
    """Generate a UUID v4 string for use as a primary key."""
    return str(uuid.uuid4())


def _resolve_product(db: Session, product_id: str | None) -> Tuple[str | None, str | None, str | None]:
    """
    Look up a product and return ``(product_id, category_id, seller_id)``.

    If *product_id* is ``None``, all three values are ``None``.
    If the product is not found, all three values are ``None``.
    """
    if product_id is None:
        return None, None, None

    product = db.query(Product).filter(Product.id == product_id).first()
    if product is None:
        logger.warning("Product %s not found - skipping category/seller resolution.", product_id)
        # Return ``None`` for the product too: ``UserBehaviour.productId`` is a
        # foreign key, so inserting the *missing* id would raise an IntegrityError
        # (→ HTTP 500 with no CORS headers in the browser).
        return None, None, None

    return product.id, product.categoryId, product.sellerId


def _build_metadata(**kwargs: Any) -> Dict[str, Any]:
    """Build a metadata dict, dropping keys whose values are ``None``."""
    return {k: v for k, v in kwargs.items() if v is not None}


# ---------------------------------------------------------------------------
# 1. PRODUCT_VIEW — user viewed a product
# ---------------------------------------------------------------------------

def track_product_view(
    db: Session,
    user_id: str,
    product_id: str,
    source: str | None = None,
    time_spent: int | None = None,
    scroll_depth: int | None = None,
    metadata: Dict[str, Any] | None = None,
) -> UserBehaviour:
    """
    Log a **product view** event.

    Parameters
    ----------
    db : Session
        Active database session.
    user_id : str
        UUID of the viewing user.
    product_id : str
        UUID of the viewed product.
    source : str, optional
        Page or component where the view originated
        (e.g. ``"home_page"``, ``"search_results"``, ``"recommendation_carousel"``).
    time_spent : int, optional
        How long (seconds) the user stayed on the detail page.
    scroll_depth : int, optional
        How far (percentage) the user scrolled.
    metadata : dict, optional
        Any additional key-value pairs to merge into the stored metadata.

    Returns
    -------
    UserBehaviour
        The newly created database record.
    """
    pid, cid, sid = _resolve_product(db, product_id)
    meta = _build_metadata(
        timeSpent=time_spent,
        scrollDepth=scroll_depth,
    )
    if metadata:
        meta.update(metadata)

    return track_event(
        db,
        user_id=user_id,
        event_type=EVENT_PRODUCT_VIEW,
        product_id=pid,
        category_id=cid,
        seller_id=sid,
        source=source,
        metadata=meta,
    )


# ---------------------------------------------------------------------------
# 2. SEARCH — user submitted a search query
# ---------------------------------------------------------------------------

def track_search(
    db: Session,
    user_id: str,
    query: str,
    source: str | None = None,
    result_count: int | None = None,
    metadata: Dict[str, Any] | None = None,
) -> UserBehaviour:
    """
    Log a **search** event.

    Parameters
    ----------
    db : Session
        Active database session.
    user_id : str
        UUID of the searching user.
    query : str
        The raw search text entered by the user.
    source : str, optional
        Where the search was initiated (e.g. ``"navbar"``, ``"home_search"``).
    result_count : int, optional
        Number of products returned by the search.
    metadata : dict, optional
        Any additional key-value pairs.

    Returns
    -------
    UserBehaviour
        The newly created database record.
    """
    meta = _build_metadata(
        query=query,
        resultCount=result_count,
    )
    if metadata:
        meta.update(metadata)

    return track_event(
        db,
        user_id=user_id,
        event_type=EVENT_SEARCH,
        source=source,
        metadata=meta,
    )


# ---------------------------------------------------------------------------
# 3. CLICK — user clicked on a product card / button / link
# ---------------------------------------------------------------------------

def track_click(
    db: Session,
    user_id: str,
    product_id: str,
    source: str | None = None,
    element_clicked: str | None = None,
    metadata: Dict[str, Any] | None = None,
) -> UserBehaviour:
    """
    Log a **click** event on a product or UI element.

    Parameters
    ----------
    db : Session
        Active database session.
    user_id : str
        UUID of the clicking user.
    product_id : str
        UUID of the product that was clicked.
    source : str, optional
        Where the click happened
        (e.g. ``"search_results"``, ``"recommendation_carousel"``, ``"cart_page"``).
    element_clicked : str, optional
        The specific UI element that was interacted with
        (e.g. ``"product_card"``, ``"add_to_cart_button"``, ``"favorite_icon"``).
    metadata : dict, optional
        Any additional key-value pairs.

    Returns
    -------
    UserBehaviour
        The newly created database record.
    """
    pid, cid, sid = _resolve_product(db, product_id)
    meta = _build_metadata(
        elementClicked=element_clicked,
    )
    if metadata:
        meta.update(metadata)

    return track_event(
        db,
        user_id=user_id,
        event_type=EVENT_CLICK,
        product_id=pid,
        category_id=cid,
        seller_id=sid,
        source=source,
        metadata=meta,
    )


# ---------------------------------------------------------------------------
# 4. WISHLIST — user added or removed a product from their wishlist
# ---------------------------------------------------------------------------

def track_wishlist(
    db: Session,
    user_id: str,
    product_id: str,
    action: str = "add",
    source: str | None = None,
    metadata: Dict[str, Any] | None = None,
) -> UserBehaviour:
    """
    Log a **wishlist** event (add or remove).

    Parameters
    ----------
    db : Session
        Active database session.
    user_id : str
        UUID of the user.
    product_id : str
        UUID of the product being wishlisted / un-wishlisted.
    action : str
        ``"add"`` or ``"remove"``.
    source : str, optional
        Where the wishlist action occurred
        (e.g. ``"product_details"``, ``"quick_view_modal"``, ``"wishlist_page"``).
    metadata : dict, optional
        Any additional key-value pairs.

    Returns
    -------
    UserBehaviour
        The newly created database record.
    """
    pid, cid, sid = _resolve_product(db, product_id)
    meta = _build_metadata(action=action)
    if metadata:
        meta.update(metadata)

    return track_event(
        db,
        user_id=user_id,
        event_type=EVENT_WISHLIST,
        product_id=pid,
        category_id=cid,
        seller_id=sid,
        source=source,
        metadata=meta,
    )


# ---------------------------------------------------------------------------
# 5. CART — user added / removed / updated a cart item
# ---------------------------------------------------------------------------

def track_cart(
    db: Session,
    user_id: str,
    product_id: str,
    action: str = "add",
    quantity: int = 1,
    source: str | None = None,
    cart_item_id: str | None = None,
    metadata: Dict[str, Any] | None = None,
) -> UserBehaviour:
    """
    Log a **cart** event (add, remove, or update quantity).

    Parameters
    ----------
    db : Session
        Active database session.
    user_id : str
        UUID of the user.
    product_id : str
        UUID of the product being added / removed.
    action : str
        ``"add"``, ``"remove"``, or ``"update"``.
    quantity : int
        Quantity involved in the action.
    source : str, optional
        Where the cart action occurred
        (e.g. ``"product_details"``, ``"quick_view_modal"``, ``"cart_page"``).
    cart_item_id : str, optional
        UUID of the ``CartItem`` record (if available).
    metadata : dict, optional
        Any additional key-value pairs.

    Returns
    -------
    UserBehaviour
        The newly created database record.
    """
    pid, cid, sid = _resolve_product(db, product_id)
    meta = _build_metadata(
        action=action,
        quantity=quantity,
        cartItemId=cart_item_id,
    )
    if metadata:
        meta.update(metadata)

    return track_event(
        db,
        user_id=user_id,
        event_type=EVENT_CART,
        product_id=pid,
        category_id=cid,
        seller_id=sid,
        source=source,
        metadata=meta,
    )


# ---------------------------------------------------------------------------
# 6. PURCHASE — user completed an order
# ---------------------------------------------------------------------------

def track_purchase(
    db: Session,
    user_id: str,
    order_id: str,
    product_ids: List[str],
    total_amount: float,
    source: str | None = None,
    metadata: Dict[str, Any] | None = None,
) -> UserBehaviour:
    """
    Log a **purchase** event (one row per completed order).

    Unlike other events, a purchase may involve many products.
    A single ``UserBehaviour`` row is created for the entire order;
    the individual product IDs are stored in ``metadata.productIds``.
    The ``productId`` / ``categoryId`` / ``sellerId`` columns reference
    the **first** product in the order for quick filtering.

    Parameters
    ----------
    db : Session
        Active database session.
    user_id : str
        UUID of the purchasing user.
    order_id : str
        UUID of the completed ``Order``.
    product_ids : list of str
        UUIDs of all products in this order.
    total_amount : float
        Total monetary value of the order.
    source : str, optional
        Where the purchase originated
        (e.g. ``"checkout_page"``, ``"buy_now_button"``).
    metadata : dict, optional
        Any additional key-value pairs.

    Returns
    -------
    UserBehaviour
        The newly created database record.
    """
    # Resolve category/seller from the first product in the order
    first_pid, cid, sid = _resolve_product(db, product_ids[0] if product_ids else None)

    meta = _build_metadata(
        orderId=order_id,
        totalAmount=total_amount,
        itemCount=len(product_ids),
        productIds=product_ids,
    )
    if metadata:
        meta.update(metadata)

    return track_event(
        db,
        user_id=user_id,
        event_type=EVENT_PURCHASE,
        product_id=first_pid,
        category_id=cid,
        seller_id=sid,
        source=source,
        metadata=meta,
    )


# ---------------------------------------------------------------------------
# 6.5. RETURN — user returned an order/item
# ---------------------------------------------------------------------------

def track_return(
    db: Session,
    user_id: str,
    product_id: str,
    order_id: str | None = None,
    quantity: int = 1,
    source: str | None = None,
    reason: str | None = None,
    review_text: str | None = None,
    rating: int | None = None,
    metadata: Dict[str, Any] | None = None,
) -> UserBehaviour:
    """
    Log a **return** event.

    Parameters
    ----------
    db : Session
        Active database session.
    user_id : str
        UUID of the returning user.
    product_id : str
        UUID of the product being returned.
    order_id : str, optional
        UUID of the related Order.
    quantity : int
        Quantity returned.
    source : str, optional
        Where the return originated.
    reason : str, optional
        Return reason — one of ``QUALITY``, ``DAMAGED``, ``MISTAKE``,
        ``OTHER``.  ``QUALITY`` / ``DAMAGED`` are quality issues and set
        ``qualityIssue`` in the metadata (the scoring engine uses it to
        penalise the brand for this user and the seller globally).
    review_text : str, optional
        Private feedback captured alongside the return.
    rating : int, optional
        Optional 1–5 rating given at return time.
    metadata : dict, optional
        Any additional key-value pairs.
    """
    pid, cid, sid = _resolve_product(db, product_id)
    quality_issue = reason in ("QUALITY", "DAMAGED")
    meta = _build_metadata(
        orderId=order_id,
        quantity=quantity,
        reason=reason,
        reviewText=review_text,
        rating=rating,
        qualityIssue=quality_issue if reason else None,
    )
    if metadata:
        meta.update(metadata)

    return track_event(
        db,
        user_id=user_id,
        event_type=EVENT_RETURN,
        product_id=pid,
        category_id=cid,
        seller_id=sid,
        source=source,
        metadata=meta,
    )


# ---------------------------------------------------------------------------
# 7. REVIEW — user wrote a text review for a product
# ---------------------------------------------------------------------------

def track_review(
    db: Session,
    user_id: str,
    product_id: str,
    review_text: str,
    source: str | None = None,
    review_id: str | None = None,
    metadata: Dict[str, Any] | None = None,
) -> UserBehaviour:
    """
    Log a **review** event (user submitted a text review).

    Parameters
    ----------
    db : Session
        Active database session.
    user_id : str
        UUID of the reviewing user.
    product_id : str
        UUID of the reviewed product.
    review_text : str
        The full text of the review (metadata stores a 500‑char snippet).
    source : str, optional
        Where the review was submitted (e.g. ``"product_details"``).
    review_id : str, optional
        UUID of the ``Review`` record (if available).
    metadata : dict, optional
        Any additional key-value pairs.

    Returns
    -------
    UserBehaviour
        The newly created database record.
    """
    pid, cid, sid = _resolve_product(db, product_id)
    meta = _build_metadata(
        reviewText=review_text[:500],  # keep metadata lightweight
        reviewId=review_id,
    )
    if metadata:
        meta.update(metadata)

    return track_event(
        db,
        user_id=user_id,
        event_type=EVENT_REVIEW,
        product_id=pid,
        category_id=cid,
        seller_id=sid,
        source=source,
        metadata=meta,
    )


# ---------------------------------------------------------------------------
# 8. RATING — user assigned a 1-5 star rating to a product
# ---------------------------------------------------------------------------

def track_rating(
    db: Session,
    user_id: str,
    product_id: str,
    rating_value: int,
    source: str | None = None,
    metadata: Dict[str, Any] | None = None,
) -> UserBehaviour:
    """
    Log a **rating** event (user gave a 1‑5 star rating).

    Parameters
    ----------
    db : Session
        Active database session.
    user_id : str
        UUID of the rating user.
    product_id : str
        UUID of the rated product.
    rating_value : int
        The rating value (1‑5).
    source : str, optional
        Where the rating was submitted.
    metadata : dict, optional
        Any additional key-value pairs.

    Returns
    -------
    UserBehaviour
        The newly created database record.
    """
    pid, cid, sid = _resolve_product(db, product_id)
    meta = _build_metadata(
        ratingValue=rating_value,
    )
    if metadata:
        meta.update(metadata)

    return track_event(
        db,
        user_id=user_id,
        event_type=EVENT_RATING,
        product_id=pid,
        category_id=cid,
        seller_id=sid,
        source=source,
        metadata=meta,
    )


# ---------------------------------------------------------------------------
# Core — generic event inserter
# ---------------------------------------------------------------------------

def track_event(
    db: Session,
    user_id: str,
    event_type: str,
    product_id: str | None = None,
    category_id: str | None = None,
    seller_id: str | None = None,
    source: str | None = None,
    metadata: Dict[str, Any] | None = None,
) -> UserBehaviour:
    """
    Insert a row into ``UserBehaviour`` and commit.

    This is the **core** function that all typed helpers above delegate
    to.  You can also call it directly for custom events that don't fit
    the eight standard types (e.g. ``"SHARE"``, ``"REPEAT_VISIT"``).

    Parameters
    ----------
    db : Session
        Active database session.
    user_id : str
        UUID of the user who performed the action.
    event_type : str
        A label for the event (e.g. ``"PRODUCT_VIEW"``, ``"SEARCH"``).
    product_id : str, optional
        UUID of the related product (if any).
    category_id : str, optional
        UUID of the related category (if any).
    seller_id : str, optional
        UUID of the related seller (if any).
    source : str, optional
        Page / component where the event originated.
    metadata : dict, optional
        Arbitrary JSON-serialisable payload.

    Returns
    -------
    UserBehaviour
        The newly created and committed database record.
    """
    record = UserBehaviour(
        id=_new_id(),
        userId=user_id,
        eventType=event_type,
        productId=product_id,
        categoryId=category_id,
        sellerId=seller_id,
        source=source,
        eventMetadata=metadata or {},
        createdAt=datetime.utcnow(),
    )

    db.add(record)
    db.commit()
    db.refresh(record)

    logger.debug(
        "UserBehaviour [%s] user=%s product=%s source=%s",
        event_type,
        user_id,
        product_id or "—",
        source or "—",
    )

    return record
