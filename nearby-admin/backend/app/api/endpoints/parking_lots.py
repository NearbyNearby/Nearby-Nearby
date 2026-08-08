"""Admin CRUD for reusable parking lots (issues #90 / #161).

Two kinds of lot live in ``parking_lots``:

    STANDALONE (``owner_poi_id`` NULL)   an admin-curated public lot ("Main St
                                         Municipal Deck") that any POI may link.
    OWNED (``owner_poi_id`` set)         a lot belonging to one POI but offered
                                         to its neighbors.

Permissions follow that split. An owned lot is ordinary POI content, so
admin-or-editor may write it. A standalone lot is shared infrastructure whose
edit propagates to every POI that links it, so it is admin-only. There is no
"area manager" role in this codebase (admin | editor | viewer), so admin is the
narrowest gate available; revisit if that role ever lands.

Reads are admin-or-editor: an editor must be able to FIND a lot to link it even
where it may not edit it. There is no public route here in v1 (product decision
4): a standalone lot has no page of its own and rides along on POI details only.

The POI-side linking does NOT live here. It rides on the POI payload as
``parking_lot_links`` (see ``shared/parking_lots.py``), the same way the Task 2.1
link fields do.
"""

import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from geoalchemy2 import Geography
from sqlalchemy import func, or_, text
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.permissions import require_admin, require_admin_or_editor
from app.models.parking_lot import ParkingLot, POIParkingLink
from app.models.poi import PointOfInterest
from app.schemas.parking_lot import (
    ParkingLot as ParkingLotSchema,
    ParkingLotCreate,
    ParkingLotUpdate,
)
from shared.parking_lots import lot_images

router = APIRouter()

# Columns a create/update may set directly (latitude/longitude become geom).
_SCALAR_FIELDS = (
    "name", "parking_types", "accessible_parking_details", "notes",
    "what3words", "address_hint", "expect_to_pay", "publication_status",
)


def _is_admin(current_user) -> bool:
    return getattr(current_user, "role", None) == "admin"


def _require_admin_for_standalone(current_user, is_standalone: bool) -> None:
    """A standalone lot is shared infrastructure: admin-only to write."""
    if is_standalone and not _is_admin(current_user):
        raise HTTPException(
            status_code=403,
            detail="Only an admin may create or edit a standalone parking lot",
        )


def _set_geom(lot: ParkingLot, latitude, longitude) -> None:
    """Set / clear ``geom`` from a lat+lng pair. Only a COMPLETE pair sets it."""
    if latitude is None or longitude is None:
        return
    lot.geom = func.ST_SetSRID(func.ST_MakePoint(float(longitude), float(latitude)), 4326)


def _lat_lng(db: Session, lot: ParkingLot):
    if lot.geom is None:
        return None, None
    row = db.execute(
        text("SELECT ST_Y(geom), ST_X(geom) FROM parking_lots WHERE id = :i"),
        {"i": str(lot.id)},
    ).fetchone()
    return (row[0], row[1]) if row else (None, None)


def _lot_response(db: Session, lot: ParkingLot) -> dict:
    """Build the ParkingLot response payload for one lot."""
    lat, lng = _lat_lng(db, lot)
    owner = None
    if lot.owner_poi_id:
        poi = db.query(PointOfInterest).filter(PointOfInterest.id == lot.owner_poi_id).first()
        if poi is not None:
            poi_type = getattr(poi, "poi_type", None)
            owner = {
                "id": poi.id,
                "name": poi.name,
                "slug": getattr(poi, "slug", None),
                "poi_type": poi_type.value if hasattr(poi_type, "value") else poi_type,
            }
    linked = db.query(POIParkingLink).filter(POIParkingLink.parking_lot_id == lot.id).count()
    return {
        "id": lot.id,
        "owner_poi_id": lot.owner_poi_id,
        "is_standalone": lot.owner_poi_id is None,
        "name": lot.name,
        "parking_types": lot.parking_types or [],
        "accessible_parking_details": lot.accessible_parking_details or [],
        "notes": lot.notes,
        "latitude": lat,
        "longitude": lng,
        "what3words": lot.what3words,
        "address_hint": lot.address_hint,
        "expect_to_pay": lot.expect_to_pay,
        "publication_status": lot.publication_status,
        "owner": owner,
        "images": lot_images(db, [lot.id]).get(str(lot.id), []),
        "linked_poi_count": linked,
        "created_at": lot.created_at,
        "updated_at": lot.updated_at,
    }


