"""Issue #141: nearby cards must be able to resolve a repeating event's CURRENT date.

A repeating event is a single POI whose ``start_datetime`` is the FIRST
occurrence of the series. The card payload shipped only that date, so a weekly
market that began years ago rendered on the Nearby list with its original date
and a "Past" badge. The card now also carries the recurrence definition so the
client can resolve the occurrence that is current today.
"""

import pytest
from datetime import datetime, timezone
from conftest import (
    orm_create_event, orm_create_business, db_session, app_client,
)

RECURRENCE_KEYS = (
    "start_datetime", "end_datetime", "is_repeating",
    "repeat_pattern", "recurrence_end_date", "excluded_dates",
)


@pytest.fixture
def weekly_market(db_session):
    market = orm_create_event(
        db_session,
        name="Recurring Market Card",
        published=True,
        slug="recurring-market-card",
        location="POINT(-79.177397 35.720303)",
        event_fields={
            "start_datetime": datetime(2020, 7, 2, 15, 0, 0, tzinfo=timezone.utc),
            "end_datetime": datetime(2020, 7, 2, 18, 0, 0, tzinfo=timezone.utc),
            "is_repeating": True,
            "repeat_pattern": {"frequency": "weekly", "interval": 1, "days_of_week": ["Thu"]},
            "recurrence_end_date": None,
            "excluded_dates": ["2026-08-13"],
        },
    )
    origin = orm_create_business(
        db_session, name="Card Origin", published=True, slug="card-origin",
        location="POINT(-79.177500 35.720400)",
    )
    db_session.commit()
    return market, origin


def _card(rows, name):
    for row in rows:
        if row["name"] == name:
            return row
    raise AssertionError(f"{name!r} not in {[r['name'] for r in rows]}")


def test_nearby_by_id_card_carries_recurrence(weekly_market, app_client):
    _, origin = weekly_market
    resp = app_client.get(f"/api/pois/{origin.id}/nearby?radius_miles=5")
    assert resp.status_code == 200
    card = _card(resp.json(), "Recurring Market Card")
    for key in RECURRENCE_KEYS:
        assert key in card, f"card is missing {key}"
    assert card["is_repeating"] is True
    assert card["repeat_pattern"]["frequency"] == "weekly"
    assert card["excluded_dates"] == ["2026-08-13"]
    assert card["recurrence_end_date"] is None


def test_latlng_nearby_card_carries_recurrence(weekly_market, app_client):
    resp = app_client.get("/api/nearby?latitude=35.720303&longitude=-79.177397")
    assert resp.status_code == 200
    card = _card(resp.json(), "Recurring Market Card")
    for key in RECURRENCE_KEYS:
        assert key in card, f"card is missing {key}"
    assert card["is_repeating"] is True


def test_non_event_card_has_no_recurrence_keys(weekly_market, app_client):
    """Only events carry the recurrence block; other cards stay unchanged."""
    resp = app_client.get("/api/nearby?latitude=35.720303&longitude=-79.177397")
    assert resp.status_code == 200
    card = _card(resp.json(), "Card Origin")
    for key in ("is_repeating", "repeat_pattern", "recurrence_end_date", "excluded_dates"):
        assert key not in card
