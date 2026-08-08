"""Search correctness regressions (issues #127, #137, #140).

All three user-facing search surfaces (the homepage SearchBar suggestions,
Explore, and the Nearby search box) call ``/api/pois/hybrid-search``, which
routes through ``multi_signal_search``. So all three bugs are fixed in that one
path (plus the endpoint-level event filter).

  #140  Explore with the Events filter returned EVERY event for a query like
        "farmers market": the semantic signal took the 30 nearest neighbours
        with no similarity floor and then divided by the best score, promoting
        the worst neighbour of a bad batch to ~1.0.
  #137  "pet friendly" returned listings that are not pet friendly (it was
        matched as text, not as the amenity flag).
  #127  Homepage suggestions listed events that already happened.

Dates are always RELATIVE to now, never hardcoded calendar dates.
"""

import importlib
import math
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import text
from conftest import orm_create_business, orm_create_event, orm_create_park

# Admin-side writer: populates the (deliberately unmapped) `embedding` column,
# exactly like tests/test_embedding_pipeline.py. Imported at module scope, i.e.
# before the app_client fixture swaps sys.path over to the app backend.
embedding_writer = importlib.import_module("app.crud.embedding_writer")

_NOW = datetime.now(timezone.utc).replace(microsecond=0)
_TODAY_START = _NOW.replace(hour=0, minute=0, second=0)
_FUTURE = _NOW + timedelta(days=30)
_PAST = _NOW - timedelta(days=30)

_SEARCH_ENDPOINTS = ("search", "hybrid-search", "semantic-search")


def _names(resp):
    assert resp.status_code == 200, resp.text
    return [r["name"] for r in resp.json()]


def _search(client, q, endpoint="hybrid-search", **params):
    return client.get(f"/api/pois/{endpoint}", params={"q": q, "limit": 50, **params})


# ---------------------------------------------------------------------------
# #140: a query must actually match; a type filter is not a listing
# ---------------------------------------------------------------------------

_UNRELATED_EVENTS = [
    ("Midnight Jazz Quartet", "An evening of improvised jazz in the town hall."),
    ("Beekeeping Workshop", "Learn hive management from local apiarists."),
    ("Chess Tournament", "Open rated tournament for all ages."),
    ("Watercolor Painting Class", "Bring a brush and paint the riverbank."),
]


def _seed_events(db):
    """One event that matches "farmers market" + four that clearly do not."""
    target = orm_create_event(
        db,
        name="Pittsboro Farmers Market",
        published=True,
        description_long="Weekly outdoor farmers market with local produce and crafts.",
        event_fields={"start_datetime": _FUTURE},
    )
    others = [
        orm_create_event(
            db, name=name, published=True, description_long=desc,
            event_fields={"start_datetime": _FUTURE},
        )
        for name, desc in _UNRELATED_EVENTS
    ]
    db.commit()
    return target, others


def _embed_all(db, pois):
    for poi in pois:
        embedding_writer.write_embedding_best_effort(db, poi.id)
    db.commit()


# --- prod-like embedding geometry -------------------------------------------
# The hermetic mock embedder is a token-hash bag of words, so unrelated texts
# come out near-orthogonal (cosine ~0), much cleaner than reality and NOT the
# distribution that produced #140. Real EmbeddingGemma keeps unrelated pairs
# around 0.2-0.45 and related pairs above ~0.55, and the old code divided every
# neighbour by the batch best, so a 0.40 neighbour scored 0.53 of a 0.75 match.
# These helpers write vectors with an EXACT cosine to the query vector so the
# prod distribution can be reproduced deterministically.
_DIM = 768


def _query_vector():
    vec = [0.0] * _DIM
    vec[0] = 1.0
    return vec


def _vector_with_cosine(cosine, axis):
    """Unit vector whose cosine with _query_vector() is exactly `cosine`."""
    vec = [0.0] * _DIM
    vec[0] = cosine
    vec[axis] = math.sqrt(1.0 - cosine * cosine)
    return vec


def _set_embedding(db, poi_id, vec):
    """Write the unmapped pgvector column directly (as the backfill does)."""
    db.execute(
        text("UPDATE points_of_interest SET embedding = cast(:v as vector) WHERE id = :id"),
        {"v": str(list(vec)), "id": str(poi_id)},
    )
    db.commit()


class _FixedVectorClient:
    """Embedding client stub: every query embeds to the same known vector."""

    enabled = True
    base_url = "stub://vectors"

    def embed(self, text_value, kind="document"):
        return _query_vector()

    def embed_batch(self, texts, kind="document"):
        return [_query_vector() for _ in (texts or [])]


