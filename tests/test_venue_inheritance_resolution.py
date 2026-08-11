"""
Phase 6: Test venue inheritance resolution utility.

resolve_venue_inheritance() merges venue data into event data based on
per-section inheritance config: as_is, use_and_add, do_not_use.
"""

import pytest


class TestVenueInheritanceResolution:
    """Unit tests for resolve_venue_inheritance utility."""

    def test_as_is_copies_venue_parking(self):
        """as_is mode should copy venue parking data to the event."""
        from shared.utils.venue_inheritance import resolve_venue_inheritance

        event_data = {"parking_types": None}
        venue_data = {"parking_types": ["Public Parking Lot", "Street"]}
        config = {"parking": "as_is"}

        result = resolve_venue_inheritance(event_data, venue_data, config)
        assert result["parking_types"] == ["Public Parking Lot", "Street"]

    def test_use_and_add_is_read_path_noop(self):
        """INVERTED (#124): use_and_add no longer merges at read time.

        It used to be `test_use_and_add_merges_venue_and_event`, asserting the
        venue's values were merged in on every read. That is exactly the
        overwrite the mode promises not to do: the copy is a ONE-TIME write-time
        action in the admin form, and the event's own values then stand alone.
        """
        from shared.utils.venue_inheritance import resolve_venue_inheritance

        event_data = {"parking_types": ["Valet"]}
        venue_data = {"parking_types": ["Public Parking Lot", "Street"]}
        config = {"parking": "use_and_add"}

        result = resolve_venue_inheritance(event_data, venue_data, config)
        assert result["parking_types"] == ["Valet"]
        # Still reported as an inherited section so the UI can badge it.
        assert result["_venue_source"]["parking"] == "use_and_add"

    def test_use_and_add_does_not_backfill_empty_event_field(self):
        """use_and_add never reaches into the venue at read time, even when empty."""
        from shared.utils.venue_inheritance import resolve_venue_inheritance

        event_data = {"parking_types": None}
        venue_data = {"parking_types": ["Street"]}

        result = resolve_venue_inheritance(event_data, venue_data, {"parking": "use_and_add"})
        assert result["parking_types"] is None

    def test_do_not_use_ignores_venue_data(self):
        """do_not_use should not copy venue data."""
        from shared.utils.venue_inheritance import resolve_venue_inheritance

        event_data = {"parking_types": ["Valet"]}
        venue_data = {"parking_types": ["Public Parking Lot"]}
        config = {"parking": "do_not_use"}

        result = resolve_venue_inheritance(event_data, venue_data, config)
        assert result["parking_types"] == ["Valet"]

    def test_missing_config_defaults_to_no_inheritance(self):
        """No inheritance config means event keeps its own data."""
        from shared.utils.venue_inheritance import resolve_venue_inheritance

        event_data = {"parking_types": ["Valet"]}
        venue_data = {"parking_types": ["Public Parking Lot"]}

        result = resolve_venue_inheritance(event_data, venue_data, None)
        assert result["parking_types"] == ["Valet"]

    def test_null_venue_data_no_error(self):
        """Null venue data should not cause errors."""
        from shared.utils.venue_inheritance import resolve_venue_inheritance

        event_data = {"parking_types": ["Valet"]}
        config = {"parking": "as_is"}

        result = resolve_venue_inheritance(event_data, None, config)
        assert result["parking_types"] == ["Valet"]

    def test_restrooms_as_is(self):
        """as_is for restrooms section."""
        from shared.utils.venue_inheritance import resolve_venue_inheritance

        event_data = {"public_toilets": None, "toilet_description": None}
        venue_data = {"public_toilets": ["Yes", "Family"], "toilet_description": "Near entrance"}
        config = {"restrooms": "as_is"}

        result = resolve_venue_inheritance(event_data, venue_data, config)
        assert result["public_toilets"] == ["Yes", "Family"]
        assert result["toilet_description"] == "Near entrance"

    def test_accessibility_use_and_add(self):
        """INVERTED (#124): use_and_add is a read-path no-op for accessibility too.

        Previously asserted the venue's wheelchair_details filled an empty event
        field on read. It now only fills at copy time, in the admin form.
        """
        from shared.utils.venue_inheritance import resolve_venue_inheritance

        event_data = {"wheelchair_details": None}
        venue_data = {"wheelchair_details": "Ramp at entrance"}
        config = {"accessibility": "use_and_add"}

        result = resolve_venue_inheritance(event_data, venue_data, config)
        assert result["wheelchair_details"] is None

    def test_accessibility_as_is_inherits_mobility_access(self):
        """The three mobility booleans live in one JSONB dict and must inherit (#124)."""
        from shared.utils.venue_inheritance import resolve_venue_inheritance

        mobility = {
            "step_free_entry": True,
            "main_area_accessible": True,
            "ground_level_service": False,
        }
        event_data = {"wheelchair_details": None, "mobility_access": None}
        venue_data = {"wheelchair_details": "Ramp at entrance", "mobility_access": mobility}

        result = resolve_venue_inheritance(event_data, venue_data, {"accessibility": "as_is"})
        assert result["mobility_access"] == mobility

    def test_hours_section_removed(self):
        """INVERTED (#124): hours is no longer an inheritable section.

        Was `test_hours_as_is`, asserting venue hours flowed onto the event. An
        event's schedule is its own; the venue's opening hours are not it.
        Stale {"hours": ...} keys in existing venue_inheritance rows are ignored
        exactly like any other unknown section, so no data migration is needed.
        """
        from shared.utils.venue_inheritance import resolve_venue_inheritance
        from shared.constants.venue_sections import SECTION_FIELDS

        assert "hours" not in SECTION_FIELDS

        event_data = {"hours": None}
        venue_data = {"hours": {"monday": {"open": "09:00", "close": "17:00"}}}

        result = resolve_venue_inheritance(event_data, venue_data, {"hours": "as_is"})
        assert result["hours"] is None
        assert "hours" not in result["_venue_source"]

    def test_unknown_section_ignored(self):
        """An unrecognized section key is skipped, not an error."""
        from shared.utils.venue_inheritance import resolve_venue_inheritance

        event_data = {"parking_types": ["Valet"]}
        venue_data = {"parking_types": ["Street"]}

        result = resolve_venue_inheritance(event_data, venue_data, {"not_a_section": "as_is"})
        assert result["parking_types"] == ["Valet"]
        assert result["_venue_source"] == {}

    @pytest.mark.parametrize(
        "section,field,venue_value",
        [
            ("address", "address_city", "Pittsboro"),
            ("address", "arrival_methods", ["Street Parking"]),
            ("parking", "accessible_parking_details", ["Van accessible"]),
            ("restrooms", "accessible_restroom", True),
            ("playground", "playground_types", ["Swings"]),
            ("playground", "inclusive_playground", True),
            ("amenities", "payment_methods", ["Cash"]),
            ("amenities", "cell_service", "Good"),
            ("pet_policy", "pet_options", ["Leashed dogs"]),
            ("alcohol_smoking", "alcohol_available", "beer_wine"),
            ("alcohol_smoking", "smoking_options", ["Designated areas"]),
            ("contact", "phone_number", "919-555-1234"),
        ],
    )
    def test_new_sections_inherit_as_is(self, section, field, venue_value):
        """Every section in the #124 registry resolves under as_is."""
        from shared.utils.venue_inheritance import resolve_venue_inheritance

        result = resolve_venue_inheritance({field: None}, {field: venue_value}, {section: "as_is"})
        assert result[field] == venue_value

    def test_registry_is_the_single_source_of_sections(self):
        """The resolver must not carry its own section map (#124)."""
        import shared.utils.venue_inheritance as vi
        from shared.constants.venue_sections import SECTION_FIELDS, UI_SECTIONS

        assert vi._SECTION_FIELDS is SECTION_FIELDS
        assert set(UI_SECTIONS) <= set(SECTION_FIELDS)

    def test_multiple_sections(self):
        """Multiple sections can be configured independently."""
        from shared.utils.venue_inheritance import resolve_venue_inheritance

        # wheelchair_accessible removed — column dropped (Issue #45 PR2 Migration B)
        # Accessibility section now uses wheelchair_details.
        event_data = {
            "parking_types": None,
            "public_toilets": ["Porta Potti"],
            "wheelchair_details": None,
        }
        venue_data = {
            "parking_types": ["Street"],
            "public_toilets": ["Yes"],
            "wheelchair_details": "Ramp at entrance",
        }
        config = {
            "parking": "as_is",
            "restrooms": "do_not_use",
            "accessibility": "as_is",
        }

        result = resolve_venue_inheritance(event_data, venue_data, config)
        assert result["parking_types"] == ["Street"]
        assert result["public_toilets"] == ["Porta Potti"]  # do_not_use: event keeps own
        assert result["wheelchair_details"] == "Ramp at entrance"  # as_is from venue

    def test_venue_source_annotations(self):
        """Result should include _venue_source annotations."""
        from shared.utils.venue_inheritance import resolve_venue_inheritance

        event_data = {"parking_types": None}
        venue_data = {"parking_types": ["Street"]}
        config = {"parking": "as_is"}

        result = resolve_venue_inheritance(event_data, venue_data, config)
        assert "_venue_source" in result
        assert result["_venue_source"]["parking"] == "as_is"
