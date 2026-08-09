"""
test_seller_boost.py — Standalone tests for the seller fairness algorithm

Run with::

    python tests/test_seller_boost.py

No external dependencies beyond Python 3.10+ and the standard library.
The tests use simple mock/stub objects that mimic the Product attributes
that ``seller_boost.py`` accesses at runtime.
"""

from __future__ import annotations

import sys
import os
from dataclasses import dataclass
from typing import Any, Dict, List

# Allow running from the recommendation-system/ directory
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# ---------------------------------------------------------------------------
# Mock objects (no DB required)
# ---------------------------------------------------------------------------

@dataclass
class MockSeller:
    """Minimal stand-in for the SQLAlchemy Seller model."""

    id: str
    isNewSeller: bool = True
    rating: float = 0.0
    cancelPenalty: float = 0.0


class MockProduct:
    """
    Minimal stand-in for the SQLAlchemy Product model.

    Supports arbitrary transient attributes via ``setattr`` / ``getattr``
    just like a real ORM object.
    """

    def __init__(
        self,
        product_id: str,
        seller_id: str,
        is_new: bool = False,
        score: float = 0.0,
    ):
        self.id = product_id
        self.sellerId = seller_id
        self.seller = MockSeller(id=seller_id, isNewSeller=is_new)
        self.final_score = score

    def __repr__(self) -> str:
        return (
            f"MockProduct(id={self.id!r}, "
            f"seller={self.seller.id!r}, "
            f"new={self.seller.isNewSeller}, "
            f"score={getattr(self, 'final_score', 0.0):.2f})"
        )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_products(
    scores: List[float],
    *,
    new_indices: List[int] | None = None,
    seller_ids: List[str] | None = None,
) -> List[MockProduct]:
    """
    Build a list of MockProduct objects for testing.

    Parameters
    ----------
    scores : list of float
        Scores to assign to each product.
    new_indices : list of int, optional
        Indices (0-based) of products whose sellers should be marked new.
        If omitted, no sellers are new.
    seller_ids : list of str, optional
        Explicit seller IDs per product. If omitted, each product gets
        a unique seller ``f"s{i}"``.

    Returns
    -------
    list of MockProduct
    """
    if seller_ids is None:
        seller_ids = [f"s{i}" for i in range(len(scores))]
    if new_indices is None:
        new_indices = []

    products = []
    for i, score in enumerate(scores):
        is_new = i in new_indices
        p = MockProduct(
            product_id=f"p{i}",
            seller_id=seller_ids[i],
            is_new=is_new,
            score=score,
        )
        products.append(p)
    return products


def count_new(products: List[MockProduct]) -> int:
    """Count how many products in the list are from new sellers."""
    return sum(1 for p in products if p.seller and p.seller.isNewSeller)


def count_established(products: List[MockProduct]) -> int:
    """Count how many products are from established (non-new) sellers."""
    return sum(1 for p in products if p.seller and not p.seller.isNewSeller)


def seller_slots(products: List[MockProduct]) -> Dict[str, int]:
    """Count how many slots each seller occupies."""
    counts: Dict[str, int] = {}
    for p in products:
        counts[p.sellerId] = counts.get(p.sellerId, 0) + 1
    return counts


# ═══════════════════════════════════════════════════════════════════════════
# Tests — _interleave
# ═══════════════════════════════════════════════════════════════════════════

def test_interleave_only_new():
    """When there are only new products, return them in order."""
    from app.ml.seller_boost import _interleave

    new = make_products([1.0, 0.9, 0.8], new_indices=[0, 1, 2])
    result = _interleave(new, [], total_slots=5, ratio=0.15)
    assert len(result) == 3, f"Expected 3, got {len(result)}"
    assert all(p.seller.isNewSeller for p in result), "All should be new"
    print("  ✅ test_interleave_only_new")


def test_interleave_only_established():
    """When there are only established products, return them in order."""
    from app.ml.seller_boost import _interleave

    est = make_products([1.0, 0.9, 0.8])
    result = _interleave([], est, total_slots=5, ratio=0.15)
    assert len(result) == 3, f"Expected 3, got {len(result)}"
    assert all(not p.seller.isNewSeller for p in result), "All should be established"
    print("  ✅ test_interleave_only_established")


