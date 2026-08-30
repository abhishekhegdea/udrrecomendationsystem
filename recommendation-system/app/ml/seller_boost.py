"""
seller_boost.py — Seller Fairness Algorithm for UdrCrafts

Promotes **new artisans** by reserving recommendation slots and
preventing popular sellers from dominating the rankings.

Fairness algorithm (4 phases)
──────────────────────────────

**Phase 1 — Score boost**
  Every product whose seller has ``isNewSeller == True`` receives an
  additive boost to its ``final_score``.  The default boost of +0.15
  lifts a new-seller product past roughly 15 % of established products
  without overwhelming the top of the list.

**Phase 2 — Seller diversity cap**
  No single seller can occupy more than ``ceil(total_slots * 0.20)``
  slots.  Products beyond that limit are removed from consideration so
  large catalogues don't crowd out smaller artisans.

**Phase 3 — Slot reservation (15 % guarantee)**
  At least ``max(1, floor(total_slots * 0.15))`` slots are reserved for
  products from ``isNewSeller == True`` sellers.  If the top-K scored
  products don't contain enough new-seller items, the lowest-scoring
  established-product slots are swapped for the best new-seller items
  that were just below the cut-off.

**Phase 4 — Interleaving**
  Instead of lumping new sellers at the bottom, we **interleave** them
  evenly throughout the final list.  Every N-th position (approximately
  every 6th slot for 15 %) is force-assigned to the next-best new-seller
  product.  This guarantees new artisans get **position diversity** —
  they appear above, middle, and throughout the recommendation feed.
"""

from __future__ import annotations

import logging
import math
from typing import List, Optional

from app.models import Product

logger = logging.getLogger(__name__)

# ── Default constants ───────────────────────────────────────────────────
DEFAULT_NEW_SELLER_RATIO = 0.15       # 15 % of slots reserved
DEFAULT_BOOST_AMOUNT = 0.15           # additive score boost for new sellers
DEFAULT_MAX_PER_SELLER_RATIO = 0.20   # no seller exceeds 20 % of slots

# ── Cancel penalty constants ───────────────────────────────────────────
# cancelPenalty is a cumulative counter on the Seller model.
# Each unit of penalty reduces the product's final_score by this amount.
CANCEL_PENALTY_WEIGHT = 0.02

# ── Quality-return penalty constants ────────────────────────────────────
# returnPenalty is a cumulative counter on the Seller model, incremented
# when a customer returns one of the seller's products citing a quality
# issue.  Each unit reduces the product's final_score by this amount — a
# stronger signal than a plain cancellation, because the item physically
# failed the customer.
RETURN_PENALTY_WEIGHT = 0.03


# ---------------------------------------------------------------------------
# Phase 0 — Cancel penalty (negative score for cancelled orders)
# ---------------------------------------------------------------------------

def apply_cancel_penalty(
    products: List[Product],
    penalty_weight: float = CANCEL_PENALTY_WEIGHT,
    attribute: str = "final_score",
) -> None:
    """
    Deduct score from every product whose seller has a cancelPenalty > 0.

    The penalty is applied **in-place** to the transient attribute named by
    *attribute* (default ``final_score``).

    For each product, the deduction is::

        deduction = seller.cancelPenalty * penalty_weight

    This means a seller who cancelled 5 items loses 5 * 0.02 = 0.10 from
    every one of their product's final_score, making them rank lower in
    recommendations.

    Parameters
    ----------
    products : list of Product
        The candidate product list (mutated in-place).
    penalty_weight : float
        Multiplier applied to the seller's cancelPenalty.
    attribute : str
        The name of the transient score attribute on each product.
    """
    penalised_count = 0
    for p in products:
        if p.seller and getattr(p.seller, 'cancelPenalty', 0) > 0:
            penalty = p.seller.cancelPenalty * penalty_weight
            current = getattr(p, attribute, 0.0)
            setattr(p, attribute, current - penalty)
            penalised_count += 1

    if penalised_count:
        logger.debug(
            "Applied cancel penalty to %d products (weight=%.4f).",
            penalised_count,
            penalty_weight,
        )


