"""End-to-end embedding pipeline test (Shared phase).

This is the "CI test of derivation" for the embedding feature: it exercises the
WRITE path (admin embed-on-write -> stored vector) and the READ path
(nearby-app multi-signal semantic search -> relevant nearest neighbour) against
a REAL pgvector column, using a deterministic, hermetic mock embedding client
(no torch, no TEI, no network).

It complements test_embed_on_write.py (which proves fail-soft ROBUSTNESS with a
DISABLED client). Here the client is ENABLED, so the vector is actually stored
and actually drives a semantic match.

Key contracts asserted:
  * conftest creates the unmapped ``embedding vector(768)`` column + HNSW index.
  * write_embedding_best_effort populates that column (NON-NULL) for a POI.
  * a query sharing tokens with the document ranks the POI in semantic search.
  * fail-soft still holds: with NO mock (disabled client) the write no-ops and
    search still returns keyword results.
"""

import importlib

import pytest
from sqlalchemy import text

from conftest import orm_create_business


embedding_writer = importlib.import_module("app.crud.embedding_writer")


def _embedding_is_populated(db, poi_id) -> bool:
    row = db.execute(
        text("SELECT embedding IS NOT NULL FROM points_of_interest WHERE id = :id"),
        {"id": str(poi_id)},
    ).fetchone()
    return bool(row and row[0])


class TestEmbeddingColumnExists:
    def test_embedding_column_and_index_present(self, db_session):
        """conftest's raw DDL created the unmapped vector(768) column + HNSW idx."""
        col = db_session.execute(text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'points_of_interest' AND column_name = 'embedding'"
        )).fetchone()
        assert col is not None, "embedding column must exist for the pipeline"

        idx = db_session.execute(text(
            "SELECT indexname FROM pg_indexes "
            "WHERE tablename = 'points_of_interest' "
            "AND indexname = 'poi_embedding_hnsw_idx'"
        )).fetchone()
        assert idx is not None, "HNSW index must exist"


class TestWritePathPopulatesEmbedding:
    def test_write_embedding_best_effort_populates_column(
        self, db_session, mock_embedding_client
    ):
        """With an ENABLED (mock) client, the writer stores a NON-NULL vector."""
        poi = orm_create_business(
            db_session,
            name="Pet Friendly Trail Coffee",
            description_long="A pet friendly coffee shop beside a scenic trail.",
            published=True,
        )
        db_session.commit()

        # Sanity: the runtime client really is enabled now (mock applied).
        from shared.embeddings import get_embedding_client
        assert get_embedding_client().enabled is True

        # Before the write the column is NULL.
        assert _embedding_is_populated(db_session, poi.id) is False

        embedding_writer.write_embedding_best_effort(db_session, poi.id)

        # The writer committed on its own connection; re-read fresh.
        db_session.commit()
        assert _embedding_is_populated(db_session, poi.id) is True


class TestReadPathSemanticMatch:
    def test_semantic_search_returns_token_matching_poi(
        self, db_session, mock_embedding_client, app_client
    ):
        """A query sharing tokens with the embedded document ranks the POI.

        Because the mock embedding is a token-hash bag-of-words, a query whose
        tokens are in the document produces a vector with HIGH cosine
        similarity to that document vector. We give the target a name that does
        NOT trigram match the query, and a distractor that shares no query
        tokens, so the semantic signal is what surfaces the target.

        The query is deliberately longer than the bare phrase "pet friendly":
        that phrase is now an amenity-flag query answered from
        icon_pet_friendly (#137), and the extra token overlap keeps the cosine
        clear of SEMANTIC_SIMILARITY_THRESHOLD (#140).
        """
        # Belt-and-suspenders: ensure the read path uses the mock even though
        # app startup already ran get_embedding_client() (which is patched).
        app_client.app.state.embedding_client = mock_embedding_client

        target = orm_create_business(
            db_session,
            name="Zzz Quiet Corner",  # no token overlap with "pet friendly"
            description_long="An especially pet friendly spot, great for dogs.",
            published=True,
        )
        distractor = orm_create_business(
            db_session,
            name="Iron Anvil Hardware",
            description_long="Tools, nails, lumber and industrial supplies.",
            published=True,
        )
        db_session.commit()

        # Embed BOTH so the nearest-neighbour query has competitors.
        embedding_writer.write_embedding_best_effort(db_session, target.id)
        embedding_writer.write_embedding_best_effort(db_session, distractor.id)
        db_session.commit()

        assert _embedding_is_populated(db_session, target.id) is True
        assert _embedding_is_populated(db_session, distractor.id) is True

        # Read path: semantic-search routes through multi_signal_search and the
        # semantic signal (pgvector cosine) should surface the target.
        resp = app_client.get(
            "/api/pois/semantic-search",
            params={"q": "pet friendly spot for dogs", "limit": 10},
        )
        assert resp.status_code == 200, resp.text
        results = resp.json()
        names = [r["name"] for r in results]
        assert "Zzz Quiet Corner" in names, (
            f"semantic signal should surface the token-matching POI; got {names}"
        )

    def test_semantic_signal_contributes_score_directly(
        self, db_session, mock_embedding_client, app_client
    ):
        """The semantic signal function itself returns a non-empty score map for
        the embedded POI — proving the contribution is semantic, not keyword.

        The query mirrors the document's tokens so the mock's cosine clears
        SEMANTIC_SIMILARITY_THRESHOLD (#140); the bag-of-words mock cannot
        express a paraphrase the way the real model does.
        """
        from app.search.search_engine import _signal_semantic

        target = orm_create_business(
            db_session,
            name="Zzz Quiet Corner Two",  # no overlap with query tokens
            description_long="A pet friendly destination with dog water bowls.",
            published=True,
        )
        db_session.commit()
        embedding_writer.write_embedding_best_effort(db_session, target.id)
        db_session.commit()

        scores = _signal_semantic(
            db_session,
            "pet friendly destination with dog water bowls",
            None,
            mock_embedding_client,
        )
        assert scores, "semantic signal must return a non-empty score map"
        assert str(target.id) in scores
        assert scores[str(target.id)] > 0.0


class TestFailSoftWithoutMock:
    def test_disabled_client_write_is_noop_and_keyword_search_works(
        self, db_session, app_client
    ):
        """Without the mock (disabled client): the write no-ops (embedding stays
        NULL) but the app still creates data and keyword search still returns it.
        """
        from shared.embeddings import get_embedding_client
        assert get_embedding_client().enabled is False

        poi = orm_create_business(
            db_session,
            name="Sunrise Bakery Keyword",
            description_long="Fresh bread daily.",
            published=True,
        )
        db_session.commit()

        # Disabled client -> writer is a clean no-op, never raises.
        embedding_writer.write_embedding_best_effort(db_session, poi.id)
        db_session.commit()
        assert _embedding_is_populated(db_session, poi.id) is False

        # Keyword/trigram search still surfaces it by name.
        resp = app_client.get(
            "/api/pois/search", params={"q": "Sunrise Bakery Keyword"}
        )
        assert resp.status_code == 200, resp.text
        names = [r["name"] for r in resp.json()]
        assert "Sunrise Bakery Keyword" in names
