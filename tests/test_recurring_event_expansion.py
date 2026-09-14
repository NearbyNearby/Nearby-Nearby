"""
Phase 5: Test recurring event expansion utility.

expand_recurring_dates() should generate concrete datetime instances based on
repeat_pattern JSONB, respecting excluded_dates, manual_dates, and recurrence_end_date.
"""

import pytest
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo


class TestExpandRecurringDates:
    """Unit tests for the expand_recurring_dates utility."""

    def test_daily_expansion_7_day_range(self):
        """Daily event over 7 days should produce 7 occurrences."""
        from shared.utils.recurring_events import expand_recurring_dates

        start = datetime(2026, 3, 1, 18, 0, 0, tzinfo=timezone.utc)
        pattern = {"frequency": "daily", "interval": 1}

        results = expand_recurring_dates(
            start_datetime=start,
            repeat_pattern=pattern,
            date_from=datetime(2026, 3, 1, tzinfo=timezone.utc),
            date_to=datetime(2026, 3, 7, 23, 59, 59, tzinfo=timezone.utc),
        )
        assert len(results) == 7

    def test_weekly_specific_days(self):
        """Weekly on Mon and Fri over 2 weeks should produce 4 occurrences."""
        from shared.utils.recurring_events import expand_recurring_dates

        # 2026-03-02 is a Monday
        start = datetime(2026, 3, 2, 10, 0, 0, tzinfo=timezone.utc)
        pattern = {"frequency": "weekly", "interval": 1, "days": ["MO", "FR"]}

        results = expand_recurring_dates(
            start_datetime=start,
            repeat_pattern=pattern,
            date_from=datetime(2026, 3, 2, tzinfo=timezone.utc),
            date_to=datetime(2026, 3, 15, 23, 59, 59, tzinfo=timezone.utc),
        )
        assert len(results) == 4
        # Check days of week: should be Monday(0) and Friday(4)
        weekdays = [d.weekday() for d in results]
        assert all(wd in (0, 4) for wd in weekdays)

    def test_weekly_two_days_days_of_week_key_short_tokens(self):
        """Issue #164: admin form writes "days_of_week" with Mon/Tue/... tokens,
        not "days" with MO/TU/... tokens. A Wed+Sat weekly market must expand
        to both weekdays, in order, not just the start date's weekday."""
        from shared.utils.recurring_events import expand_recurring_dates

        # 2026-03-04 is a Wednesday
        start = datetime(2026, 3, 4, 9, 0, 0, tzinfo=timezone.utc)
        pattern = {"frequency": "weekly", "interval": 1, "days_of_week": ["Wed", "Sat"]}

        results = expand_recurring_dates(
            start_datetime=start,
            repeat_pattern=pattern,
            date_from=datetime(2026, 3, 4, tzinfo=timezone.utc),
            date_to=datetime(2026, 3, 17, 23, 59, 59, tzinfo=timezone.utc),
        )
        weekdays = [d.weekday() for d in results]
        assert weekdays == [2, 5, 2, 5]  # Wed, Sat, Wed, Sat (Mon=0 .. Sun=6)

    def test_weekly_two_days_days_of_week_key_full_names_case_insensitive(self):
        """Same pattern, full weekday names, mixed case."""
        from shared.utils.recurring_events import expand_recurring_dates

        start = datetime(2026, 3, 4, 9, 0, 0, tzinfo=timezone.utc)
        pattern = {"frequency": "weekly", "interval": 1, "days_of_week": ["WEDNESDAY", "saturday"]}

        results = expand_recurring_dates(
            start_datetime=start,
            repeat_pattern=pattern,
            date_from=datetime(2026, 3, 4, tzinfo=timezone.utc),
            date_to=datetime(2026, 3, 17, 23, 59, 59, tzinfo=timezone.utc),
        )
        weekdays = [d.weekday() for d in results]
        assert weekdays == [2, 5, 2, 5]

    def test_weekly_two_days_legacy_days_key_dateutil_tokens(self):
        """The legacy "days" key with MO/TU/... tokens must keep working."""
        from shared.utils.recurring_events import expand_recurring_dates

        start = datetime(2026, 3, 4, 9, 0, 0, tzinfo=timezone.utc)
        pattern = {"frequency": "weekly", "interval": 1, "days": ["WE", "SA"]}

        results = expand_recurring_dates(
            start_datetime=start,
            repeat_pattern=pattern,
            date_from=datetime(2026, 3, 4, tzinfo=timezone.utc),
            date_to=datetime(2026, 3, 17, 23, 59, 59, tzinfo=timezone.utc),
        )
        weekdays = [d.weekday() for d in results]
        assert weekdays == [2, 5, 2, 5]

    def test_weekly_two_days_respects_recurrence_end_date_and_excluded_dates(self):
        """Wed+Sat market: recurrence_end_date cuts the series short and an
        excluded Saturday is dropped, while the other Saturdays remain."""
        from shared.utils.recurring_events import expand_recurring_dates

        start = datetime(2026, 3, 4, 9, 0, 0, tzinfo=timezone.utc)
        pattern = {"frequency": "weekly", "interval": 1, "days_of_week": ["Wed", "Sat"]}

        results = expand_recurring_dates(
            start_datetime=start,
            repeat_pattern=pattern,
            date_from=datetime(2026, 3, 4, tzinfo=timezone.utc),
            date_to=datetime(2026, 4, 30, 23, 59, 59, tzinfo=timezone.utc),
            excluded_dates=["2026-03-07"],  # the first Saturday
            recurrence_end_date=datetime(2026, 3, 18, 23, 59, 59, tzinfo=timezone.utc),
        )
        dates = [d.strftime("%Y-%m-%d") for d in results]
        # Wed 3/4, Sat 3/7 (excluded), Wed 3/11, Sat 3/14, Wed 3/18. Series ends
        # 3/18 (recurrence_end_date); Sat 3/21 onward must not appear.
        assert dates == ["2026-03-04", "2026-03-11", "2026-03-14", "2026-03-18"]

    def test_monthly_expansion(self):
        """Monthly event over 3 months should produce 3 occurrences."""
        from shared.utils.recurring_events import expand_recurring_dates

        start = datetime(2026, 1, 15, 19, 0, 0, tzinfo=timezone.utc)
        pattern = {"frequency": "monthly", "interval": 1}

        results = expand_recurring_dates(
            start_datetime=start,
            repeat_pattern=pattern,
            date_from=datetime(2026, 1, 1, tzinfo=timezone.utc),
            date_to=datetime(2026, 3, 31, 23, 59, 59, tzinfo=timezone.utc),
        )
        assert len(results) == 3

    def test_yearly_expansion(self):
        """Yearly event over 3 years should produce 3 occurrences."""
        from shared.utils.recurring_events import expand_recurring_dates

        start = datetime(2026, 7, 4, 12, 0, 0, tzinfo=timezone.utc)
        pattern = {"frequency": "yearly", "interval": 1}

        results = expand_recurring_dates(
            start_datetime=start,
            repeat_pattern=pattern,
            date_from=datetime(2026, 1, 1, tzinfo=timezone.utc),
            date_to=datetime(2028, 12, 31, 23, 59, 59, tzinfo=timezone.utc),
        )
        assert len(results) == 3

    def test_excluded_dates_are_omitted(self):
        """Excluded dates should be removed from the expansion."""
        from shared.utils.recurring_events import expand_recurring_dates

        start = datetime(2026, 3, 1, 18, 0, 0, tzinfo=timezone.utc)
        pattern = {"frequency": "daily", "interval": 1}

        results = expand_recurring_dates(
            start_datetime=start,
            repeat_pattern=pattern,
            date_from=datetime(2026, 3, 1, tzinfo=timezone.utc),
            date_to=datetime(2026, 3, 7, 23, 59, 59, tzinfo=timezone.utc),
            excluded_dates=["2026-03-03", "2026-03-05"],
        )
        assert len(results) == 5
        dates = [d.strftime("%Y-%m-%d") for d in results]
        assert "2026-03-03" not in dates
        assert "2026-03-05" not in dates

    def test_manual_dates_are_included(self):
        """Manual dates should be added even outside the repeat pattern."""
        from shared.utils.recurring_events import expand_recurring_dates

        start = datetime(2026, 3, 1, 18, 0, 0, tzinfo=timezone.utc)
        pattern = {"frequency": "weekly", "interval": 1, "days": ["MO"]}

        results = expand_recurring_dates(
            start_datetime=start,
            repeat_pattern=pattern,
            date_from=datetime(2026, 3, 1, tzinfo=timezone.utc),
            date_to=datetime(2026, 3, 31, 23, 59, 59, tzinfo=timezone.utc),
            manual_dates=["2026-03-15T10:00:00Z"],  # A Sunday (not Monday)
        )
        dates = [d.strftime("%Y-%m-%d") for d in results]
        assert "2026-03-15" in dates

    def test_recurrence_end_date_respected(self):
        """Events should not expand past recurrence_end_date."""
        from shared.utils.recurring_events import expand_recurring_dates

        start = datetime(2026, 1, 1, 10, 0, 0, tzinfo=timezone.utc)
        pattern = {"frequency": "monthly", "interval": 1}

        results = expand_recurring_dates(
            start_datetime=start,
            repeat_pattern=pattern,
            date_from=datetime(2026, 1, 1, tzinfo=timezone.utc),
            date_to=datetime(2026, 12, 31, 23, 59, 59, tzinfo=timezone.utc),
            recurrence_end_date=datetime(2026, 4, 1, tzinfo=timezone.utc),
        )
        assert len(results) == 3  # Jan, Feb, Mar only

    def test_60_month_cap(self):
        """Expansion should not exceed 60 months from start regardless of date_to."""
        from shared.utils.recurring_events import expand_recurring_dates

        start = datetime(2026, 1, 1, 10, 0, 0, tzinfo=timezone.utc)
        pattern = {"frequency": "monthly", "interval": 1}

        results = expand_recurring_dates(
            start_datetime=start,
            repeat_pattern=pattern,
            date_from=datetime(2026, 1, 1, tzinfo=timezone.utc),
            date_to=datetime(2036, 12, 31, 23, 59, 59, tzinfo=timezone.utc),
        )
        # 60 months = 5 years, so max is Jan 2026 -> Dec 2030 = 60 occurrences
        assert len(results) <= 60

    def test_custom_interval(self):
        """Every 3 days over 9 days should produce 3 occurrences."""
        from shared.utils.recurring_events import expand_recurring_dates

        start = datetime(2026, 4, 1, 18, 0, 0, tzinfo=timezone.utc)
        pattern = {"frequency": "daily", "interval": 3}

        results = expand_recurring_dates(
            start_datetime=start,
            repeat_pattern=pattern,
            date_from=datetime(2026, 4, 1, tzinfo=timezone.utc),
            date_to=datetime(2026, 4, 9, 23, 59, 59, tzinfo=timezone.utc),
        )
        assert len(results) == 3
        assert results[0].day == 1
        assert results[1].day == 4
        assert results[2].day == 7

    def test_biweekly_is_every_other_week(self):
        """The admin's "Every 2 Weeks" option ("biweekly") used to be an unknown
        frequency, so the series collapsed to its first date."""
        from shared.utils.recurring_events import expand_recurring_dates

        # 2026-03-03 is a Tuesday; 15:00Z is 10 AM Eastern.
        start = datetime(2026, 3, 3, 15, 0, 0, tzinfo=timezone.utc)
        pattern = {"frequency": "biweekly", "interval": 1, "days_of_week": ["Tue"]}

        results = expand_recurring_dates(
            start_datetime=start,
            repeat_pattern=pattern,
            date_from=datetime(2026, 3, 1, tzinfo=timezone.utc),
            date_to=datetime(2026, 4, 1, tzinfo=timezone.utc),
        )
        eastern = ZoneInfo("America/New_York")
        assert [r.astimezone(eastern).day for r in results] == [3, 17, 31]
        assert all(r.astimezone(eastern).hour == 10 for r in results)

    def test_biweekly_weekend_pair_stays_together(self):
        """Weeks run Monday to Sunday, so Sat + Sun every other week pairs up."""
        from shared.utils.recurring_events import expand_recurring_dates

        # 2026-08-01 is a Saturday; 13:00Z is 9 AM Eastern.
        start = datetime(2026, 8, 1, 13, 0, 0, tzinfo=timezone.utc)
        pattern = {"frequency": "biweekly", "interval": 1, "days_of_week": ["Sat", "Sun"]}

        results = expand_recurring_dates(
            start_datetime=start,
            repeat_pattern=pattern,
            date_from=datetime(2026, 8, 1, tzinfo=timezone.utc),
            date_to=datetime(2026, 8, 17, tzinfo=timezone.utc),
        )
        eastern = ZoneInfo("America/New_York")
        assert [r.astimezone(eastern).day for r in results] == [1, 2, 15, 16]

    def test_empty_pattern_returns_single(self):
        """None or empty repeat_pattern should return just the start_datetime."""
        from shared.utils.recurring_events import expand_recurring_dates

        start = datetime(2026, 5, 1, 10, 0, 0, tzinfo=timezone.utc)

        results = expand_recurring_dates(
            start_datetime=start,
            repeat_pattern=None,
            date_from=datetime(2026, 1, 1, tzinfo=timezone.utc),
            date_to=datetime(2026, 12, 31, 23, 59, 59, tzinfo=timezone.utc),
        )
        assert len(results) == 1
        assert results[0] == start

    def test_results_are_sorted(self):
        """Results should be sorted chronologically."""
        from shared.utils.recurring_events import expand_recurring_dates

        start = datetime(2026, 3, 1, 18, 0, 0, tzinfo=timezone.utc)
        pattern = {"frequency": "daily", "interval": 1}

        results = expand_recurring_dates(
            start_datetime=start,
            repeat_pattern=pattern,
            date_from=datetime(2026, 3, 1, tzinfo=timezone.utc),
            date_to=datetime(2026, 3, 10, 23, 59, 59, tzinfo=timezone.utc),
            manual_dates=["2026-03-05T08:00:00Z"],
        )
        for i in range(len(results) - 1):
            assert results[i] <= results[i + 1]