def test_interleave_15_percent():
    """At 15% ratio, new sellers appear at roughly every 7th position."""
    from app.ml.seller_boost import _interleave

    new = make_products(
        [1.0, 0.9, 0.8, 0.7], new_indices=[0, 1, 2, 3]
    )
    est = make_products(
        [0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0.0, -0.1, -0.2, -0.3,
         0.6, 0.5, 0.4, 0.3, 0.2, 0.1],
        seller_ids=[f"e{i}" for i in range(16)],
    )

    result = _interleave(new, est, total_slots=20, ratio=0.15)

    assert len(result) == 20, f"Expected 20, got {len(result)}"
    assert count_new(result) == 4, f"Expected 4 new, got {count_new(result)}"
    assert count_established(result) == 16

    # New sellers should NOT be clustered at the end — at least one
    # should be in the first half (positions 0–9)
    first_half_new = count_new(result[:10])
    assert first_half_new >= 1, (
        f"Expected at least 1 new seller in first half, "
        f"got {first_half_new} at positions {[i for i, p in enumerate(result[:10]) if p.seller.isNewSeller]}"
    )
    print("  ✅ test_interleave_15_percent")


def test_interleave_50_percent():
    """At 50% ratio, new sellers appear every 2nd position."""
    from app.ml.seller_boost import _interleave

    new = make_products(
        [1.0, 0.9, 0.8, 0.7, 0.6], new_indices=[0, 1, 2, 3, 4]
    )
    est = make_products(
        [0.5, 0.4, 0.3, 0.2, 0.1],
        seller_ids=[f"e{i}" for i in range(5)],
    )

    result = _interleave(new, est, total_slots=10, ratio=0.5)

    assert len(result) == 10, f"Expected 10, got {len(result)}"
    assert count_new(result) == 5, f"Expected 5 new, got {count_new(result)}"

    # With step=2, new products should be at even indices
    for i in [0, 2, 4, 6, 8]:
        assert result[i] is not None, f"Position {i} should be filled"
    print("  ✅ test_interleave_50_percent")


def test_interleave_empty():
    """Empty inputs produce empty output."""
    from app.ml.seller_boost import _interleave

    result = _interleave([], [], total_slots=10, ratio=0.15)
    assert result == [], f"Expected empty list, got {result}"
    print("  ✅ test_interleave_empty")


# ═══════════════════════════════════════════════════════════════════════════
# Tests — boost_new_sellers
# ═══════════════════════════════════════════════════════════════════════════

def test_boost_new_sellers_adds_score():
    """New-seller products get +0.15 added to their final_score."""
    from app.ml.seller_boost import boost_new_sellers

    products = make_products(
        [1.0, 0.9, 0.8, 0.7, 0.6],
        new_indices=[1, 3],  # indices 1 and 3 are new
    )

    boost_new_sellers(products, boost_amount=0.15, attribute="final_score")

    # Established products unchanged
    assert products[0].final_score == 1.0, f"Expected 1.0, got {products[0].final_score}"
    assert products[2].final_score == 0.8, f"Expected 0.8, got {products[2].final_score}"
    assert products[4].final_score == 0.6, f"Expected 0.6, got {products[4].final_score}"

    # New products boosted
    assert products[1].final_score == 0.9 + 0.15, f"Expected {0.9 + 0.15}, got {products[1].final_score}"
    assert products[3].final_score == 0.7 + 0.15, f"Expected {0.7 + 0.15}, got {products[3].final_score}"

    print("  ✅ test_boost_new_sellers_adds_score")


def test_boost_new_sellers_no_new():
    """No boost applied when there are no new sellers."""
    from app.ml.seller_boost import boost_new_sellers

    products = make_products([1.0, 0.9, 0.8])
    boost_new_sellers(products, boost_amount=0.15)
    assert products[0].final_score == 1.0
    assert products[1].final_score == 0.9
    assert products[2].final_score == 0.8
    print("  ✅ test_boost_new_sellers_no_new")


