# app/search/search_engine.py
"""
Multi-signal search engine.

Pulls candidates from multiple PostgreSQL queries, scores each signal
independently, then merges and re-ranks in Python.
"""

import re
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import text

from .query_processor import parse_query, ParsedQuery
from .constants import (
    AMENITY_FLAG_PHRASES,
    SIGNAL_WEIGHTS,
    MIN_ABSOLUTE_SCORE,
    RELATIVE_SCORE_THRESHOLD,
    SEMANTIC_SIMILARITY_THRESHOLD,
    TRIGRAM_SIMILARITY_THRESHOLD,
)

# Defense-in-depth: any field name we interpolate into raw SQL must be a plain
# identifier. Even though the per-signal allowlists already enforce a closed
# set, this guards against a future code change that adds a new field without
# whitelisting it. If a non-identifier ever reaches the SQL builder, drop it.
_IDENT_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def _safe_ident(name: str) -> Optional[str]:
    """Return name only if it's a bare SQL identifier; otherwise None."""
    if not isinstance(name, str):
        return None
    return name if _IDENT_RE.fullmatch(name) else None


# Closed set of the boolean columns an amenity phrase may filter on.
_AMENITY_FLAG_COLUMNS = frozenset(AMENITY_FLAG_PHRASES.values())

# Everything that isn't a letter or digit collapses to a single space, so
# "Pet-Friendly", "PET FRIENDLY!" and "pet_friendly" all normalize to the same
# lookup key.
_NON_WORD_RE = re.compile(r"[^a-z0-9]+")


def amenity_flag_column(query: str) -> Optional[str]:
    """Return the icon_* column for a query that IS a known amenity phrase.

    Only a query essentially EQUAL to the phrase counts (Issue #137). A richer
    query like "pet friendly cafe in Pittsboro" keeps going through the normal
    ranked path, where the phrase still contributes a structured-filter signal.
    """
    if not query:
        return None
    normalized = _NON_WORD_RE.sub(" ", query.strip().lower()).strip()
    return AMENITY_FLAG_PHRASES.get(normalized)


def multi_signal_search(
    db: Session,
    query: str,
    limit: int = 10,
    poi_type: Optional[str] = None,
    client=None,
) -> list:
    """
    Run multi-signal search and return ranked POI objects.

    Args:
        db: Database session
        query: User search query
        limit: Max results to return
        poi_type: Optional POI type filter (e.g. "BUSINESS")
        client: Shared embedding client (shared.embeddings.EmbeddingClient).
            When None or disabled, the semantic signal is skipped and search
            degrades to the keyword/full-text signals.

    Returns:
        List of PointOfInterest ORM objects, enriched with category info,
        sorted by combined score (best first).
    """
    if not query or not query.strip():
        return []

    parsed = parse_query(query)

    # An explicit poi_type (caller / filter pill) overrides any type hint the
    # query text implies. Track it separately from the effective type: it is
    # the only kind of type filter allowed to constrain the name-match signals
    # below (Issue #166).
    explicit_type = poi_type.upper() if poi_type else None
    effective_type = explicit_type or parsed.poi_type_hint

    # Issue #137: "pet friendly" (and friends) is a filter, not a phrase to
    # fuzzy-match. Answer it from the computed amenity boolean and stop —
    # ranking POIs that merely mention the words is exactly the reported bug.
    flag_column = amenity_flag_column(query)
    if flag_column:
        return _amenity_flag_results(db, flag_column, effective_type, limit)

    # Collect candidate POI IDs with per-signal scores
    # Each signal returns {poi_id: score} where score is 0..1
    candidates = {}  # poi_id -> {signal_name: score}

    # --- Signal 1 & 2: Exact + trigram name match ---
    # Issue #166: a query word can imply a type ("market" -> EVENT) even when
    # the query is actually the exact name of a POI of a different type
    # ("Riverside Market", a business). An INFERRED type must not hide a name
    # hit that strong, so these two signals only honor an EXPLICIT type filter
    # (a caller-passed poi_type / filter pill); the inferred hint still shapes
    # every other signal below.
    exact_scores = _signal_exact_name(db, parsed.original_query, explicit_type)
    _merge_scores(candidates, "exact_name", exact_scores)

    keyword_scores = _signal_keyword_name(db, parsed.original_query, explicit_type)
    _merge_scores(candidates, "keyword_name", keyword_scores)

    # --- Signal 3: Full-text search (tsvector) ---
    fulltext_scores = _signal_fulltext(db, parsed.original_query, effective_type)
    _merge_scores(candidates, "fulltext", fulltext_scores)

    # --- Signal 4: Semantic (pgvector) ---
    semantic_scores = _signal_semantic(db, parsed.semantic_query, effective_type, client)
    _merge_scores(candidates, "semantic", semantic_scores)

    # --- Signal 5: Structured filter match ---
    if parsed.extracted_filters:
        filter_scores = _signal_structured_filters(db, parsed.extracted_filters, effective_type)
        _merge_scores(candidates, "structured_filter", filter_scores)

    # --- Signal 6: Type/city contextual boost ---
    if effective_type or parsed.location_hint:
        boost_scores = _signal_type_city_boost(
            db, candidates.keys(), effective_type, parsed.location_hint
        )
        _merge_scores(candidates, "type_city_boost", boost_scores)

    if not candidates:
        return []

    # --- Score merging ---
    scored = []
    for poi_id, signals in candidates.items():
        total = 0.0
        for signal_name, weight in SIGNAL_WEIGHTS.items():
            total += signals.get(signal_name, 0.0) * weight
        scored.append((poi_id, total))

    # Sort by score descending
    scored.sort(key=lambda x: x[1], reverse=True)

    # Dynamic threshold: drop below 20% of top score, minimum 0.05
    if scored:
        top_score = scored[0][1]
        threshold = max(top_score * RELATIVE_SCORE_THRESHOLD, MIN_ABSOLUTE_SCORE)
        scored = [(pid, s) for pid, s in scored if s >= threshold]

    # Limit
    scored = scored[:limit]

    if not scored:
        return []

    return _load_pois_in_order(db, [pid for pid, _ in scored])


