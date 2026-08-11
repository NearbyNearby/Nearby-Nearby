"""
Phase 5: Test recurring event expansion utility.

expand_recurring_dates() should generate concrete datetime instances based on
repeat_pattern JSONB, respecting excluded_dates, manual_dates, and recurrence_end_date.
"""

import pytest
from datetime import datetime, timezone, timedelta


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
