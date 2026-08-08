"""Single shared ORM for the whole platform (Task 1.2).

Every SQLAlchemy model that maps a table admin owns via Alembic is defined ONCE
here and imported by both backends. Importing this package registers every
class on the one shared declarative ``Base`` so cross-model relationships
(e.g. ``Image.uploader`` -> ``User``, ``PointOfInterest.primary_type`` ->
``PrimaryType``) resolve regardless of which backend loads them.
"""

from shared.models.base import Base
from shared.models.enums import POIType, EventStatus, ImageType
from shared.models.category import Category, poi_category_association
from shared.models.primary_type import PrimaryType
from shared.models.attribute import Attribute
from shared.models.user import User
from shared.models.poi import (
    PointOfInterest,
    POIRelationship,
    Business,
    Park,
    Trail,
    Event,
)
from shared.models.parking_lot import ParkingLot, POIParkingLink
from shared.models.image import Image, IMAGE_TYPE_CONFIG
from shared.models.poi_revision import POIRevision

__all__ = [
    "Base",
    "POIType",
    "EventStatus",
    "ImageType",
    "Category",
    "poi_category_association",
    "PrimaryType",
    "Attribute",
    "User",
    "PointOfInterest",
    "POIRelationship",
    "Business",
    "Park",
    "Trail",
    "Event",
    "ParkingLot",
    "POIParkingLink",
    "Image",
    "IMAGE_TYPE_CONFIG",
    "POIRevision",
]
