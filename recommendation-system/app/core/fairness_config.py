"""
fairness_config.py — Dynamic Fairness Configuration Manager

Provides ``get_config()`` and ``update_config()`` for the seller fairness
parameters stored in the ``FairnessConfig`` table.

The table is a **singleton** — always exactly one row.  If the row does
not exist yet, ``get_config()`` auto-creates it with the defaults from
:mod:`app.ml.seller_boost`.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict

from sqlalchemy.orm import Session

from app.ml.seller_boost import (
    DEFAULT_BOOST_AMOUNT,
    DEFAULT_MAX_PER_SELLER_RATIO,
    DEFAULT_NEW_SELLER_RATIO,
)

logger = logging.getLogger(__name__)


@dataclass
class FairnessConfigData:
    """Value object returned by :func:`get_config`."""

    boost_amount: float = DEFAULT_BOOST_AMOUNT
    new_seller_ratio: float = DEFAULT_NEW_SELLER_RATIO
    max_per_seller_ratio: float = DEFAULT_MAX_PER_SELLER_RATIO

    def to_dict(self) -> Dict[str, Any]:
        return {
            "boost_amount": self.boost_amount,
            "new_seller_ratio": self.new_seller_ratio,
            "max_per_seller_ratio": self.max_per_seller_ratio,
        }


def get_config(db: Session) -> FairnessConfigData:
    """
    Read the current fairness config from the DB.

    If the ``FairnessConfig`` table is empty (first run), upsert a row
    with the module-level defaults and return them.

    Returns
    -------
    FairnessConfigData
        The current (or default) configuration.
    """
    from app.models import FairnessConfig

    row = db.query(FairnessConfig).first()

    if row is None:
        # Auto-seed with defaults so the table is never empty
        row = FairnessConfig(
            boost_amount=DEFAULT_BOOST_AMOUNT,
            new_seller_ratio=DEFAULT_NEW_SELLER_RATIO,
            max_per_seller_ratio=DEFAULT_MAX_PER_SELLER_RATIO,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        logger.info("Seeded FairnessConfig table with defaults (%.2f / %.2f / %.2f).",
                    row.boost_amount, row.new_seller_ratio, row.max_per_seller_ratio)

    return FairnessConfigData(
        boost_amount=row.boost_amount,
        new_seller_ratio=row.new_seller_ratio,
        max_per_seller_ratio=row.max_per_seller_ratio,
    )


def update_config(
    db: Session,
    *,
    boost_amount: float | None = None,
    new_seller_ratio: float | None = None,
    max_per_seller_ratio: float | None = None,
) -> FairnessConfigData:
    """
    Update the singleton fairness config row.

    Only the fields that are provided (not ``None``) are changed.  The
    row is auto-created with defaults if it does not exist yet.

    Returns
    -------
    FairnessConfigData
        The updated configuration after saving.
    """
    from app.models import FairnessConfig

    row = db.query(FairnessConfig).first()
    if row is None:
        row = FairnessConfig(
            boost_amount=DEFAULT_BOOST_AMOUNT,
            new_seller_ratio=DEFAULT_NEW_SELLER_RATIO,
            max_per_seller_ratio=DEFAULT_MAX_PER_SELLER_RATIO,
        )
        db.add(row)

    if boost_amount is not None:
        row.boost_amount = boost_amount
    if new_seller_ratio is not None:
        row.new_seller_ratio = new_seller_ratio
    if max_per_seller_ratio is not None:
        row.max_per_seller_ratio = max_per_seller_ratio

    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)

    logger.info(
        "FairnessConfig updated: boost=%.2f ratio=%.2f cap=%.2f",
        row.boost_amount,
        row.new_seller_ratio,
        row.max_per_seller_ratio,
    )

    return FairnessConfigData(
        boost_amount=row.boost_amount,
        new_seller_ratio=row.new_seller_ratio,
        max_per_seller_ratio=row.max_per_seller_ratio,
    )
