"""Pydantic schemas for reusable parking lots (issues #90 / #161).

``ParkingLot*`` covers the standalone CRUD surface (/api/parking-lots/);
``ParkingLotLink`` is the per-POI edge that rides on the POI payload as
``parking_lot_links``. The unified read (``parking_lots`` on a POI response) is a
plain list of dicts built by ``shared.parking_lots.read_parking_lots`` and is not
re-validated here: it merges two storage shapes and adding a second schema would
just be a second place to forget to update.
"""

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from ._coercers import EmptyStringToNoneMixin


class ParkingLotLink(BaseModel):
    """One POI -> lot edge. ``label`` is linker-owned ("free after 5pm")."""

    parking_lot_id: uuid.UUID
    sort_order: int = 0
    label: Optional[str] = Field(default=None, max_length=160)

    model_config = ConfigDict(from_attributes=True)

    @field_validator("label", mode="before")
    @classmethod
    def _blank_label_to_none(cls, v):
        if isinstance(v, str) and not v.strip():
            return None
        return v


class ParkingLotBase(EmptyStringToNoneMixin, BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    parking_types: List[str] = []
    accessible_parking_details: List[str] = []
    notes: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    what3words: Optional[str] = Field(default=None, max_length=100)
    address_hint: Optional[str] = Field(default=None, max_length=255)
    # varchar + CHECK in the DB; kept Optional[str] here so a bad value surfaces
    # as the DB's 400 rather than two divergent vocabularies.
    expect_to_pay: Optional[str] = None
    publication_status: str = "draft"

    model_config = ConfigDict(from_attributes=True)


class ParkingLotCreate(ParkingLotBase):
    # NULL => standalone public lot (admin only). Set => owned by that POI.
    owner_poi_id: Optional[uuid.UUID] = None


class ParkingLotUpdate(EmptyStringToNoneMixin, BaseModel):
    """Every field optional: a PUT that omits a key leaves it untouched."""

    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    parking_types: Optional[List[str]] = None
    accessible_parking_details: Optional[List[str]] = None
    notes: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    what3words: Optional[str] = Field(default=None, max_length=100)
    address_hint: Optional[str] = Field(default=None, max_length=255)
    expect_to_pay: Optional[str] = None
    publication_status: Optional[str] = None
    owner_poi_id: Optional[uuid.UUID] = None

    model_config = ConfigDict(from_attributes=True)


class ParkingLotOwner(BaseModel):
    """Minimal owner summary, matching the ``owner`` key of a unified entry."""

    id: uuid.UUID
    name: str
    slug: Optional[str] = None
    poi_type: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class ParkingLot(ParkingLotBase):
    id: uuid.UUID
    owner_poi_id: Optional[uuid.UUID] = None
    is_standalone: bool = True
    owner: Optional[ParkingLotOwner] = None
    images: List[Dict[str, Any]] = []
    linked_poi_count: int = 0
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