# ---------------------------------------------------------------------------
# Phase 0b — Quality-return penalty (negative score for quality returns)
# ---------------------------------------------------------------------------

def apply_return_penalty(
    products: List[Product],
    penalty_weight: float = RETURN_PENALTY_WEIGHT,
    attribute: str = "final_score",
) -> None:
    """
    Deduct score from every product whose seller has a returnPenalty > 0.

    Mirrors :func:`apply_cancel_penalty` but uses the seller's
    ``returnPenalty`` counter (quality-issue returns).  Applied
    **in-place** to the transient attribute named by *attribute*
    (default ``final_score``).

    For each product, the deduction is::

        deduction = seller.returnPenalty * penalty_weight

    A seller with 2 quality-issue returns loses 2 * 0.03 = 0.06 from every
    one of their product's final_score, lowering them in recommendations
    for **all** customers.

    Parameters
    ----------
    products : list of Product
        The candidate product list (mutated in-place).
    penalty_weight : float
        Multiplier applied to the seller's returnPenalty.
    attribute : str
        The name of the transient score attribute on each product.
    """
    penalised_count = 0
    for p in products:
        if p.seller and getattr(p.seller, 'returnPenalty', 0) > 0:
            penalty = p.seller.returnPenalty * penalty_weight
            current = getattr(p, attribute, 0.0)
            setattr(p, attribute, current - penalty)
            penalised_count += 1

    if penalised_count:
        logger.debug(
            "Applied return penalty to %d products (weight=%.4f).",
            penalised_count,
            penalty_weight,
        )


# ---------------------------------------------------------------------------
# Phase 1 — Score boost
# ---------------------------------------------------------------------------

def boost_new_sellers(
    products: List[Product],
    boost_amount: float = DEFAULT_BOOST_AMOUNT,
    attribute: str = "final_score",
) -> None:
    """
    Add a score boost to every product whose seller is marked as new.

    The boost is applied **in-place** to the transient attribute named by
    *attribute* (default ``final_score``).

    Parameters
    ----------
    products : list of Product
        The candidate product list (mutated in-place).
    boost_amount : float
        Additive boost applied to each new-seller product's score.
    attribute : str
        The name of the transient score attribute on each product.
    """
    boosted_count = 0
    for p in products:
        if p.seller and p.seller.isNewSeller:
            current = getattr(p, attribute, 0.0)
            setattr(p, attribute, current + boost_amount)
            boosted_count += 1

    if boosted_count:
        logger.debug(
            "Boosted %d new-seller products by +%.2f.",
            boosted_count,
            boost_amount,
        )


# ---------------------------------------------------------------------------
# Phase 2 — Seller diversity cap
# ---------------------------------------------------------------------------

def cap_seller_dominance(
    products: List[Product],
    total_slots: int,
    max_per_seller_ratio: float = DEFAULT_MAX_PER_SELLER_RATIO,
    attribute: str = "final_score",
) -> List[Product]:
    """
    Remove products from sellers that already have enough items in the
    top ranks so that no single seller exceeds *max_per_seller_ratio*.

    The input list is assumed to be sorted by *attribute* descending.
    Returns a filtered list (a new list, not in-place).

    Parameters
    ----------
    products : list of Product
        Candidate products, pre-sorted by score descending.
    total_slots : int
        Total number of recommendation slots available.
    max_per_seller_ratio : float
        Maximum fraction of slots one seller can occupy.
    attribute : str
        Name of the score attribute to sort by.

    Returns
    -------
    list of Product
        Filtered list respecting the diversity cap.
    """
    if not products:
        return []

    max_per_seller = max(1, math.ceil(total_slots * max_per_seller_ratio))
    seller_counts: dict = {}
    filtered: List[Product] = []

    for p in products:
        seller_id = p.sellerId
        current_count = seller_counts.get(seller_id, 0)
        if current_count >= max_per_seller:
            logger.debug(
                "Seller %s capped at %d products (dominance prevention).",
                seller_id,
                max_per_seller,
            )
            continue
        seller_counts[seller_id] = current_count + 1
        filtered.append(p)

    return filtered


