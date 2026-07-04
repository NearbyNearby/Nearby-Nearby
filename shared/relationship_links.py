"""Task 2.1: POI-to-POI link fields backed by the poi_relationships edge table.

Six admin form fields used to store POI-to-POI links as untyped UUID arrays (or
dict-lists) inside JSONB columns, with no referential integrity: deleting a
referenced POI left a dangling "ghost" UUID. This module moves those links into
the typed, FK-backed ``poi_relationships`` edge table so a POI delete cascades
its edges and ghost refs become impossible.

    JSONB column               relationship_type         entry shape
    ------------------------   ----------------------    ------------------------------
    service_locations          service_location          [uuid, ...]
    locally_found_at           locally_found_at          [uuid, ...]
    associated_trails          associated_trail          [uuid, ...]
    membership_passes          membership_pass           [uuid, ...]
    vendor_poi_links           vendor                    [{"poi_id": uuid, "vendor_type": ...}]
    organization_memberships   organization_membership   [{"poi_id": uuid, "name": ...} | {"name": ...}]

Directionality: the POI that OWNS the field is the edge SOURCE; each referenced
POI is the TARGET. Reads are therefore outbound edges
(``source_poi_id == owner`` and ``relationship_type == <type>``).

``organization_memberships`` is the one impure field: some entries are external
organizations with only a ``name``/link and no ``poi_id``. Those are NOT
POI-to-POI links and cannot become edges (an edge needs a target POI); this
release does not migrate or display them. The JSONB column is retained (not
dropped this release), so the raw data survives for a follow-up decision.

Any entry whose target UUID does not resolve to an existing POI is a ghost ref
and is skipped (and counted, by the backfill).

Known limitation: edges carry no position, so a migrated link list loses its
original array order (reads sort by target id for stability). If ordering ever
matters, ``meta`` can carry a ``_pos`` ordinal like poi_points does.
"""

from __future__ import annotations

import json
import uuid
from typing import Any, Dict, Iterable, List, Optional, Tuple

from shared.models.poi import POIRelationship, PointOfInterest

# field name -> descriptor.
#   rel_type : the poi_relationships.relationship_type value.
#   owner    : "poi" (top-level column on points_of_interest) or "event"
#              (a column on the events subtype, keyed by poi_id == POI id).
#   shape    : admin round-trip shape — "uuid_list" (List[uuid]) or "dict"
#              (List[Dict], where each entry carries a poi_id + extra keys).
LINK_FIELDS: Dict[str, Dict[str, str]] = {
    "service_locations":        {"rel_type": "service_location",       "owner": "poi",   "shape": "uuid_list"},
    "locally_found_at":         {"rel_type": "locally_found_at",       "owner": "poi",   "shape": "uuid_list"},
    "associated_trails":        {"rel_type": "associated_trail",       "owner": "poi",   "shape": "uuid_list"},
    "membership_passes":        {"rel_type": "membership_pass",        "owner": "poi",   "shape": "uuid_list"},
    "organization_memberships": {"rel_type": "organization_membership", "owner": "poi",  "shape": "dict"},
    "vendor_poi_links":         {"rel_type": "vendor",                 "owner": "event", "shape": "dict"},
}

# relationship_type -> field name (for the serializer, which knows the rel_type
# from the registry ``source`` ("edges:<rel_type>") rather than the field name).
REL_TYPE_TO_FIELD: Dict[str, str] = {v["rel_type"]: k for k, v in LINK_FIELDS.items()}


def _coerce_uuid(raw: Any) -> Optional[uuid.UUID]:
    """Return a UUID for ``raw`` (UUID or uuid-shaped string), else None."""
    if isinstance(raw, uuid.UUID):
        return raw
    if isinstance(raw, str) and raw.strip():
        try:
            return uuid.UUID(raw.strip())
        except (ValueError, AttributeError):
            return None
    return None


