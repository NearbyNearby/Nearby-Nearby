"""Event datetime timezone policy (Issue #180).

Every Nearby Nearby POI is in North Carolina, so an event datetime typed
without a zone is an America/New_York wall clock. The admin Mantine
DateTimePicker emits naive local strings ("YYYY-MM-DD HH:mm:ss") and the event
columns are timestamptz, so a naive value used to be labeled UTC: 7 PM stored
as 19:00Z and displayed as 3 PM Eastern. Naive event datetimes arriving at any
write path are labeled America/New_York; aware values pass through unchanged.
"""

from datetime import datetime
from zoneinfo import ZoneInfo

EVENT_TZ = ZoneInfo("America/New_York")

# Every datetime column on the events table that a naive input can reach.
EVENT_DATETIME_FIELDS = (
    "start_datetime",
    "end_datetime",
    "recurrence_end_date",
    "vendor_application_deadline",
)


def localize_event_datetime(value):
    """Attach America/New_York to a naive event datetime; leave aware values alone.

    Accepts a datetime or an ISO string (the raw autosave payload carries
    strings); strings are parsed first so the zone check sees the real value.
    None passes through. A string that does not parse is returned unchanged so
    the schema/column surfaces the bad value as it did before.
    """
    if value is None:
        return None
    if isinstance(value, str):
        text = value.strip()
        if text.endswith(("Z", "z")):
            text = text[:-1] + "+00:00"
        try:
            value = datetime.fromisoformat(text)
        except ValueError:
            return value
    if isinstance(value, datetime) and value.tzinfo is None:
        return value.replace(tzinfo=EVENT_TZ)
    return value