# ---------------------------------------------------------------------------
# Phase 3 & 4 — Slot reservation + Interleaving
# ---------------------------------------------------------------------------

def apply_fairness_ranking(
    products: List[Product],
    total_slots: int = 20,
    new_seller_ratio: float = DEFAULT_NEW_SELLER_RATIO,
    attribute: str = "final_score",
) -> List[Product]:
    """
    Select and reorder products so that new sellers get fair visibility.

    Algorithm
    ─────────

    1. **Reserve** ``reserved = max(1, floor(total_slots * ratio))`` slots
       for new-seller products.

    2. Separate the candidate list into **new** (``isNewSeller == True``)
       and **established** (``isNewSeller == False``).

    3. Take the top ``reserved`` products from the new-seller list.

    4. Take the top ``total_slots - reserved`` products from the
       established list.

    5. If there aren't enough established products to fill their share,
       promote the next best new-seller products.

    6. **Interleave**: merge the two lists so that new-seller products are
       spread evenly across the final ranking instead of being clustered
       at the bottom.

    Parameters
    ----------
    products : list of Product
        Candidate products, sorted by *attribute* descending.
    total_slots : int
        Number of recommendation slots to fill.
    new_seller_ratio : float
        Target fraction of slots for new sellers (default 0.15 = 15 %).
    attribute : str
        Name of the transient score attribute.

    Returns
    -------
    list of Product
        At most *total_slots* products, interleaved fairly.
    """
    if not products:
        return []

    reserved = max(1, math.floor(total_slots * new_seller_ratio))
    remaining_slots = total_slots - reserved

    # ── Separate into new and established ────────────────────────────
    new_seller_products: List[Product] = []
    established_products: List[Product] = []

    for p in products:
        # Pass-through for products without a seller relationship loaded
        is_new = p.seller.isNewSeller if p.seller else False
        if is_new:
            new_seller_products.append(p)
        else:
            established_products.append(p)

    # ── Phase 3: Reserve slots for new sellers ──────────────────────
    selected_new = new_seller_products[:reserved]

    # Fill remaining slots with top established products
    selected_established = established_products[:remaining_slots]

    # If there aren't enough established products, promote more new-seller
    # products to fill the gap
    shortfall = remaining_slots - len(selected_established)
    if shortfall > 0:
        extra_new = new_seller_products[reserved: reserved + shortfall]
        selected_new.extend(extra_new)

    # ── Phase 4: Interleave ───────────────────────────────────────────
    final = _interleave(selected_new, selected_established, total_slots, new_seller_ratio)

    logger.info(
        "Fairness ranking applied: %d new-seller slots reserved out of %d total.",
        len([p for p in final if p.seller and p.seller.isNewSeller]),
        len(final),
    )

    return final[:total_slots]


# ---------------------------------------------------------------------------
# Interleaving helper
# ---------------------------------------------------------------------------

