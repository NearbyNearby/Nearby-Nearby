"""Re-export shim. The POI ORM lives once in shared/models/poi.py (Task 1.2).

Do NOT add columns or classes here — edit shared/models/ so both backends stay
in sync. This module only re-exports so existing `from app.models.poi import X`
call sites keep working.
"""

from shared.models.poi import (  # noqa: F401
    PointOfInterest,
    POIRelationship,
    Business,
    Park,
    Trail,
    Event,
)
from shared.models.category import Category, poi_category_association  # noqa: F401
from shared.models.enums import POIType  # noqa: F401
