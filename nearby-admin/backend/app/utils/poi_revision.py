"""Write an append-only audit row on every admin POI mutation (Task 1.1).

``record_poi_revision`` serializes the full POI (reusing the admin's existing
``schemas.PointOfInterest`` response serialization, plus a poi_relationships
edge summary) and adds a ``POIRevision`` row to the SAME session/transaction as
the mutation. It never commits: the caller's existing commit persists the audit
row atomically with the mutation, so audit and data commit together or roll back
together (see Task 1.1 in docs/architecture/production-hardening-plan.md).

Best-effort but in-transaction: building the snapshot is fully wrapped, so a
serialization bug degrades the snapshot content (stores an ``_snapshot_error``
marker) instead of raising and rolling back the real mutation. The insert itself
is a plain, always-valid append.
"""

import uuid
from typing import Any, Optional

from app.models import POIRevision


def _coerce_uuid(value: Any) -> Optional[uuid.UUID]:
    """Return a UUID or None. Non-UUID values (e.g. a test mock's string id)
    degrade to None rather than blowing up the insert."""
    if value is None:
        return None
    if isinstance(value, uuid.UUID):
        return value
    try:
        return uuid.UUID(str(value))
    except (ValueError, AttributeError, TypeError):
        return None


def _relationship_summary(poi) -> list:
    """A summary of the POI's poi_relationships edges: ids + type, both
    directions. Kept id-only on purpose (the snapshot must not balloon)."""
    out = []
    for r in list(getattr(poi, "source_relationships", None) or []):
        out.append({
            "source_poi_id": str(r.source_poi_id),
            "target_poi_id": str(r.target_poi_id),
            "relationship_type": r.relationship_type,
        })
    for r in list(getattr(poi, "target_relationships", None) or []):
        out.append({
            "source_poi_id": str(r.source_poi_id),
            "target_poi_id": str(r.target_poi_id),
            "relationship_type": r.relationship_type,
        })
    return out


def _build_snapshot(db, poi) -> dict:
    """Serialize the POI to a JSON-safe dict: base + subtype + categories +
    relationship summary. Fully defensive: any failure yields a minimal
    error-marked snapshot so the mutation is never rolled back by the audit."""
    # Flush + refresh so a freshly-created POI's location is a real WKBElement
    # (not the unflushed 'POINT(x y)' WKT string) and its categories/subtype are
    # queryable, exactly matching what the GET endpoint would serialize.
    try:
        db.flush()
        db.refresh(poi)
    except Exception:
        pass

    try:
        from app import schemas
        data = schemas.PointOfInterest.model_validate(poi).model_dump(mode="json")
    except Exception as exc:  # pragma: no cover - defensive
        data = {"id": str(getattr(poi, "id", None)), "_snapshot_error": repr(exc)}

    try:
        data["poi_relationships"] = _relationship_summary(poi)
    except Exception:  # pragma: no cover - defensive
        data["poi_relationships"] = []

    return data


def record_poi_revision(db, poi, action: str, user_id=None) -> None:
    """Add one append-only ``POIRevision`` row for ``poi`` to the session.

    Does NOT commit; the caller's existing commit flushes it in the same
    transaction. For deletes, call this BEFORE the POI (and its edges) are gone.
    """
    snapshot = _build_snapshot(db, poi)
    db.add(POIRevision(
        poi_id=poi.id,
        action=action,
        snapshot=snapshot,
        user_id=_coerce_uuid(user_id),
    ))
