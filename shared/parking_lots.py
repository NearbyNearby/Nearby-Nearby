"""Reusable parking lots: link sync + the ONE unified read (issues #90 / #161).

Parking is stored in two places this release and unified here:

    representation                       table                        origin
    ----------------------------------   --------------------------   --------
    the POI's OWN pins (repeating form)  poi_points (kind='parking')  "own"
    SHAREABLE lots linked to the POI     parking_lots + the link edge  "linked"

The own-pin write path is untouched (see ``shared/poi_points.py``); nothing in
this module writes ``poi_points``. What is new is ``poi_parking_links``: a POI
declares which shareable lots it surfaces, in which order, with an optional
linker-owned ``label``.

``read_parking_lots`` is the single read contract both the admin response and
the public serializer use: own entries first (in their ``_pos`` order), then the
linked entries (in ``sort_order``), every entry the SAME shape:

    { id, origin, is_standalone, name, parking_types, accessible_parking_details,
      notes, lat, lng, what3words, address_hint, expect_to_pay, label,
      owner: {id, name, slug, poi_type} | null, images: [...], sort_order }

``id`` is the poi_points row id for own entries and the parking_lots row id for
linked entries, so it is unique within the array either way. ``label`` is always
null for own entries (nobody else is linking them). Own entries carry their
photos from the owner POI's ``image_type='parking'`` rows scoped by the
``parking_{index+1}`` context the form uploads under; linked entries carry the
lot's own ``parking_lot_id`` rows. In both cases ``caption`` is the
"what should visitors look for?" note - no new image column was needed.

Publication rules (``audience="public"`` only):
  * own entries are always emitted (the POI itself is already published-gated);
  * a linked lot is emitted only if the LOT is published;
  * a linked lot OWNED by another POI additionally requires that owner POI to be
    published, so a draft neighbor never leaks through its lot;
  * the ``owner`` summary is emitted only for a published owner.
``audience="admin"`` applies no publication filter and adds nothing else: the
admin needs to see and reorder drafts.
"""

from __future__ import annotations

import uuid
from typing import Any, Dict, Iterable, List, Optional

from sqlalchemy import func, text

from shared.models.enums import ImageType
from shared.models.image import Image
from shared.models.parking_lot import ParkingLot, POIParkingLink
from shared.models.poi import PointOfInterest
from shared.poi_points import read_point_field

# The admin write-only POI field carrying the link list. NOT a registry field:
# it is an input, and what the public reads is the derived ``parking_lots``.
LINK_FIELD = "parking_lot_links"


def lot_image_context(lot_id: Any) -> str:
    """``image_context`` used for a shareable lot's photos.

    Mirrors the stable-UUID contexts the admin form already uses for sub-entities
    (``sponsor_{stableId}``), so a lot's photos survive reordering.
    """
    return f"parking_lot_{lot_id}"


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


def _coerce_int(raw: Any, default: int) -> int:
    if isinstance(raw, bool) or raw is None:
        return default
    try:
        return int(raw)
    except (TypeError, ValueError):
        return default


def _extract_link_entries(value: Any) -> Iterable[Dict[str, Any]]:
    """Yield ``{lot_id, sort_order, label}`` for each entry in ``value``.

    Accepts the two admin shapes: a bare list of UUIDs (``[uuid, ...]``) and a
    list of dicts (``[{parking_lot_id, sort_order?, label?}, ...]``). Entries
    without a parseable lot id are skipped. ``sort_order`` defaults to the
    entry's index so a plain UUID list keeps its order.
    """
    if value is None:
        return
    if isinstance(value, (str, uuid.UUID, dict)):
        value = [value]
    if not isinstance(value, (list, tuple)):
        return
    for pos, entry in enumerate(value):
        if isinstance(entry, dict):
            lot_id = _coerce_uuid(entry.get("parking_lot_id") or entry.get("id"))
            sort_order = _coerce_int(entry.get("sort_order"), pos)
            label = entry.get("label")
            label = label.strip() if isinstance(label, str) and label.strip() else None
        else:
            lot_id = _coerce_uuid(entry)
            sort_order = pos
            label = None
        if lot_id is None:
            continue
        yield {"lot_id": lot_id, "sort_order": sort_order, "label": label}