def _load_pois_in_order(db: Session, poi_ids: list) -> list:
    """Fetch full ORM objects for poi_ids, preserving the given order."""
    from ..crud.crud_poi import _enrich_poi_with_category_info
    from .. import models

    if not poi_ids:
        return []

    pois = db.query(models.poi.PointOfInterest).filter(
        models.poi.PointOfInterest.id.in_(poi_ids)
    ).all()

    # Sort by the caller's order (the IN clause doesn't preserve it)
    poi_map = {str(p.id): p for p in pois}
    ordered = []
    for pid in poi_ids:
        poi = poi_map.get(pid)
        if poi:
            _enrich_poi_with_category_info(db, poi)
            ordered.append(poi)

    return ordered


def _amenity_flag_results(
    db: Session, flag_column: str, poi_type: Optional[str], limit: int
) -> list:
    """Return published POIs whose amenity boolean is true (Issue #137)."""
    if flag_column not in _AMENITY_FLAG_COLUMNS:
        return []
    column = _safe_ident(flag_column)
    if column is None:
        return []

    type_filter = "AND poi_type = :poi_type" if poi_type else ""
    sql = text(f"""
        SELECT id::text FROM points_of_interest
        WHERE publication_status = 'published'
        AND {column} IS TRUE
        {type_filter}
        ORDER BY name
        LIMIT :limit
    """)
    params = {"limit": limit}
    if poi_type:
        params["poi_type"] = poi_type
    try:
        rows = db.execute(sql, params).fetchall()
    except Exception as e:
        print(f"[SEARCH] Amenity flag search error: {e}")
        db.rollback()
        return []

    return _load_pois_in_order(db, [row[0] for row in rows])


# ---------------------------------------------------------------------------
# Signal functions
# ---------------------------------------------------------------------------

def _signal_exact_name(db: Session, query: str, poi_type: Optional[str]) -> dict:
    """Exact (case-insensitive) name match. Returns score 1.0 for matches."""
    type_filter = "AND poi_type = :poi_type" if poi_type else ""
    sql = text(f"""
        SELECT id::text FROM points_of_interest
        WHERE publication_status = 'published'
        AND LOWER(name) = LOWER(:query)
        {type_filter}
        LIMIT 5
    """)
    params = {"query": query}
    if poi_type:
        params["poi_type"] = poi_type
    try:
        rows = db.execute(sql, params).fetchall()
        return {row[0]: 1.0 for row in rows}
    except Exception as e:
        print(f"[SEARCH] Exact name signal error: {e}")
        db.rollback()
        return {}


