"""Task 1.1: append-only POI revision audit trail.

Every admin POI mutation (create / update / delete / autosave) must append one
``poi_revisions`` row with the correct action, poi_id, and a full JSON snapshot
(base + subtype + categories + relationship summary). Revisions must survive the
deletion of their POI. The migration must round-trip up/down.
"""

import os
import importlib.util
import uuid

import pytest
import sqlalchemy as sa

from conftest import (
    create_business,
    create_trail,
    create_event,
    create_category,
    _mock_get_current_user_with_role,
)
from app.models import POIRevision, POIRelationship


def _revisions_for(db, poi_id):
    """All revision rows for a POI, oldest first."""
    return (
        db.query(POIRevision)
        .filter(POIRevision.poi_id == uuid.UUID(str(poi_id)))
        .order_by(POIRevision.created_at)
        .all()
    )


class TestRevisionPerMutation:
    def test_create_writes_one_revision(self, admin_client, db_session):
        trail = create_trail(
            admin_client,
            name="Ridge Trail",
            trail={"difficulty": "moderate", "length_text": "3.2 mi"},
        )
        poi_id = trail["id"]

        revs = _revisions_for(db_session, poi_id)
        assert len(revs) == 1
        rev = revs[0]
        assert rev.action == "create"
        assert str(rev.poi_id) == poi_id

        snap = rev.snapshot
        # Base field
        assert snap["name"] == "Ridge Trail"
        assert snap["poi_type"] == "TRAIL"
        # Subtype field (proves subtype is serialized)
        assert snap["trail"]["difficulty"] == "moderate"
        assert snap["trail"]["length_text"] == "3.2 mi"
        # Relationship summary key is always present
        assert "poi_relationships" in snap
        assert snap["poi_relationships"] == []

    def test_update_writes_a_revision(self, admin_client, db_session):
        biz = create_business(admin_client, name="Before Name")
        poi_id = biz["id"]

        resp = admin_client.put(
            f"/api/pois/{poi_id}",
            json={"name": "After Name", "description_short": "changed"},
        )
        assert resp.status_code == 200, resp.text

        revs = _revisions_for(db_session, poi_id)
        actions = [r.action for r in revs]
        assert actions == ["create", "update"]
        update_snap = revs[-1].snapshot
        assert update_snap["name"] == "After Name"
        assert update_snap["description_short"] == "changed"

    def test_autosave_writes_an_update_revision(self, admin_client, db_session):
        biz = create_business(admin_client, name="Autosave Audit")
        poi_id = biz["id"]

        resp = admin_client.patch(
            f"/api/pois/{poi_id}/autosave",
            json={"description_short": "autosaved text"},
        )
        assert resp.status_code == 200, resp.text

        revs = _revisions_for(db_session, poi_id)
        assert [r.action for r in revs] == ["create", "update"]
        # The autosaved value is reflected in the snapshot.
        assert revs[-1].snapshot["description_short"] == "autosaved text"

    def test_delete_writes_a_revision(self, admin_client, db_session):
        biz = create_business(admin_client, name="Doomed Biz")
        poi_id = biz["id"]

        resp = admin_client.delete(f"/api/pois/{poi_id}")
        assert resp.status_code in (200, 204), resp.text

        revs = _revisions_for(db_session, poi_id)
        assert [r.action for r in revs] == ["create", "delete"]
        # The delete snapshot captured the POI as it was before removal.
        assert revs[-1].snapshot["name"] == "Doomed Biz"


class TestRevisionSurvivesDeletion:
    def test_revisions_queryable_after_poi_deleted(self, admin_client, db_session):
        biz = create_business(admin_client, name="Delete Survivor")
        poi_id = biz["id"]

        # A couple of mutations, then delete.
        admin_client.put(f"/api/pois/{poi_id}", json={"description_short": "v2"})
        assert admin_client.delete(f"/api/pois/{poi_id}").status_code in (200, 204)

        # POI is gone from the app surface...
        assert admin_client.get(f"/api/pois/{poi_id}").status_code == 404
        # ...but its revisions remain queryable (poi_id has no FK / cascade).
        revs = _revisions_for(db_session, poi_id)
        assert [r.action for r in revs] == ["create", "update", "delete"]


