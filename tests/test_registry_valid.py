"""Self-validation tests for the POI field registry.

These tests need NO database. They guard the integrity of
``shared/poi_fields.json`` against its meta-schema
(``shared/poi_fields.schema.json``) and against the other shared sources of
truth (``field_options.py``, the ``POIType`` enum), and they pin the PII fields
to the ``admin`` audience so a future edit can never silently leak them.

If the optional ``jsonschema`` package is installed (as in CI) the entries are
validated against the real Draft 2020-12 meta-schema. Otherwise a small
self-contained validator enforces the same constraints so the test still runs
in a bare environment.
"""

import json
import os
import re

import pytest

# ---------------------------------------------------------------------------
# Paths — resolved relative to this test file so cwd does not matter.
# ---------------------------------------------------------------------------
TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(TESTS_DIR, ".."))
REGISTRY_PATH = os.path.join(REPO_ROOT, "shared", "poi_fields.json")
SCHEMA_PATH = os.path.join(REPO_ROOT, "shared", "poi_fields.schema.json")

# Make ``shared`` importable without relying on conftest sys.path tweaks.
import sys

if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)


# ---------------------------------------------------------------------------
# Fixtures / module-level data
# ---------------------------------------------------------------------------
def _load_registry_raw():
    with open(REGISTRY_PATH, "r", encoding="utf-8") as fh:
        return json.load(fh)


def _load_schema():
    with open(SCHEMA_PATH, "r", encoding="utf-8") as fh:
        return json.load(fh)


# ---------------------------------------------------------------------------
# Minimal fallback validator (used only when ``jsonschema`` is unavailable).
# Enforces the same constraints the meta-schema declares for a field entry.
# ---------------------------------------------------------------------------
_REQUIRED_KEYS = [
    "key", "label", "type", "group", "order", "applies_to", "tier",
    "audience", "render", "icon", "value_source", "schema_org", "source",
    "computed", "card", "deprecated", "replaced_by",
]
_TYPE_ENUM = {
    "boolean", "enum", "multi", "text", "richtext", "url", "phone", "email",
    "money", "number", "date", "datetime", "geo", "image", "image[]",
    "relation", "list", "dict",
}
_TIER_ENUM = {"free", "paid", "any"}
_AUDIENCE_ENUM = {"public", "admin", "partner"}
_RENDER_ENUM = {"auto", "bespoke", "hidden"}
_POITYPE_ENUM = {
    "BUSINESS", "SERVICES", "PARK", "TRAIL", "EVENT", "YOUTH_ACTIVITIES",
    "JOBS", "VOLUNTEER_OPPORTUNITIES", "DISASTER_HUBS",
}
_KEY_RE = re.compile(r"^[a-z][a-z0-9_]*$")
_SOURCE_RE = re.compile(
    r"^(poi|business|park|trail|event)\.[a-z0-9_]+$"
    r"|^computed\.[a-z0-9_]+$"
    r"|^images:[a-z0-9_]+$"
    r"|^edges:[a-z0-9_]+$"  # Task 2.1: POI-to-POI links served from poi_relationships
    r"|^points:[a-z0-9_]+$"  # Task 2.3: point geometry served from poi_points
    r"|^lots:[a-z0-9_]+$"  # #90/#161: unified parking read (own pins ++ linked lots)
)


def _fallback_validate_entry(entry, idx):
    """Raise AssertionError describing the first constraint an entry violates."""
    where = f"entry[{idx}] key={entry.get('key')!r}"
    assert isinstance(entry, dict), f"{where}: not an object"

    # additionalProperties: false + required.
    extra = set(entry) - set(_REQUIRED_KEYS)
    assert not extra, f"{where}: unexpected keys {sorted(extra)}"
    missing = set(_REQUIRED_KEYS) - set(entry)
    assert not missing, f"{where}: missing required keys {sorted(missing)}"

    assert isinstance(entry["key"], str) and _KEY_RE.match(entry["key"]), (
        f"{where}: key fails pattern"
    )
    assert isinstance(entry["label"], str) and entry["label"], f"{where}: bad label"
    assert entry["type"] in _TYPE_ENUM, f"{where}: bad type {entry['type']!r}"
    assert isinstance(entry["group"], str) and entry["group"], f"{where}: bad group"
    assert isinstance(entry["order"], int) and not isinstance(entry["order"], bool), (
        f"{where}: order must be int"
    )

    applies = entry["applies_to"]
    assert isinstance(applies, list) and len(applies) >= 1, f"{where}: applies_to empty"
    assert len(applies) == len(set(applies)), f"{where}: applies_to not unique"
    for t in applies:
        assert t in _POITYPE_ENUM, f"{where}: bad applies_to value {t!r}"

    assert entry["tier"] in _TIER_ENUM, f"{where}: bad tier {entry['tier']!r}"
    assert entry["audience"] in _AUDIENCE_ENUM, f"{where}: bad audience"
    assert entry["render"] in _RENDER_ENUM, f"{where}: bad render"

    for nullable in ("icon", "value_source", "schema_org", "replaced_by"):
        val = entry[nullable]
        assert val is None or isinstance(val, str), f"{where}: {nullable} must be str|null"

    assert isinstance(entry["source"], str) and _SOURCE_RE.match(entry["source"]), (
        f"{where}: source fails pattern: {entry['source']!r}"
    )
    for boolean in ("computed", "card", "deprecated"):
        assert isinstance(entry[boolean], bool), f"{where}: {boolean} must be bool"


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------
def test_registry_parses():
    """poi_fields.json must parse to a non-empty JSON array."""
    data = _load_registry_raw()
    assert isinstance(data, list), "registry must be a JSON array"
    assert len(data) > 0, "registry must not be empty"


