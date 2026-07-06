# app/models/poi.py
"""Re-export shim. The POI ORM lives once in shared/models/poi.py (Task 1.2).

Do NOT add columns or classes here — edit shared/models/ so both backends stay
in sync. This module only re-exports so existing `models.poi.X` call sites keep
working. ``Category`` / ``poi_category_association`` are re-exported here too
because app code accesses them as ``models.poi.Category`` /
``models.poi.poi_category_association``.
"""

from shared.models.poi import (  # noqa: F401
    PointOfInterest,
    POIRelationship,
    POIPoint,
    Business,
    Park,
    Trail,
    Event,
)
from shared.models.category import Category, poi_category_association  # noqa: F401
from shared.models.enums import POIType  # noqa: F401