class TestIssue140EventSearchRelevance:
    def test_semantic_search_does_not_return_every_event(
        self, db_session, mock_embedding_client, app_client
    ):
        """With embeddings live, unrelated events must NOT ride the semantic
        signal into a "farmers market" + Events search."""
        app_client.app.state.embedding_client = mock_embedding_client
        target, others = _seed_events(db_session)
        _embed_all(db_session, [target, *others])

        names = _names(_search(app_client, "farmers market", poi_type="EVENT"))
        assert "Pittsboro Farmers Market" in names
        assert [n for n, _ in _UNRELATED_EVENTS if n in names] == []

    def test_keyword_only_search_does_not_return_every_event(
        self, db_session, app_client
    ):
        """Fail-soft path (embedding service off) stays relevant as well."""
        _seed_events(db_session)

        names = _names(_search(app_client, "farmers market", poi_type="EVENT"))
        assert "Pittsboro Farmers Market" in names
        assert [n for n, _ in _UNRELATED_EVENTS if n in names] == []

    def test_query_matching_nothing_returns_empty(
        self, db_session, mock_embedding_client, app_client
    ):
        """A query nothing matches returns [], not the whole type listing."""
        app_client.app.state.embedding_client = mock_embedding_client
        target, others = _seed_events(db_session)
        _embed_all(db_session, [target, *others])

        assert _names(_search(app_client, "scuba diving lessons", poi_type="EVENT")) == []

    def test_prod_like_semantic_spread_does_not_return_every_event(
        self, db_session, app_client
    ):
        """The actual #140 repro: with EmbeddingGemma-like cosines (target 0.75,
        unrelated 0.40) the old max-normalized signal ranked every event."""
        target, others = _seed_events(db_session)
        _set_embedding(db_session, target.id, _vector_with_cosine(0.75, 1))
        for i, poi in enumerate(others):
            _set_embedding(db_session, poi.id, _vector_with_cosine(0.40, i + 2))
        app_client.app.state.embedding_client = _FixedVectorClient()

        names = _names(_search(app_client, "farmers market", poi_type="EVENT"))
        assert "Pittsboro Farmers Market" in names
        assert [n for n, _ in _UNRELATED_EVENTS if n in names] == []

    def test_strong_semantic_only_match_survives(self, db_session, app_client):
        """Precision fix must not kill semantic recall: a POI with a strong
        embedding match and NO lexical overlap is still returned."""
        target, others = _seed_events(db_session)
        semantic_only = orm_create_event(
            db_session,
            name="Zzz Gathering",  # no lexical overlap with the query at all
            published=True,
            description_long="Neighbours trade home grown vegetables every Saturday.",
            event_fields={"start_datetime": _FUTURE},
        )
        db_session.commit()

        _set_embedding(db_session, target.id, _vector_with_cosine(0.75, 1))
        _set_embedding(db_session, semantic_only.id, _vector_with_cosine(0.70, 2))
        for i, poi in enumerate(others):
            _set_embedding(db_session, poi.id, _vector_with_cosine(0.40, i + 3))
        app_client.app.state.embedding_client = _FixedVectorClient()

        names = _names(_search(app_client, "farmers market", poi_type="EVENT"))
        assert "Zzz Gathering" in names
        assert [n for n, _ in _UNRELATED_EVENTS if n in names] == []

    def test_semantic_signal_drops_weak_neighbours(self, db_session, app_client):
        """Unit view of the same fix: the signal itself must not score a
        below-threshold neighbour."""
        from app.search.search_engine import _signal_semantic
        from app.search.constants import SEMANTIC_SIMILARITY_THRESHOLD

        target, others = _seed_events(db_session)
        _set_embedding(db_session, target.id, _vector_with_cosine(0.75, 1))
        for i, poi in enumerate(others):
            _set_embedding(db_session, poi.id, _vector_with_cosine(0.40, i + 2))

        scores = _signal_semantic(
            db_session, "farmers market", "EVENT", _FixedVectorClient()
        )
        assert set(scores) == {str(target.id)}
        # 0.75 rescaled out of [threshold, 1], not normalized to 1.0
        expected = (0.75 - SEMANTIC_SIMILARITY_THRESHOLD) / (
            1.0 - SEMANTIC_SIMILARITY_THRESHOLD
        )
        assert scores[str(target.id)] == pytest.approx(expected, abs=1e-3)


