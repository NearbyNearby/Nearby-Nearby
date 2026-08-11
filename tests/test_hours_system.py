"""
Tests for Tasks 173-176: Hours system backend completion.

- Hours data round-trip (save via admin, read back)
- Python hours resolution engine (port of JS getEffectiveHoursForDate)
- Effective-hours API endpoint on nearby-app
"""
import pytest
from datetime import date
from conftest import create_business, orm_create_business, orm_publish_poi


# ---------------------------------------------------------------------------
# Sample hours data fixtures
# ---------------------------------------------------------------------------
REGULAR_HOURS = {
    "regular": {
        "monday": {
            "status": "open",
            "periods": [{"open": {"type": "fixed", "time": "09:00"}, "close": {"type": "fixed", "time": "17:00"}}]
        },
        "tuesday": {
            "status": "open",
            "periods": [{"open": {"type": "fixed", "time": "09:00"}, "close": {"type": "fixed", "time": "17:00"}}]
        },
        "wednesday": {
            "status": "open",
            "periods": [{"open": {"type": "fixed", "time": "09:00"}, "close": {"type": "fixed", "time": "17:00"}}]
        },
        "thursday": {
            "status": "open",
            "periods": [{"open": {"type": "fixed", "time": "09:00"}, "close": {"type": "fixed", "time": "17:00"}}]
        },
        "friday": {
            "status": "open",
            "periods": [{"open": {"type": "fixed", "time": "09:00"}, "close": {"type": "fixed", "time": "17:00"}}]
        },
        "saturday": {"status": "closed"},
        "sunday": {"status": "closed"},
    }
}

HOLIDAY_HOURS = {
    "christmas": {"status": "closed", "name": "Christmas Day"},
    "thanksgiving": {
        "status": "modified",
        "name": "Thanksgiving",
        "periods": [{"open": {"type": "fixed", "time": "10:00"}, "close": {"type": "fixed", "time": "14:00"}}]
    },
}

SEASONAL_HOURS = {
    "summer": {
        "useDateRange": True,
        "startDate": "06-01",
        "endDate": "08-31",
        "monday": {
            "status": "open",
            "periods": [{"open": {"type": "fixed", "time": "08:00"}, "close": {"type": "fixed", "time": "20:00"}}]
        },
        "tuesday": {
            "status": "open",
            "periods": [{"open": {"type": "fixed", "time": "08:00"}, "close": {"type": "fixed", "time": "20:00"}}]
        },
        "wednesday": {
            "status": "open",
            "periods": [{"open": {"type": "fixed", "time": "08:00"}, "close": {"type": "fixed", "time": "20:00"}}]
        },
        "thursday": {
            "status": "open",
            "periods": [{"open": {"type": "fixed", "time": "08:00"}, "close": {"type": "fixed", "time": "20:00"}}]
        },
        "friday": {
            "status": "open",
            "periods": [{"open": {"type": "fixed", "time": "08:00"}, "close": {"type": "fixed", "time": "20:00"}}]
        },
        "saturday": {
            "status": "open",
            "periods": [{"open": {"type": "fixed", "time": "10:00"}, "close": {"type": "fixed", "time": "18:00"}}]
        },
        "sunday": {"status": "closed"},
    }
}

EXCEPTION_HOURS = [
    {
        "type": "one-time",
        "date": "2026-07-04",
        "status": "closed",
        "reason": "Independence Day"
    },
    {
        "type": "one-time",
        "date": "2026-03-15",
        "status": "modified",
        "reason": "Staff training",
        "periods": [{"open": {"type": "fixed", "time": "12:00"}, "close": {"type": "fixed", "time": "16:00"}}]
    },
]

RECURRING_EXCEPTION = {
    "type": "recurring",
    "pattern": {
        "ordinal": "third",
        "dayOfWeek": "wednesday",
        "months": [],  # all months
    },
    "status": "modified",
    "reason": "Monthly team meeting",
    "periods": [{"open": {"type": "fixed", "time": "13:00"}, "close": {"type": "fixed", "time": "17:00"}}]
}

