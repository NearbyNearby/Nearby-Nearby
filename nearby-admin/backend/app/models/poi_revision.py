"""Re-export shim. The POIRevision ORM lives once in shared/models/ (Task 1.2).

Do NOT add columns here; edit shared/models/poi_revision.py so both backends
stay in sync. This module only re-exports so `from app.models.poi_revision
import POIRevision` (and `app.models.POIRevision`) keep working.
"""

from shared.models.poi_revision import POIRevision  # noqa: F401
