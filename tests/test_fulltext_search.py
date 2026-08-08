"""
Integration tests for full-text search (tsvector column).

Requires the PostGIS test database (tests/docker-compose.test.yml).
"""

import pytest
from sqlalchemy import text
from conftest import orm_create_business


class TestTsvectorColumn:
    def test_tsvector_column_exists(self, db_session):
        """search_document column is created on startup."""
        # The app_client fixture triggers the startup event which creates the column.
        # But since we're testing just the column, create it manually here.
        try:
            db_session.execute(text("""
                ALTER TABLE points_of_interest
                ADD COLUMN IF NOT EXISTS search_document tsvector
                GENERATED ALWAYS AS (
                    setweight(to_tsvector('english', COALESCE(name, '')), 'A') ||
                    setweight(to_tsvector('english', COALESCE(description_short, '')), 'B') ||
                    setweight(to_tsvector('english', COALESCE(address_city, '')), 'B') ||
                    setweight(to_tsvector('english', COALESCE(description_long, '')), 'C')
                ) STORED
            """))
            db_session.commit()
        except Exception:
            db_session.rollback()
            # Column might already exist from a previous run — that's fine
            pass

        result = db_session.execute(text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'points_of_interest' AND column_name = 'search_document'"
        )).fetchone()
        assert result is not None


class TestFullTextSearch:
    @pytest.fixture(autouse=True)
    def _setup_tsvector(self, db_session):
        """Ensure tsvector column exists before tests."""
        try:
            db_session.execute(text("""
                ALTER TABLE points_of_interest
                ADD COLUMN IF NOT EXISTS search_document tsvector
                GENERATED ALWAYS AS (
                    setweight(to_tsvector('english', COALESCE(name, '')), 'A') ||
                    setweight(to_tsvector('english', COALESCE(description_short, '')), 'B') ||
                    setweight(to_tsvector('english', COALESCE(address_city, '')), 'B') ||
                    setweight(to_tsvector('english', COALESCE(description_long, '')), 'C')
                ) STORED
            """))
            db_session.execute(text(
                "CREATE INDEX IF NOT EXISTS idx_poi_search_document "
                "ON points_of_interest USING GIN (search_document)"
            ))
            db_session.commit()
        except Exception:
            db_session.rollback()

    def test_multiword_query(self, db_session, app_client):
        """A multi-word query matches descriptions containing those words.

        The query used to be the bare phrase "pet friendly"; that is now an
        amenity-flag query (#137) answered from icon_pet_friendly instead of
        from text, so this test uses a longer phrase to keep exercising
        full-text matching.
        """
        orm_create_business(
            db_session,
            name="Quiet Bookshop",
            description_long="A pet friendly bookshop with cozy reading corners",
            published=True,
        )
        db_session.commit()

        resp = app_client.get(
            "/api/pois/hybrid-search", params={"q": "pet friendly bookshop"}
        )
        assert resp.status_code == 200
        names = [r["name"] for r in resp.json()]
        assert "Quiet Bookshop" in names

    def test_stemming(self, db_session, app_client):
        """Stemming: 'fishing' matches POI with 'fish' in description."""
        orm_create_business(
            db_session,
            name="Lakeside Supply Co",
            description_short="Fresh fish and bait for anglers",
            description_long="Local shop selling fresh fish and supplies for lake adventures",
            published=True,
        )
        db_session.commit()

        resp = app_client.get("/api/pois/hybrid-search", params={"q": "fishing"})
        assert resp.status_code == 200
        names = [r["name"] for r in resp.json()]
        assert "Lakeside Supply Co" in names

    def test_description_search(self, db_session, app_client):
        """Query matching only description (not name) still finds POI."""
        orm_create_business(
            db_session,
            name="Java Joint",
            description_long="Best organic coffee and free wifi workspace in town",
            published=True,
        )
        db_session.commit()

        resp = app_client.get(
            "/api/pois/hybrid-search", params={"q": "organic coffee workspace"}
        )
        assert resp.status_code == 200
        names = [r["name"] for r in resp.json()]
        assert "Java Joint" in names
