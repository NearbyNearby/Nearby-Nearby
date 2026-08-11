"""Recurring event date expansion utility.

Expands a repeat_pattern JSONB into concrete datetime instances within a given range,
respecting excluded_dates, manual_dates, and recurrence_end_date.
"""

from datetime import datetime, timezone, timedelta
from typing import List, Optional
from dateutil.rrule import rrule, DAILY, WEEKLY, MONTHLY, YEARLY, MO, TU, WE, TH, FR, SA, SU
from dateutil.parser import isoparse

_FREQ_MAP = {
    "daily": DAILY,
    "weekly": WEEKLY,
    "monthly": MONTHLY,
    "yearly": YEARLY,
}

# Full weekday names, used to resolve both the dateutil two-letter vocabulary
# (MO/TU/WE/...) and the admin form's vocabulary (Mon/Tue/Thu/... or full
# names like "Monday"), case-insensitively. Mirrors the matching in
# nearby-app/app/src/utils/eventSchedule.js (toWeekdayIndex): a token matches
# if it is a case-insensitive prefix of exactly one weekday name.
_WEEKDAY_NAMES = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
_WEEKDAY_OBJS = [MO, TU, WE, TH, FR, SA, SU]

# Maximum expansion horizon: 60 months from start
_MAX_MONTHS = 60


def _parse_weekday(token):
    """Resolve a day-of-week token to a dateutil weekday object, or None.

    Accepts the dateutil two-letter vocabulary (MO/TU/WE/TH/FR/SA/SU), the
    admin form's three-letter vocabulary (Mon/Tue/Wed/...), and full names
    (Monday/Tuesday/...), all case-insensitively. A token shorter than 2
    characters is rejected (single letters are ambiguous, e.g. "T").
    """
    if not isinstance(token, str):
        return None
    t = token.strip().lower()
    if len(t) < 2:
        return None
    for name, obj in zip(_WEEKDAY_NAMES, _WEEKDAY_OBJS):
        if name.startswith(t):
            return obj
    return None


def expand_recurring_dates(
    start_datetime: datetime,
    repeat_pattern: Optional[dict],
    date_from: datetime,
    date_to: datetime,
    excluded_dates: Optional[List[str]] = None,
    manual_dates: Optional[List[str]] = None,
    recurrence_end_date: Optional[datetime] = None,
) -> List[datetime]:
    """Expand a repeating event into concrete datetimes within [date_from, date_to].

    Args:
        start_datetime: The first occurrence of the event.
        repeat_pattern: JSONB dict with keys: frequency, interval, days (optional).
        date_from: Start of the query window (inclusive).
        date_to: End of the query window (inclusive).
        excluded_dates: List of ISO date strings to skip (e.g. ["2026-07-04"]).
        manual_dates: List of ISO datetime strings to force-include.
        recurrence_end_date: Hard stop for recurrence (no occurrences after this).

    Returns:
        Sorted list of datetimes within the requested range.
    """
    if not repeat_pattern or not repeat_pattern.get("frequency"):
        # Non-repeating: just return start_datetime if it's in range
        if date_from <= start_datetime <= date_to:
            return [start_datetime]
        return []

    freq_str = repeat_pattern["frequency"].lower()
    freq = _FREQ_MAP.get(freq_str)
    if freq is None:
        return [start_datetime] if date_from <= start_datetime <= date_to else []

    interval = repeat_pattern.get("interval", 1)

    # Compute effective end: min of date_to, recurrence_end_date, and 60-month cap
    max_end = start_datetime + timedelta(days=_MAX_MONTHS * 30)
    effective_end = date_to
    if recurrence_end_date and recurrence_end_date < effective_end:
        effective_end = recurrence_end_date
    if max_end < effective_end:
        effective_end = max_end

    # Build rrule kwargs
    kwargs = {
        "freq": freq,
        "dtstart": start_datetime,
        "interval": interval,
        "until": effective_end,
    }

    # Weekly with specific days. The admin form writes "days_of_week" (Mon/Tue/
    # Thu tokens); older callers use "days" (MO/TU/WE tokens). Accept both keys
    # and both vocabularies so a multi-day-per-week series (e.g. Wed + Sat)
    # expands correctly regardless of which side wrote the pattern.
    days = repeat_pattern.get("days_of_week") or repeat_pattern.get("days")
    if days and freq == WEEKLY:
        if not isinstance(days, list):
            days = [days]
        byweekday = [wd for wd in (_parse_weekday(d) for d in days) if wd is not None]
        if byweekday:
            kwargs["byweekday"] = byweekday

    # Generate occurrences
    rule = rrule(**kwargs)
    occurrences = set()
    for dt in rule:
        if dt > effective_end:
            break
        if date_from <= dt <= date_to:
            occurrences.add(dt)

    # Remove excluded dates
    if excluded_dates:
        excluded_set = set()
        for d_str in excluded_dates:
            try:
                excluded_set.add(datetime.strptime(d_str, "%Y-%m-%d").date())
            except ValueError:
                pass
        occurrences = {dt for dt in occurrences if dt.date() not in excluded_set}

    # Add manual dates. Each entry is either a legacy ISO string ("YYYY-MM-DD"
    # or a full ISO datetime) or an object {date, start_time, end_time} carrying
    # a per-date time override. Object form applies start_time ("HH:MM") to the
    # occurrence datetime; missing time falls back to midnight (the ISO default).
    if manual_dates:
        for m in manual_dates:
            try:
                if isinstance(m, dict):
                    date_str = m.get("date")
                    if not date_str:
                        continue
                    manual_dt = isoparse(date_str)
                    start_time = m.get("start_time")
                    if start_time and ":" in start_time:
                        parts = start_time.split(":")
                        manual_dt = manual_dt.replace(
                            hour=int(parts[0]), minute=int(parts[1])
                        )
                else:
                    manual_dt = isoparse(m)
                if manual_dt.tzinfo is None:
                    manual_dt = manual_dt.replace(tzinfo=timezone.utc)
                if date_from <= manual_dt <= date_to:
                    occurrences.add(manual_dt)
            except (ValueError, TypeError, KeyError):
                pass

    return sorted(occurrences)