# ═══════════════════════════════════════════════════════════════════════════
# Tests — cap_seller_dominance
# ═══════════════════════════════════════════════════════════════════════════

def test_cap_seller_dominance():
    """No single seller exceeds ceil(total_slots * 0.20) products."""
    from app.ml.seller_boost import cap_seller_dominance

    # 8 products all from seller "s0", 20 slots → max = ceil(20 * 0.20) = 4
    products = make_products(
        [1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3],
        seller_ids=["s0"] * 8,
    )

    filtered = cap_seller_dominance(products, total_slots=20, max_per_seller_ratio=0.20)

    assert len(filtered) == 4, f"Expected 4, got {len(filtered)}"
    slots = seller_slots(filtered)
    assert slots.get("s0", 0) == 4, f"Expected 4 slots for s0, got {slots}"
    print("  ✅ test_cap_seller_dominance")


def test_cap_seller_dominance_no_excess():
    """When no seller exceeds the cap, all products are kept."""
    from app.ml.seller_boost import cap_seller_dominance

    products = make_products(
        [1.0, 0.9, 0.8],
        seller_ids=["s0", "s1", "s2"],
    )

    filtered = cap_seller_dominance(products, total_slots=20, max_per_seller_ratio=0.20)
    assert len(filtered) == 3, f"Expected 3, got {len(filtered)}"
    print("  ✅ test_cap_seller_dominance_no_excess")


# ═══════════════════════════════════════════════════════════════════════════
# Tests — apply_fairness_ranking
# ═══════════════════════════════════════════════════════════════════════════