def sync_parking_links(db, poi_id: uuid.UUID, value: Any) -> int:
    """Replace ``poi_id``'s parking-lot links with the set parsed from ``value``.

    Delete + reinsert, mirroring ``sync_link_edges`` / ``sync_point_rows``: the
    field is authoritative for this POI's links. Lot ids that do not resolve to
    an existing ``parking_lots`` row are skipped (never a 500), as are duplicates.
    Flushes so a following snapshot / commit sees the rows. Returns the number of
    links written.
    """
    db.query(POIParkingLink).filter(
        POIParkingLink.poi_id == poi_id
    ).delete(synchronize_session=False)

    written = 0
    seen: set = set()
    for entry in _extract_link_entries(value):
        lot_id = entry["lot_id"]
        if lot_id in seen:
            continue
        exists = db.query(ParkingLot.id).filter(ParkingLot.id == lot_id).first()
        if exists is None:
            continue  # unknown lot id -> skip, do not blow up the POI save
        seen.add(lot_id)
        db.add(POIParkingLink(
            poi_id=poi_id,
            parking_lot_id=lot_id,
            sort_order=entry["sort_order"],
            label=entry["label"],
        ))
        written += 1

    db.flush()
    return written


def read_links_admin(db, poi_id: uuid.UUID) -> List[Dict[str, Any]]:
    """The admin round-trip shape of ``parking_lot_links`` for one POI."""
    rows = (
        db.query(POIParkingLink)
        .filter(POIParkingLink.poi_id == poi_id)
        .order_by(POIParkingLink.sort_order, POIParkingLink.parking_lot_id)
        .all()
    )
    return [
        {
            "parking_lot_id": str(r.parking_lot_id),
            "sort_order": r.sort_order,
            "label": r.label,
        }
        for r in rows
    ]


def clone_parking_links(db, src_poi_id: uuid.UUID, dst_poi_id: uuid.UUID) -> int:
    """Copy every parking-lot link from ``src_poi_id`` onto ``dst_poi_id``.

    Used by the event-reschedule clone so a rescheduled event keeps the parking
    its original pointed at. Existing links on the destination are replaced.
    """
    return sync_parking_links(db, dst_poi_id, [
        {"parking_lot_id": r["parking_lot_id"], "sort_order": r["sort_order"], "label": r["label"]}
        for r in read_links_admin(db, src_poi_id)
    ])


def _serialize_lot_image(img: Image, thumbnails: Dict[Any, str]) -> Dict[str, Any]:
    """One image in the POIImage-shaped dict the public serializer emits.

    Kept identical to ``poi_serializer._serialize_image``'s shape so a lot photo
    and a POI photo are indistinguishable to the frontend. ``caption`` carries
    the "what should visitors look for?" note.
    """
    img_type = getattr(img, "image_type", None)
    return {
        "id": str(img.id) if img.id is not None else None,
        "url": getattr(img, "storage_url", None),
        "thumbnail_url": thumbnails.get(img.id),
        "type": img_type.value if hasattr(img_type, "value") else img_type,
        "alt_text": getattr(img, "alt_text", None),
        "caption": getattr(img, "caption", None),
        "width": getattr(img, "width", None),
        "height": getattr(img, "height", None),
    }


def _thumbnail_urls(db, originals: List[Image]) -> Dict[Any, str]:
    """``{parent_image_id: thumbnail storage_url}`` for a batch of originals.

    Variants are separate rows keyed by ``parent_image_id``; one query resolves
    them all rather than lazy-loading ``size_variants`` per image.
    """
    ids = [img.id for img in originals]
    if not ids:
        return {}
    rows = (
        db.query(Image.parent_image_id, Image.storage_url)
        .filter(
            Image.parent_image_id.in_(ids),
            Image.image_size_variant == "thumbnail",
        )
        .all()
    )
    return {parent_id: url for parent_id, url in rows if url}


