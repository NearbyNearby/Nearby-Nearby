# Search System

## Overview

The Search System in nearby-app uses a **multi-signal search engine** that scores each POI across 6 independent signals, then combines them with tunable weights. A query processor first extracts amenity filters, POI type hints, location hints, and trail difficulty from natural language queries.

**Key Files:**
- `nearby-app/backend/app/search/search_engine.py` - Multi-signal scoring and merge logic
- `nearby-app/backend/app/search/query_processor.py` - Natural language query parsing
- `nearby-app/backend/app/search/constants.py` - Signal weights, synonyms, amenity patterns
- `nearby-app/backend/app/api/endpoints/pois.py` - Search API endpoints
- `nearby-app/backend/app/main.py` - Embedding client wiring (`app.state.embedding_client`), extension + tsvector index creation
- `shared/embeddings/` - Fail-soft TEI client + canonical searchable-text builder (shared by both backends)
- `nearby-app/app/src/components/SearchBar.jsx` - Frontend search with dropdown
- `nearby-app/app/src/pages/Explore.jsx` - Full-page search results

---

## Architecture

```
User Query: "pet friendly cafe with wifi near pittsboro"
                          │
                          ▼
              ┌─────────────────────┐
              │   Query Processor   │
              │   (parse_query)     │
              ├─────────────────────┤
              │ Extracted:          │
              │ - Filters: pet_     │
              │   options, wifi     │
              │ - Type: BUSINESS    │
              │ - Location: pitsboro│
              │ - Semantic: full    │
              │   original query    │
              └─────────┬───────────┘
                        │
                        ▼
    ┌─────────────────────────────────────────────┐
    │         Multi-Signal Search Engine            │
    ├─────────────────────────────────────────────┤
    │                                               │
    │  Signal 1: Exact Name Match (0.15)           │
    │  Signal 2: Trigram Name Similarity (0.15)    │
    │  Signal 3: Full-Text Search / tsvector (0.10)│
    │  Signal 4: Semantic / pgvector (0.45)        │
    │  Signal 5: Structured Filter Match (0.10)    │
    │  Signal 6: Type/City Contextual Boost (0.05) │
    │                                               │
    │  Total: 1.00                                  │
    ├─────────────────────────────────────────────┤
    │  Score Merge → Dynamic Threshold → Rank      │
    └─────────────────────────────────────────────┘
```

---

## The 6 Search Signals

### Signal 1: Exact Name Match (weight: 0.15)

Checks if the query exactly matches a POI name (case-insensitive). Returns score 1.0 for exact match, 0.0 otherwise. Ensures searching "Joe's Coffee" returns Joe's Coffee as #1.

### Signal 2: Trigram Name Similarity (weight: 0.15)

Uses PostgreSQL `pg_trgm` extension for fuzzy text matching on the `name` column. Handles typos and partial matches. Threshold: 0.15 similarity minimum.

```sql
SELECT id, similarity(name, 'query') as sim
FROM points_of_interest
WHERE name % 'query' AND publication_status = 'published'
ORDER BY sim DESC;
```

### Signal 3: Full-Text Search (weight: 0.10)

Uses a GENERATED tsvector column with English stemming. Created on startup:

```sql
ALTER TABLE points_of_interest
ADD COLUMN IF NOT EXISTS tsvector_col tsvector
GENERATED ALWAYS AS (to_tsvector('english', coalesce(name, '') || ' ' || coalesce(long_description, ''))) STORED;

CREATE INDEX IF NOT EXISTS idx_poi_tsvector ON points_of_interest USING gin(tsvector_col);
```

Searches using `ts_rank`:
```sql
SELECT id, ts_rank(tsvector_col, plainto_tsquery('english', 'query')) as rank
FROM points_of_interest
WHERE tsvector_col @@ plainto_tsquery('english', 'query')
  AND publication_status = 'published';
```

