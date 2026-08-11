"""Task 2.5 (contact + payments): one representation per concept.

CONTACT
-------
Contact was stored three ways: the public top-level ``phone_number`` / ``email``
/ ``website_url`` columns (kept), the admin-only ``main_contact_*`` columns
(kept), and a legacy admin-only ``contact_info`` JSONB dict::

    {"best": {"name": ..., "phone": ..., "email": ...},
     "emergency": {"name": ..., "phone": ...}}

The ``main_contact_*`` columns win. ``backfill_contact_info`` migrates the
``best`` sub-dict into ``main_contact_name`` / ``main_contact_phone`` /
``main_contact_email`` and the ``emergency`` sub-dict into
``offsite_emergency_contact`` — ONLY filling columns that are empty (NULL or
''); an existing column value is never overwritten (a differing JSONB value is
logged as a conflict, JSONB loses). The write path stops writing ``contact_info``
(stripped from the payload); the column is RETAINED (expand/contract) and stays
``audience: admin`` / hidden until a later contract release drops it, so it never
reaches the public API.

PAYMENTS
--------
Payment methods were stored twice: the top-level ``payment_methods`` list (kept,
and what the Task 2.2 facet filter queries) and a redundant
``amenities->'payment_methods'`` list. The ``payment_methods`` column wins.
``backfill_payment_methods`` unions ``amenities.payment_methods`` into the column
(order-preserving, deduped). The write path stops writing
``amenities.payment_methods`` (``strip_amenities_payment_methods`` removes the key
before ``amenities`` is persisted); the rest of the ``amenities`` dict (e.g. the
computed ``wifi`` mirror) is unaffected. The union increases facet correctness.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional

from sqlalchemy import text

logger = logging.getLogger("alembic.runtime.migration")

# The legacy contact column the write path must STOP writing.
LEGACY_CONTACT_FIELD = "contact_info"


# --------------------------------------------------------------------------- #
# Write-path strip: drop amenities.payment_methods before persisting amenities.
# --------------------------------------------------------------------------- #
def strip_amenities_payment_methods(poi: dict) -> dict:
    """Remove the redundant ``payment_methods`` key from ``poi['amenities']`` so
    it is never persisted there again (the top-level ``payment_methods`` column is
    the single source). No-op when amenities is absent / not a dict / has no such
    key. Mutates and returns ``poi``.
    """
    amenities = poi.get("amenities")
    if isinstance(amenities, dict) and "payment_methods" in amenities:
        amenities = dict(amenities)
        amenities.pop("payment_methods", None)
        poi["amenities"] = amenities
    return poi


# --------------------------------------------------------------------------- #
# Backfill: contact_info JSONB -> main_contact_* / offsite_emergency_contact
# --------------------------------------------------------------------------- #
def _is_empty(value: Any) -> bool:
    return value is None or (isinstance(value, str) and value.strip() == "")


def _clean_str(value: Any) -> Optional[str]:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _format_emergency(emergency: Any) -> Optional[str]:
    """Flatten an ``emergency`` value (dict or str) into the free-text
    ``offsite_emergency_contact`` column."""
    if isinstance(emergency, str):
        return _clean_str(emergency)
    if isinstance(emergency, dict):
        name = _clean_str(emergency.get("name"))
        phone = _clean_str(emergency.get("phone"))
        if name and phone:
            return f"{name} ({phone})"
        return name or phone
    return None


# contact_info path -> target column.
_CONTACT_MAP = [
    (("best", "name"), "main_contact_name"),
    (("best", "phone"), "main_contact_phone"),
    (("best", "email"), "main_contact_email"),
]


def backfill_contact_info(bind) -> Dict[str, int]:
    """Idempotent, fill-NULL-only migration of ``contact_info`` into the
    ``main_contact_*`` / ``offsite_emergency_contact`` columns.

    Returns ``{"filled": n, "conflicts": m, "skipped": k}``:
      * ``filled``    — a column was empty and got a value from contact_info;
      * ``conflicts`` — the column already held a DIFFERENT value (kept; logged);
      * ``skipped``   — contact_info had a value but the column already matched, or
                        contact_info had nothing to offer.

    Idempotent: after a run the columns equal the migrated values, so a re-run
    fills nothing (no conflict, since column == source). Does NOT modify
    ``contact_info`` (retained).
    """
    counts = {"filled": 0, "conflicts": 0, "skipped": 0}

    for row in bind.execute(
        text(
            "SELECT id, contact_info, main_contact_name, main_contact_phone, "
            "main_contact_email, offsite_emergency_contact "
            "FROM points_of_interest"
        )
    ).mappings():
        ci = row["contact_info"]
        if not isinstance(ci, dict) or not ci:
            continue

        updates: Dict[str, str] = {}

        # best.* -> main_contact_*
        best = ci.get("best")
        for (path0, path1), col in _CONTACT_MAP:
            src = _clean_str((best or {}).get(path1)) if isinstance(best, dict) else None
            if src is None:
                continue
            current = row[col]
            if _is_empty(current):
                updates[col] = src
            elif _clean_str(current) != src:
                counts["conflicts"] += 1
                logger.info(
                    "[contact_info] poi=%s conflict on %s (kept column value)",
                    row["id"], col,
                )
            else:
                counts["skipped"] += 1

        # emergency -> offsite_emergency_contact
        emerg = _format_emergency(ci.get("emergency"))
        if emerg is not None:
            current = row["offsite_emergency_contact"]
            if _is_empty(current):
                updates["offsite_emergency_contact"] = emerg
            elif _clean_str(current) != emerg:
                counts["conflicts"] += 1
                logger.info(
                    "[contact_info] poi=%s conflict on offsite_emergency_contact "
                    "(kept column value)", row["id"],
                )
            else:
                counts["skipped"] += 1

        if updates:
            set_clause = ", ".join(f"{c} = :{c}" for c in updates)
            bind.execute(
                text(f"UPDATE points_of_interest SET {set_clause} WHERE id = :id"),
                {**updates, "id": str(row["id"])},
            )
            counts["filled"] += len(updates)

    return counts


# --------------------------------------------------------------------------- #
# Backfill: amenities.payment_methods -> payment_methods (union, dedup)
# --------------------------------------------------------------------------- #
def _as_list(value: Any) -> List[Any]:
    if isinstance(value, (list, tuple)):
        return list(value)
    return []


def backfill_payment_methods(bind) -> Dict[str, int]:
    """Idempotent union of ``amenities->'payment_methods'`` into the
    ``payment_methods`` column (order-preserving: existing column values first,
    then amenities values not already present).

    Returns ``{"updated": n, "added": total_added_values}``. Does NOT modify
    ``amenities`` (retained; the write path stops writing its payment_methods key).
    Re-running is a no-op (the union already equals the column).
    """
    counts = {"updated": 0, "added": 0}

    for row in bind.execute(
        text("SELECT id, payment_methods, amenities FROM points_of_interest")
    ).mappings():
        current = _as_list(row["payment_methods"])
        amenities = row["amenities"]
        am_pm = _as_list(amenities.get("payment_methods")) if isinstance(amenities, dict) else []
        if not am_pm:
            continue

        union: List[Any] = list(current)
        added = 0
        for v in am_pm:
            if v not in union:
                union.append(v)
                added += 1
        if added == 0:
            continue

        bind.execute(
            text("UPDATE points_of_interest SET payment_methods = CAST(:pm AS jsonb) WHERE id = :id"),
            {"pm": json.dumps(union), "id": str(row["id"])},
        )
        counts["updated"] += 1
        counts["added"] += added

    return counts
