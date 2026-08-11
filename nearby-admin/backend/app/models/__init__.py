# This file makes it possible to import models like:
# from app.models import PointOfInterest
# instead of the more verbose:
# from app.models.poi import PointOfInterest

from .poi import PointOfInterest, POIRelationship, Business, Park, Trail, Event, POIType
from .poi_revision import POIRevision
from .category import Category, poi_category_association
from .primary_type import PrimaryType
from .attribute import Attribute
from .user import User
from .parking_lot import ParkingLot, POIParkingLink
from .image import Image, ImageType, IMAGE_TYPE_CONFIG
from app.database import Base