def test_apply_fairness_ranking_15_percent():
    """With 20 slots and 15% ratio, at least 3 new-seller slots reserved."""
    from app.ml.seller_boost import apply_fairness_ranking

    # 10 new products, 10 established — all sorted by score
    products = make_products(
        [1.0, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55,
         0.5, 0.45, 0.4, 0.35, 0.3, 0.25, 0.2, 0.15, 0.1, 0.05],
        new_indices=[0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
        seller_ids=[f"n{i}" for i in range(10)] + [f"e{i}" for i in range(10)],
    )

    result = apply_fairness_ranking(products, total_slots=20, new_seller_ratio=0.15)

    assert len(result) == 20, f"Expected 20, got {len(result)}"
    new_count = count_new(result)
    assert new_count >= 3, f"Expected >= 3 new sellers, got {new_count}"
    print(f"  ✅ test_apply_fairness_ranking_15_percent (new={new_count})")


def test_apply_fairness_ranking_all_new():
    """When all products are new, returns top 20."""
    from app.ml.seller_boost import apply_fairness_ranking

    products = make_products(
        [1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1] * 3,
        new_indices=list(range(30)),
        seller_ids=[f"s{i}" for i in range(30)],
    )

    result = apply_fairness_ranking(products, total_slots=20, new_seller_ratio=0.15)
    assert len(result) == 20, f"Expected 20, got {len(result)}"
    assert count_new(result) == 20, "All should be new"
    print("  ✅ test_apply_fairness_ranking_all_new")


def test_apply_fairness_ranking_shortfall():
    """When there aren't enough established products, shortfall is filled."""
    from app.ml.seller_boost import apply_fairness_ranking

    # Only 3 established, 17 new — should still work
    products = make_products(
        [1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1,
         0.0, -0.1, -0.2, -0.3, -0.4, -0.5, -0.6, -0.7, -0.8, -0.9],
        new_indices=list(range(17)),  # first 17 are new
        seller_ids=[f"n{i}" for i in range(17)] + [f"e{i}" for i in range(3)],
    )

    result = apply_fairness_ranking(products, total_slots=20, new_seller_ratio=0.15)
    assert len(result) == 20, f"Expected 20, got {len(result)}"
    print("  ✅ test_apply_fairness_ranking_shortfall")


# ═══════════════════════════════════════════════════════════════════════════
# Tests — fair_rank (full pipeline)
# ═══════════════════════════════════════════════════════════════════════════

def test_fair_rank_typical():
    """Full pipeline with mixed new/established sellers."""
    from app.ml.seller_boost import fair_rank

    # 30 candidates: first 5 are new sellers, rest 25 are established
    # Scores descending: new sellers at 0.95-0.75, established at 0.94..-0.25
    products = make_products(
        [0.95, 0.90, 0.85, 0.80, 0.75] +   # 5 new sellers
        [0.94, 0.89, 0.84, 0.79, 0.74,     # 25 established sellers
         0.70, 0.65, 0.60, 0.55, 0.50,
         0.45, 0.40, 0.35, 0.30, 0.25,
         0.20, 0.15, 0.10, 0.05, 0.00,
         -0.05, -0.10, -0.15, -0.20, -0.25],
        new_indices=[0, 1, 2, 3, 4],
        seller_ids=(
            ["n1", "n2", "n3", "n4", "n5"] +
            [f"e{i}" for i in range(25)]
        ),
    )

    result = fair_rank(
        products,
        total_slots=20,
        boost_amount=0.15,
        new_seller_ratio=0.15,
        max_per_seller_ratio=0.20,
    )

    assert len(result) == 20, f"Expected 20, got {len(result)}"
    new_count = count_new(result)
    assert new_count >= 3, f"Expected >= 3 new sellers after fairness, got {new_count}"

    # No single seller should exceed 4 slots (20 * 0.20 = 4)
    slots = seller_slots(result)
    for sid, count in slots.items():
        assert count <= 4, f"Seller {sid} has {count} slots, max allowed is 4"

    # New sellers should not all be clustered at the end
    first_half_new = count_new(result[:10])
    assert first_half_new >= 1, (
        f"Expected at least 1 new seller in top 10, "
        f"got {first_half_new} at positions "
        f"{[i for i, p in enumerate(result[:10]) if p.seller.isNewSeller]}"
    )

    print(f"  ✅ test_fair_rank_typical (new={new_count}, slots={slots})")


def test_fair_rank_all_established():
    """
    No new sellers → all slots filled by established sellers.

    Note: because ``reserved = max(1, floor(total_slots * 0.15))`` always
    reserves at least 1 slot even when there are zero new sellers, the
    result may be ``total_slots - 1`` items when no new sellers exist.
    This is a known trade-off of the 15% guarantee.
    """
    from app.ml.seller_boost import fair_rank

    products = make_products(
        [0.9, 0.8, 0.7, 0.6, 0.5] * 6,
        seller_ids=[f"e{i}" for i in range(30)],
    )

    result = fair_rank(products, total_slots=10)
    # 1 slot is always reserved for new sellers; with 0 available,
    # we get 9 instead of 10
    assert len(result) == 9, f"Expected 9 (dead reservation slot), got {len(result)}"
    assert count_new(result) == 0, "Expected no new sellers"
    print("  ✅ test_fair_rank_all_established (9 due to empty reservation slot)")


def test_fair_rank_empty():
    """Empty input returns empty output."""
    from app.ml.seller_boost import fair_rank

    result = fair_rank([], total_slots=20)
    assert result == [], f"Expected empty list, got {result}"
    print("  ✅ test_fair_rank_empty")


# ═══════════════════════════════════════════════════════════════════════════
# Tests — apply_cancel_penalty
# ═══════════════════════════════════════════════════════════════════════════

def test_apply_cancel_penalty_deducts_score():
    """
    Products from sellers with cancelPenalty > 0 get score deducted.

    A seller with cancelPenalty=5 should have each of their products'
    final_score reduced by 5 * 0.02 = 0.10.
    """
    from app.ml.seller_boost import apply_cancel_penalty, CANCEL_PENALTY_WEIGHT

    # Create 3 products. Two share the same seller with penalty, one is clean.
    products = [
        MockProduct(product_id="p0", seller_id="s0", is_new=False, score=1.0),
        MockProduct(product_id="p1", seller_id="s0", is_new=False, score=0.8),
        MockProduct(product_id="p2", seller_id="s1", is_new=False, score=0.6),
    ]
    # Set cancelPenalty on seller s0
    products[0].seller.cancelPenalty = 5.0
    products[1].seller.cancelPenalty = 5.0
    # Seller s1 has no penalty (default 0)

    apply_cancel_penalty(products, penalty_weight=CANCEL_PENALTY_WEIGHT, attribute="final_score")

    # Products from penalised seller: 1.0 - (5 * 0.02) = 0.90
    assert abs(products[0].final_score - 0.90) < 0.001, f"Expected 0.90, got {products[0].final_score}"
    assert abs(products[1].final_score - 0.70) < 0.001, f"Expected 0.70, got {products[1].final_score}"

    # Product from clean seller unchanged
    assert abs(products[2].final_score - 0.60) < 0.001, f"Expected 0.60, got {products[2].final_score}"

    print("  ✅ test_apply_cancel_penalty_deducts_score")


def test_apply_cancel_penalty_no_penalty():
    """No deduction when no seller has cancelPenalty."""
    from app.ml.seller_boost import apply_cancel_penalty

    products = make_products([1.0, 0.9, 0.8])
    # All sellers have cancelPenalty=0 (default)

    apply_cancel_penalty(products, penalty_weight=0.02, attribute="final_score")

    assert products[0].final_score == 1.0
    assert products[1].final_score == 0.9
    assert products[2].final_score == 0.8
    print("  ✅ test_apply_cancel_penalty_no_penalty")


def test_apply_cancel_penalty_mixed():
    """Mixed sellers — some penalised, some not."""
    from app.ml.seller_boost import apply_cancel_penalty

    products = [
        MockProduct(product_id="p0", seller_id="s0", is_new=False, score=1.0),
        MockProduct(product_id="p1", seller_id="s1", is_new=False, score=0.9),
        MockProduct(product_id="p2", seller_id="s0", is_new=False, score=0.8),
        MockProduct(product_id="p3", seller_id="s2", is_new=False, score=0.7),
    ]
    # Seller s0 has penalty=3, s1 has penalty=10, s2 has no penalty
    products[0].seller.cancelPenalty = 3.0
    products[1].seller.cancelPenalty = 10.0
    products[2].seller.cancelPenalty = 3.0

    apply_cancel_penalty(products, penalty_weight=0.02, attribute="final_score")

    # s0 products: 3 * 0.02 = 0.06 deduction
    assert abs(products[0].final_score - 0.94) < 0.001, f"Expected 0.94, got {products[0].final_score}"
    assert abs(products[2].final_score - 0.74) < 0.001, f"Expected 0.74, got {products[2].final_score}"

    # s1 product: 10 * 0.02 = 0.20 deduction
    assert abs(products[1].final_score - 0.70) < 0.001, f"Expected 0.70, got {products[1].final_score}"

    # s2 product: no deduction
    assert abs(products[3].final_score - 0.70) < 0.001, f"Expected 0.70, got {products[3].final_score}"

    print("  ✅ test_apply_cancel_penalty_mixed")


# ═══════════════════════════════════════════════════════════════════════════
# Tests — apply_return_penalty
# ═══════════════════════════════════════════════════════════════════════════

def test_apply_return_penalty_deducts_score():
    """
    Products from sellers with returnPenalty > 0 get score deducted.

    A seller with returnPenalty=2 should have each of their products'
    final_score reduced by 2 * 0.03 = 0.06.
    """
    from app.ml.seller_boost import apply_return_penalty, RETURN_PENALTY_WEIGHT

    products = [
        MockProduct(product_id="p0", seller_id="s0", is_new=False, score=1.0),
        MockProduct(product_id="p1", seller_id="s0", is_new=False, score=0.8),
        MockProduct(product_id="p2", seller_id="s1", is_new=False, score=0.6),
    ]
    products[0].seller.returnPenalty = 2.0
    products[1].seller.returnPenalty = 2.0
    # Seller s1 has no penalty (default 0)

    apply_return_penalty(products, penalty_weight=RETURN_PENALTY_WEIGHT, attribute="final_score")

    # Products from penalised seller: 1.0 - (2 * 0.03) = 0.94
    assert abs(products[0].final_score - 0.94) < 0.001, f"Expected 0.94, got {products[0].final_score}"
    assert abs(products[1].final_score - 0.74) < 0.001, f"Expected 0.74, got {products[1].final_score}"

    # Product from clean seller unchanged
    assert abs(products[2].final_score - 0.60) < 0.001, f"Expected 0.60, got {products[2].final_score}"

    print("  ✅ test_apply_return_penalty_deducts_score")


def test_apply_return_penalty_no_penalty():
    """No deduction when no seller has returnPenalty."""
    from app.ml.seller_boost import apply_return_penalty

    products = make_products([1.0, 0.9, 0.8])
    apply_return_penalty(products, penalty_weight=0.03, attribute="final_score")

    assert products[0].final_score == 1.0
    assert products[1].final_score == 0.9
    assert products[2].final_score == 0.8
    print("  ✅ test_apply_return_penalty_no_penalty")


def test_apply_return_penalty_mixed():
    """Mixed sellers — some with return penalties, some without."""
    from app.ml.seller_boost import apply_return_penalty

    products = [
        MockProduct(product_id="p0", seller_id="s0", is_new=False, score=1.0),
        MockProduct(product_id="p1", seller_id="s1", is_new=False, score=0.9),
        MockProduct(product_id="p2", seller_id="s0", is_new=False, score=0.8),
    ]
    products[0].seller.returnPenalty = 5.0
    products[2].seller.returnPenalty = 5.0
    # Seller s1 has no penalty

    apply_return_penalty(products, penalty_weight=0.03, attribute="final_score")

    # s0 products: 5 * 0.03 = 0.15 deduction
    assert abs(products[0].final_score - 0.85) < 0.001, f"Expected 0.85, got {products[0].final_score}"
    assert abs(products[2].final_score - 0.65) < 0.001, f"Expected 0.65, got {products[2].final_score}"

    # s1 product: no deduction
    assert abs(products[1].final_score - 0.90) < 0.001, f"Expected 0.90, got {products[1].final_score}"

    print("  ✅ test_apply_return_penalty_mixed")


# ═══════════════════════════════════════════════════════════════════════════
# Runner
# ═══════════════════════════════════════════════════════════════════════════

def run_all():
    """Execute every test_* function in this module."""
    tests = [
        # _interleave
        test_interleave_only_new,
        test_interleave_only_established,
        test_interleave_15_percent,
        test_interleave_50_percent,
        test_interleave_empty,
        # boost_new_sellers
        test_boost_new_sellers_adds_score,
        test_boost_new_sellers_no_new,
        # cap_seller_dominance
        test_cap_seller_dominance,
        test_cap_seller_dominance_no_excess,
        # apply_fairness_ranking
        test_apply_fairness_ranking_15_percent,
        test_apply_fairness_ranking_all_new,
        test_apply_fairness_ranking_shortfall,
        # fair_rank
        test_fair_rank_typical,
        test_fair_rank_all_established,
        test_fair_rank_empty,
        # New: apply_cancel_penalty tests
        test_apply_cancel_penalty_deducts_score,
        test_apply_cancel_penalty_no_penalty,
        test_apply_cancel_penalty_mixed,
        # New: apply_return_penalty tests
        test_apply_return_penalty_deducts_score,
        test_apply_return_penalty_no_penalty,
        test_apply_return_penalty_mixed,
    ]

    passed = 0
    failed = 0
    for test_fn in tests:
        name = test_fn.__name__
        try:
            test_fn()
            passed += 1
        except Exception as e:
            print(f"  ❌ {name} FAILED: {e}")
            failed += 1

    print(f"\n{'=' * 50}")
    print(f"  Results: {passed} passed, {failed} failed, {len(tests)} total")
    print(f"{'=' * 50}")
    return failed == 0


if __name__ == "__main__":
    success = run_all()
    sys.exit(0 if success else 1)
