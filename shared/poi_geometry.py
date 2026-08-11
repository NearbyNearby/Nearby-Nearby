"""Real-geometry helpers for the geom_line / geom_area columns (Task 2.4).

Two concerns, both dependency-light (shapely + geoalchemy2 are already required
by the geo stack that maps ``location``):

1. Write path (admin create/update, import scripts, the future draw UI):
   ``geojson_to_wkt`` validates a GeoJSON geometry (correct type, sane lon/lat
   ranges) and returns plain WKT — assigned to the mapped Geometry column exactly
   like ``location`` (the column typmod applies SRID 4326). It raises ``ValueError``
   on any invalid geometry; the CRUD maps that to HTTP 400.

2. Public derivation: a trail's length in miles from ``geom_line`` via
   ``ST_Length(geom_line::geography)``. ``length_text`` stays the display fallback
   when no line exists. The raw geometries themselves are admin-audience and are
   never serialized to a public endpoint.
"""

from __future__ import annotations

from typing import Any, Optional

# 1 statute mile in metres (PostGIS ``geography`` length is metres).
METERS_PER_MILE = 1609.344


def _iter_lonlat(geom) -> Any:
    """Yield every (lon, lat) vertex of a shapely LineString or Polygon."""
    gtype = geom.geom_type
    if gtype == "LineString":
        yield from geom.coords
    elif gtype == "Polygon":
        yield from geom.exterior.coords
        for ring in geom.interiors:
            yield from ring.coords
    else:  # pragma: no cover - callers validate type first
        yield from ()


def geojson_to_wkt(geojson: Any, expected_type: str) -> str:
    """Validate a GeoJSON geometry and return plain WKT (no SRID prefix).

    ``expected_type`` is ``"LineString"`` or ``"Polygon"``. Validation:
      * must be a GeoJSON object (dict) with a matching ``type``;
      * must parse to a shapely geometry of that exact type;
      * every coordinate must be a finite lon in [-180, 180], lat in [-90, 90].

    Raises ``ValueError`` (mapped to HTTP 400 by the CRUD) on any violation. The
    returned WKT is assigned to the Geometry column just like ``location`` — the
    column's SRID-4326 typmod tags the stored value, so the round-trip matches the
    existing POINT handling.
    """
    from shapely.geometry import shape as _shape

    if not isinstance(geojson, dict):
        raise ValueError("geometry must be a GeoJSON object")
    gtype = geojson.get("type")
    if gtype != expected_type:
        raise ValueError(
            f"geometry type must be '{expected_type}', got {gtype!r}"
        )
    try:
        geom = _shape(geojson)
    except Exception as exc:  # malformed coordinates / structure
        raise ValueError(f"invalid {expected_type} geometry: {exc}")
    if geom.geom_type != expected_type:
        raise ValueError(
            f"geometry type must be '{expected_type}', got {geom.geom_type!r}"
        )
    if geom.is_empty:
        raise ValueError(f"{expected_type} geometry is empty")
    for lon, lat in _iter_lonlat(geom):
        if not (-180.0 <= lon <= 180.0) or not (-90.0 <= lat <= 90.0):
            raise ValueError(
                f"coordinate out of range: lon={lon}, lat={lat} "
                "(expected lon in [-180,180], lat in [-90,90])"
            )
    return geom.wkt


def wkb_to_geojson(value: Any) -> Optional[dict]:
    """Convert a stored geometry (geoalchemy2 WKBElement) to a GeoJSON dict.

    Used by the admin response schema so geom_line / geom_area serialize
    JSON-safely (and therefore appear JSON-safely in poi_revisions snapshots),
    mirroring how ``PointGeometry`` JSON-safes ``location``. Returns None for a
    NULL geometry or on any parse failure (defensive — never 500 a response).
    """
    if value is None:
        return None
    try:
        from geoalchemy2.shape import to_shape
        from shapely.geometry import mapping
        return mapping(to_shape(value))
    except Exception:  # pragma: no cover - defensive
        return None


def compute_length_miles(db, poi_id) -> Optional[float]:
    """Trail length in miles from geom_line, or None when no line exists.

    ``ST_Length(geom_line::geography)`` returns great-circle metres for the
    SRID-4326 lon/lat line; we convert to miles and round to 2 dp. One indexed
    single-row query (detail path only — no N+1).
    """
    from sqlalchemy import text

    row = db.execute(
        text(
            "SELECT ST_Length(geom_line::geography) FROM points_of_interest "
            "WHERE id = :id AND geom_line IS NOT NULL"
        ),
        {"id": str(poi_id)},
    ).fetchone()
    if not row or row[0] is None:
        return None
    return round(row[0] / METERS_PER_MILE, 2)


def enrich_trail_length(db, poi) -> Any:
    """Attach the derived ``length_miles`` onto the nested trail object.

    ``length_miles`` is NOT a mapped column, so a plain ``setattr`` is used (an
    unmapped attribute is invisible to the unit of work — it never dirties the
    session, so a later autoflush can't write anything back). The app's Trail
    response schema reads it via ``from_attributes``; when no trail row exists (or
    no line), the value is None and ``length_text`` remains the display fallback.
    No-op for non-trail POIs.
    """
    if poi is None:
        return poi
    trail = getattr(poi, "trail", None)
    if trail is None:
        return poi
    setattr(trail, "length_miles", compute_length_miles(db, poi.id))
    return poi