class TestSnapshotContents:
    def test_snapshot_includes_categories(self, admin_client, db_session):
        cat = create_category(
            admin_client, name="Coffee Shops", applicable_to=["BUSINESS"]
        )
        biz = create_business(
            admin_client,
            name="Cat Biz",
            category_ids=[cat["id"]],
            main_category_id=cat["id"],
        )
        snap = _revisions_for(db_session, biz["id"])[0].snapshot

        assert snap["main_category"]["id"] == cat["id"]
        assert snap["main_category"]["name"] == "Coffee Shops"
        # The category id + name also appear in the full categories list.
        all_names = {c["name"] for c in snap.get("categories", [])}
        assert "Coffee Shops" in all_names

    def test_snapshot_includes_relationship_summary(self, admin_client, db_session):
        park = create_business(admin_client, name="Rel Source")
        target = create_business(admin_client, name="Rel Target")

        # Insert an edge directly (bypasses type-combo validation) then mutate the
        # source so its next revision serializes the relationship summary.
        db_session.add(POIRelationship(
            source_poi_id=uuid.UUID(park["id"]),
            target_poi_id=uuid.UUID(target["id"]),
            relationship_type="service_provider",
        ))
        db_session.commit()

        resp = admin_client.put(
            f"/api/pois/{park['id']}", json={"description_short": "touch"}
        )
        assert resp.status_code == 200, resp.text

        snap = _revisions_for(db_session, park["id"])[-1].snapshot
        summary = snap["poi_relationships"]
        assert any(
            r["target_poi_id"] == target["id"]
            and r["relationship_type"] == "service_provider"
            for r in summary
        ), summary

    def test_event_subtype_field_captured(self, admin_client, db_session):
        event = create_event(
            admin_client,
            name="Fair",
            event={"start_datetime": "2026-09-01T10:00:00Z", "organizer_name": "Town"},
        )
        snap = _revisions_for(db_session, event["id"])[0].snapshot
        assert snap["event"]["organizer_name"] == "Town"
        assert snap["event"]["start_datetime"].startswith("2026-09-01")


class TestUserIdCapture:
    def test_user_id_recorded_when_valid_uuid(self, admin_client, db_session):
        from app.main import app as admin_app
        from app.core.permissions import get_current_user_with_role

        real_id = uuid.uuid4()

        class _RealUser:
            id = real_id
            role = "admin"
            email = "editor@example.com"

        admin_app.dependency_overrides[get_current_user_with_role] = lambda: _RealUser()
        try:
            biz = create_business(admin_client, name="Attributed Biz")
        finally:
            admin_app.dependency_overrides[get_current_user_with_role] = (
                _mock_get_current_user_with_role
            )

        rev = _revisions_for(db_session, biz["id"])[0]
        assert rev.user_id == real_id

    def test_user_id_null_when_not_a_uuid(self, admin_client, db_session):
        # The conftest mock user has a non-UUID id ("test-user-id"); it must
        # degrade to NULL rather than break the insert.
        biz = create_business(admin_client, name="Anon Biz")
        rev = _revisions_for(db_session, biz["id"])[0]
        assert rev.user_id is None


class TestMigrationRoundTrip:
    def test_upgrade_downgrade_round_trips(self, db_session):
        from alembic.migration import MigrationContext
        from alembic.operations import Operations

        engine = db_session.get_bind()

        here = os.path.dirname(__file__)
        mig_path = os.path.abspath(os.path.join(
            here, "..", "nearby-admin", "backend", "alembic", "versions",
            "o_poi_revisions_001_add_poi_revisions.py",
        ))
        spec = importlib.util.spec_from_file_location("o_poi_revisions_001", mig_path)
        mig = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mig)

        assert mig.revision == "o_poi_revisions_001"
        assert mig.down_revision == "n_sponsor_logo_001"

        # The fixture already created poi_revisions via create_all; drop it to
        # simulate the pre-migration state.
        with engine.begin() as conn:
            conn.execute(sa.text("DROP TABLE IF EXISTS poi_revisions"))
            assert not sa.inspect(conn).has_table("poi_revisions")

        # upgrade(): table + index appear.
        with engine.begin() as conn:
            with Operations.context(MigrationContext.configure(conn)):
                mig.upgrade()
            insp = sa.inspect(conn)
            assert insp.has_table("poi_revisions")
            idx_names = {ix["name"] for ix in insp.get_indexes("poi_revisions")}
            assert "ix_poi_revisions_poi_id" in idx_names
            cols = {c["name"] for c in insp.get_columns("poi_revisions")}
            assert {"id", "poi_id", "action", "snapshot", "user_id", "created_at"} <= cols

        # downgrade(): table gone.
        with engine.begin() as conn:
            with Operations.context(MigrationContext.configure(conn)):
                mig.downgrade()
            assert not sa.inspect(conn).has_table("poi_revisions")

        # Re-create so the schema matches the migrated end-state for teardown.
        with engine.begin() as conn:
            with Operations.context(MigrationContext.configure(conn)):
                mig.upgrade()