def _signal_keyword_name(db: Session, query: str, poi_type: Optional[str]) -> dict:
    """Trigram similarity on name. Returns the raw similarity as the score.

    The score is deliberately NOT divided by the batch maximum: pg_trgm
    similarity is already an absolute 0..1 quality measure, and normalizing by
    the best row promoted the best of a bad batch to a perfect score (#140).
    """
    type_filter = "AND poi_type = :poi_type" if poi_type else ""
    sql = text(f"""
        SELECT id::text,
               similarity(name, :query) AS sim
        FROM points_of_interest
        WHERE publication_status = 'published'
        AND similarity(name, :query) > :threshold
        {type_filter}
        ORDER BY sim DESC
        LIMIT 30
    """)
    params = {"query": query, "threshold": TRIGRAM_SIMILARITY_THRESHOLD}
    if poi_type:
        params["poi_type"] = poi_type
    try:
        rows = db.execute(sql, params).fetchall()
        return {row[0]: float(row[1]) for row in rows}
    except Exception as e:
        print(f"[SEARCH] Keyword name signal error: {e}")
        db.rollback()
        return {}


def _signal_fulltext(db: Session, query: str, poi_type: Optional[str]) -> dict:
    """Full-text search using tsvector/tsquery. Returns ts_rank score."""
    # Check if search_document column exists
    try:
        col_check = db.execute(text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'points_of_interest' AND column_name = 'search_document'"
        )).fetchone()
        if not col_check:
            return {}
    except Exception:
        db.rollback()
        return {}

    type_filter = "AND poi_type = :poi_type" if poi_type else ""
    sql = text(f"""
        SELECT id::text,
               ts_rank(search_document, websearch_to_tsquery('english', :query)) AS rank
        FROM points_of_interest
        WHERE publication_status = 'published'
        AND search_document @@ websearch_to_tsquery('english', :query)
        {type_filter}
        ORDER BY rank DESC
        LIMIT 30
    """)
    params = {"query": query}
    if poi_type:
        params["poi_type"] = poi_type
    try:
        rows = db.execute(sql, params).fetchall()
        if not rows:
            return {}
        max_rank = max(row[1] for row in rows) or 1.0
        return {row[0]: row[1] / max_rank for row in rows}
    except Exception as e:
        print(f"[SEARCH] Full-text signal error: {e}")
        db.rollback()
        return {}


def _signal_semantic(
    db: Session, query: str, poi_type: Optional[str], client
) -> dict:
    """Semantic search using pgvector embeddings."""
    if client is None:
        return {}

    # Check embedding column exists
    try:
        col_check = db.execute(text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'points_of_interest' AND column_name = 'embedding'"
        )).fetchone()
        if not col_check:
            return {}
    except Exception:
        db.rollback()
        return {}

    # The shared client is fail-soft: it returns None (never raises) on a
    # disabled client, transport error, or bad vector. Bail to keyword search.
    query_embedding = client.embed(query, kind="query")
    if query_embedding is None:
        return {}

    type_filter = "AND poi_type = :poi_type" if poi_type else ""
    sql = text(f"""
        SELECT id::text,
               1 - (embedding <=> cast(:query_embedding as vector)) AS similarity
        FROM points_of_interest
        WHERE publication_status = 'published'
        AND embedding IS NOT NULL
        AND (1 - (embedding <=> cast(:query_embedding as vector))) >= :threshold
        {type_filter}
        ORDER BY embedding <=> cast(:query_embedding as vector)
        LIMIT 30
    """)
    params = {
        "query_embedding": str(list(query_embedding)),
        "threshold": SEMANTIC_SIMILARITY_THRESHOLD,
    }
    if poi_type:
        params["poi_type"] = poi_type
    try:
        rows = db.execute(sql, params).fetchall()
        if not rows:
            return {}
        # Rescale [threshold, 1] -> [0, 1] instead of dividing by the batch
        # maximum. Normalizing by the best row made the worst neighbour of a
        # bad batch look like a strong match, which is why a type-filtered
        # search returned every row of that type (#140). Rescaling keeps a
        # borderline match borderline, so the merge thresholds can drop it.
        span = 1.0 - SEMANTIC_SIMILARITY_THRESHOLD
        return {
            row[0]: max((float(row[1]) - SEMANTIC_SIMILARITY_THRESHOLD) / span, 0.0)
            for row in rows
        }
    except Exception as e:
        print(f"[SEARCH] Semantic signal error: {e}")
        db.rollback()
        return {}