def lot_images(db, lot_ids: List[uuid.UUID]) -> Dict[str, List[Dict[str, Any]]]:
    """``{lot_id_str: [image dicts]}`` for every lot in ``lot_ids``, ONE query.

    Only original rows (``parent_image_id IS NULL``) are returned, matching what
    the POI image reads emit.
    """
    if not lot_ids:
        return {}
    rows = (
        db.query(Image)
        .filter(
            Image.parking_lot_id.in_(list(lot_ids)),
            Image.parent_image_id.is_(None),
        )
        .order_by(Image.display_order, Image.created_at)
        .all()
    )
    thumbnails = _thumbnail_urls(db, rows)
    out: Dict[str, List[Dict[str, Any]]] = {}
    for img in rows:
        out.setdefault(str(img.parking_lot_id), []).append(
            _serialize_lot_image(img, thumbnails)
        )
    return out


def _own_parking_images(db, poi_id: uuid.UUID) -> Dict[str, List[Dict[str, Any]]]:
    """``{image_context: [image dicts]}`` for a POI's own parking photos.

    The repeating form uploads them under ``parking_{index+1}``, so the context
    is how an own entry finds its photos. ONE query for all of them.
    """
    rows = (
        db.query(Image)
        .filter(
            Image.poi_id == poi_id,
            Image.image_type == ImageType.parking,
            Image.parent_image_id.is_(None),
        )
        .order_by(Image.display_order, Image.created_at)
        .all()
    )
    thumbnails = _thumbnail_urls(db, rows)
    out: Dict[str, List[Dict[str, Any]]] = {}
    for img in rows:
        out.setdefault(img.image_context or "", []).append(
            _serialize_lot_image(img, thumbnails)
        )
    return out


def _own_entries(db, poi_id: uuid.UUID) -> List[Dict[str, Any]]:
    """Project the POI's own ``poi_points(kind='parking')`` pins into lot shape.

    Read-only: this reuses ``read_point_field`` and never writes poi_points, so
    the own-parking round-trip stays byte-identical.
    """
    pins = read_point_field(db, poi_id, "parking_locations") or []
    if not pins:
        return []
    ids = db.execute(
        text(
            "SELECT id FROM poi_points WHERE poi_id = :p AND kind = 'parking' "
            "ORDER BY COALESCE((meta->>'_pos')::int, 0), id"
        ),
        {"p": str(poi_id)},
    ).scalars().all()
    photos = _own_parking_images(db, poi_id)

    entries: List[Dict[str, Any]] = []
    for idx, pin in enumerate(pins):
        entries.append({
            "id": str(ids[idx]) if idx < len(ids) else None,
            "origin": "own",
            "is_standalone": False,
            "name": pin.get("name"),
            "parking_types": pin.get("parking_types") or [],
            "accessible_parking_details": pin.get("accessible_parking_details") or [],
            "notes": pin.get("notes"),
            "lat": pin.get("lat"),
            "lng": pin.get("lng"),
            "what3words": pin.get("w3w") or pin.get("what3words"),
            "address_hint": pin.get("address_hint"),
            "expect_to_pay": pin.get("expect_to_pay"),
            "label": None,
            "owner": None,
            "images": photos.get(f"parking_{idx + 1}", []),
            "sort_order": idx,
        })
    return entries


def _owner_summary(owner: Optional[PointOfInterest]) -> Optional[Dict[str, Any]]:
    if owner is None:
        return None
    poi_type = getattr(owner, "poi_type", None)
    return {
        "id": str(owner.id),
        "name": owner.name,
        "slug": getattr(owner, "slug", None),
        "poi_type": poi_type.value if hasattr(poi_type, "value") else poi_type,
    }