class TestExpansionDSTAndLocalWeekday:
    """Issue #180: expansion must run on the America/New_York wall clock.

    Once storage is correct a weekly 7 PM Eastern event is stored as 23:00Z in
    summer (EDT) and 00:00Z in winter (EST). Running rrule on the aware UTC
    value drifts the local time by an hour at the DST change and, for evening
    events, evaluates byweekday on the UTC day (a 7 PM Tuesday lands on
    Wednesday 00:00Z)."""

    def test_weekly_evening_survives_fall_dst_change(self):
        """Weekly Tue 19:00 local (23:00Z before Nov 1 2026, 00:00Z after) stays
        19:00 local on Tuesdays on both sides of the DST change."""
        from shared.utils.recurring_events import expand_recurring_dates

        # Tue 2026-10-20, 19:00 EDT = 23:00Z
        start = datetime(2026, 10, 20, 23, 0, 0, tzinfo=timezone.utc)
        pattern = {"frequency": "weekly", "interval": 1, "days_of_week": ["Tue"]}

        results = expand_recurring_dates(
            start_datetime=start,
            repeat_pattern=pattern,
            date_from=datetime(2026, 10, 20, tzinfo=timezone.utc),
            # Wide enough to cover the full Eastern day of Tue Nov 17 (the last
            # expected occurrence), so only the DST behavior is under test.
            date_to=datetime(2026, 11, 18, 4, 59, 59, tzinfo=timezone.utc),
        )
        # Oct 20, 27 are EDT (23:00Z); Nov 3, 10, 17 are EST (00:00Z next day).
        # All are Tuesdays at 19:00 America/New_York.
        assert len(results) == 5
        for dt in results:
            local = dt.astimezone(ZoneInfo("America/New_York"))
            assert local.weekday() == 1  # Tuesday
            assert (local.hour, local.minute) == (19, 0)
        assert results[0] == datetime(2026, 10, 20, 23, 0, tzinfo=timezone.utc)
        assert results[2] == datetime(2026, 11, 4, 0, 0, tzinfo=timezone.utc)

    def test_late_evening_event_stays_on_local_weekday(self):
        """A weekly Tue 21:00 local event is 02:00Z Wednesday in winter (EST);
        byweekday must still fire on the LOCAL Tuesday, not the UTC Wednesday.
        The start is the UTC-labeled instant the DB returns (psycopg2 gives
        timestamptz values in UTC), an aware Eastern datetime never reaches
        this function from storage."""
        from shared.utils.recurring_events import expand_recurring_dates

        # Tue 2026-01-06, 21:00 EST = Wed 02:00Z
        start = datetime(2026, 1, 7, 2, 0, tzinfo=timezone.utc)
        pattern = {"frequency": "weekly", "interval": 1, "days_of_week": ["Tue"]}

        results = expand_recurring_dates(
            start_datetime=start,
            repeat_pattern=pattern,
            date_from=datetime(2026, 1, 1, tzinfo=timezone.utc),
            date_to=datetime(2026, 1, 31, 23, 59, 59, tzinfo=timezone.utc),
        )
        assert len(results) == 4
        for dt in results:
            local = dt.astimezone(ZoneInfo("America/New_York"))
            assert local.weekday() == 1  # local Tuesday, not UTC Wednesday
            assert (local.hour, local.minute) == (21, 0)

    def test_manual_date_object_start_time_is_local(self):
        """A manual date {date, start_time "19:00"} yields 19:00 America/New_York,
        not 19:00 UTC."""
        from shared.utils.recurring_events import expand_recurring_dates

        start = datetime(2026, 3, 4, 14, 0, 0, tzinfo=timezone.utc)
        pattern = {"frequency": "weekly", "interval": 1, "days_of_week": ["Wed"]}

        results = expand_recurring_dates(
            start_datetime=start,
            repeat_pattern=pattern,
            date_from=datetime(2026, 3, 1, tzinfo=timezone.utc),
            date_to=datetime(2026, 3, 31, 23, 59, 59, tzinfo=timezone.utc),
            manual_dates=[{"date": "2026-03-15", "start_time": "19:00"}],
        )
        manual = [dt for dt in results if dt.date().isoformat() == "2026-03-15"]
        assert len(manual) == 1
        local = manual[0].astimezone(ZoneInfo("America/New_York"))
        assert (local.hour, local.minute) == (19, 0)

    def test_naive_manual_date_string_is_local(self):
        """A legacy naive ISO manual date string is an Eastern wall time."""
        from shared.utils.recurring_events import expand_recurring_dates

        start = datetime(2026, 3, 4, 14, 0, 0, tzinfo=timezone.utc)
        pattern = {"frequency": "weekly", "interval": 1, "days_of_week": ["Wed"]}

        results = expand_recurring_dates(
            start_datetime=start,
            repeat_pattern=pattern,
            date_from=datetime(2026, 3, 1, tzinfo=timezone.utc),
            date_to=datetime(2026, 3, 31, 23, 59, 59, tzinfo=timezone.utc),
            manual_dates=["2026-03-15T19:00:00"],
        )
        manual = [dt for dt in results if dt.date().isoformat() == "2026-03-15"]
        assert len(manual) == 1
        local = manual[0].astimezone(ZoneInfo("America/New_York"))
        assert (local.hour, local.minute) == (19, 0)
