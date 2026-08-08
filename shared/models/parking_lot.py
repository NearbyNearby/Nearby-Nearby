"""Reusable parking lots (issues #90 / #161).

A parking lot is often SHARED: one municipal deck serves a dozen storefronts, one
trailhead lot serves the park and the trail that starts in it. Before this
release the only representation was a POI's OWN pins (``poi_points`` rows with
``kind='parking'``, written from the repeating ParkingLocationGroup form), which
cannot be referenced by a second POI: the lot had to be re-entered, re-pinned and
re-photographed on every POI that uses it, and edits never propagated.

Two tables add the missing capability WITHOUT disturbing the working own-lot
path:

    ``parking_lots``       one row per SHAREABLE lot. ``owner_poi_id`` NULL means
                           a standalone, admin-curated public lot; NOT NULL means
                           the lot belongs to that POI but is offered to others.
    ``poi_parking_links``  which POIs surface which lot, in which order, with an
                           optional linker-owned ``label`` ("free after 5pm").

Own pins stay in ``poi_points``; the two representations are unified at READ
time into one ``parking_lots`` array with an ``origin`` discriminator (see
``shared/parking_lots.py``). Collapsing them into a single table is a follow-up
contract release, deliberately not this one.

Schema notes:
  * ``expect_to_pay`` / ``publication_status`` are varchar guarded by CHECK, NOT
    native Postgres enums, matching this schema's precedent (relationship_type,
    listing_type, poi_points.kind) and avoiding the enum deploy hazards.
  * ``geom`` is NULLABLE here (unlike ``poi_points.geom``): a lot may be recorded
    from an address before anyone has pinned it. Consumers must tolerate a lot
    with no coordinate.
  * There is no ``lot_kind`` column; standalone-ness is derivable
    (``owner_poi_id IS NULL``) and is exposed as the ``is_standalone`` property.

The prod schema is created by migration ``x_parking_lots_001``; the create_all
test DB gets the tables, CHECKs, FK CASCADEs and GIST index straight from here.
"""

import uuid

from sqlalchemy import (
    Column, String, Text, Integer, TIMESTAMP, ForeignKey, CheckConstraint, text,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from geoalchemy2 import Geometry

from shared.models.base import Base

# Allowed values for the two controlled-vocabulary columns. Kept here so the
# model, the CHECK constraints and the Pydantic schemas share one definition.
EXPECT_TO_PAY_VALUES = ("yes", "no", "sometimes")
LOT_PUBLICATION_STATUSES = ("draft", "published", "archived")


class ParkingLot(Base):
    """One shareable parking lot: owned by a POI, or standalone (admin-curated)."""

    __tablename__ = "parking_lots"
    __table_args__ = (
        CheckConstraint(
            "expect_to_pay IS NULL OR expect_to_pay IN ('yes','no','sometimes')",
            name="ck_parking_lots_expect_to_pay_valid",
        ),
        CheckConstraint(
            "publication_status IN ('draft','published','archived')",
            name="ck_parking_lots_publication_status_valid",
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # NULL => standalone public lot (admin-owned). NOT NULL => owned by that POI,
    # and deleting the owner deletes the lot (its links cascade in turn).
    owner_poi_id = Column(
        UUID(as_uuid=True),
        ForeignKey("points_of_interest.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    name = Column(String(255), nullable=False)
    # PARKING_OPTIONS values, same vocabulary the own-pin form uses.
    parking_types = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"), default=list)
    # PARKING_ADA_CHECKLIST values.
    accessible_parking_details = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"), default=list)
    notes = Column(Text, nullable=True)
    # Nullable: a lot may pre-date its geolocation (see module docstring).
    geom = Column(Geometry(geometry_type="POINT", srid=4326), nullable=True)
    what3words = Column(String(100), nullable=True)
    address_hint = Column(String(255), nullable=True)
    expect_to_pay = Column(String(20), nullable=True)
    publication_status = Column(String(20), nullable=False, server_default=text("'draft'"), default="draft")
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(
        TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    owner_poi = relationship("PointOfInterest", foreign_keys=[owner_poi_id])
    images = relationship("Image", back_populates="parking_lot", cascade="all, delete-orphan")
    links = relationship(
        "POIParkingLink", back_populates="parking_lot", cascade="all, delete-orphan"
    )

    @property
    def is_standalone(self) -> bool:
        """True when no POI owns this lot (admin-curated public lot)."""
        return self.owner_poi_id is None

    def __repr__(self):
        return f"<ParkingLot(id='{self.id}', name='{self.name}', owner='{self.owner_poi_id}')>"


class POIParkingLink(Base):
    """Edge: ``poi_id`` surfaces ``parking_lot_id`` at position ``sort_order``.

    ``label`` is LINKER-owned, not lot-owned: "free after 5pm" is true for the
    diner across the street and false for the theater next door, so it lives on
    the edge rather than on the lot.
    """

    __tablename__ = "poi_parking_links"

    poi_id = Column(
        UUID(as_uuid=True),
        ForeignKey("points_of_interest.id", ondelete="CASCADE"),
        primary_key=True,
    )
    parking_lot_id = Column(
        UUID(as_uuid=True),
        ForeignKey("parking_lots.id", ondelete="CASCADE"),
        primary_key=True,
        index=True,
    )
    sort_order = Column(Integer, nullable=False, server_default=text("0"), default=0)
    label = Column(String(160), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    poi = relationship("PointOfInterest", foreign_keys=[poi_id])
    parking_lot = relationship("ParkingLot", back_populates="links")

    def __repr__(self):
        return f"<POIParkingLink(poi='{self.poi_id}', lot='{self.parking_lot_id}')>"