def _linked_entries(db, poi_id: uuid.UUID, *, audience: str) -> List[Dict[str, Any]]:
    """The POI's linked shareable lots, in ``sort_order``, publication-filtered.

    Three queries total regardless of how many lots: the links+lots join, the
    owner POIs, and one batched image read.
    """
    rows = (
        db.query(
            POIParkingLink,
            ParkingLot,
            func.ST_Y(ParkingLot.geom).label("lat"),
            func.ST_X(ParkingLot.geom).label("lng"),
        )
        .join(ParkingLot, ParkingLot.id == POIParkingLink.parking_lot_id)
        .filter(POIParkingLink.poi_id == poi_id)
        .order_by(POIParkingLink.sort_order, ParkingLot.name)
        .all()
    )
    if not rows:
        return []

    public = audience == "public"
    if public:
        rows = [r for r in rows if r[1].publication_status == "published"]
        if not rows:
            return []

    owner_ids = {r[1].owner_poi_id for r in rows if r[1].owner_poi_id is not None}
    owners: Dict[Any, PointOfInterest] = {}
    if owner_ids:
        owners = {
            o.id: o
            for o in db.query(PointOfInterest)
            .filter(PointOfInterest.id.in_(list(owner_ids)))
            .all()
        }

    def _owner_published(owner) -> bool:
        return owner is not None and getattr(owner, "publication_status", None) == "published"

    if public:
        # A lot owned by a DRAFT POI is that POI's private business; never leak it.
        rows = [
            r for r in rows
            if r[1].owner_poi_id is None or _owner_published(owners.get(r[1].owner_poi_id))
        ]
        if not rows:
            return []

    photos = lot_images(db, [r[1].id for r in rows])

    entries: List[Dict[str, Any]] = []
    for lk, lot, lat, lng in rows:
        owner = owners.get(lot.owner_poi_id) if lot.owner_poi_id else None
        if public and not _owner_published(owner):
            owner = None
        entries.append({
            "id": str(lot.id),
            "origin": "linked",
            "is_standalone": lot.owner_poi_id is None,
            "name": lot.name,
            "parking_types": lot.parking_types or [],
            "accessible_parking_details": lot.accessible_parking_details or [],
            "notes": lot.notes,
            "lat": lat,
            "lng": lng,
            "what3words": lot.what3words,
            "address_hint": lot.address_hint,
            "expect_to_pay": lot.expect_to_pay,
            "label": lk.label,
            "owner": _owner_summary(owner),
            "images": photos.get(str(lot.id), []),
            "sort_order": lk.sort_order,
        })
    return entries


def read_parking_lots(db, poi_id: uuid.UUID, *, audience: str = "public") -> List[Dict[str, Any]]:
    """THE unified read: the POI's own pins, then its linked shareable lots.

    ``audience="public"`` applies the publication rules in the module docstring;
    ``audience="admin"`` applies none (drafts are what the editor is working on).
    """
    own = _own_entries(db, poi_id)
    linked = _linked_entries(db, poi_id, audience=audience)
    # Own entries keep 0..n-1; linked entries continue the sequence so the array
    # index and the emitted sort_order agree for the frontend.
    for offset, entry in enumerate(linked):
        entry["sort_order"] = len(own) + offset
    return own + linked


def enrich_poi_parking(db, poi, *, audience: str = "admin"):
    """Attach ``parking_lots`` + ``parking_lot_links`` to an ORM POI instance.

    Plain setattr is correct here (unlike ``enrich_poi_point_fields``, which must
    use ``set_committed_value``): neither key is a MAPPED attribute, so writing
    them cannot mark the instance dirty and no autoflush can ever try to persist
    them. ``set_committed_value`` would in fact raise, since there is no attribute
    impl to commit against.
    """
    if poi is None:
        return poi
    setattr(poi, "parking_lots", read_parking_lots(db, poi.id, audience=audience))
    setattr(poi, LINK_FIELD, read_links_admin(db, poi.id))
    return poi