# ---------------------------------------------------------------------------
# #137: well-known amenity phrases filter on the icon_* booleans
# ---------------------------------------------------------------------------

def _seed_amenities(db):
    """A POI that really has the amenities + one that only TALKS about them."""
    flagged = orm_create_business(
        db,
        name="Quiet Corner Cafe",
        published=True,
        icon_pet_friendly=True,
        icon_free_wifi=True,
        icon_public_restroom=True,
        icon_wheelchair_accessible=True,
    )
    unflagged = orm_create_business(
        db,
        name="Iron Anvil Hardware",
        published=True,
        description_long=(
            "A pet friendly, wheelchair accessible shop with free wifi "
            "and a public restroom nearby."
        ),
    )
    db.commit()
    return flagged, unflagged


class TestIssue137AmenityPhraseFilters:
    @pytest.mark.parametrize(
        "query",
        ["pet friendly", "Pet-Friendly", "PET FRIENDLY", "pet_friendly", "dog friendly"],
    )
    def test_pet_friendly_phrases(self, db_session, app_client, query):
        _seed_amenities(db_session)
        names = _names(_search(app_client, query))
        assert names == ["Quiet Corner Cafe"]

    @pytest.mark.parametrize(
        "query", ["wheelchair accessible", "Wheelchair-Accessible", "wheelchair"]
    )
    def test_wheelchair_phrases(self, db_session, app_client, query):
        _seed_amenities(db_session)
        names = _names(_search(app_client, query))
        assert names == ["Quiet Corner Cafe"]

    @pytest.mark.parametrize("query", ["wifi", "free wifi", "Free Wi-Fi"])
    def test_wifi_phrases(self, db_session, app_client, query):
        _seed_amenities(db_session)
        names = _names(_search(app_client, query))
        assert names == ["Quiet Corner Cafe"]

    @pytest.mark.parametrize(
        "query", ["restroom", "restrooms", "public restroom", "Public Restrooms"]
    )
    def test_restroom_phrases(self, db_session, app_client, query):
        _seed_amenities(db_session)
        names = _names(_search(app_client, query))
        assert names == ["Quiet Corner Cafe"]

    def test_amenity_phrase_respects_poi_type(self, db_session, app_client):
        orm_create_park(db_session, name="Riverbend Park", published=True,
                        icon_pet_friendly=True)
        orm_create_business(db_session, name="Quiet Corner Cafe", published=True,
                            icon_pet_friendly=True)
        db_session.commit()

        assert _names(_search(app_client, "pet friendly", poi_type="PARK")) == [
            "Riverbend Park"
        ]

    def test_amenity_phrase_excludes_drafts(self, db_session, app_client):
        orm_create_business(db_session, name="Draft Pet Cafe", published=False,
                            icon_pet_friendly=True)
        orm_create_business(db_session, name="Live Pet Cafe", published=True,
                            icon_pet_friendly=True)
        db_session.commit()

        assert _names(_search(app_client, "pet friendly")) == ["Live Pet Cafe"]

    def test_amenity_phrase_with_no_matches_is_empty(self, db_session, app_client):
        """Nothing carries the flag: an honest empty result, not a text match."""
        orm_create_business(
            db_session, name="Iron Anvil Hardware", published=True,
            description_long="A pet friendly shop where dogs are always welcome.",
        )
        db_session.commit()

        assert _names(_search(app_client, "pet friendly")) == []

    def test_amenity_phrase_still_hides_past_events(self, db_session, app_client):
        orm_create_event(
            db_session, name="Old Dog Parade", published=True, icon_pet_friendly=True,
            event_fields={"start_datetime": _PAST, "end_datetime": _PAST + timedelta(hours=4)},
        )
        orm_create_event(
            db_session, name="New Dog Parade", published=True, icon_pet_friendly=True,
            event_fields={"start_datetime": _FUTURE},
        )
        db_session.commit()

        names = _names(_search(app_client, "pet friendly", poi_type="EVENT"))
        assert names == ["New Dog Parade"]

    def test_longer_query_still_uses_text_ranking(self, db_session, app_client):
        """Only a query that IS the phrase becomes a flag filter. A richer query
        keeps going through the normal ranked path."""
        orm_create_business(
            db_session, name="Iron Anvil Hardware", published=True,
            description_long="A pet friendly hardware shop with a wide aisle.",
        )
        db_session.commit()

        names = _names(_search(app_client, "pet friendly hardware"))
        assert "Iron Anvil Hardware" in names


# ---------------------------------------------------------------------------
# #127: search suggestions must not surface events that already happened
# ---------------------------------------------------------------------------