def _extract_entries(value: Any) -> Iterable[Tuple[uuid.UUID, Optional[Dict[str, Any]]]]:
    """Yield ``(target_uuid, meta_or_None)`` for each POI-link entry in ``value``.

    Handles the three JSONB shapes:
      * flat UUID string / UUID            -> (uuid, None)
      * ``{"poi_id"/"id"/"target_poi_id": uuid, **extra}`` -> (uuid, extra or None)

    Entries with no resolvable UUID reference (external/manual/malformed) yield
    nothing.
    """
    if not value or not isinstance(value, (list, tuple)):
        return
    for entry in value:
        if entry is None:
            continue
        if isinstance(entry, (str, uuid.UUID)):
            tid = _coerce_uuid(entry)
            if tid is not None:
                yield tid, None
        elif isinstance(entry, dict):
            tid = _coerce_uuid(
                entry.get("poi_id") or entry.get("id") or entry.get("target_poi_id")
            )
            if tid is None:
                continue
            meta = {
                k: v for k, v in entry.items()
                if k not in ("poi_id", "id", "target_poi_id")
            }
            yield tid, (meta or None)


def sync_link_edges(db, source_poi_id: uuid.UUID, field: str, value: Any) -> int:
    """Replace the outbound edges of ``field``'s relationship_type for
    ``source_poi_id`` with the resolved set parsed from ``value``.

    Skips self-links and targets that do not resolve to an existing POI (ghost
    refs). Flushes so a following snapshot / commit sees the edges. Returns the
    number of edges written.
    """
    info = LINK_FIELDS[field]
    rel_type = info["rel_type"]

    # Wipe the current outbound edges of this type, then rebuild from the payload
    # (the field is authoritative for its own relationship_type on this POI).
    db.query(POIRelationship).filter(
        POIRelationship.source_poi_id == source_poi_id,
        POIRelationship.relationship_type == rel_type,
    ).delete(synchronize_session=False)

    written = 0
    seen: set = set()
    for tid, meta in _extract_entries(value):
        if tid == source_poi_id or tid in seen:
            continue
        exists = db.query(PointOfInterest.id).filter(PointOfInterest.id == tid).first()
        if exists is None:
            continue  # ghost ref — target POI does not exist
        seen.add(tid)
        db.add(POIRelationship(
            source_poi_id=source_poi_id,
            target_poi_id=tid,
            relationship_type=rel_type,
            meta=meta,
        ))
        written += 1

    db.flush()
    return written


def _resolve_outbound(db, source_poi_id: uuid.UUID, rel_type: str,
                      *, published_only: bool) -> List[Tuple[Any, Optional[dict]]]:
    """Return ``(target_poi, meta)`` for each outbound edge, ordered stably.

    Targets that no longer exist (or are unpublished, when ``published_only``)
    are dropped.
    """
    edges = (
        db.query(POIRelationship)
        .filter(
            POIRelationship.source_poi_id == source_poi_id,
            POIRelationship.relationship_type == rel_type,
        )
        .all()
    )
    if not edges:
        return []
    target_ids = [e.target_poi_id for e in edges]
    tq = db.query(PointOfInterest).filter(PointOfInterest.id.in_(target_ids))
    if published_only:
        tq = tq.filter(PointOfInterest.publication_status == "published")
    targets = {t.id: t for t in tq.all()}
    resolved: List[Tuple[Any, Optional[dict]]] = []
    for e in sorted(edges, key=lambda x: str(x.target_poi_id)):
        t = targets.get(e.target_poi_id)
        if t is not None:
            resolved.append((t, e.meta or None))
    return resolved


def _poi_type_str(t) -> Any:
    pt = getattr(t, "poi_type", None)
    return pt.value if hasattr(pt, "value") else pt


def read_edges_public(db, source_poi_id: uuid.UUID, rel_type: str) -> List[Dict[str, Any]]:
    """Public-audience reconstruction: a list of linked-POI summaries for the
    RelationLink widget (``id``/``poi_id``/``name``/``slug``/``poi_type`` + any
    per-edge meta). Published targets only.
    """
    out: List[Dict[str, Any]] = []
    for t, meta in _resolve_outbound(db, source_poi_id, rel_type, published_only=True):
        item = {
            "id": str(t.id),
            "poi_id": str(t.id),
            "name": t.name,
            "slug": t.slug,
            "poi_type": _poi_type_str(t),
        }
        if meta:
            item.update(meta)
        out.append(item)
    return out


