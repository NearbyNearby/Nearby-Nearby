"""Card serializer drift guard (Task 1.4).

The public card / nearby-result payload is produced by ``serialize_poi_card`` in
``nearby-app/backend/app/serialization/poi_serializer.py``, which whitelists keys
via the hand-maintained ``_CARD_SCHEMA_KEYS`` frozenset. The field registry
(``shared/poi_fields.json``) is the source of truth for WHICH fields belong on a
card (entries with ``card == true`` and ``audience == "public"``). Before Task 1.4
the whitelist silently dropped 10 such fields (trail difficulty/length, event
start, amenity icons, tier/sponsor flags).

This guard asserts ``_CARD_SCHEMA_KEYS`` is a SUPERSET of every public
``card == true`` registry field, except an explicit, documented exclusion set
(``DOCUMENTED_CARD_EXCLUSIONS``, defined next to the serializer with a reason).
No card field may be dropped again without documenting why.
"""

import importlib.util
import json
import os
import sys

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(TESTS_DIR, ".."))
REGISTRY_PATH = os.path.join(REPO_ROOT, "shared", "poi_fields.json")
SERIALIZER_PATH = os.path.join(
    REPO_ROOT, "nearby-app", "backend", "app", "serialization", "poi_serializer.py"
)

# ``shared`` must be importable — the serializer imports the registry loader.
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)


def _load_serializer_module():
    """Load the serializer file directly.

    Loading by file path avoids the admin/app ``app`` top-level package name
    collision that the root conftest juggles on ``sys.path``; the serializer's
    only module-level import is ``shared.constants.poi_registry`` (light, no
    torch / geo stack).
    """
    spec = importlib.util.spec_from_file_location(
        "poi_serializer_under_test", SERIALIZER_PATH
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _public_card_keys():
    with open(REGISTRY_PATH, "r", encoding="utf-8") as fh:
        entries = json.load(fh)
    return {
        e["key"]
        for e in entries
        if e.get("card") is True and e.get("audience") == "public"
    }


_SERIALIZER = _load_serializer_module()
CARD_SCHEMA_KEYS = _SERIALIZER._CARD_SCHEMA_KEYS
DOCUMENTED_CARD_EXCLUSIONS = _SERIALIZER.DOCUMENTED_CARD_EXCLUSIONS
PUBLIC_CARD_KEYS = _public_card_keys()


def test_card_schema_covers_all_public_card_fields():
    """No silent drops: every public ``card == true`` registry field is in the
    card schema unless explicitly documented as excluded."""
    required = PUBLIC_CARD_KEYS - DOCUMENTED_CARD_EXCLUSIONS
    missing = required - CARD_SCHEMA_KEYS
    assert not missing, (
        "Registry card:true public fields missing from _CARD_SCHEMA_KEYS. Add "
        "each to the card schema, or to DOCUMENTED_CARD_EXCLUSIONS with a reason: "
        f"{sorted(missing)}"
    )


def test_documented_card_exclusions_are_real_public_card_fields():
    """Every documented exclusion must actually be a public ``card == true``
    registry field, else it is stale and should be removed."""
    stale = DOCUMENTED_CARD_EXCLUSIONS - PUBLIC_CARD_KEYS
    assert not stale, (
        f"DOCUMENTED_CARD_EXCLUSIONS lists fields that are not public card "
        f"fields (stale): {sorted(stale)}"
    )