def test_loader_round_trips():
    """The Python loader returns the same parsed list as the raw file."""
    from shared.constants.poi_registry import load_registry, all_entries

    raw = _load_registry_raw()
    assert load_registry() == raw
    assert all_entries() == raw


def test_every_entry_validates_against_meta_schema():
    """Every entry conforms to shared/poi_fields.schema.json."""
    data = _load_registry_raw()
    schema = _load_schema()

    try:
        import jsonschema  # type: ignore

        jsonschema.validate(instance=data, schema=schema)
    except ImportError:
        # Fallback: enforce the per-entry constraints manually.
        assert schema.get("type") == "array"
        for idx, entry in enumerate(data):
            _fallback_validate_entry(entry, idx)


def test_no_duplicate_keys():
    """Field keys must be globally unique."""
    data = _load_registry_raw()
    keys = [e["key"] for e in data]
    dupes = sorted({k for k in keys if keys.count(k) > 1})
    assert not dupes, f"duplicate registry keys: {dupes}"


def test_value_sources_resolve_to_field_options():
    """Every value_source names a real attribute in shared.constants.field_options."""
    from shared.constants import field_options

    data = _load_registry_raw()
    sources = sorted({e["value_source"] for e in data if e["value_source"]})
    missing = [s for s in sources if not hasattr(field_options, s)]
    assert not missing, f"value_source(s) not found in field_options.py: {missing}"


def test_replaced_by_points_to_live_key():
    """Every replaced_by references an existing, non-deprecated key."""
    data = _load_registry_raw()
    keys_by_name = {e["key"]: e for e in data}
    for e in data:
        target = e["replaced_by"]
        if target is None:
            continue
        assert target in keys_by_name, (
            f"{e['key']}.replaced_by points to missing key {target!r}"
        )
        assert not keys_by_name[target]["deprecated"], (
            f"{e['key']}.replaced_by points to deprecated key {target!r}"
        )


def test_applies_to_values_in_poitype_enum():
    """Every applies_to value is a member of the canonical POIType enum."""
    from shared.models.enums import POIType

    valid = {t.value for t in POIType}
    data = _load_registry_raw()
    for e in data:
        for t in e["applies_to"]:
            assert t in valid, f"{e['key']}: applies_to {t!r} not in POIType enum"


def test_pii_fields_are_admin_audience():
    """REGRESSION GUARD: PII / internal fields must never be public.

    main_contact_name / main_contact_email / main_contact_phone /
    offsite_emergency_contact / emergency_protocols were leaked by the public
    API before the B0 hotfix. contact_info (a JSONB holding a "best" contact
    person + an "emergency" sub-object) and compliance (internal operational
    data) are the same data class and the registry-driven serializer emits every
    audience=="public" field regardless of render — so they must be admin too.
    admin_notes (free-form internal operator notes) is the same class. Pinning
    all eight to audience=="admin" here means a future registry edit that flips
    any of them back to public fails CI.
    """
    pii_keys = {
        "main_contact_name",
        "main_contact_email",
        "main_contact_phone",
        "offsite_emergency_contact",
        "emergency_protocols",
        "contact_info",
        "compliance",
        "admin_notes",
    }
    data = _load_registry_raw()
    by_key = {e["key"]: e for e in data}

    for key in pii_keys:
        assert key in by_key, f"expected PII field {key!r} present in registry"
        assert by_key[key]["audience"] == "admin", (
            f"PII field {key!r} must be audience=='admin', "
            f"got {by_key[key]['audience']!r}"
        )


def test_frontend_mirror_matches_source_of_truth():
    """The Vite frontend cannot import the repo-root shared/ registry, so the
    generator writes a byte-identical mirror at
    nearby-app/app/src/data/poi_fields.json. This guard fails CI if the two ever
    drift (e.g. someone edits one copy by hand instead of re-running the
    generator)."""
    mirror_path = os.path.join(
        REPO_ROOT, "nearby-app", "app", "src", "data", "poi_fields.json"
    )
    assert os.path.exists(mirror_path), (
        "frontend registry mirror missing — run scripts/gen_poi_registry.py"
    )
    with open(REGISTRY_PATH, "r", encoding="utf-8") as fh:
        canonical = fh.read()
    with open(mirror_path, "r", encoding="utf-8") as fh:
        mirror = fh.read()
    assert canonical == mirror, (
        "shared/poi_fields.json and nearby-app/app/src/data/poi_fields.json have "
        "drifted — re-run `python3 scripts/gen_poi_registry.py` to regenerate both"
    )