# Legacy blob written before #116: per-holiday `status` only, no `mode`.
# Mirrored literally in nearby-app/app/src/utils/__tests__/hoursUtils.holidayModes.test.js
LEGACY_HOLIDAYS = {
    "christmas": {"name": "Christmas Day", "date": "12-25", "status": "open", "periods": []},
    "thanksgiving": {"name": "Thanksgiving", "date": "fourth_thursday_november", "status": "closed"},
}

# New #116 blob: `mode` drives behavior, `status` is kept as a legacy mirror.
# Mirrored literally in nearby-app/app/src/utils/__tests__/hoursUtils.holidayModes.test.js
MODE_HOLIDAYS = {
    "independence_day": {
        "name": "Independence Day", "date": "07-04",
        "mode": "follows_regular", "status": "open",
    },
    "christmas": {
        "name": "Christmas Day", "date": "12-25",
        "mode": "closed", "status": "closed", "note": "Reopens December 26",
    },
    "thanksgiving": {
        "name": "Thanksgiving", "date": "fourth_thursday_november",
        "mode": "modified", "status": "modified",
        "periods": [{"open": {"type": "fixed", "time": "10:00"}, "close": {"type": "fixed", "time": "14:00"}}],
    },
    "halloween": {
        "name": "Halloween", "date": "10-31",
        "mode": "open", "status": "open",
    },
}

# #118 - a location with no weekly schedule at all.
NO_REGULAR_HOURS = {
    "no_regular_hours": True,
    "regular": REGULAR_HOURS["regular"],
    "notes": "Hours vary. Call ahead.",
}

RECURRING_EXCEPTION_SPECIFIC_MONTHS = {
    "type": "recurring",
    "pattern": {
        "ordinal": "first",
        "dayOfWeek": "monday",
        "months": ["1", "2", "3"],  # Jan, Feb, Mar only
    },
    "status": "closed",
    "reason": "Quarterly planning",
}


