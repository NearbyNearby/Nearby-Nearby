"""Issue #180: a timezone-naive event datetime is an America/New_York wall time.

The admin Mantine DateTimePicker sends naive local strings ("YYYY-MM-DD
HH:mm:ss"). The events columns are timestamptz, so a naive value used to be
labeled UTC: typing 7:00 PM stored 19:00Z, which every screen shows as 3 PM
Eastern. Policy: naive event datetimes arriving at any write path are
America/New_York wall times; aware values (Z or offset) pass through unchanged.
"""

from datetime import datetime, timezone


def _instant(iso_str):
    """Parse an API datetime string into an aware UTC datetime."""
    return datetime.fromisoformat(iso_str.replace("Z", "+00:00")).astimezone(timezone.utc)


def _create_event(admin_client, name, event_fields):
    resp = admin_client.post("/api/pois/", json={
        "name": name,
        "poi_type": "EVENT",
        "location": {"type": "Point", "coordinates": [-79.3, 35.6]},
        "event": event_fields,
    })
    assert resp.status_code == 201, resp.text
    return resp.json()


def _get_event(admin_client, poi_id):
    resp = admin_client.get(f"/api/pois/{poi_id}")
    assert resp.status_code == 200
    return resp.json()["event"]


class TestCreateNaiveIsEastern:
    def test_summer_evening_stored_correctly(self, admin_client):
        """7 PM-9 PM Eastern in September (EDT) -> 23:00Z / 01:00Z next day."""
        data = _create_event(admin_client, "Pub Trivia", {
            "start_datetime": "2026-09-17 19:00:00",  # exact Mantine format, no zone
            "end_datetime": "2026-09-17 21:00:00",
        })
        ev = _get_event(admin_client, data["id"])
        assert _instant(ev["start_datetime"]) == datetime(2026, 9, 17, 23, 0, tzinfo=timezone.utc)
        assert _instant(ev["end_datetime"]) == datetime(2026, 9, 18, 1, 0, tzinfo=timezone.utc)

    def test_winter_evening_crosses_utc_midnight(self, admin_client):
        """7 PM Eastern in January (EST) -> 00:00Z the next day."""
        data = _create_event(admin_client, "Winter Trivia", {
            "start_datetime": "2026-01-15 19:00:00",
        })
        ev = _get_event(admin_client, data["id"])
        assert _instant(ev["start_datetime"]) == datetime(2026, 1, 16, 0, 0, tzinfo=timezone.utc)

    def test_recurrence_end_date_naive_is_eastern(self, admin_client):
        data = _create_event(admin_client, "Seasonal Series", {
            "start_datetime": "2026-01-15 19:00:00",
            "recurrence_end_date": "2026-12-31 23:59:00",
        })
        ev = _get_event(admin_client, data["id"])
        assert _instant(ev["recurrence_end_date"]) == datetime(2027, 1, 1, 4, 59, tzinfo=timezone.utc)


class TestUpdateNaiveIsEastern:
    def test_put_naive_start_and_end(self, admin_client):
        data = _create_event(admin_client, "PUT Event", {
            "start_datetime": "2026-09-17T19:00:00Z",
        })
        resp = admin_client.put(f"/api/pois/{data['id']}", json={
            "event": {
                "start_datetime": "2026-09-17 19:00:00",
                "end_datetime": "2026-09-17 21:00:00",
            },
        })
        assert resp.status_code == 200, resp.text
        ev = _get_event(admin_client, data["id"])
        assert _instant(ev["start_datetime"]) == datetime(2026, 9, 17, 23, 0, tzinfo=timezone.utc)
        assert _instant(ev["end_datetime"]) == datetime(2026, 9, 18, 1, 0, tzinfo=timezone.utc)


class TestAutosaveNaiveIsEastern:
    def test_patch_naive_start_and_end(self, admin_client):
        """Autosave bypasses the pydantic schemas and must not label 7 PM as UTC."""
        data = _create_event(admin_client, "Autosave Event", {
            "start_datetime": "2026-09-17T19:00:00Z",
        })
        resp = admin_client.patch(f"/api/pois/{data['id']}/autosave", json={
            "start_datetime": "2026-09-17 19:00:00",
            "end_datetime": "2026-09-17 21:00:00",
        })
        assert resp.status_code == 200, resp.text
        ev = _get_event(admin_client, data["id"])
        assert _instant(ev["start_datetime"]) == datetime(2026, 9, 17, 23, 0, tzinfo=timezone.utc)
        assert _instant(ev["end_datetime"]) == datetime(2026, 9, 18, 1, 0, tzinfo=timezone.utc)


class TestRescheduleNaiveIsEastern:
    def test_reschedule_naive_start(self, admin_client):
        data = _create_event(admin_client, "Reschedule Event", {
            "start_datetime": "2026-09-17T19:00:00Z",
        })
        resp = admin_client.post(f"/api/pois/{data['id']}/reschedule", json={
            "new_start_datetime": "2026-10-01 19:00:00",
        })
        assert resp.status_code == 201, resp.text
        clone_id = resp.json()["id"]
        ev = _get_event(admin_client, clone_id)
        assert _instant(ev["start_datetime"]) == datetime(2026, 10, 1, 23, 0, tzinfo=timezone.utc)


class TestAwareInputUnchanged:
    def test_aware_z_stays(self, admin_client):
        """An input that already carries a zone (e.g. RescheduleModal Date objects) is kept."""
        data = _create_event(admin_client, "Aware Event", {
            "start_datetime": "2026-09-17T23:00:00Z",
        })
        ev = _get_event(admin_client, data["id"])
        assert _instant(ev["start_datetime"]) == datetime(2026, 9, 17, 23, 0, tzinfo=timezone.utc)