This catches description-only matches (e.g., searching "kayak" finds a park whose description mentions kayak rentals even if "kayak" isn't in the name).

### Signal 4: Semantic Search (weight: 0.45)

Uses pgvector ML embeddings from the `michaelfeil/embeddinggemma-300m` model (768-dim). The query is encoded **out-of-process** by a TEI embedding service (see "Embedding Service" below) via the shared fail-soft client, then nearest neighbors are found by cosine distance against the stored `embedding vector(768)` column.

```python
# nearby-app/backend/app/search/search_engine.py :: _signal_semantic
# `client` is app.state.embedding_client (shared.embeddings.EmbeddingClient).
query_embedding = client.embed(query, kind="query")  # prepends the query prefix
if query_embedding is None:
    return {}                                          # → keyword-only fallback

# pgvector cosine: 1 - (embedding <=> :query_embedding) AS similarity
# WHERE publication_status = 'published' AND embedding IS NOT NULL
# ORDER BY embedding <=> :query_embedding LIMIT 30
```

The signal is **gated three ways** and degrades silently to the other 5 signals when any fails:

1. `client is None` (model wiring failed at startup) → `{}`.
2. `embedding` column missing (checked against `information_schema.columns`) → `{}`.
3. `client.embed(...)` returns `None` — disabled client (`EMBEDDING_SERVICE_URL` unset), TEI down/timeout, or a wrong-dimension vector. The shared client never raises; it returns `None` and the signal returns `{}`.

This is why semantic search is **fail-soft**: with `EMBEDDING_SERVICE_URL` unset or the TEI service down, search still works (keyword + full-text + trigram), it just loses the semantic signal.

### Signal 5: Structured Filter Match (weight: 0.10)

The query processor extracts amenity filters from natural language. For each extracted filter, the engine checks if the POI's JSONB fields contain matching values.

Examples:
- "pet friendly" → checks `pet_options` is not empty
- "free wifi" → checks `wifi_options` contains "free"
- "wheelchair accessible" → checks `accessibility_features` is not empty

Patterns are defined in `constants.py` via `AMENITY_PATTERNS_STATIC` and dynamically loaded from `shared/constants/field_options.py`.

### Signal 6: Type/City Contextual Boost (weight: 0.05)

Small nudge for POIs matching the inferred type or city:
- If query processor detects type hint (e.g., "restaurant" → BUSINESS), matching POIs get a boost
- If a location hint is extracted (e.g., "near Pittsboro"), POIs in that city get a boost

---

## Query Processor

The `parse_query()` function extracts structured information from natural language:

```python
from app.search import parse_query

parsed = parse_query("easy hiking trail near siler city with restrooms")
# ParsedQuery(
#   original_query="easy hiking trail near siler city with restrooms",
#   semantic_query="easy hiking trail near siler city with restrooms",
#   extracted_filters=[ExtractedFilter(field="toilet_locations", values=None)],
#   poi_type_hint="TRAIL",
#   location_hint="siler city",
#   trail_difficulty_hint="easy"
# )
```

### Extraction Rules

| Feature | Pattern | Result |
|---------|---------|--------|
| Amenity filters | "pet friendly", "wifi", "wheelchair", "restrooms" | ExtractedFilter with field name |
| POI type hints | "restaurant", "cafe", "trail", "park", "event" | POIType enum value |
| Location hints | "near X", "in X", "around X", "by X" | City/location string |
| Trail difficulty | "easy", "moderate", "hard/difficult" | Difficulty level |

Synonyms are defined in `constants.py`:
- `POI_TYPE_SYNONYMS`: Maps words like "restaurant", "cafe", "eatery" → "BUSINESS"
- `TRAIL_DIFFICULTY_SYNONYMS`: Maps "beginner" → "easy", "challenging" → "hard"
- `LOCATION_PREFIXES`: {"near", "in", "around", "by"}

---

## Score Merging and Thresholding

After all 6 signals return their scores, the engine:

1. **Weighted combine**: For each POI, compute `sum(signal_score * signal_weight)`
2. **Dynamic threshold**: Drop any POI scoring below 20% of the top result (minimum absolute: 0.02)
3. **Sort**: Return results ordered by combined score, descending

Constants from `constants.py` (must sum to 1.0):
```python
SIGNAL_WEIGHTS = {
    "semantic": 0.45,
    "keyword_name": 0.15,
    "fulltext": 0.10,
    "exact_name": 0.15,
    "structured_filter": 0.10,
    "type_city_boost": 0.05,
}
MIN_ABSOLUTE_SCORE = 0.02
RELATIVE_SCORE_THRESHOLD = 0.20
TRIGRAM_SIMILARITY_THRESHOLD = 0.15
SEMANTIC_SIMILARITY_THRESHOLD = 0.45  # issue #140
```

`SEMANTIC_SIMILARITY_THRESHOLD` (issue #140) is the cosine floor for the
semantic signal: rows below it are excluded in SQL, and surviving scores are
rescaled `(sim - T) / (1 - T)` instead of being normalized by the batch
maximum (which used to promote the best of a bad batch to ~1.0 and surface
every POI of the filtered type). It is the main relevance knob: lower it
(~0.35) for more recall, raise it (~0.55) for more precision.

**Amenity-flag short circuit** (issue #137): a query that IS a known amenity
phrase (after normalizing case/hyphens/underscores), e.g. "pet friendly",
"free wifi", "wheelchair accessible", skips ranking entirely and filters on
the corresponding computed boolean (`icon_pet_friendly`, `icon_free_wifi`,
`icon_wheelchair_accessible`, `icon_public_restroom`), still applying the
published filter and any type filter. See `AMENITY_FLAG_PHRASES` /
`amenity_flag_column()` in `constants.py`. This is distinct from the older
`AMENITY_PATTERNS_STATIC` mechanism, which extracts amenity terms out of
LONGER queries as one weighted signal among six; the short circuit only fires
when the whole query is essentially the phrase itself.

`multi_signal_search(db, query, limit, poi_type, client)` runs all 6 signals, weight-combines them per POI, applies the dynamic threshold, and returns ranked ORM objects. The semantic `client` is threaded through from `app.state.embedding_client`; when it is `None`/disabled the blend is purely the 5 keyword signals.

---

## API Endpoints

### GET /api/pois/search

Keyword search with pg_trgm.

```
GET /api/pois/search?q=coffee&limit=10
```

### GET /api/pois/semantic-search

ML-powered natural language search.

```
GET /api/pois/semantic-search?q=place%20to%20work%20on%20laptop&limit=10
```

### GET /api/pois/hybrid-search

Multi-signal combined search (the primary search endpoint).

```
GET /api/pois/hybrid-search?q=pet+friendly+cafe+with+wifi&limit=10&poi_type=BUSINESS
```

Query Parameters:
- `q` (string): Search query
- `limit` (int): Max results (default: 10)
- `poi_type` (string, optional): Filter by POI type

Response:
```json
[
  {
    "id": "uuid",
    "name": "Joe's Coffee",
    "slug": "joes-coffee-pittsboro",
    "poi_type": "BUSINESS",
    "address_city": "Pittsboro",
    "similarity": 0.85
  }
]
```

---

## Frontend Search UX

### Search Bar Behavior

1. **Typing**: Debounced (300ms) hybrid search → dropdown shows results with POI type badges
2. **Enter key / Search button**: Navigates to `/explore?q=query` for full-page results
3. **Dropdown footer**: "Search in Explore" CTA + "Can't find it?" → links to Claim Business page
4. **Arrow keys**: Navigate dropdown results; Enter selects

### Explore Page Search Mode

When `/explore?q=query&type=PARK` is loaded:
- Calls `/api/pois/hybrid-search` with query and optional type filter
- Shows results in grid layout with NearbyFilters (light variant)
- Filter pills (All / Businesses / Events / Parks / Trails) update the `type` URL param

### Hero Filter Pills

The homepage Hero section has quick-filter pills that link to `/explore?type=BUSINESS` etc.

---

## Embedding Service (TEI)

The embedding model is no longer loaded in-process. It runs as a **separate
[Text Embeddings Inference (TEI)](https://huggingface.co/docs/text-embeddings-inference)
service** and is consumed over HTTP by a thin, fail-soft client. This removed
`torch` / `sentence-transformers` (~1GB) from the nearby-app image and put the
app back on CI builds.

| Aspect | Value |
|--------|-------|
| Server | `ghcr.io/huggingface/text-embeddings-inference:cpu-1.8.1` (TEI 1.8.1, CPU) |
| Model | `michaelfeil/embeddinggemma-300m` (ungated EmbeddingGemma mirror, no HF token) |
| Dimension | **768** (matches the `vector(768)` column + HNSW index) |
| Wire contract | `POST {base}/embed` with `{"inputs": [...], "normalize": true, "truncate": false}` → array-of-arrays |
| Discovery | `EMBEDDING_SERVICE_URL` env var; local `http://embedding:80`, prod `http://embedding.<namespace>:80` (ECS Service Connect) |

**Key files:**
- `shared/embeddings/client.py` — `EmbeddingClient` + `get_embedding_client()` singleton
- `shared/embeddings/text_builder.py` — canonical `build_searchable_text(...)` / `build_searchable_text_from_orm(poi)`
- `nearby-admin/backend/app/crud/embedding_writer.py` — embed-on-write
- `nearby-admin/backend/scripts/backfill_embeddings.py` — bulk (re)embed

### The shared client (`shared.embeddings`)

Both backends import `from shared.embeddings import get_embedding_client`. The
client is deliberately fail-soft (the rest of the codebase relies on this):

- **Disabled when `EMBEDDING_SERVICE_URL` is unset/empty** → `embed()` returns
  `None` with **no network call**. Callers fall back to keyword search.
- **Never raises.** On any error (timeout, connection refused, non-2xx,
  malformed JSON, wrong vector dimension) it logs once and returns `None`.
- **Defensively L2-normalizes** every returned vector so cosine-distance SQL is
  correct even if the server did not normalize, and rejects (returns `None` for)
  any vector whose length ≠ 768.
- The singleton reads `EMBEDDING_SERVICE_URL` and `EMBEDDING_MODEL` (model id is
  informational only — TEI serves one model per container).

### Asymmetric query/document prompts

EmbeddingGemma is trained for **asymmetric, task-prefixed** encoding: queries and
documents must get different prefixes or retrieval quality drops sharply. The
shared client prepends the prefix by `kind` **before** sending to TEI (and calls
`/embed` without `prompt_name` so TEI does not double-apply a prefix):

| `kind` | Prefix prepended | Used by |
|--------|------------------|---------|
| `"query"` | `task: search result \| query: ` | `_signal_semantic` (search time) |
| `"document"` | `title: none \| text: ` | embed-on-write + backfill |

### Write path — embed-on-write (admin)

`embedding_writer.write_embedding_best_effort(db, poi_id)` is called **after**
the commit on POI create, update, and (text-relevant) autosave in nearby-admin.
It is best-effort by contract:

- Reloads the POI on a **fresh session** with the trail/event/business/category
  joins, builds the document text via `build_searchable_text_from_orm`, and
  embeds with `kind="document"`.
- Writes with raw SQL in its **own transaction** —
  `UPDATE points_of_interest SET embedding = CAST(:e AS vector) WHERE id = :id`
  (the `embedding` column is intentionally **not** ORM-mapped). This can never
  roll back or corrupt the already-committed POI row.
- **Swallows all errors.** If TEI is unconfigured or down, the write is a clean
  no-op and the POI save still succeeds; the backfill self-heals later.
- Autosave only re-embeds when a field in `EMBED_RELEVANT_FIELDS` changed
  (`should_reembed`), so it does not re-embed on every keystroke-batch.

### The canonical searchable text

`build_searchable_text` assembles a pipe-joined string from name, type,
categories, descriptions, business/youth/entertainment amenities, accessibility
& wifi/pet/toilet features, park facilities/things-to-do/natural-features,
trail difficulty/length/route/surfaces/experiences, event venue settings,
business price range, cost/pricing, alcohol, discounts, and city. The
embed-on-write path and the backfill use the **same builder**, so write-time and
backfill embeddings are byte-identical.

---

## Generating Embeddings

The pgvector `embedding` column and its HNSW index are created by the Alembic
migration `k_embedding_001` (run on admin startup / `alembic upgrade head`).
Embeddings are written **on every POI create/update/autosave** in nearby-admin
(`embedding_writer.write_embedding_best_effort`). To (re)embed in bulk — e.g.
after a mass import or a text-builder change — run the admin backfill script,
which embeds through the out-of-process TEI service via `shared.embeddings`:

```bash
# From the nearby-admin backend (requires EMBEDDING_SERVICE_URL set to the TEI URL)
python scripts/backfill_embeddings.py --force   # re-embed ALL POIs
python scripts/backfill_embeddings.py           # only POIs WHERE embedding IS NULL
```

> The legacy in-process scripts `nearby-app/backend/add_embeddings_column.py`
> and `nearby-app/backend/generate_embeddings.py` were retired: the DDL now
> lives in migration `k_embedding_001` and the embedding logic in
> `shared/embeddings` + `nearby-admin/backend/scripts/backfill_embeddings.py`.

The embedding text now includes categories, amenities, facilities, and trail-specific info for richer semantic matching.

---

## Fallback Behavior

| Condition | Behavior |
|-----------|----------|
| No pgvector extension / no `embedding` column | Semantic signal returns empty; other 5 signals still work |
| No embeddings generated (`embedding IS NULL`) | Those POIs are excluded from the semantic signal only |
| `EMBEDDING_SERVICE_URL` unset | Client disabled; `embed()` returns `None` (no network); semantic signal skipped |
| TEI service down / timeout / bad vector | Client returns `None` (never raises); semantic signal skipped |
| Empty/nonsense query | Returns empty list (no crash) |
| Query too short (< 2 chars) | Frontend doesn't fire search |

---

## Performance Considerations

### Indexes

```sql
-- pg_trgm GIN indexes for fuzzy search
CREATE INDEX idx_poi_name_trgm ON points_of_interest USING gin (name gin_trgm_ops);
CREATE INDEX idx_poi_city_trgm ON points_of_interest USING gin (address_city gin_trgm_ops);

-- tsvector GIN index for full-text search
CREATE INDEX idx_poi_tsvector ON points_of_interest USING gin (tsvector_col);

-- pgvector HNSW index for vector search (created by migration k_embedding_001)
CREATE INDEX poi_embedding_hnsw_idx ON points_of_interest
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
```

### Caching

- The embedding client is a cheap, pooled HTTP singleton (no in-process model)
- tsvector column is GENERATED STORED (no runtime computation)
- Consider LRU cache for frequent queries

### Batch Processing

```python
# Bulk (re)embed through the TEI service, document prefix applied per item.
# Used by nearby-admin/backend/scripts/backfill_embeddings.py.
from shared.embeddings import get_embedding_client
client = get_embedding_client()
vectors = client.embed_batch(texts, kind="document")  # list[list[float] | None]
```
