"""Venue inheritance resolution for events.

When an event has a venue_poi_id, certain data sections can be inherited from
the venue POI. The venue_inheritance JSONB config specifies per-section behavior:
  - "as_is": venue data wins, live, on every read. The event's own columns for
    that section are dormant, never cleared, and never shown.
  - "use_and_add": a ONE-TIME copy performed by the admin form when the mode is
    selected. At read time this is a NO-OP: the event's own columns are used
    verbatim so later venue edits cannot overwrite the editor's changes.
  - "do_not_use": skip venue data, keep event's own data.

Issue #124: use_and_add used to merge venue lists/dicts into the event on every
read, which is exactly the overwrite the mode promises not to do. Sections and
their fields now come from shared/constants/venue_sections.py; hours is no
longer inheritable, and stale {"hours": ...} config keys are simply ignored.
"""

from typing import Optional

from shared.constants.venue_sections import SECTION_FIELDS as _SECTION_FIELDS


def resolve_venue_inheritance(
    event_data: dict,
    venue_data: Optional[dict],
    inheritance_config: Optional[dict],
) -> dict:
    """Merge venue data into event data based on inheritance config.

    Args:
        event_data: Dict of event POI fields.
        venue_data: Dict of venue POI fields (may be None).
        inheritance_config: Per-section config dict, e.g. {"parking": "as_is"}.

    Returns:
        Merged dict with event_data updated according to config.
        Includes "_venue_source" dict showing which sections were inherited.
    """
    result = dict(event_data)
    venue_source = {}

    if not inheritance_config or not venue_data:
        result["_venue_source"] = venue_source
        return result

    for section, mode in inheritance_config.items():
        if section not in _SECTION_FIELDS:
            continue

        fields = _SECTION_FIELDS[section]
        venue_source[section] = mode

        # do_not_use: nothing to do. use_and_add: also nothing to do; the copy
        # already happened at write time, so the event's own values stand and a
        # later venue edit must not reach back in and overwrite them.
        if mode != "as_is":
            continue

        for field in fields:
            venue_val = venue_data.get(field)
            if venue_val is not None:
                result[field] = venue_val

    result["_venue_source"] = venue_source
    return result
