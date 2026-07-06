"""Canonical enum definitions shared between nearby-admin and nearby-app.

Both backends must use these enums to stay in sync with the database.
"""

import enum


class POIType(enum.Enum):
    BUSINESS = "BUSINESS"
    SERVICES = "SERVICES"
    PARK = "PARK"
    TRAIL = "TRAIL"
    EVENT = "EVENT"
    YOUTH_ACTIVITIES = "YOUTH_ACTIVITIES"
    JOBS = "JOBS"
    VOLUNTEER_OPPORTUNITIES = "VOLUNTEER_OPPORTUNITIES"
    DISASTER_HUBS = "DISASTER_HUBS"


class EventStatus(enum.Enum):
    SCHEDULED = "Scheduled"
    CANCELED = "Canceled"
    POSTPONED = "Postponed"
    UPDATED_DATE_TIME = "Updated Date and/or Time"
    RESCHEDULED = "Rescheduled"
    MOVED_ONLINE = "Moved Online"
    UNOFFICIAL_PROPOSED = "Unofficial Proposed Date"


class ImageType(str, enum.Enum):
    # ``str`` mixin: the admin Pydantic layer aliases this as ``ImageTypeEnum``
    # (schemas/image.py) for request/response validation, which relied on
    # str-enum semantics. SQLAlchemy still maps ``Enum(ImageType)`` by member
    # name, so the DB ``imagetype`` labels are unchanged.
    main = "main"
    gallery = "gallery"
    entry = "entry"
    parking = "parking"
    restroom = "restroom"
    rental = "rental"
    playground = "playground"
    menu = "menu"
    trail_head = "trail_head"
    trail_exit = "trail_exit"
    access_point = "access_point"
    map = "map"
    downloadable_map = "downloadable_map"
    sponsor_logo = "sponsor_logo"