# ---------------------------------------------------------------------------
# Hours round-trip tests (admin API)
# ---------------------------------------------------------------------------
class TestHoursRoundTrip:
    def test_create_business_with_regular_hours(self, admin_client):
        """Create a business with regular hours; read back the same data."""
        biz = create_business(admin_client, name="Regular Hours Biz", hours=REGULAR_HOURS)
        poi_id = biz["id"]
        resp = admin_client.get(f"/api/pois/{poi_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["hours"]["regular"]["monday"]["status"] == "open"
        assert data["hours"]["regular"]["saturday"]["status"] == "closed"

    def test_create_with_holiday_hours(self, admin_client):
        """Create with holidays inside hours JSONB."""
        hours = {**REGULAR_HOURS, "holidays": HOLIDAY_HOURS}
        biz = create_business(admin_client, name="Holiday Biz", hours=hours)
        resp = admin_client.get(f"/api/pois/{biz['id']}")
        assert resp.status_code == 200
        assert resp.json()["hours"]["holidays"]["christmas"]["status"] == "closed"

    def test_create_with_seasonal_hours(self, admin_client):
        """Create with seasonal hours inside hours JSONB."""
        hours = {**REGULAR_HOURS, "seasonal": SEASONAL_HOURS}
        biz = create_business(admin_client, name="Seasonal Biz", hours=hours)
        resp = admin_client.get(f"/api/pois/{biz['id']}")
        assert resp.status_code == 200
        assert "summer" in resp.json()["hours"]["seasonal"]

    def test_create_with_exceptions(self, admin_client):
        """Create with exception hours."""
        hours = {**REGULAR_HOURS, "exceptions": EXCEPTION_HOURS}
        biz = create_business(admin_client, name="Exception Biz", hours=hours)
        resp = admin_client.get(f"/api/pois/{biz['id']}")
        assert resp.status_code == 200
        assert len(resp.json()["hours"]["exceptions"]) == 2

    def test_create_with_recurring_exceptions(self, admin_client):
        """Create with a recurring exception pattern."""
        hours = {**REGULAR_HOURS, "exceptions": [RECURRING_EXCEPTION]}
        biz = create_business(admin_client, name="Recurring Exc Biz", hours=hours)
        resp = admin_client.get(f"/api/pois/{biz['id']}")
        assert resp.status_code == 200
        exc = resp.json()["hours"]["exceptions"][0]
        assert exc["type"] == "recurring"
        assert exc["pattern"]["ordinal"] == "third"

    def test_update_hours(self, admin_client):
        """Update hours on an existing POI."""
        biz = create_business(admin_client, name="Update Hours Biz")
        resp = admin_client.put(f"/api/pois/{biz['id']}", json={"hours": REGULAR_HOURS})
        assert resp.status_code == 200
        assert resp.json()["hours"]["regular"]["monday"]["status"] == "open"

    def test_no_regular_hours_round_trip(self, admin_client):
        """#118 - the no_regular_hours flag survives a create/read cycle."""
        biz = create_business(admin_client, name="No Regular Hours Biz", hours=NO_REGULAR_HOURS)
        resp = admin_client.get(f"/api/pois/{biz['id']}")
        assert resp.status_code == 200
        data = resp.json()["hours"]
        assert data["no_regular_hours"] is True
        assert data["notes"] == "Hours vary. Call ahead."

    def test_holiday_mode_and_note_round_trip(self, admin_client):
        """#116 - per-holiday mode + note survive a create/read cycle."""
        hours = {**REGULAR_HOURS, "holidays": MODE_HOLIDAYS}
        biz = create_business(admin_client, name="Holiday Mode Biz", hours=hours)
        resp = admin_client.get(f"/api/pois/{biz['id']}")
        assert resp.status_code == 200
        holidays = resp.json()["hours"]["holidays"]
        assert holidays["christmas"]["mode"] == "closed"
        assert holidays["christmas"]["note"] == "Reopens December 26"
        # Legacy mirror still written alongside the new mode.
        assert holidays["christmas"]["status"] == "closed"
        assert holidays["independence_day"]["mode"] == "follows_regular"

    def test_mixed_legacy_and_new_holiday_blob_survives_put(self, admin_client):
        """A blob holding both legacy status-only and new mode entries round-trips."""
        mixed = {**LEGACY_HOLIDAYS, "halloween": MODE_HOLIDAYS["halloween"]}
        biz = create_business(admin_client, name="Mixed Holiday Biz")
        resp = admin_client.put(
            f"/api/pois/{biz['id']}",
            json={"hours": {**REGULAR_HOURS, "holidays": mixed}},
        )
        assert resp.status_code == 200
        holidays = resp.json()["hours"]["holidays"]
        assert "mode" not in holidays["christmas"]
        assert holidays["christmas"]["status"] == "open"
        assert holidays["halloween"]["mode"] == "open"

    def test_full_hours_structure(self, admin_client):
        """All sections populated: regular + holidays + seasonal + exceptions."""
        hours = {
            **REGULAR_HOURS,
            "holidays": HOLIDAY_HOURS,
            "seasonal": SEASONAL_HOURS,
            "exceptions": EXCEPTION_HOURS + [RECURRING_EXCEPTION],
        }
        biz = create_business(admin_client, name="Full Hours Biz", hours=hours)
        resp = admin_client.get(f"/api/pois/{biz['id']}")
        data = resp.json()["hours"]
        assert "regular" in data
        assert "holidays" in data
        assert "seasonal" in data
        assert len(data["exceptions"]) == 3


# ---------------------------------------------------------------------------
# Python hours resolution engine tests
# ---------------------------------------------------------------------------
class TestHoursResolution:
    def test_regular_hours_monday(self):
        """Regular Monday hours returned for a Monday date."""
        from shared.utils.hours_resolution import get_effective_hours_for_date
        # 2026-03-02 is a Monday
        result = get_effective_hours_for_date(REGULAR_HOURS, date(2026, 3, 2))
        assert result["source"] == "regular"
        assert result["hours"]["status"] == "open"
        assert result["hours"]["periods"][0]["open"]["time"] == "09:00"

    def test_exception_overrides_regular(self):
        """One-off exception for a date overrides regular hours."""
        from shared.utils.hours_resolution import get_effective_hours_for_date
        hours = {**REGULAR_HOURS, "exceptions": EXCEPTION_HOURS}
        # 2026-03-15 is a Sunday (but has exception)
        result = get_effective_hours_for_date(hours, date(2026, 3, 15))
        assert result["source"] == "exception"
        assert result["label"] == "Staff training"

    def test_holiday_overrides_regular(self):
        """Holiday hours for Christmas override regular."""
        from shared.utils.hours_resolution import get_effective_hours_for_date
        hours = {**REGULAR_HOURS, "holidays": HOLIDAY_HOURS}
        # 2026-12-25 is Christmas (Friday)
        result = get_effective_hours_for_date(hours, date(2026, 12, 25))
        assert result["source"] == "holiday"
        assert result["hours"]["status"] == "closed"

    def test_seasonal_overrides_regular(self):
        """Summer seasonal hours override regular on a summer date."""
        from shared.utils.hours_resolution import get_effective_hours_for_date
        hours = {**REGULAR_HOURS, "seasonal": SEASONAL_HOURS}
        # 2026-07-06 is a Monday in summer
        result = get_effective_hours_for_date(hours, date(2026, 7, 6))
        assert result["source"] == "seasonal"
        assert result["hours"]["periods"][0]["open"]["time"] == "08:00"

    def test_exception_overrides_holiday(self):
        """Exception on Christmas Day overrides holiday hours."""
        from shared.utils.hours_resolution import get_effective_hours_for_date
        xmas_exception = {
            "type": "one-time",
            "date": "2026-12-25",
            "status": "modified",
            "reason": "Special Christmas event",
            "periods": [{"open": {"type": "fixed", "time": "11:00"}, "close": {"type": "fixed", "time": "15:00"}}]
        }
        hours = {**REGULAR_HOURS, "holidays": HOLIDAY_HOURS, "exceptions": [xmas_exception]}
        result = get_effective_hours_for_date(hours, date(2026, 12, 25))
        assert result["source"] == "exception"
        assert result["label"] == "Special Christmas event"

    def test_exception_overrides_seasonal(self):
        """Exception overrides seasonal hours."""
        from shared.utils.hours_resolution import get_effective_hours_for_date
        hours = {**REGULAR_HOURS, "seasonal": SEASONAL_HOURS, "exceptions": EXCEPTION_HOURS}
        # 2026-07-04 is in summer AND has a closed exception
        result = get_effective_hours_for_date(hours, date(2026, 7, 4))
        assert result["source"] == "exception"
        assert result["hours"]["status"] == "closed"

    def test_recurring_exception(self):
        """3rd Wednesday pattern matches correctly."""
        from shared.utils.hours_resolution import get_effective_hours_for_date
        hours = {**REGULAR_HOURS, "exceptions": [RECURRING_EXCEPTION]}
        # 2026-03-18 is the 3rd Wednesday of March
        result = get_effective_hours_for_date(hours, date(2026, 3, 18))
        assert result["source"] == "exception"
        assert result["label"] == "Monthly team meeting"

    def test_recurring_exception_specific_months(self):
        """Recurring exception only in Jan/Feb/Mar."""
        from shared.utils.hours_resolution import get_effective_hours_for_date
        hours = {**REGULAR_HOURS, "exceptions": [RECURRING_EXCEPTION_SPECIFIC_MONTHS]}
        # 2026-02-02 is 1st Monday of February — should match
        result = get_effective_hours_for_date(hours, date(2026, 2, 2))
        assert result["source"] == "exception"
        assert result["hours"]["status"] == "closed"

        # 2026-04-06 is 1st Monday of April — should NOT match
        result2 = get_effective_hours_for_date(hours, date(2026, 4, 6))
        assert result2["source"] == "regular"

    def test_closed_exception(self):
        """Exception with status 'closed' returns closed."""
        from shared.utils.hours_resolution import get_effective_hours_for_date
        hours = {**REGULAR_HOURS, "exceptions": EXCEPTION_HOURS}
        # 2026-07-04 is the closed exception
        result = get_effective_hours_for_date(hours, date(2026, 7, 4))
        assert result["hours"]["status"] == "closed"
        assert result["label"] == "Independence Day"

    def test_no_hours_data(self):
        """None/empty hours returns None gracefully."""
        from shared.utils.hours_resolution import get_effective_hours_for_date
        result = get_effective_hours_for_date(None, date(2026, 3, 15))
        assert result["source"] == "none"
        assert result["hours"] is None


# ---------------------------------------------------------------------------
# Holiday modes (#116)
#
# The JS twin of these cases lives in
# nearby-app/app/src/utils/__tests__/hoursUtils.holidayModes.test.js and uses
# the SAME fixture literals and the SAME dates. Change both or neither.
# ---------------------------------------------------------------------------
class TestHolidayModes:
    def test_legacy_status_open_still_falls_through_to_regular(self):
        """A pre-#116 {"status": "open"} entry keeps its old fall-through meaning.

        It must NOT be read as the new always-open mode.
        """
        from shared.utils.hours_resolution import get_effective_hours_for_date
        hours = {**REGULAR_HOURS, "holidays": LEGACY_HOLIDAYS}
        # 2026-12-25 is Christmas Day, a Friday (regular hours 09:00-17:00).
        result = get_effective_hours_for_date(hours, date(2026, 12, 25))
        assert result["source"] == "regular"
        assert result["hours"]["periods"][0]["open"]["time"] == "09:00"
        # The holiday name is carried so the UI can annotate the row.
        assert result["label"] == "Christmas Day"

    def test_legacy_status_closed_still_closes(self):
        from shared.utils.hours_resolution import get_effective_hours_for_date
        hours = {**REGULAR_HOURS, "holidays": LEGACY_HOLIDAYS}
        # 2026-11-26 is Thanksgiving.
        result = get_effective_hours_for_date(hours, date(2026, 11, 26))
        assert result["source"] == "holiday"
        assert result["hours"]["status"] == "closed"

    def test_get_holiday_mode_maps_legacy_and_new_entries(self):
        from shared.utils.hours_resolution import get_holiday_mode
        assert get_holiday_mode({"status": "open"}) == "follows_regular"
        assert get_holiday_mode({"status": "closed"}) == "closed"
        assert get_holiday_mode({"status": "modified"}) == "modified"
        assert get_holiday_mode({"mode": "open", "status": "open"}) == "open"
        assert get_holiday_mode({"mode": "follows_regular", "status": "open"}) == "follows_regular"
        assert get_holiday_mode(None) == "unconfirmed"
        assert get_holiday_mode({}) == "unconfirmed"

    def test_follows_regular_derives_per_year_weekday(self):
        """The #116 example: July 4 follows regular hours, result differs by year."""
        from shared.utils.hours_resolution import get_effective_hours_for_date
        hours = {**REGULAR_HOURS, "holidays": MODE_HOLIDAYS}

        # 2025-07-04 is a Friday: regular hours apply.
        friday = get_effective_hours_for_date(hours, date(2025, 7, 4))
        assert friday["source"] == "regular"
        assert friday["hours"]["status"] == "open"
        assert friday["label"] == "Independence Day"

        # 2026-07-04 is a Saturday: the business is closed on Saturdays.
        saturday = get_effective_hours_for_date(hours, date(2026, 7, 4))
        assert saturday["source"] == "regular"
        assert saturday["hours"]["status"] == "closed"
        assert saturday["label"] == "Independence Day"

    def test_mode_closed_carries_note(self):
        from shared.utils.hours_resolution import get_effective_hours_for_date
        hours = {**REGULAR_HOURS, "holidays": MODE_HOLIDAYS}
        result = get_effective_hours_for_date(hours, date(2026, 12, 25))
        assert result["source"] == "holiday"
        assert result["hours"]["status"] == "closed"
        assert result["label"] == "Christmas Day"
        assert result["note"] == "Reopens December 26"

    def test_mode_modified_uses_holiday_periods(self):
        from shared.utils.hours_resolution import get_effective_hours_for_date
        hours = {**REGULAR_HOURS, "holidays": MODE_HOLIDAYS}
        result = get_effective_hours_for_date(hours, date(2026, 11, 26))
        assert result["source"] == "holiday"
        assert result["hours"]["status"] == "open"
        assert result["hours"]["periods"][0]["close"]["time"] == "14:00"

    def test_mode_open_on_normally_closed_weekday(self):
        """Open with no periods saved: open, hours unknown. Never invent 24h."""
        from shared.utils.hours_resolution import get_effective_hours_for_date
        hours = {**REGULAR_HOURS, "holidays": MODE_HOLIDAYS}
        # 2026-10-31 is Halloween, a Saturday (regular: closed).
        result = get_effective_hours_for_date(hours, date(2026, 10, 31))
        assert result["source"] == "holiday"
        assert result["hours"]["status"] == "open"
        assert result["hours"].get("hoursVary") is True
        assert result["hours"].get("periods") in (None, [])

    def test_mode_open_reuses_regular_periods_when_open_that_weekday(self):
        from shared.utils.hours_resolution import get_effective_hours_for_date
        hours = {
            **REGULAR_HOURS,
            "holidays": {"christmas": {"name": "Christmas Day", "date": "12-25", "mode": "open", "status": "open"}},
        }
        # 2026-12-25 is a Friday: reuse Friday's regular periods.
        result = get_effective_hours_for_date(hours, date(2026, 12, 25))
        assert result["source"] == "holiday"
        assert result["hours"]["status"] == "open"
        assert result["hours"]["periods"][0]["open"]["time"] == "09:00"

    def test_absent_major_holiday_is_unconfirmed(self):
        from shared.utils.hours_resolution import get_effective_hours_for_date
        # No holidays configured at all.
        result = get_effective_hours_for_date(REGULAR_HOURS, date(2026, 12, 25))
        assert result["source"] == "holiday_unconfirmed"
        assert result["hours"] is None
        assert result["unconfirmed"] is True
        assert result["label"] == "Christmas Day"

    def test_absent_minor_holiday_falls_through_silently(self):
        from shared.utils.hours_resolution import get_effective_hours_for_date
        # 2026-10-31 is Halloween, a minor holiday: no notice, no label.
        result = get_effective_hours_for_date(REGULAR_HOURS, date(2026, 10, 31))
        assert result["source"] == "regular"
        assert result["label"] is None

    def test_exception_still_beats_an_unconfirmed_holiday(self):
        from shared.utils.hours_resolution import get_effective_hours_for_date
        exception = {
            "type": "one-time", "date": "2026-12-25", "status": "closed", "reason": "Family time",
        }
        hours = {**REGULAR_HOURS, "exceptions": [exception]}
        result = get_effective_hours_for_date(hours, date(2026, 12, 25))
        assert result["source"] == "exception"
        assert result["label"] == "Family time"


# ---------------------------------------------------------------------------
# No regular hours (#118)
#
# JS twin: nearby-app/app/src/utils/__tests__/hoursUtils.noRegularHours.test.js
# ---------------------------------------------------------------------------
class TestNoRegularHours:
    def test_ordinary_day_reports_no_regular_hours(self):
        from shared.utils.hours_resolution import get_effective_hours_for_date
        # 2026-03-03 is an ordinary Tuesday (regular hours say 09:00-17:00).
        result = get_effective_hours_for_date(NO_REGULAR_HOURS, date(2026, 3, 3))
        assert result["source"] == "no_regular_hours"
        assert result["hours"]["status"] == "no_regular_hours"
        # The stale regular schedule must not leak.
        assert "periods" not in result["hours"]

    def test_exception_still_wins(self):
        from shared.utils.hours_resolution import get_effective_hours_for_date
        hours = {**NO_REGULAR_HOURS, "exceptions": EXCEPTION_HOURS}
        result = get_effective_hours_for_date(hours, date(2026, 3, 15))
        assert result["source"] == "exception"
        assert result["label"] == "Staff training"

    def test_holiday_still_wins(self):
        from shared.utils.hours_resolution import get_effective_hours_for_date
        hours = {**NO_REGULAR_HOURS, "holidays": MODE_HOLIDAYS}
        result = get_effective_hours_for_date(hours, date(2026, 12, 25))
        assert result["source"] == "holiday"
        assert result["hours"]["status"] == "closed"

    def test_seasonal_only_without_an_active_season_reports_closed(self):
        """Engine lockstep with hoursUtils.js: #46 gating, not stale regular hours."""
        from shared.utils.hours_resolution import get_effective_hours_for_date
        hours = {**REGULAR_HOURS, "seasonal": SEASONAL_HOURS, "seasonal_only": True}
        # 2026-01-05 is a Monday outside the summer range.
        result = get_effective_hours_for_date(hours, date(2026, 1, 5))
        assert result["source"] == "seasonal"
        assert result["hours"]["status"] == "closed"
        assert "seasonal" in result["label"].lower()

    def test_wins_over_seasonal_only(self):
        """P4 - the two flags are mutually exclusive; no_regular_hours wins."""
        from shared.utils.hours_resolution import get_effective_hours_for_date
        hours = {**NO_REGULAR_HOURS, "seasonal": SEASONAL_HOURS, "seasonal_only": True}
        result = get_effective_hours_for_date(hours, date(2026, 7, 6))
        assert result["source"] == "no_regular_hours"


# ---------------------------------------------------------------------------
# Effective-hours endpoint tests (nearby-app API)
# ---------------------------------------------------------------------------
class TestEffectiveHoursEndpoint:
    def test_effective_hours_endpoint(self, db_session, app_client):
        """GET /api/pois/{id}/effective-hours?date=2026-03-02 returns 200."""
        hours = {**REGULAR_HOURS, "holidays": HOLIDAY_HOURS}
        poi = orm_create_business(db_session, name="Effective Hours Biz", published=True, hours=hours)
        db_session.commit()

        resp = app_client.get(f"/api/pois/{poi.id}/effective-hours?date=2026-03-02")
        assert resp.status_code == 200, f"Expected 200: {resp.text}"
        data = resp.json()
        assert data["source"] == "regular"
        assert data["hours"]["status"] == "open"

    def test_effective_hours_with_exception(self, db_session, app_client):
        """Returns exception hours for exception date."""
        hours = {**REGULAR_HOURS, "exceptions": EXCEPTION_HOURS}
        poi = orm_create_business(db_session, name="Exception Hours Biz", published=True, hours=hours)
        db_session.commit()

        resp = app_client.get(f"/api/pois/{poi.id}/effective-hours?date=2026-07-04")
        assert resp.status_code == 200
        data = resp.json()
        assert data["source"] == "exception"
        assert data["hours"]["status"] == "closed"

    def test_effective_hours_no_date_uses_today(self, db_session, app_client):
        """Omit date param — uses today."""
        poi = orm_create_business(db_session, name="Today Hours Biz", published=True, hours=REGULAR_HOURS)
        db_session.commit()

        resp = app_client.get(f"/api/pois/{poi.id}/effective-hours")
        assert resp.status_code == 200
        data = resp.json()
        assert data["source"] in ("regular", "none")
