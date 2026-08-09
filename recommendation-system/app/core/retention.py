"""
retention.py — Data Retention & Cleanup for UserBehaviour

Prevents the ``UserBehaviour`` table from growing unbounded by deleting
records that exceed their retention period.

Retention tiers
───────────────

Different event types have different business value and volume, so we
apply **tiered retention**:

+-----------------+------------+------------------------------------------+
| Event type      | Retention  | Rationale                                |
+=================+============+==========================================+
| PRODUCT_VIEW    |  90 days   | High volume; transient browsing signal   |
| SEARCH          |  90 days   | Moderate volume; query trends decay fast |
| CLICK           |  90 days   | High volume; transient intent signal     |
| WISHLIST        | 180 days   | Slower-changing preference signal        |
| CART            | 180 days   | Purchase intent with longer shelf life   |
| PURCHASE        | 365 days   | Low volume; strong training signal       |
| REVIEW          | 365 days   | Low volume; durable social proof         |
| RATING          | 365 days   | Low volume; long-term product quality    |
+-----------------+------------+------------------------------------------+

Design
──────

- Deletes are performed **in batches** (default 1000 rows) to avoid long
  table locks or overwhelming Postgres transaction logs.
- A **dry-run** mode is available so you can preview the impact before
  running a real delete.
- The module can be called directly from Python or from a Celery task.
- Every batch commit is logged for observability.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Dict, List, Optional

from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.models import UserBehaviour

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Default retention periods (in days)
# ---------------------------------------------------------------------------

#: Short-lived transient signals
SHORT_TERM_DAYS = 90
#: Medium-lived preference signals
MEDIUM_TERM_DAYS = 180
#: Long-lived strong signals
LONG_TERM_DAYS = 365

DEFAULT_RETENTION: Dict[str, int] = {
    "PRODUCT_VIEW": SHORT_TERM_DAYS,
    "SEARCH": SHORT_TERM_DAYS,
    "CLICK": SHORT_TERM_DAYS,
    "WISHLIST": MEDIUM_TERM_DAYS,
    "CART": MEDIUM_TERM_DAYS,
    "PURCHASE": LONG_TERM_DAYS,
    "REVIEW": LONG_TERM_DAYS,
    "RATING": LONG_TERM_DAYS,
}

# ---------------------------------------------------------------------------
# Result container
# ---------------------------------------------------------------------------

@dataclass
class CleanupSummary:
    """Result of a retention cleanup run."""

    #: Total rows deleted across all event types
    total_deleted: int = 0
    #: Per-event-type breakdown
    per_event: Dict[str, int] = field(default_factory=dict)
    #: Whether this was a dry run (no actual deletions)
    was_dry_run: bool = False

    @property
    def summary_line(self) -> str:
        """Compact one-line description for logging."""
        if self.total_deleted == 0:
            return "No stale records found."
        events = ", ".join(
            f"{k}={v}" for k, v in sorted(self.per_event.items()) if v > 0
        )
        return f"{self.total_deleted} rows deleted ({events})"


# ---------------------------------------------------------------------------
# Core cleanup logic
# ---------------------------------------------------------------------------

def retain_user_behaviour(
    db: Session,
    retention_days: Optional[Dict[str, int]] = None,
    *,
    batch_size: int = 1_000,
    dry_run: bool = False,
) -> CleanupSummary:
    """
    Delete ``UserBehaviour`` rows that are older than their event type's
    retention period.

    Parameters
    ----------
    db : Session
        Active database session.
    retention_days : dict of str → int, optional
        Override the default retention periods.  Keys are event type names
        (e.g. ``"PRODUCT_VIEW"``), values are days to retain.
        Event types not present in the dict use :data:`DEFAULT_RETENTION`.
    batch_size : int
        Number of rows to delete per ``DELETE ... LIMIT`` batch.
        Larger batches are faster but hold locks longer.  Default 1 000.
    dry_run : bool
        If ``True``, only **count** the rows that *would* be deleted —
        no actual deletion happens.  Use this to preview the impact.

    Returns
    -------
    CleanupSummary
        Stats about the (simulated or real) deletion.
    """
    merged_retention = {**DEFAULT_RETENTION}
    if retention_days:
        merged_retention.update(retention_days)

    summary = CleanupSummary(was_dry_run=dry_run)
    now = datetime.utcnow()

    for event_type, days in merged_retention.items():
        cutoff = now - timedelta(days=days)

        # First, count how many rows are eligible (same for dry-run & real)
        count_query = (
            db.query(UserBehaviour)
            .filter(
                UserBehaviour.eventType == event_type,
                UserBehaviour.createdAt < cutoff,
            )
        )
        eligible = count_query.count()

        if eligible == 0:
            logger.debug("Retention [%s]: no rows older than %d days.", event_type, days)
            continue

        if dry_run:
            logger.info(
                "Retention [DRY-RUN] [%s]: %d rows exceed %d‑day retention.",
                event_type,
                eligible,
                days,
            )
            summary.per_event[event_type] = eligible
            summary.total_deleted += eligible
            continue

        # Real deletion in batches
        deleted_batch = 0
        while True:
            # Build a delete statement with a LIMIT by sub-querying IDs
            subq = (
                db.query(UserBehaviour.id)
                .filter(
                    UserBehaviour.eventType == event_type,
                    UserBehaviour.createdAt < cutoff,
                )
                .limit(batch_size)
                .subquery()
            )
            stmt = delete(UserBehaviour).where(UserBehaviour.id.in_(subq))
            result = db.execute(stmt)
            db.commit()

            rows = result.rowcount
            deleted_batch += rows

            if rows == 0:
                break

            logger.debug(
                "Retention [%s]: deleted batch of %d rows (running total %d).",
                event_type,
                rows,
                deleted_batch,
            )

        logger.info(
            "Retention [%s]: deleted %d rows older than %d days.",
            event_type,
            deleted_batch,
            days,
        )
        summary.per_event[event_type] = deleted_batch
        summary.total_deleted += deleted_batch

    logger.info("Retention cleanup %s: %s", "DRY-RUN" if dry_run else "done", summary.summary_line)
    return summary


# ---------------------------------------------------------------------------
# Convenience: delete everything older than N days (all event types)
# ---------------------------------------------------------------------------

def retain_all(
    db: Session,
    max_age_days: int = 365,
    *,
    batch_size: int = 1_000,
    dry_run: bool = False,
) -> CleanupSummary:
    """
    Delete **all** ``UserBehaviour`` rows older than *max_age_days*,
    regardless of event type.

    This is a simpler alternative to :func:`retain_user_behaviour` for
    cases where you don't need per-event-type retention policies.

    Parameters
    ----------
    db : Session
        Active database session.
    max_age_days : int
        Maximum age in days.  Any row older than this is deleted.
    batch_size : int
        Rows per batch.
    dry_run : bool
        If ``True``, only count (no actual deletions).

    Returns
    -------
    CleanupSummary
        Stats about the (simulated or real) deletion.
    """
    cutoff = datetime.utcnow() - timedelta(days=max_age_days)
    summary = CleanupSummary(was_dry_run=dry_run)

    eligible = (
        db.query(UserBehaviour)
        .filter(UserBehaviour.createdAt < cutoff)
        .count()
    )

    if eligible == 0:
        logger.info("Retention [all]: no rows older than %d days.", max_age_days)
        return summary

    if dry_run:
        logger.info(
            "Retention [DRY-RUN] [all]: %d rows exceed %d‑day retention.",
            eligible,
            max_age_days,
        )
        summary.total_deleted = eligible
        return summary

    deleted_total = 0
    while True:
        subq = (
            db.query(UserBehaviour.id)
            .filter(UserBehaviour.createdAt < cutoff)
            .limit(batch_size)
            .subquery()
        )
        stmt = delete(UserBehaviour).where(UserBehaviour.id.in_(subq))
        result = db.execute(stmt)
        db.commit()

        rows = result.rowcount
        deleted_total += rows

        if rows == 0:
            break

        logger.debug("Retention [all]: deleted batch of %d rows (running total %d).", rows, deleted_total)

    logger.info(
        "Retention [all]: deleted %d rows older than %d days.",
        deleted_total,
        max_age_days,
    )
    summary.total_deleted = deleted_total
    return summary
