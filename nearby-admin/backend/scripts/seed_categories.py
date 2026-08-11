#!/usr/bin/env python3
"""
Seed script for categories.

Source of truth is production (fetched via the public, unauthenticated
GET /api/categories/by-poi-type/{TYPE} endpoint on admin.nearbynearby.com,
2026-08-04) so a local DB rebuild reproduces prod's real category set.
Replaces the old ~29-category placeholder snapshot referencing Story 3 /
PO_REQUIREMENTS.md, which never had the real place-type taxonomy
(Greenway Trail, Backcountry Trail, etc. for Trail, and similarly deeper
sets for Business/Park/Event). See project memory
local-vs-prod-data-gap.md for background.

Categories that are children (have a parent) are seeded after their parent
so the parent_id lookup by name works. A few categories are children in
one POI type context (e.g. shared with another) but that relationship is
per-category, not per-applicable_to, so parent/child pairs always seed
together as one entry regardless of which type list surfaced them.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text

from app.database import SessionLocal, engine
from app.models.category import Category
from app.schemas.category import generate_slug

def seed_categories():
    """
    Create categories matching production, preserving parent/child hierarchy
    and each category's real applicable_to (POI types).
    """
    db = SessionLocal()

    try:
        # Clear existing POI-category assignments first (old local categories are
        # being wholesale replaced with real production ones, so any existing
        # assignment referencing them is being retired along with the row it
        # points at), then the categories themselves.
        db.execute(text("DELETE FROM poi_categories"))
        db.query(Category).delete()
        db.commit()

        # (name, applicable_to, sort_order, parent_name)
        categories_data = [
            ("Attractions", ["BUSINESS"], 0, None),
            ("Food + Drink", ["BUSINESS", "EVENT"], 0, None),
            ("Groups + Organizations", ["BUSINESS"], 0, None),
            ("Landmarks & Historical Sites", ["BUSINESS"], 0, "Attractions"),
            ("Live Music Venue", ["BUSINESS"], 0, "Food + Drink"),
            ("Monuments & Memorials", ["BUSINESS"], 0, "Landmarks & Historical Sites"),
            ("Museums & Exhibits", ["BUSINESS"], 0, "Attractions"),
            ("Nonprofit", ["BUSINESS"], 0, "Groups + Organizations"),
            ("Professional Services", ["BUSINESS"], 0, None),
            ("Public Art", ["BUSINESS"], 0, "Attractions"),
            ("Restaurant", ["BUSINESS"], 0, "Food + Drink"),
            ("Science & Nature Museum", ["BUSINESS"], 0, "Museums & Exhibits"),
            ("Aquatic Center", ["PARK"], 0, None),
            ("Beach + Coastal", ["PARK"], 0, None),
            ("Botanical Garden", ["PARK"], 0, None),
            ("City Park", ["PARK"], 0, None),
            ("Community Garden", ["PARK"], 0, None),
            ("Community Park", ["PARK"], 0, None),
            ("Community Recreation Center", ["PARK"], 0, None),
            ("Conservation Easement Land", ["PARK"], 0, None),
            ("County Park", ["PARK"], 0, None),
            ("Dog Park", ["PARK"], 0, None),
            ("Game Land + Wildlife Management Area", ["PARK"], 0, None),
            ("Greenway Corridor", ["PARK"], 0, None),
            ("Island", ["PARK"], 0, None),
            ("Lake + Reservoir Access", ["PARK"], 0, None),
            ("Land Trust Property", ["PARK"], 0, None),
            ("National Forest", ["PARK"], 0, None),
            ("National Park", ["PARK"], 0, None),
            ("Natural Area", ["PARK"], 0, None),
            ("Nature Preserve", ["PARK"], 0, None),
            ("Neighborhood Park", ["PARK"], 0, None),
            ("Open Land", ["PARK"], 0, None),
            ("Pocket Park", ["PARK"], 0, None),
            ("Public Square + Plaza", ["PARK"], 0, None),
            ("Recreational Park + Facilities", ["PARK"], 0, None),
            ("Riparian + Riverbank", ["PARK"], 0, None),
            ("Roadside Park", ["PARK"], 0, None),
            ("State Forest", ["PARK"], 0, None),
            ("State Game Land", ["PARK"], 0, None),
            ("State Park", ["PARK"], 0, None),
            ("Wetlands", ["PARK"], 0, None),
            ("Wilderness Area", ["PARK"], 0, None),
            ("Wildlife Refuges", ["PARK"], 0, None),
            ("Backcountry Trail", ["TRAIL"], 0, None),
            ("Backpacking Trail", ["TRAIL"], 0, None),
            ("Cross-Country Ski Trail", ["TRAIL"], 0, None),
            ("Cycling Trail", ["TRAIL"], 0, None),
            ("Equestrian Trail", ["TRAIL"], 0, None),
            ("Farm + Agricultural Access Road", ["TRAIL"], 0, None),
            ("Greenway Trail", ["TRAIL"], 0, None),
            ("Hiking Trail", ["TRAIL"], 0, None),
            ("Indigenous + Cultural Route", ["TRAIL"], 0, None),
            ("Mountain Biking Trail", ["TRAIL"], 0, None),
            ("Multi-Use Trail", ["TRAIL"], 0, None),
            ("Nature Trail", ["TRAIL"], 0, None),
            ("OHV + Motorized Trail", ["TRAIL"], 0, None),
            ("Paddling + Water Trail", ["TRAIL"], 0, None),
            ("Rail Trail", ["TRAIL"], 0, None),
            ("Snowshoe Trail", ["TRAIL"], 0, None),
            ("Timber + Forest Road", ["TRAIL"], 0, None),
            ("Utility Corridor Trail", ["TRAIL"], 0, None),
            ("Wheelchair + Mobility Aid Trail", ["TRAIL"], 0, None),
            ("Winter Hiking Trail", ["TRAIL"], 0, None),
            ("4-H Events", ["EVENT"], 0, None),
            ("Activities & Health", ["EVENT"], 0, None),
            ("Arts & Crafts", ["EVENT"], 0, None),
            ("Auto, Boat & Air", ["EVENT"], 0, None),
            ("Baby Fairs & Parenting Events", ["EVENT"], 0, None),
            ("Biking", ["EVENT"], 0, "Activities & Health"),
            ("Board Game Nights", ["EVENT"], 0, None),
            ("Business", ["EVENT"], 0, None),
            ("Camp, Retreat, Trip", ["EVENT"], 0, None),
            ("Chamber of Commerce Events", ["EVENT"], 0, None),
            ("Classes & Workshops", ["EVENT"], 0, None),
            ("Community Clean-Up Days", ["EVENT"], 0, None),
            ("Community & Culture", ["EVENT"], 0, None),
            ("Dancing", ["EVENT"], 0, "Activities & Health"),
            ("Dinner & Gala", ["EVENT"], 0, None),
            ("DnD Groups", ["EVENT"], 0, None),
            ("Family Fun Days", ["EVENT"], 0, None),
            ("Farmers Market", ["EVENT"], 0, None),
            ("Farm Machinery Events", ["EVENT"], 0, None),
            ("Festivals, Parade & Fair", ["EVENT"], 0, "Community & Culture"),
            ("Fishing Tournaments & Events", ["EVENT"], 0, None),
            ("Fitness", ["EVENT"], 0, "Activities & Health"),
            ("Fundraiser", ["EVENT"], 0, "Community & Culture"),
            ("Garden Club", ["EVENT"], 0, None),
            ("Health Screenings & Clinics", ["EVENT"], 0, None),
            ("Home & Lifestyle", ["EVENT"], 0, None),
            ("Homeschool Meetups", ["EVENT"], 0, None),
            ("Hunting & Gun Shows", ["EVENT"], 0, None),
            ("Kids’ Nights/Childcare Drop-Off Events", ["EVENT"], 0, None),
            ("Learning Pods", ["EVENT"], 0, None),
            ("Library Programs", ["EVENT"], 0, None),
            ("Literature & Author Events", ["EVENT"], 0, None),
            ("Livestock Shows & Auctions", ["EVENT"], 0, None),
            ("Local History & Heritage", ["EVENT"], 0, None),
            ("Main Street & Downtown Events", ["EVENT"], 0, None),
            ("Nightlife", ["EVENT"], 0, None),
            ("Political", ["EVENT"], 0, "Community & Culture"),
            ("Races, Walks & 5K", ["EVENT"], 0, "Activities & Health"),
            ("RC (Remote Control) Events", ["EVENT"], 0, None),
            ("Religious", ["EVENT"], 0, "Community & Culture"),
            ("Ribbon Cuttings", ["EVENT"], 0, None),
            ("Rodeos & Equestrian", ["EVENT"], 0, None),
            ("Seasonal & Holiday", ["EVENT"], 0, None),
            ("Seminar or Talk", ["EVENT"], 0, None),
            ("Senior & Retirement Events", ["EVENT"], 0, None),
            ("Shows", ["EVENT"], 0, None),
            ("Sports", ["EVENT"], 0, "Activities & Health"),
            ("Spring & Easter", ["EVENT"], 0, "Seasonal & Holiday"),
            ("Storytelling", ["EVENT"], 0, "Shows"),
            ("St. Patrick’s Day", ["EVENT"], 0, "Seasonal & Holiday"),
            ("Summer Kickoff", ["EVENT"], 0, "Seasonal & Holiday"),
            ("Support Group", ["EVENT"], 0, "Community & Culture"),
            ("Swap Meets & Flea Markets", ["EVENT"], 0, None),
            ("Theater", ["EVENT"], 0, "Shows"),
            ("Town Halls & Civic Meetings", ["EVENT"], 0, None),
            ("Tractor Pulls", ["EVENT"], 0, None),
            ("Tradeshow & Expo", ["EVENT"], 0, "Shows"),
            ("Trivia + Game Night", ["EVENT"], 0, None),
            ("Trivia Night", ["EVENT"], 0, "Trivia + Game Night"),
            ("Valentine’s Day", ["EVENT"], 0, "Seasonal & Holiday"),
            ("Veterans Day", ["EVENT"], 0, "Seasonal & Holiday"),
            ("Wedding Shows & Expos", ["EVENT"], 0, None),
            ("Winter Break Fun", ["EVENT"], 0, "Seasonal & Holiday"),
            ("Winter Celebrations", ["EVENT"], 0, "Seasonal & Holiday"),
            ("Yoga, Meditation & Spiritual", ["EVENT"], 0, "Activities & Health"),
            ("Art Museum", ["BUSINESS"], 0, "Museums & Exhibits"),
            ("Bar + Pub", ["BUSINESS"], 0, "Food + Drink"),
            ("Cafe", ["BUSINESS"], 0, "Restaurant"),
            ("Chamber of Commerce", ["BUSINESS"], 0, "Groups + Organizations"),
            ("Farmers Market Organization ", ["BUSINESS"], 0, "Groups + Organizations"),
            ("Historical Markers", ["BUSINESS"], 0, "Landmarks & Historical Sites"),
            ("Historic Courthouse", ["BUSINESS"], 0, "Landmarks & Historical Sites"),
            ("Historic Site", ["BUSINESS", "PARK"], 0, "Landmarks & Historical Sites"),
            ("Legal", ["BUSINESS"], 0, "Professional Services"),
            ("Local History Museum", ["BUSINESS"], 0, "Museums & Exhibits"),
            ("Mural", ["BUSINESS"], 0, "Public Art"),
            ("Real Estate Law", ["BUSINESS"], 0, "Legal"),
            ("ATV, UTV/Side-by-Side", ["TRAIL"], 0, "OHV + Motorized Trail"),
            ("Dirt Bike/Motorcycle", ["TRAIL"], 0, "OHV + Motorized Trail"),
            ("Full-Size 4x4/Jeep", ["TRAIL"], 0, "OHV + Motorized Trail"),
            ("4th of July", ["EVENT"], 0, "Seasonal & Holiday"),
            ("Antique Shows", ["EVENT"], 0, "Shows"),
            ("Back to School", ["EVENT"], 0, "Seasonal & Holiday"),
            ("Black History Month", ["EVENT"], 0, "Seasonal & Holiday"),
            ("Charity & Causes", ["EVENT"], 0, "Community & Culture"),
            ("Church or Faith-Based Events", ["EVENT"], 0, "Community & Culture"),
            ("Competitions", ["EVENT"], 0, "Shows"),
            ("Diwali", ["EVENT"], 0, "Seasonal & Holiday"),
            ("Fall Festivals", ["EVENT"], 0, "Seasonal & Holiday"),
            ("Father’s Day", ["EVENT"], 0, "Seasonal & Holiday"),
            ("Flag Day", ["EVENT"], 0, "Seasonal & Holiday"),
            ("Gallery", ["EVENT"], 0, "Shows"),
            ("Halloween", ["EVENT"], 0, "Seasonal & Holiday"),
            ("Hanukkah", ["EVENT"], 0, "Seasonal & Holiday"),
            ("Hispanic Heritage Month", ["EVENT"], 0, "Seasonal & Holiday"),
            ("Holiday Markets & Bazaars", ["EVENT"], 0, "Seasonal & Holiday"),
            ("Indigenous Peoples’ Day", ["EVENT"], 0, "Seasonal & Holiday"),
            ("Juneteenth", ["EVENT"], 0, "Seasonal & Holiday"),
            ("Kwanzaa", ["EVENT"], 0, "Seasonal & Holiday"),
            ("Labor Day", ["EVENT"], 0, "Seasonal & Holiday"),
            ("Lunar New Year", ["EVENT"], 0, "Seasonal & Holiday"),
            ("Memorial Day", ["EVENT"], 0, "Seasonal & Holiday"),
            ("Mother’s Day", ["EVENT"], 0, "Seasonal & Holiday"),
            ("Movie & Film", ["EVENT"], 0, "Shows"),
            ("Music", ["EVENT"], 0, "Shows"),
            ("New Year’s Eve & New Year’s Day", ["EVENT"], 0, "Seasonal & Holiday"),
            ("Patriot Day (9/11)", ["EVENT"], 0, "Seasonal & Holiday"),
            ("Performing Arts", ["EVENT"], 0, "Shows"),
            ("Presidents Day", ["EVENT"], 0, "Seasonal & Holiday"),
            ("Pride Month", ["EVENT"], 0, "Seasonal & Holiday"),
            ("Ramadan / Eid", ["EVENT"], 0, "Seasonal & Holiday"),
            ("Business Law", ["BUSINESS"], 0, "Legal"),
            ("Estate Planning", ["BUSINESS"], 0, "Legal"),
        ]

        created_by_name = {}
        for name, applicable_to, sort_order, parent_name in categories_data:
            parent = created_by_name.get(parent_name) if parent_name else None
            category = Category(
                name=name,
                slug=generate_slug(name),
                applicable_to=applicable_to,
                parent_id=parent.id if parent else None,
                is_active=True,
                sort_order=sort_order,
            )
            db.add(category)
            db.commit()
            db.refresh(category)
            created_by_name[name] = category

        print(f"\n✅ Successfully seeded {len(categories_data)} categories!")

    except Exception as e:
        print(f"❌ Error seeding categories: {e}")
        db.rollback()
        raise
    finally:
        db.close()

if __name__ == "__main__":
    seed_categories()
