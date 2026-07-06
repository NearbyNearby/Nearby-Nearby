"""Task 2.3: per-POI point geometries backed by the ``poi_points`` table.

Six admin form fields used to store point geometry (map pins) as arrays of
``{lat, lng, ...}`` objects (or, for the trailhead, a single object) inside JSONB
columns. PostGIS could not query them. This module moves those points into the
GIST-indexed ``poi_points`` table so spatial queries (``ST_DWithin`` /
``ST_Distance`` — "nearest restroom to a coordinate") work, while the admin form
and the public serialized shapes stay byte-identical (reconstructed on read).

    field                  owner   shape    kind          coord keys
    --------------------   -----   ------   -----------   -------------------
    parking_locations      poi     array    parking       lat / lng
    toilet_locations       poi     array    restroom      lat / lng
    playground_locations   poi     array    playground    lat / lng
    payphone_locations     poi     array    payphone      lat / lng
    access_points          trail   array    access_point  latitude / longitude
    trailhead_location      trail   single   trailhead     lat / lng

Each poi_points row is ONE point: ``geom`` (Point, 4326) holds the coordinate;
``meta`` (JSONB) holds every OTHER key from the original entry verbatim (name,
notes, parking_types, toilet_types, playground types/surfaces, descriptions,
what3words, photo_ids, ...) plus a reserved ``_pos`` ordinal so the original
array order round-trips (photo uploads are index-scoped, so order matters).

``geom`` is NOT NULL: an entry with no parseable coordinate pair (a not-yet-
geolocated pin) or a malformed entry has no point and is SKIPPED (and counted).
The JSONB source columns are RETAINED this release (expand/contract), so existing
coordinate-less data survives in JSONB as the recovery source until a later
contract release drops the columns.
"""

from __future__ import annotations

import json
import uuid
from typing import Any, Dict, List, Optional

from geoalchemy2.elements import WKTElement
from sqlalchemy import text

from shared.models.poi import POIPoint

# Reserved meta key carrying the original array index so order is stable across
# the delete+reinsert write path (never emitted to admin/public — stripped on read).
_POSITION_KEY = "_pos"

# field name -> descriptor.
#   kind      : poi_points.kind value (matches the DB CHECK constraint).
#   owner     : "poi" (top-level column on points_of_interest) or "trail"
#               (a column on the trails subtype, keyed by poi_id == POI id).
#   shape     : "array" (List[Dict]) or "single" (one Dict, the trailhead).
#   lat_key / lng_key : the coordinate keys inside each entry dict.
POINT_FIELDS: Dict[str, Dict[str, str]] = {
    "parking_locations":    {"kind": "parking",      "owner": "poi",   "shape": "array",  "lat_key": "lat",      "lng_key": "lng"},
    "toilet_locations":     {"kind": "restroom",     "owner": "poi",   "shape": "array",  "lat_key": "lat",      "lng_key": "lng"},
    "playground_locations": {"kind": "playground",   "owner": "poi",   "shape": "array",  "lat_key": "lat",      "lng_key": "lng"},
    "payphone_locations":   {"kind": "payphone",     "owner": "poi",   "shape": "array",  "lat_key": "lat",      "lng_key": "lng"},
    "access_points":        {"kind": "access_point", "owner": "trail", "shape": "array",  "lat_key": "latitude", "lng_key": "longitude"},
    "trailhead_location":   {"kind": "trailhead",    "owner": "trail", "shape": "single", "lat_key": "lat",      "lng_key": "lng"},
}

# kind -> field name (the serializer knows the kind from the registry ``source``
# ("points:<kind>"), not the field name).
KIND_TO_FIELD: Dict[str, str] = {v["kind"]: k for k, v in POINT_FIELDS.items()}


def _coerce_coord(raw: Any) -> Optional[float]:
    """Return ``raw`` as a float coordinate, or None if missing/unparseable."""
    if raw is None or isinstance(raw, bool):
        return None
    if isinstance(raw, (int, float)):
        return float(raw)
    if isinstance(raw, str) and raw.strip():
        try:
            return float(raw.strip())
        except ValueError:
            return None
    return None


