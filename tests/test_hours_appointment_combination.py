"""Issue #118 - posted hours AND "appointments required" can coexist.

A law firm open Mon-Fri 9-5 that only sees clients by appointment is a real
listing. Before #118 the admin form silently cleared
`hours_but_appointment_required` whenever no day was set to the 'appointment'
status, so any unrelated hours edit dropped the flag.

The admin form fix is covered by
nearby-admin/frontend/src/components/__tests__/HoursSelector.test.jsx. These
tests guard the API side: the flag is an independent column and nothing in the
hours write path may touch it.
"""
from conftest import create_business
from test_hours_system import REGULAR_HOURS


APPOINTMENT_ONLY_HOURS = {
    "regular": {
        day: {"status": "appointment", "periods": [
            {"open": {"type": "appointment"}, "close": {"type": "appointment"}}
        ]}
        for day in ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
    }
}


class TestAppointmentFlagWithRegularHours:
    def test_regular_hours_and_appointment_flag_coexist(self, admin_client):
        biz = create_business(
            admin_client,
            name="Law Firm With Hours",
            hours=REGULAR_HOURS,
            hours_but_appointment_required=True,
            appointment_booking_url="https://example.com/book",
        )
        resp = admin_client.get(f"/api/pois/{biz['id']}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["hours_but_appointment_required"] is True
        assert data["hours"]["regular"]["monday"]["status"] == "open"

    def test_unrelated_hours_edit_keeps_the_flag(self, admin_client):
        """The regression: editing hours must never clear the flag."""
        biz = create_business(
            admin_client,
            name="Law Firm Hours Edit",
            hours=REGULAR_HOURS,
            hours_but_appointment_required=True,
        )
        edited = {
            **REGULAR_HOURS,
            "notes": "Front desk closes at 4:30.",
        }
        resp = admin_client.put(f"/api/pois/{biz['id']}", json={"hours": edited})
        assert resp.status_code == 200
        assert resp.json()["hours_but_appointment_required"] is True

        # And on a fresh read, not just the write response.
        assert admin_client.get(f"/api/pois/{biz['id']}").json()["hours_but_appointment_required"] is True

    def test_flag_is_cleared_only_when_explicitly_sent(self, admin_client):
        biz = create_business(
            admin_client,
            name="Law Firm Flag Off",
            hours=REGULAR_HOURS,
            hours_but_appointment_required=True,
            appointment_booking_url="https://example.com/book",
        )
        resp = admin_client.put(
            f"/api/pois/{biz['id']}", json={"hours_but_appointment_required": False}
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["hours_but_appointment_required"] is False
        # The booking URL survives so the flag can be switched back on.
        assert data["appointment_booking_url"] == "https://example.com/book"

    def test_appointment_only_hours_still_supported(self, admin_client):
        """The all-days-by-appointment shape keeps working alongside the flag."""
        biz = create_business(
            admin_client,
            name="By Appointment Only Biz",
            hours=APPOINTMENT_ONLY_HOURS,
            hours_but_appointment_required=True,
        )
        data = admin_client.get(f"/api/pois/{biz['id']}").json()
        assert data["hours"]["regular"]["monday"]["status"] == "appointment"
        assert data["hours_but_appointment_required"] is True