class TestIssue127PastEventsInSuggestions:
    @pytest.mark.parametrize("endpoint", _SEARCH_ENDPOINTS)
    def test_past_event_excluded_from_suggestions(self, db_session, app_client, endpoint):
        orm_create_event(
            db_session, name="Riverbend Craft Fair Spring", published=True,
            event_fields={
                "start_datetime": _PAST,
                "end_datetime": _PAST + timedelta(hours=6),
            },
        )
        orm_create_event(
            db_session, name="Riverbend Craft Fair Autumn", published=True,
            event_fields={"start_datetime": _FUTURE},
        )
        db_session.commit()

        names = _names(_search(app_client, "Riverbend Craft Fair", endpoint=endpoint))
        assert "Riverbend Craft Fair Autumn" in names
        assert "Riverbend Craft Fair Spring" not in names

    def test_past_event_without_end_datetime_excluded(self, db_session, app_client):
        orm_create_event(
            db_session, name="Riverbend Craft Fair Spring", published=True,
            event_fields={"start_datetime": _PAST, "end_datetime": None},
        )
        db_session.commit()

        assert _names(_search(app_client, "Riverbend Craft Fair")) == []

    def test_event_started_earlier_today_still_suggested(self, db_session, app_client):
        """"Past" is measured from the start of today, so an event that began
        this morning is still happening today."""
        orm_create_event(
            db_session, name="Riverbend Craft Fair Today", published=True,
            event_fields={
                "start_datetime": _TODAY_START + timedelta(minutes=1),
                "end_datetime": None,
            },
        )
        db_session.commit()

        assert _names(_search(app_client, "Riverbend Craft Fair")) == [
            "Riverbend Craft Fair Today"
        ]

    def test_ongoing_multi_day_event_suggested(self, db_session, app_client):
        orm_create_event(
            db_session, name="Riverbend Craft Fair Week", published=True,
            event_fields={"start_datetime": _PAST, "end_datetime": _FUTURE},
        )
        db_session.commit()

        assert _names(_search(app_client, "Riverbend Craft Fair")) == [
            "Riverbend Craft Fair Week"
        ]

    def test_repeating_event_with_open_pattern_suggested(self, db_session, app_client):
        """A weekly market that started last year is still running."""
        orm_create_event(
            db_session, name="Riverbend Craft Fair Weekly", published=True,
            event_fields={
                "start_datetime": _PAST,
                "end_datetime": _PAST + timedelta(hours=4),
                "is_repeating": True,
                "repeat_pattern": {"frequency": "weekly", "interval": 1},
                "recurrence_end_date": None,
            },
        )
        db_session.commit()

        assert _names(_search(app_client, "Riverbend Craft Fair")) == [
            "Riverbend Craft Fair Weekly"
        ]

    def test_repeating_event_with_finished_recurrence_excluded(self, db_session, app_client):
        orm_create_event(
            db_session, name="Riverbend Craft Fair Retired", published=True,
            event_fields={
                "start_datetime": _PAST - timedelta(days=90),
                "is_repeating": True,
                "repeat_pattern": {"frequency": "weekly", "interval": 1},
                "recurrence_end_date": _PAST,
            },
        )
        db_session.commit()

        assert _names(_search(app_client, "Riverbend Craft Fair")) == []

    def test_cancelled_future_event_excluded(self, db_session, app_client):
        orm_create_event(
            db_session, name="Riverbend Craft Fair Cancelled", published=True,
            event_fields={"start_datetime": _FUTURE, "event_status": "Canceled"},
        )
        db_session.commit()

        assert _names(_search(app_client, "Riverbend Craft Fair")) == []

    def test_non_event_pois_unaffected(self, db_session, app_client):
        orm_create_business(db_session, name="Riverbend Craft Supply", published=True)
        db_session.commit()

        assert _names(_search(app_client, "Riverbend Craft Supply")) == [
            "Riverbend Craft Supply"
        ]

    def test_past_event_still_reachable_directly(self, db_session, app_client):
        """Only search/browse hides past events; direct links keep working."""
        past = orm_create_event(
            db_session, name="Riverbend Craft Fair Archive", published=True,
            slug="riverbend-craft-fair-archive",
            event_fields={
                "start_datetime": _PAST,
                "end_datetime": _PAST + timedelta(hours=6),
            },
        )
        db_session.commit()

        resp = app_client.get(f"/api/pois/{past.id}")
        assert resp.status_code == 200
        assert resp.json()["name"] == "Riverbend Craft Fair Archive"