def _entries_of(value: Any, info: Dict[str, str]) -> List[Any]:
    """Normalize a field value into a list of entry candidates.

    ``single`` fields wrap their one dict; ``array`` fields pass through, with a
    lone dict tolerated (legacy singular playground rows — see migration g67_001).
    """
    if value is None:
        return []
    if info["shape"] == "single":
        return [value] if isinstance(value, dict) else []
    if isinstance(value, dict):
        return [value]
    if isinstance(value, (list, tuple)):
        return list(value)
    return []


def _parse_entry(entry: Any, info: Dict[str, str]):
    """Return ``(lat, lng, meta)`` for a valid geolocated entry, else None.

    None means "skip and count": the entry is not a dict, or it lacks a parseable
    coordinate pair. ``meta`` is every key except the two coordinate keys.
    """
    if not isinstance(entry, dict):
        return None
    lat = _coerce_coord(entry.get(info["lat_key"]))
    lng = _coerce_coord(entry.get(info["lng_key"]))
    if lat is None or lng is None:
        return None
    meta = {k: v for k, v in entry.items() if k not in (info["lat_key"], info["lng_key"])}
    return lat, lng, meta


def sync_point_rows(db, poi_id: uuid.UUID, field: str, value: Any) -> int:
    """Replace all poi_points of ``field``'s kind for ``poi_id`` with the points
    parsed from ``value`` (delete + reinsert, mirroring the 2.1 edge sync).

    Coordinate-less / malformed entries are skipped. The original array index is
    stored in ``meta._pos`` so order round-trips. Flushes so a following snapshot
    / commit sees the rows. Returns the number of point rows written.
    """
    info = POINT_FIELDS[field]
    kind = info["kind"]

    db.query(POIPoint).filter(
        POIPoint.poi_id == poi_id,
        POIPoint.kind == kind,
    ).delete(synchronize_session=False)

    written = 0
    for pos, entry in enumerate(_entries_of(value, info)):
        parsed = _parse_entry(entry, info)
        if parsed is None:
            continue
        lat, lng, meta = parsed
        meta = dict(meta)
        meta[_POSITION_KEY] = pos
        db.add(POIPoint(
            poi_id=poi_id,
            kind=kind,
            geom=WKTElement(f"POINT({lng} {lat})", srid=4326),
            meta=meta,
        ))
        written += 1

    db.flush()
    return written


def read_point_field(db, poi_id: uuid.UUID, field: str) -> Any:
    """Reconstruct ``field`` in its ORIGINAL JSONB shape from poi_points.

    ``array`` -> ``[{lat_key, lng_key, **meta}, ...]`` (or None if no rows);
    ``single`` -> ``{lat_key, lng_key, **meta}`` (or None). ``_pos`` is stripped;
    rows are ordered by it so the array order matches what was written.
    """
    info = POINT_FIELDS[field]
    rows = db.execute(
        text(
            "SELECT ST_Y(geom) AS lat, ST_X(geom) AS lng, meta "
            "FROM poi_points WHERE poi_id = :p AND kind = :k "
            "ORDER BY COALESCE((meta->>'_pos')::int, 0), id"
        ),
        {"p": str(poi_id), "k": info["kind"]},
    ).mappings().all()

    out: List[Dict[str, Any]] = []
    for r in rows:
        meta = dict(r["meta"] or {})
        meta.pop(_POSITION_KEY, None)
        entry = {info["lat_key"]: r["lat"], info["lng_key"]: r["lng"]}
        entry.update(meta)
        out.append(entry)

    if info["shape"] == "single":
        return out[0] if out else None
    return out or None


def read_points_by_kind(db, poi_id: uuid.UUID, kind: str) -> Any:
    """Serializer entry point: reconstruct the public value for ``points:<kind>``.

    Same reconstruction (and same shape) the admin read uses — these fields carry
    no PII, so public == admin. Returns None for an unknown kind.
    """
    field = KIND_TO_FIELD.get(kind)
    if field is None:
        return None
    return read_point_field(db, poi_id, field)


