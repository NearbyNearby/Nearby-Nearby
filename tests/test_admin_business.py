"""Tests for Business POI CRUD operations via admin API."""

import pytest
from conftest import create_business


class TestCreateBusinessMinimal:
    def test_create_business_minimal(self, admin_client):
        """POST with only required fields."""
        data = create_business(admin_client, name="Minimal Cafe")
        assert data["name"] == "Minimal Cafe"
        assert data["poi_type"] == "BUSINESS"
        assert data["business"]["price_range"] == "$$"
        assert data["publication_status"] == "draft"
        assert "id" in data
        assert data["slug"] is not None

    def test_create_business_no_subtype_fails(self, admin_client):
        """POST without business subtype data should fail."""
        payload = {
            "name": "No Subtype",
            "poi_type": "BUSINESS",
            "location": {"type": "Point", "coordinates": [-79.0, 35.8]},
        }
        resp = admin_client.post("/api/pois/", json=payload)
        assert resp.status_code == 422


class TestCreateBusinessAllFields:
    def test_create_business_all_fields(self, admin_client):
        """POST with every base + business field populated."""
        payload = {
            "name": "Full Business",
            "poi_type": "BUSINESS",
            "location": {"type": "Point", "coordinates": [-79.5, 35.5]},
            "description_long": "<p>A full description with <b>HTML</b></p>",
            "description_short": "Short desc under 200 chars",
            "teaser_paragraph": "Teaser for the card",
            "listing_type": "paid",
            "address_full": "123 Main St, Pittsboro, NC 27312",
            "address_street": "123 Main St",
            "address_city": "Pittsboro",
            "address_state": "NC",
            "address_zip": "27312",
            "address_county": "Chatham",
            "front_door_latitude": 35.7200,
            "front_door_longitude": -79.1770,
            "dont_display_location": False,
            "status": "Fully Open",
            "status_message": "Open for summer season",
            "is_verified": True,
            "publication_status": "draft",
            "website_url": "https://fullbusiness.com",
            "phone_number": "919-555-1234",
            "email": "info@fullbusiness.com",
            "main_contact_name": "Jane Doe",
            "main_contact_email": "jane@fullbusiness.com",
            "main_contact_phone": "919-555-5678",
            "instagram_username": "fullbusiness",
            "facebook_username": "fullbusiness",
            "x_username": "fullbiz",
            "tiktok_username": "fullbiz",
            "linkedin_username": "fullbusiness",
            "other_socials": {"youtube": "fullbizchannel"},
            "parking_types": ["Street", "Lot"],
            "parking_locations": [{"lat": 35.72, "lng": -79.18, "name": "Main Lot"}],
            "parking_notes": "Free parking in rear",
            # "public_transit_info" removed — renamed _deprecated_public_transit_info (Migration A #33)
            "expect_to_pay_parking": "no",
            # "wheelchair_accessible" removed — column dropped (Issue #45 PR2 Migration B)
            "wheelchair_details": "Ramp at front entrance",
            "public_toilets": ["Indoor"],
            "toilet_locations": [{"lat": 35.72, "lng": -79.18}],
            "toilet_description": "Accessible restrooms available",
            # "key_facilities" removed — renamed _deprecated_key_facilities (Migration A #34)
            "payment_methods": ["Cash", "Credit Card", "Apple Pay"],
            "alcohol_options": ["Beer", "Wine"],
            "smoking_options": ["Outdoor Only"],
            "smoking_details": "Patio smoking area",
            "wifi_options": ["Free WiFi"],
            "drone_usage": "No",
            "drone_policy": "No drones permitted",
            "pet_options": ["Dogs Allowed Outside"],
            "pet_policy": "Well-behaved dogs on patio",
            "available_for_rent": True,
            "rental_info": "Available for private events",
            "rental_pricing": "$500/evening",
            "rental_link": "https://fullbusiness.com/rent",
            "playground_available": False,
            "price_range_per_person": "$15 and under",
            "pricing": "Moderate",
            "discounts": ["Military", "Senior"],
            "gift_cards": "yes_this_only",
            "youth_amenities": ["Kids Menu", "High Chair"],
            "business_amenities": ["Outdoor Seating", "Free WiFi"],
            "entertainment_options": ["Live Music", "Trivia Night"],
            "menu_link": "https://fullbusiness.com/menu",
            "delivery_links": [{"title": "DoorDash", "url": "https://doordash.com/fullbiz"}],
            "reservation_links": [{"title": "OpenTable", "url": "https://opentable.com/fullbiz"}],
            "appointment_links": [{"title": "Calendly", "url": "https://calendly.com/fullbiz"}],
            "online_ordering_links": [{"title": "Order Direct", "url": "https://fullbusiness.com/order"}],
            "business_entry_notes": "Enter through the side door",
            "appointment_booking_url": "https://fullbusiness.com/book",
            "hours_but_appointment_required": False,
            "ideal_for": ["Families", "Date Night", "Business Lunch"],
            "ideal_for_key": ["Families", "Date Night"],
            "photos": {"featured": "https://example.com/photo.jpg"},
            "hours": {
                "monday": {"open": "09:00", "close": "17:00"},
                "tuesday": {"open": "09:00", "close": "17:00"},
                # Issue #70: holiday_hours top-level key replaced by hours.holidays.
                "holidays": {"christmas": "closed"},
            },
            "amenities": {"wifi": True, "outdoor_seating": True},
            "contact_info": {"best": {"name": "Rhonda", "phone": "919-555-0000"}},
            "compliance": {"pre_approval_required": True, "lead_time": "5 days"},
            "custom_fields": {"Parking Tip": "Back lot is free after 5 PM."},
            "history_paragraph": "Founded in 1985 as a small coffee shop.",
            "featured_image": "https://example.com/featured.jpg",
            "community_impact": "Sponsors local Little League team",
            "article_links": [{"title": "Featured in News", "url": "https://news.com/article"}],
            "organization_memberships": [{"name": "Chamber of Commerce"}],
            "downloadable_maps": [{"name": "Parking Map", "url": "https://example.com/map.pdf"}],
            "offsite_emergency_contact": "Fire: 911, Manager: 919-555-9999",
            "emergency_protocols": "Exit through back door",
            "is_disaster_hub": False,
            "business": {"price_range": "$$$"},
        }

        resp = admin_client.post("/api/pois/", json=payload)
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert data["name"] == "Full Business"
        assert data["business"]["price_range"] == "$$$"
        assert data["listing_type"] == "paid"
        assert data["address_city"] == "Pittsboro"
        assert data["is_verified"] is True

    def test_create_business_all_fields_roundtrip(self, admin_client):
        """Create → GET → verify every field value matches."""
        biz = create_business(
            admin_client,
            name="Roundtrip Biz",
            description_long="Long desc",
            phone_number="919-111-2222",
            address_city="Durham",
        )
        poi_id = biz["id"]

        resp = admin_client.get(f"/api/pois/{poi_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "Roundtrip Biz"
        assert data["description_long"] == "Long desc"
        assert data["phone_number"] == "919-111-2222"
        assert data["address_city"] == "Durham"


class TestCreateBusinessTitledLinks:
    def test_create_business_titled_links(self, admin_client):
        """Test titled link format: [{title, url}]."""
        biz = create_business(
            admin_client,
            name="Link Biz",
            delivery_links=[{"title": "DoorDash", "url": "https://doordash.com/biz"}],
            reservation_links=[{"title": "OpenTable", "url": "https://opentable.com/biz"}],
        )
        assert biz["delivery_links"] == [{"title": "DoorDash", "url": "https://doordash.com/biz"}]
        assert biz["reservation_links"] == [{"title": "OpenTable", "url": "https://opentable.com/biz"}]

    def test_create_business_old_link_format(self, admin_client):
        """String-format links auto-convert to dict format."""
        biz = create_business(
            admin_client,
            name="Old Link Biz",
            delivery_links=["https://doordash.com/oldbiz"],
        )
        # Should be normalized to dict format
        assert biz["delivery_links"] == [{"title": "", "url": "https://doordash.com/oldbiz"}]


class TestCreateBusinessJsonbFields:
    def test_create_business_jsonb_fields(self, admin_client):
        """Test JSONB fields: hours, amenities, compliance, custom_fields.

        Task 2.5: photos and contact_info are no longer round-tripped through the
        create payload — the write path stops writing them (photos -> the images
        table; contact_info -> the main_contact_* columns). Their new behavior is
        covered by tests/test_one_representation.py.
        """
        hours = {
            "monday": {"open": "08:00", "close": "20:00"},
            "tuesday": {"open": "08:00", "close": "20:00"},
            "wednesday": "closed",
        }
        amenities = {"wifi": True, "parking": "free"}
        compliance = {"pre_approval_required": False}
        custom_fields = {"Note": "Test note"}

        biz = create_business(
            admin_client,
            name="JSONB Biz",
            hours=hours,
            amenities=amenities,
            compliance=compliance,
            custom_fields=custom_fields,
        )

        assert biz["hours"]["monday"]["open"] == "08:00"
        assert biz["amenities"]["wifi"] is True
        assert biz["compliance"]["pre_approval_required"] is False
        assert biz["custom_fields"]["Note"] == "Test note"