def _interleave(
    new_products: List[Product],
    established_products: List[Product],
    total_slots: int,
    ratio: float,
) -> List[Product]:
    """
    Evenly distribute new-seller products throughout the ranked list.

    Strategy
    ────────
    Place a new-seller product at every ``step``-th position (where
    ``step ≈ 1 / ratio``), filling the rest with established products.

    Example with 20 slots, 15 % ratio (step = 6.67 → floor 6):
    ::

        Position:  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20
        New:       █                    █                    █
        Est:       █  █  █  █  █        █  █  █  █  █        █  █  █  █  █  █

    This guarantees the first new-seller product appears in a visible
    position (not buried at the bottom) and that visibility is spread.
    """
    # ── Guard: if either list is empty, just concatenate in order ────
    if not new_products:
        return established_products[:total_slots]
    if not established_products:
        return new_products[:total_slots]

    result: List[Optional[Product]] = [None] * total_slots

    # Calculate the interleaving step — how many positions between new slots
    step = max(2, round(1.0 / ratio)) if ratio > 0 else total_slots

    # ── Place new-seller products at evenly spaced positions ─────────
    new_iter = iter(new_products)
    for i in range(0, total_slots, step):
        if i < total_slots:
            try:
                result[i] = next(new_iter)
            except StopIteration:
                break

    # ── Fill remaining gaps with established products ────────────────
    est_iter = iter(established_products)
    for i in range(total_slots):
        if result[i] is None:
            try:
                result[i] = next(est_iter)
            except StopIteration:
                break

    # ── Fill any remaining None slots with overflow from new sellers ─
    # (happens when there are more new products than step positions)
    overflow_new_iter = iter(new_products)
    for i in range(total_slots):
        if result[i] is None:
            try:
                result[i] = next(overflow_new_iter)
            except StopIteration:
                break

    # ── Flatten: remove any None gaps (shouldn't happen, but guard) ──
    return [p for p in result if p is not None]


# ---------------------------------------------------------------------------
# Convenience: One-call pipeline
# ---------------------------------------------------------------------------

def fair_rank(
    products: List[Product],
    total_slots: int = 20,
    *,
    boost_amount: float = DEFAULT_BOOST_AMOUNT,
    new_seller_ratio: float = DEFAULT_NEW_SELLER_RATIO,
    max_per_seller_ratio: float = DEFAULT_MAX_PER_SELLER_RATIO,
    attribute: str = "final_score",
    penalty_weight: float = CANCEL_PENALTY_WEIGHT,
    return_penalty_weight: float = RETURN_PENALTY_WEIGHT,
) -> List[Product]:
    """
    Run the full fairness pipeline (Phases 0‑4) in one call.

    This is the **recommended entry point** for callers.

    Pipeline
    ────────
    0. :func:`apply_cancel_penalty` — deduct score for sellers with
       cancellation penalties.
    0b. :func:`apply_return_penalty` — deduct score for sellers with
       quality-return penalties.
    1. :func:`boost_new_sellers` — add score boost for new artisans.
    2. :func:`cap_seller_dominance` — remove excess products from
       any single seller.
    3. Sort by score descending.
    4. :func:`apply_fairness_ranking` — reserve slots and interleave.

    Parameters
    ----------
    products : list of Product
        Candidate products (ORM objects with ``seller`` relationship).
    total_slots : int
        How many recommendations to return.
    boost_amount : float
        Additive score boost for new-seller products.
    new_seller_ratio : float
        Fraction of slots reserved for new sellers (default 0.15).
    max_per_seller_ratio : float
        Max fraction of slots one seller can occupy (default 0.20).
    attribute : str
        Name of the attribute storing each product's relevance score.
    penalty_weight : float
        Multiplier for the seller's cancelPenalty when deducting score.
    return_penalty_weight : float
        Multiplier for the seller's returnPenalty when deducting score.

    Returns
    -------
    list of Product
        Fairly ranked and interleaved products.
    """
    # Phase 0 — Cancel penalty (negative score for cancellations)
    apply_cancel_penalty(products, penalty_weight=penalty_weight, attribute=attribute)

    # Phase 0b — Quality-return penalty (negative score for quality returns)
    apply_return_penalty(products, penalty_weight=return_penalty_weight, attribute=attribute)

    # Phase 1
    boost_new_sellers(products, boost_amount=boost_amount, attribute=attribute)

    # Phase 2
    products = cap_seller_dominance(
        products,
        total_slots=total_slots,
        max_per_seller_ratio=max_per_seller_ratio,
        attribute=attribute,
    )

    # Re-sort after boosting and capping
    products.sort(key=lambda p: getattr(p, attribute, 0.0), reverse=True)

    # Phase 3 & 4
    return apply_fairness_ranking(
        products,
        total_slots=total_slots,
        new_seller_ratio=new_seller_ratio,
        attribute=attribute,
    )