def _get_lot_or_404(db: Session, lot_id: uuid.UUID) -> ParkingLot:
    lot = db.query(ParkingLot).filter(ParkingLot.id == lot_id).first()
    if lot is None:
        raise HTTPException(status_code=404, detail="Parking lot not found")
    return lot


@router.get("/parking-lots/", response_model=List[ParkingLotSchema])
def list_parking_lots(
    q: Optional[str] = Query(None, description="Case-insensitive match on name / address hint"),
    standalone_only: bool = Query(False, description="Only admin-curated lots with no owner POI"),
    owner_poi_id: Optional[uuid.UUID] = Query(None, description="Only lots owned by this POI"),
    near_lat: Optional[float] = Query(None),
    near_lng: Optional[float] = Query(None),
    radius_m: int = Query(5000, ge=1, le=200000, description="Radius for near_lat/near_lng, metres"),
    skip: int = 0,
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user=Depends(require_admin_or_editor()),
):
    """Feed for the POI form's lot picker. Drafts are included on purpose: an
    editor needs to see (and can then flag) a lot that is not published yet."""
    query = db.query(ParkingLot)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(or_(ParkingLot.name.ilike(like), ParkingLot.address_hint.ilike(like)))
    if standalone_only:
        query = query.filter(ParkingLot.owner_poi_id.is_(None))
    if owner_poi_id is not None:
        query = query.filter(ParkingLot.owner_poi_id == owner_poi_id)
    if near_lat is not None and near_lng is not None:
        # Geography cast so radius_m is real metres, not degrees.
        origin = func.ST_SetSRID(func.ST_MakePoint(near_lng, near_lat), 4326)
        query = query.filter(
            ParkingLot.geom.isnot(None),
            func.ST_DWithin(
                func.cast(ParkingLot.geom, Geography),
                func.cast(origin, Geography),
                radius_m,
            ),
        )
    lots = query.order_by(ParkingLot.name).offset(skip).limit(limit).all()
    return [_lot_response(db, lot) for lot in lots]


@router.post("/parking-lots/", response_model=ParkingLotSchema, status_code=201)
def create_parking_lot(
    obj_in: ParkingLotCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_admin_or_editor()),
):
    _require_admin_for_standalone(current_user, obj_in.owner_poi_id is None)

    if obj_in.owner_poi_id is not None:
        owner = db.query(PointOfInterest.id).filter(
            PointOfInterest.id == obj_in.owner_poi_id
        ).first()
        if owner is None:
            raise HTTPException(status_code=400, detail="owner_poi_id does not resolve to a POI")

    lot = ParkingLot(owner_poi_id=obj_in.owner_poi_id)
    for field in _SCALAR_FIELDS:
        value = getattr(obj_in, field)
        if value is not None:
            setattr(lot, field, value)
    _set_geom(lot, obj_in.latitude, obj_in.longitude)

    db.add(lot)
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        # A CHECK violation (expect_to_pay / publication_status) is client error.
        raise HTTPException(status_code=400, detail=f"Database integrity error: {e}")
    db.refresh(lot)
    return _lot_response(db, lot)


@router.get("/parking-lots/{lot_id}", response_model=ParkingLotSchema)
def get_parking_lot(
    lot_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user=Depends(require_admin_or_editor()),
):
    return _lot_response(db, _get_lot_or_404(db, lot_id))