def read_link_field_admin(db, source_poi_id: uuid.UUID, field: str) -> List[Any]:
    """Admin-audience reconstruction in the field's original round-trip shape:

      * uuid_list -> ``[str(target_id), ...]``
      * dict      -> ``[{"poi_id": str(target_id), **meta}, ...]``

    Admin sees every linked POI regardless of publication status.
    """
    info = LINK_FIELDS[field]
    out: List[Any] = []
    for t, meta in _resolve_outbound(db, source_poi_id, info["rel_type"], published_only=False):
        if info["shape"] == "uuid_list":
            out.append(str(t.id))
        else:
            item = {"poi_id": str(t.id)}
            if meta:
                item.update(meta)
            out.append(item)
    return out


def clone_outbound_edges(db, src_poi_id: uuid.UUID, dst_poi_id: uuid.UUID) -> int:
    """Copy every OUTBOUND ``poi_relationships`` edge of ``src_poi_id`` onto
    ``dst_poi_id`` (new rows: source=dst, same target / relationship_type / meta).

    Used by the event reschedule clone so the copy keeps ALL of its links — the
    six Task 2.1 types (service_location / vendor / ...) AND any legacy generic
    edges (venue / sponsor / related / ...) — which live as edges, not columns,
    and were silently dropped by the old raw-column-only clone. A self-edge onto
    the clone is skipped. Flushes so a following snapshot / commit sees the rows.
    Returns the number of edges written.
    """
    written = 0
    for e in db.query(POIRelationship).filter(
        POIRelationship.source_poi_id == src_poi_id
    ).all():
        if e.target_poi_id == dst_poi_id:
            continue
        db.add(POIRelationship(
            source_poi_id=dst_poi_id,
            target_poi_id=e.target_poi_id,
            relationship_type=e.relationship_type,
            meta=e.meta,
        ))
        written += 1
    db.flush()
    return written


def backfill_link_edges(bind) -> Dict[str, Dict[str, int]]:
    """Idempotent backfill: create edge rows from the six JSONB link columns.

    ``bind`` is a SQLAlchemy Connection (alembic ``op.get_bind()``) or Session.
    Returns ``{field: {"written": n, "skipped": m}}`` where ``skipped`` counts
    ghost refs (UUIDs that do not resolve to an existing POI). Uses
    ``ON CONFLICT DO NOTHING`` so it is safe to re-run — e.g. after a rolling
    deploy, to pick up any JSONB writes made by still-old code during the window.
    Does NOT modify or drop the JSONB columns.
    """
    from sqlalchemy import text

    poi_ids = {
        str(row[0])
        for row in bind.execute(text("SELECT id FROM points_of_interest")).fetchall()
    }

    # RETURNING lets us count ACTUAL inserts (a conflicting row returns nothing),
    # so "written" is accurate and a re-run reports 0 new edges.
    insert_sql = text(
        "INSERT INTO poi_relationships "
        "(source_poi_id, target_poi_id, relationship_type, meta) "
        "VALUES (:s, :t, :r, CAST(:m AS jsonb)) "
        "ON CONFLICT DO NOTHING RETURNING 1"
    )

    results: Dict[str, Dict[str, int]] = {f: {"written": 0, "skipped": 0} for f in LINK_FIELDS}

    def _emit(field: str, source_id: str, value: Any) -> None:
        info = LINK_FIELDS[field]
        rel_type = info["rel_type"]
        seen: set = set()
        for tid, meta in _extract_entries(value):
            tid_s = str(tid)
            if tid_s == source_id or tid_s in seen:
                continue
            if tid_s not in poi_ids:
                results[field]["skipped"] += 1  # ghost ref
                continue
            seen.add(tid_s)
            inserted = bind.execute(insert_sql, {
                "s": source_id, "t": tid_s, "r": rel_type,
                "m": json.dumps(meta) if meta else None,
            }).fetchone()
            if inserted is not None:
                results[field]["written"] += 1

    # Top-level POI columns.
    top_fields = [f for f, i in LINK_FIELDS.items() if i["owner"] == "poi"]
    cols = ", ".join(top_fields)
    for row in bind.execute(text(f"SELECT id, {cols} FROM points_of_interest")).mappings():
        source_id = str(row["id"])
        for field in top_fields:
            _emit(field, source_id, row[field])

    # Event subtype column (vendor_poi_links lives on the events table, keyed by
    # poi_id, which IS the owning POI's id / the edge source).
    for row in bind.execute(
        text("SELECT poi_id, vendor_poi_links FROM events")
    ).mappings():
        _emit("vendor_poi_links", str(row["poi_id"]), row["vendor_poi_links"])

    return results
