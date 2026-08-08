"""Placeholder new-poi[-N] slug repair (issue #143).

The admin form auto-creates a draft named "New POI" the moment a POI type is
chosen, so the row is born with slug new-poi[-N]. The real name then arrives
via autosave, which historically never regenerated the slug, and that in turn
defeated update_poi's name-change detection on the eventual full save: by then
the stored name already equals the submitted name, so "name changed" is False
and the placeholder stuck forever (prod rows new-poi, new-poi-6/7/8).

Two-part fix pinned here: autosave regenerates while the slug is still a
placeholder, and update_poi treats a placeholder slug as always regenerable.
Real slugs are never touched by either path (published URLs stay stable).
"""

import uuid

from conftest import admin_client, db_session, create_business


def _admin_get(client, poi_id):
    resp = client.get(f"/api/pois/{poi_id}")
    assert resp.status_code == 200
    return resp.json()


class TestAutosaveRepairsPlaceholder:
    def test_draft_is_born_with_placeholder_slug(self, admin_client):
        poi = create_business(admin_client, name="New POI")
        assert poi["slug"].startswith("new-poi")

    def test_autosaved_name_regenerates_the_slug(self, admin_client):
        poi = create_business(admin_client, name="New POI")
        resp = admin_client.patch(
            f"/api/pois/{poi['id']}/autosave", json={"name": "Quiltmaker Cafe"}
        )
        assert resp.status_code == 200
        after = _admin_get(admin_client, poi["id"])
        assert after["slug"].startswith("quiltmaker-cafe")

    def test_two_drafts_in_a_row_get_unique_slugs(self, admin_client):
        first = create_business(admin_client, name="New POI")
        second = create_business(admin_client, name="New POI")
        assert first["slug"] != second["slug"]

        for poi in (first, second):
            resp = admin_client.patch(
                f"/api/pois/{poi['id']}/autosave", json={"name": "Twin Bakery"}
            )
            assert resp.status_code == 200
        slugs = {_admin_get(admin_client, p["id"])["slug"] for p in (first, second)}
        assert len(slugs) == 2
        assert all(s.startswith("twin-bakery") for s in slugs)


class TestFullSaveRepairsPlaceholder:
    def test_put_with_unchanged_name_repairs_a_placeholder_slug(
        self, admin_client, db_session
    ):
        """The exact production case: real name, stuck placeholder slug."""
        from app.models import PointOfInterest

        poi = create_business(admin_client, name="Gunn and Messick LLP")
        db_session.query(PointOfInterest).filter(
            PointOfInterest.id == uuid.UUID(poi["id"])
        ).update({"slug": "new-poi-8"})
        db_session.commit()

        resp = admin_client.put(
            f"/api/pois/{poi['id']}", json={"name": "Gunn and Messick LLP"}
        )
        assert resp.status_code == 200
        after = _admin_get(admin_client, poi["id"])
        assert after["slug"].startswith("gunn-and-messick")

    def test_put_with_unchanged_name_leaves_a_real_slug_alone(self, admin_client):
        poi = create_business(admin_client, name="Stable Slug Shop")
        before = poi["slug"]
        assert before.startswith("stable-slug-shop")

        resp = admin_client.put(
            f"/api/pois/{poi['id']}", json={"description_short": "edited"}
        )
        assert resp.status_code == 200
        assert _admin_get(admin_client, poi["id"])["slug"] == before

    def test_poi_still_named_new_poi_is_not_reslugged_into_another_placeholder(
        self, admin_client
    ):
        poi = create_business(admin_client, name="New POI")
        before = poi["slug"]

        resp = admin_client.put(
            f"/api/pois/{poi['id']}", json={"description_short": "still a draft"}
        )
        assert resp.status_code == 200
        assert _admin_get(admin_client, poi["id"])["slug"] == before


class TestDraftSlugTracksName:
    """Autosave hardening: a mid-typing pause must not lock in a partial slug."""

    def test_partial_name_autosave_then_full_name_repairs_the_slug(self, admin_client):
        poi = create_business(admin_client, name="New POI")
        # User pauses mid-word: autosave fires with a partial name.
        resp = admin_client.patch(f"/api/pois/{poi['id']}/autosave", json={"name": "Qu"})
        assert resp.status_code == 200
        # They finish typing: the draft's slug follows the real name.
        resp = admin_client.patch(
            f"/api/pois/{poi['id']}/autosave", json={"name": "Quiltmaker Cafe"}
        )
        assert resp.status_code == 200
        after = _admin_get(admin_client, poi["id"])
        assert after["slug"].startswith("quiltmaker-cafe")

    def test_repeated_autosave_of_the_same_name_is_idempotent(self, admin_client):
        poi = create_business(admin_client, name="New POI")
        for _ in range(3):
            resp = admin_client.patch(
                f"/api/pois/{poi['id']}/autosave", json={"name": "Steady Name Store"}
            )
            assert resp.status_code == 200
        after = _admin_get(admin_client, poi["id"])
        assert after["slug"] == "steady-name-store"

    def test_published_poi_with_real_slug_is_never_reslugged_by_autosave(self, admin_client):
        poi = create_business(admin_client, name="Published Landmark")
        before = poi["slug"]
        resp = admin_client.put(
            f"/api/pois/{poi['id']}", json={"publication_status": "published"}
        )
        assert resp.status_code == 200
        resp = admin_client.patch(
            f"/api/pois/{poi['id']}/autosave", json={"name": "Renamed Landmark"}
        )
        assert resp.status_code == 200
        assert _admin_get(admin_client, poi["id"])["slug"] == before