@router.put("/parking-lots/{lot_id}", response_model=ParkingLotSchema)
def update_parking_lot(
    lot_id: uuid.UUID,
    obj_in: ParkingLotUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_admin_or_editor()),
):
    lot = _get_lot_or_404(db, lot_id)
    # Gate on the CURRENT owner and, if ownership is being changed, on the new
    # one too: an editor must not be able to turn its own lot into a shared one.
    _require_admin_for_standalone(current_user, lot.owner_poi_id is None)
    data = obj_in.model_dump(exclude_unset=True)
    if "owner_poi_id" in data:
        _require_admin_for_standalone(current_user, data["owner_poi_id"] is None)
        lot.owner_poi_id = data.pop("owner_poi_id")

    for field in _SCALAR_FIELDS:
        if field not in data:
            continue
        # name / publication_status are NOT NULL: an explicit null is a no-op
        # rather than a 500. Every other field clears on an explicit null.
        if data[field] is None and field in ("name", "publication_status"):
            continue
        setattr(lot, field, data[field])
    _set_geom(lot, data.get("latitude"), data.get("longitude"))

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Database integrity error: {e}")
    db.refresh(lot)
    return _lot_response(db, lot)


@router.delete("/parking-lots/{lot_id}", status_code=204)
def delete_parking_lot(
    lot_id: uuid.UUID,
    force: bool = Query(False, description="Delete even when POIs still link this lot"),
    db: Session = Depends(get_db),
    current_user=Depends(require_admin()),
):
    """Deleting a linked lot silently removes it from every POI that shows it, so
    it takes an explicit ``?force=true`` acknowledgement."""
    lot = _get_lot_or_404(db, lot_id)
    linked = db.query(POIParkingLink).filter(POIParkingLink.parking_lot_id == lot.id).count()
    if linked and not force:
        raise HTTPException(
            status_code=409,
            detail={
                "detail": f"{linked} POI(s) still link this parking lot",
                "linked_poi_count": linked,
            },
        )
    db.delete(lot)
    db.commit()
    return None


@router.get("/parking-lots/{lot_id}/linked-pois")
def list_linked_pois(
    lot_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user=Depends(require_admin_or_editor()),
):
    """Who would be affected by editing or deleting this lot."""
    _get_lot_or_404(db, lot_id)
    rows = (
        db.query(POIParkingLink, PointOfInterest)
        .join(PointOfInterest, PointOfInterest.id == POIParkingLink.poi_id)
        .filter(POIParkingLink.parking_lot_id == lot_id)
        .order_by(POIParkingLink.sort_order, PointOfInterest.name)
        .all()
    )
    out = []
    for link, poi in rows:
        poi_type = getattr(poi, "poi_type", None)
        out.append({
            "id": str(poi.id),
            "name": poi.name,
            "slug": getattr(poi, "slug", None),
            "poi_type": poi_type.value if hasattr(poi_type, "value") else poi_type,
            "publication_status": poi.publication_status,
            "sort_order": link.sort_order,
            "label": link.label,
        })
    return out


@router.post("/parking-lots/promote-from-point/{poi_point_id}",
             response_model=ParkingLotSchema, status_code=201)
def promote_point_to_lot(
    poi_point_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user=Depends(require_admin_or_editor()),
):
    """"Share this lot": copy one of a POI's own parking pins into a shareable
    lot owned by that POI, and link the POI to it.

    Deliberately a COPY, not a move (product decision 10): the own pin keeps
    rendering exactly as before, so promoting can never change what the POI's
    page already shows. The follow-up contract release is what collapses the two.
    """
    row = db.execute(
        text(
            "SELECT poi_id, ST_Y(geom) AS lat, ST_X(geom) AS lng, meta "
            "FROM poi_points WHERE id = :i AND kind = 'parking'"
        ),
        {"i": str(poi_point_id)},
    ).mappings().first()
    if row is None:
        raise HTTPException(status_code=404, detail="Parking point not found")

    meta = dict(row["meta"] or {})
    lot = ParkingLot(
        owner_poi_id=row["poi_id"],
        name=meta.get("name") or "Parking",
        parking_types=meta.get("parking_types") or [],
        accessible_parking_details=meta.get("accessible_parking_details") or [],
        notes=meta.get("notes"),
        what3words=meta.get("w3w") or meta.get("what3words"),
        publication_status="draft",
    )
    _set_geom(lot, row["lat"], row["lng"])
    db.add(lot)
    db.flush()

    db.add(POIParkingLink(poi_id=row["poi_id"], parking_lot_id=lot.id, sort_order=0))
    db.commit()
    db.refresh(lot)
    return _lot_response(db, lot)