def enrich_poi_point_fields(db, poi) -> Any:
    """Reconstruct all six point fields from poi_points onto the ORM instance
    (the four POI-level attrs, plus the two trail attrs when a trail row exists)
    so responses that serialize ORM attributes (the admin GET/PUT/POST responses,
    the app's nested ``trail`` structural object) reflect poi_points, not the
    stale retained JSONB columns.

    Uses ``set_committed_value`` — NOT plain setattr — so the instance is never
    marked dirty: a later autoflush in the same session can therefore never write
    the reconstructed values back into the JSONB columns.
    """
    if poi is None:
        return poi
    from sqlalchemy.orm.attributes import set_committed_value

    trail = getattr(poi, "trail", None)
    for field, info in POINT_FIELDS.items():
        if info["owner"] == "trail":
            if trail is not None:
                set_committed_value(trail, field, read_point_field(db, poi.id, field))
        else:
            set_committed_value(poi, field, read_point_field(db, poi.id, field))
    return poi


def backfill_point_rows(bind) -> Dict[str, Dict[str, int]]:
    """Idempotent backfill: create poi_points rows from the six JSONB columns.

    ``bind`` is a SQLAlchemy Connection (alembic ``op.get_bind()``) or Session.
    Returns ``{field: {"written": n, "skipped": m}}`` where ``skipped`` counts
    coordinate-less / malformed entries.

    Idempotency + rolling-deploy safety: a ``(poi_id, kind)`` that ALREADY has
    poi_points rows is skipped entirely, so re-running is a no-op and a POI whose
    kind was already written by the new write path during a rollout is never
    clobbered. Does NOT modify or drop the JSONB columns.
    """
    results: Dict[str, Dict[str, int]] = {f: {"written": 0, "skipped": 0} for f in POINT_FIELDS}

    existing = {
        (str(row[0]), row[1])
        for row in bind.execute(text("SELECT DISTINCT poi_id, kind FROM poi_points")).fetchall()
    }

    insert_sql = text(
        "INSERT INTO poi_points (id, poi_id, kind, geom, meta) VALUES "
        "(:id, :poi, :kind, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326), CAST(:meta AS jsonb))"
    )

    def _emit(field: str, poi_id: str, value: Any) -> None:
        info = POINT_FIELDS[field]
        kind = info["kind"]
        if (poi_id, kind) in existing:
            return  # already populated -> idempotent / rolling-safe no-op
        for pos, entry in enumerate(_entries_of(value, info)):
            parsed = _parse_entry(entry, info)
            if parsed is None:
                results[field]["skipped"] += 1
                continue
            lat, lng, meta = parsed
            meta = dict(meta)
            meta[_POSITION_KEY] = pos
            bind.execute(insert_sql, {
                "id": str(uuid.uuid4()), "poi": poi_id, "kind": kind,
                "lat": lat, "lng": lng, "meta": json.dumps(meta),
            })
            results[field]["written"] += 1

    # Top-level POI columns (parking / restroom / playground / payphone).
    top_fields = [f for f, i in POINT_FIELDS.items() if i["owner"] == "poi"]
    cols = ", ".join(top_fields)
    for row in bind.execute(text(f"SELECT id, {cols} FROM points_of_interest")).mappings():
        poi_id = str(row["id"])
        for field in top_fields:
            _emit(field, poi_id, row[field])

    # Trail subtype columns (access_points / trailhead_location), keyed by poi_id.
    trail_fields = [f for f, i in POINT_FIELDS.items() if i["owner"] == "trail"]
    tcols = ", ".join(trail_fields)
    for row in bind.execute(text(f"SELECT poi_id, {tcols} FROM trails")).mappings():
        poi_id = str(row["poi_id"])
        for field in trail_fields:
            _emit(field, poi_id, row[field])

    return results
