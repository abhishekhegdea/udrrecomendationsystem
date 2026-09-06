"""
inventory_aware.py — Real-Time Inventory-Aware Recommendation Engine for UdrCrafts

Ensures that out-of-stock / unavailable products (inventory <= 0) are strictly excluded,
and products with healthy, readily fulfillable stock quantities updated by artisans
are dynamically boosted and prioritized in recommendation ranking.
"""

from __future__ import annotations

import logging
import math
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# Target stock units for maximum fulfillment confidence saturation
DEFAULT_TARGET_INVENTORY = 10

# Inventory Status Labels
STATUS_OUT_OF_STOCK = "OUT_OF_STOCK"
STATUS_LOW_STOCK = "LOW_STOCK"         # 1-2 units (urgent / scarce)
STATUS_IN_STOCK = "IN_STOCK"           # 3-9 units (healthy)
STATUS_ABUNDANT = "ABUNDANT"           # 10+ units (fully fulfillable)


def compute_inventory_fulfillment_score(
    inventory: Optional[int],
    target_inventory: int = DEFAULT_TARGET_INVENTORY,
) -> float:
    """
    Computes a normalized inventory fulfillment score [0.0, 1.0] using a logarithmic
    saturation curve.

    Formula:
        Score = 0.0 if inventory <= 0
        Score = min(1.0, ln(1 + inventory) / ln(1 + target_inventory))

    Examples (with target=10):
        - 0 units  -> 0.000 (out of stock, hard-filtered)
        - 1 unit   -> 0.289 (scarce, available but low fulfillment capacity)
        - 2 units  -> 0.458
        - 3 units  -> 0.578
        - 5 units  -> 0.747 (strong fulfillment capability)
        - 8 units  -> 0.916
        - 10+ units -> 1.000 (maximum fulfillment readiness)
    """
    if inventory is None:
        return 0.0

    try:
        inv_val = int(inventory)
    except (ValueError, TypeError):
        return 0.0

    if inv_val <= 0:
        return 0.0

    if target_inventory <= 0:
        return 1.0 if inv_val > 0 else 0.0

    log_current = math.log(1.0 + float(inv_val))
    log_target = math.log(1.0 + float(target_inventory))

    score = log_current / log_target
    return float(max(0.0, min(1.0, round(score, 4))))


def get_inventory_status(inventory: Optional[int]) -> str:
    """Returns human-readable inventory availability classification."""
    if inventory is None:
        return STATUS_OUT_OF_STOCK

    try:
        inv_val = int(inventory)
    except (ValueError, TypeError):
        return STATUS_OUT_OF_STOCK

    if inv_val <= 0:
        return STATUS_OUT_OF_STOCK
    if inv_val <= 2:
        return STATUS_LOW_STOCK
    if inv_val < DEFAULT_TARGET_INVENTORY:
        return STATUS_IN_STOCK
    return STATUS_ABUNDANT


def get_inventory_explanation(inventory: Optional[int]) -> str:
    """Generates user-friendly transparency description for recommendations."""
    if inventory is None:
        return "Currently out of stock."

    try:
        inv_val = int(inventory)
    except (ValueError, TypeError):
        return "Currently out of stock."

    if inv_val <= 0:
        return "Currently out of stock."
    if inv_val == 1:
        return "Only 1 left in stock — order soon!"
    if inv_val <= 2:
        return f"Only {inv_val} left in stock."
    if inv_val >= DEFAULT_TARGET_INVENTORY:
        return f"In stock and ready to ship ({inv_val} units available)."
    return f"In stock ({inv_val} units available)."


def apply_inventory_fulfillment_boost(
    base_score: float,
    inventory: int,
    weight: float = 0.15,
) -> float:
    """
    Applies an inventory awareness boost to a candidate's base recommendation score.
    Out-of-stock items return 0.0. In-stock items receive a proportional fulfillment boost.
    """
    if inventory <= 0:
        return 0.0

    inv_score = compute_inventory_fulfillment_score(inventory)
    # Blend base score with inventory fulfillment capability
    boosted = base_score * (1.0 - weight) + (inv_score * weight)
    return float(max(0.0, min(1.0, round(boosted, 4))))