def _signal_structured_filters(
    db: Session, filters: list, poi_type: Optional[str]
) -> dict:
    """
    Score POIs that match extracted structured filters.

    For JSONB array fields, checks if any of the expected values are contained.
    For boolean fields, checks True.
    For text fields (values=None), checks IS NOT NULL and non-empty.
    """
    if not filters:
        return {}

    # Build WHERE conditions for each filter
    conditions = []
    params = {}
    type_filter = "AND poi_type = :poi_type" if poi_type else ""
    if poi_type:
        params["poi_type"] = poi_type

    for i, filt in enumerate(filters):
        # Two-layer guard: (1) closed allowlist of known column names, then
        # (2) regex sanity-check on the identifier so a future entry can't
        # accidentally inject something like "name; DROP TABLE x".
        allowed_fields = {
            # wheelchair_accessible removed (Issue #45 PR2 Migration B — column dropped)
            "pet_options", "wifi_options", "public_toilets",
            "entertainment_options", "business_amenities", "youth_amenities",
            "alcohol_options", "parking_types", "facilities_options",
            "playground_available", "fishing_allowed", "hunting_fishing_allowed",
            "cost", "camping_lodging",
        }
        if filt.field not in allowed_fields:
            continue
        field_name = _safe_ident(filt.field)
        if field_name is None:
            continue

        if filt.values is None:
            # Text field: just check non-empty
            conditions.append(f"({field_name} IS NOT NULL AND {field_name} != '')")
        elif filt.values == [True]:
            conditions.append(f"{field_name} = true")
        else:
            # JSONB array: check if any value is contained
            # Use ?| operator for JSONB arrays
            param_name = f"vals_{i}"
            conditions.append(f"{field_name}::jsonb ?| :{param_name}")
            params[param_name] = filt.values

    if not conditions:
        return {}

    # Count how many filters each POI matches
    case_parts = []
    for cond in conditions:
        case_parts.append(f"CASE WHEN {cond} THEN 1 ELSE 0 END")

    score_expr = " + ".join(case_parts)
    num_filters = len(conditions)

    sql = text(f"""
        SELECT id::text,
               ({score_expr})::float / {num_filters} AS match_score
        FROM points_of_interest
        WHERE publication_status = 'published'
        AND ({' OR '.join(conditions)})
        {type_filter}
        ORDER BY match_score DESC
        LIMIT 50
    """)

    try:
        rows = db.execute(sql, params).fetchall()
        return {row[0]: row[1] for row in rows}
    except Exception as e:
        print(f"[SEARCH] Structured filter signal error: {e}")
        db.rollback()
        return {}


def _signal_type_city_boost(
    db: Session,
    candidate_ids,
    poi_type: Optional[str],
    location_hint: Optional[str],
) -> dict:
    """Small nudge for POIs matching the inferred type or location."""
    if not candidate_ids or (not poi_type and not location_hint):
        return {}

    ids = list(candidate_ids)
    if not ids:
        return {}

    conditions = []
    params = {"ids": tuple(ids)}

    if poi_type:
        conditions.append("CASE WHEN poi_type = :poi_type THEN 0.5 ELSE 0.0 END")
        params["poi_type"] = poi_type
    if location_hint:
        conditions.append(
            "CASE WHEN LOWER(address_city) = LOWER(:city) THEN 0.5 ELSE 0.0 END"
        )
        params["city"] = location_hint

    score_expr = " + ".join(conditions)
    divisor = len(conditions)

    sql = text(f"""
        SELECT id::text,
               ({score_expr}) / {divisor} AS boost
        FROM points_of_interest
        WHERE id::text = ANY(:ids)
    """)
    params["ids"] = ids

    try:
        rows = db.execute(sql, params).fetchall()
        return {row[0]: row[1] for row in rows}
    except Exception as e:
        print(f"[SEARCH] Type/city boost signal error: {e}")
        db.rollback()
        return {}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _merge_scores(candidates: dict, signal_name: str, scores: dict):
    """Merge a signal's scores into the candidates dict."""
    for poi_id, score in scores.items():
        if poi_id not in candidates:
            candidates[poi_id] = {}
        candidates[poi_id][signal_name] = float(score)
