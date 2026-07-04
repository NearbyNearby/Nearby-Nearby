"""Schema coercers for forgiving legacy/edge-case input.

Background: several columns in this database are `VARCHAR` with no CHECK
constraint, but their Pydantic schemas declare them as `Optional[Literal[...]]`.
When a row contains an empty string the response serializer raises
`ResponseValidationError` and the endpoint returns 500.

`EmptyStringToNoneMixin` walks the class fields via introspection and coerces
`""` to `None` for any `Optional[Literal[...]]` field, so new enum-typed fields
inherit the protection automatically. `coerce_empty_literals` is the same logic
exposed as a pure function for write paths that bypass Pydantic (autosave).

A second set of columns is enum-like but declared `Optional[str]` (not
`Optional[Literal]`) because the vocabulary lives in a DB CHECK constraint
(migration `u_validation_checks_001`) rather than the schema. The admin form
submits `''` for an untouched Radio field, which the CHECK rejects. These names
are listed in `CHECK_ENUM_STRING_FIELDS` and get the same '' -> None coercion (on
BOTH the create/update Pydantic path via the mixin AND the raw autosave dict via
the function), whitespace-only included, so an untouched form field persists as
NULL instead of tripping the CHECK.
"""

from functools import cache
from typing import Literal, get_args, get_origin

from pydantic import BaseModel, model_validator


# Enum-like columns whose vocabulary is enforced by a DB CHECK constraint
# (migration u_validation_checks_001), declared Optional[str] in the schema. The
# admin form's untouched-Radio default of '' would violate the CHECK, so '' (and
# whitespace-only) is coerced to NULL on every admin write path. Keep in sync with
# ENUM_COLUMNS in that migration. `event_status` lives on the Event subtype; the
# rest on points_of_interest.
CHECK_ENUM_STRING_FIELDS = frozenset({
    "status", "gift_cards", "drone_usage",
    "hunting_fishing_allowed", "fishing_allowed", "event_status",
})


def _is_blank(value) -> bool:
    """True for an empty or whitespace-only string (the CHECK-tripping shapes)."""
    return isinstance(value, str) and value.strip() == ""


def _annotation_allows_none_and_literal(annotation) -> bool:
    args = get_args(annotation)
    if not args:
        return False
    return type(None) in args and any(get_origin(a) is Literal for a in args)


@cache
def _literal_optional_field_names(cls: type) -> tuple:
    return tuple(
        name
        for name, fi in cls.model_fields.items()
        if _annotation_allows_none_and_literal(fi.annotation)
    )


@cache
def _check_enum_field_names(cls: type) -> tuple:
    """The CHECK-enum columns actually declared as fields on `cls`."""
    return tuple(n for n in cls.model_fields if n in CHECK_ENUM_STRING_FIELDS)


def coerce_empty_literals(data: dict, model_cls: type) -> dict:
    """Mutate `data` in place: replace '' with None for Optional[Literal] fields of
    `model_cls`, and blank/whitespace with None for any CHECK-enum column present
    (the autosave dict is flattened across POI + subtypes, so a CHECK column such
    as `event_status` can appear even though `model_cls` does not declare it)."""
    for name in _literal_optional_field_names(model_cls):
        if data.get(name) == "":
            data[name] = None
    for name in CHECK_ENUM_STRING_FIELDS:
        if name in data and _is_blank(data[name]):
            data[name] = None
    return data


class EmptyStringToNoneMixin(BaseModel):
    """Add to a class's base list to coerce '' -> None for its Optional[Literal]
    fields, and blank/whitespace -> None for its CHECK-enum Optional[str] fields.

    Handles three input shapes:
      - dict: mutate in place
      - pydantic BaseModel: pass through (already validated upstream)
      - ORM object (from_attributes=True): build a dict copy, leaving the ORM untouched
    """

    @model_validator(mode="before")
    @classmethod
    def _coerce_empty_strings_to_none(cls, data):
        literal_fields = _literal_optional_field_names(cls)
        check_fields = _check_enum_field_names(cls)
        if not literal_fields and not check_fields:
            return data
        if isinstance(data, BaseModel):
            return data
        if isinstance(data, dict):
            for name in literal_fields:
                if data.get(name) == "":
                    data[name] = None
            for name in check_fields:
                if _is_blank(data.get(name)):
                    data[name] = None
            return data
        out = {n: getattr(data, n) for n in cls.model_fields if hasattr(data, n)}
        for name in literal_fields:
            if out.get(name) == "":
                out[name] = None
        for name in check_fields:
            if _is_blank(out.get(name)):
                out[name] = None
        return out
