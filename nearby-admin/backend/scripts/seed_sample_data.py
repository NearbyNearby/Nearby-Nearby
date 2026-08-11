#!/usr/bin/env python3
"""
Seed script for local development database.

Creates ~12 sample POIs (businesses, parks, trails, events) in the
Pittsboro / Chatham County, NC area with Unsplash images so the
frontend has real content to display.

Usage (inside admin backend container):
    python scripts/seed_sample_data.py

Or from host:
    docker exec nearby-admin-backend-1 python scripts/seed_sample_data.py
"""

import sys
import os
import uuid
from datetime import datetime, timedelta, timezone

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.poi import PointOfInterest, Business, Park, Trail, Event
from app.models.category import Category, poi_category_association
from app.models.image import Image, ImageType
from app.models.parking_lot import ParkingLot
from app.models.user import User
from app.core.security import get_password_hash
from app.crud.crud_user import get_user_by_email
from app.schemas.category import generate_slug
from app.crud.crud_poi import (
    compute_accessible_restroom,
    compute_icon_booleans,
    _default_missing_restroom_coords,
)

from shared.models.enums import POIType
from shared.constants.field_options import RESTROOM_ADA_CHECKLIST
from shared.poi_points import sync_point_rows
from shared.parking_lots import sync_parking_links

# ---------------------------------------------------------------------------
# Unsplash photo IDs — all freely licensed
# ---------------------------------------------------------------------------
UNSPLASH = {
    # Businesses
    "cafe_main": "photo-1509042239860-f550ce710b93",
    "cafe_gallery1": "photo-1495474472287-4d71bcdd2085",
    "cafe_gallery2": "photo-1442512595331-e89e73853f31",
    "store_main": "photo-1604719312566-8912e9227c6a",
    "store_gallery1": "photo-1556742049-0cfed4f6a45d",
    "store_gallery2": "photo-1582268611958-ebfd161ef9cf",
    "bbq_main": "photo-1529193591184-b1d58069ecdd",
    "bbq_gallery1": "photo-1558030006-450675393462",
    "bbq_gallery2": "photo-1544025162-d76694265947",
    # Parks
    "park1_main": "photo-1441974231531-c6227db76b6e",
    "park1_gallery1": "photo-1472396961693-142e6e269027",
    "park1_gallery2": "photo-1500534314263-0869cdc67ded",
    "park2_main": "photo-1507003211169-0a1dd7228f2d",
    "park2_gallery1": "photo-1470071459604-3b5ec3a7fe05",
    "park3_main": "photo-1518173946687-a74572de8e8c",
    "park3_gallery1": "photo-1476610182048-b716b8518aae",
    # Trails
    "trail1_main": "photo-1551632811-561732d1e306",
    "trail1_gallery1": "photo-1501555088652-021faa106b9b",
    "trail1_gallery2": "photo-1519681393784-d120267933ba",
    "trail2_main": "photo-1510797215324-95aa89f43c33",
    "trail2_gallery1": "photo-1473448912268-2022ce9509d8",
    "trail3_main": "photo-1504280390367-361c6d9f38f4",
    "trail3_gallery1": "photo-1542202229-7d93c33f5d07",
    # Events
    "event1_main": "photo-1533174072545-7a4b6ad7a6c3",
    "event1_gallery1": "photo-1555939594-58d7cb561ad1",
    "event2_main": "photo-1472653431158-6364773b2a56",
    "event2_gallery1": "photo-1514525253161-7a46d19cd819",
    "event3_main": "photo-1429962714451-bb934ecdc4ec",
    "event3_gallery1": "photo-1470229722913-7c0e2dbbafd3",
}


def unsplash_url(key: str, w: int = 800) -> str:
    """Build a sized Unsplash URL from a photo key."""
    photo_id = UNSPLASH[key]
    return f"https://images.unsplash.com/{photo_id}?w={w}&q=80&auto=format"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def ensure_test_user(db: Session) -> User:
    """Create seed@nearbynearby.com if it doesn't exist. Return User."""
    email = "seed@nearbynearby.com"
    user = get_user_by_email(db, email)
    if user:
        print(f"  Test user already exists: {email}")
        return user
    user = User(
        email=email,
        hashed_password=get_password_hash("seed1234"),
        role="admin",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    print(f"  Created test user: {email}")
    return user


def ensure_categories(db: Session):
    """Run seed_categories if the table is empty."""
    count = db.query(Category).count()
    if count > 0:
        print(f"  Categories already seeded ({count} rows)")
        return
    print("  Seeding categories...")
    from scripts.seed_categories import seed_categories
    seed_categories()


def get_category(db: Session, name: str) -> Category | None:
    return db.query(Category).filter(Category.name == name).first()


# (name, applicable_to, parent_name, is_active)
#
# ensure_categories only seeds when the table is empty, and older local DBs were
# filled from a flat snapshot, so the category tree screen renders as one long
# list. This gives local dev a small, realistic hierarchy without duplicating
# anything: two existing top-level categories adopt leaves they already read
# like ("Food & Drink", "Sports Fields"), one new parent groups the outdoor
# leaves, and one child is seeded inactive so the Inactive badge has something
# to render. Parents are listed before their children so the name lookup always
# resolves, which also means the spec itself cannot describe a cycle.
CATEGORY_HIERARCHY = [
    ("Outdoor Recreation", ["PARK", "TRAIL"], None, True),
    ("Trail Hiking", ["TRAIL"], "Outdoor Recreation", True),
    ("Backpacking", ["TRAIL"], "Trail Hiking", True),
    ("Mountain Biking", ["TRAIL"], "Outdoor Recreation", True),
    ("Park Hiking Trails", ["PARK"], "Outdoor Recreation", True),
    ("Snowshoe & Winter Trails", ["TRAIL"], "Outdoor Recreation", False),
    ("Food & Drink", ["BUSINESS", "EVENT"], None, True),
    ("Restaurant & Food", ["BUSINESS"], "Food & Drink", True),
    ("Takeout", ["BUSINESS"], "Restaurant & Food", True),
    ("Farmers Markets", ["BUSINESS", "EVENT"], "Food & Drink", True),
    ("Catering", ["BUSINESS"], "Food & Drink", True),
    ("Sports Fields", ["PARK"], None, True),
    ("Baseball Field", ["PARK"], "Sports Fields", True),
    ("Basketball Court", ["PARK"], "Sports Fields", True),
    ("Soccer Field", ["PARK"], "Sports Fields", True),
    ("Tennis Court", ["PARK"], "Sports Fields", True),
]


def _is_descendant_of(node: Category, maybe_ancestor: Category) -> bool:
    """True when `node` already sits somewhere under `maybe_ancestor`."""
    seen = set()
    while node is not None and node.id not in seen:
        if node.id == maybe_ancestor.id:
            return True
        seen.add(node.id)
        node = node.parent
    return False


def ensure_category_hierarchy(db: Session):
    """Nest a handful of categories so the admin tree view has real depth.

    Idempotent: categories are matched by their unique name, missing ones are
    created, and existing ones are only touched when their parent, POI types or
    active flag differ from the spec. POI types are widened by union so a
    category never loses an applicability it already had.
    """
    created = 0
    updated = 0

    for name, applicable_to, parent_name, is_active in CATEGORY_HIERARCHY:
        parent = get_category(db, parent_name) if parent_name else None
        if parent_name and not parent:
            print(f"  WARNING: parent '{parent_name}' not found; leaving '{name}' where it is.")
            continue

        category = get_category(db, name)
        if not category:
            category = Category(
                name=name,
                slug=generate_slug(name),
                applicable_to=sorted(applicable_to),
                parent_id=parent.id if parent else None,
                is_active=is_active,
                sort_order=0,
            )
            db.add(category)
            db.commit()
            created += 1
            where = f" under {parent_name}" if parent_name else " (top level)"
            print(f"  Created category: {name}{where}")
            continue

        if parent and _is_descendant_of(parent, category):
            print(f"  WARNING: '{parent_name}' sits under '{name}'; skipping to avoid a cycle.")
            continue

        changes = []
        target_parent_id = parent.id if parent else None
        if category.parent_id != target_parent_id:
            category.parent_id = target_parent_id
            changes.append(f"nested under {parent_name}" if parent_name else "moved to top level")

        merged_types = sorted(set(category.applicable_to or []) | set(applicable_to))
        if merged_types != sorted(category.applicable_to or []):
            category.applicable_to = merged_types
            changes.append(f"POI types {', '.join(merged_types)}")

        if bool(category.is_active) != is_active:
            category.is_active = is_active
            changes.append("marked inactive" if not is_active else "marked active")

        if changes:
            db.commit()
            updated += 1
            print(f"  Updated category: {name} ({'; '.join(changes)})")

    if created or updated:
        print(f"  Hierarchy: {created} categories created, {updated} updated")
    else:
        print("  Hierarchy already in place")


def attach_image(
    db: Session,
    poi_id: uuid.UUID,
    image_type: ImageType,
    image_key: str,
    display_order: int = 0,
    alt_text: str = "",
    image_context: str | None = None,
) -> Image | None:
    """Download an Unsplash image and create an Image record.

    Because we're seeding a *local dev* database (no S3/MinIO required for
    display), we store a direct Unsplash URL as the storage_url. The frontend
    will load images from these URLs directly.

    ``image_context`` scopes a contextual sub-entity photo (e.g. an event
    sponsor's logo, uploaded under ``sponsor_<id>``) the same way the real
    admin form does; leave it None for a POI's own main/gallery images.
    """
    url = unsplash_url(image_key, w=800)
    thumb_url = unsplash_url(image_key, w=150)

    img = Image(
        poi_id=poi_id,
        image_type=image_type,
        image_context=image_context,
        filename=f"{image_key}.jpg",
        original_filename=f"{image_key}.jpg",
        mime_type="image/jpeg",
        width=800,
        height=600,
        storage_provider="external",
        storage_url=url,
        storage_key=f"seed/{image_key}.jpg",
        image_size_variant="original",
        alt_text=alt_text or image_key.replace("_", " ").title(),
        display_order=display_order,
    )
    db.add(img)
    db.flush()  # Get img.id so we can link the thumbnail

    # Create a thumbnail variant record so the frontend has a thumb URL
    thumb = Image(
        poi_id=poi_id,
        image_type=image_type,
        image_context=image_context,
        filename=f"thumbnail_{image_key}.jpg",
        original_filename=f"{image_key}.jpg",
        mime_type="image/jpeg",
        width=150,
        height=150,
        storage_provider="external",
        storage_url=thumb_url,
        storage_key=f"seed/thumbnail_{image_key}.jpg",
        image_size_variant="thumbnail",
        parent_image_id=img.id,
        alt_text=alt_text or image_key.replace("_", " ").title(),
        display_order=display_order,
    )
    db.add(thumb)
    return img


def compute_amenity_icons(
    *,
    wifi_options=None,
    pet_options=None,
    public_toilets=None,
    accessible_restroom_details=None,
    accessible_parking_details=None,
    mobility_access=None,
    inclusive_playground=False,
):
    """Run the given underlying fields through the SAME icon-boolean helpers
    ``app.crud.crud_poi`` runs on every real admin create/update, so a seeded
    POI earns icon_free_wifi / icon_pet_friendly / icon_public_restroom /
    icon_wheelchair_accessible exactly the way a real save would (rather than
    us guessing/hardcoding the booleans directly).
    """
    data = {
        "wifi_options": wifi_options,
        "pet_options": pet_options,
        "public_toilets": public_toilets,
        "accessible_restroom_details": accessible_restroom_details,
        "accessible_parking_details": accessible_parking_details,
        "mobility_access": mobility_access,
        "inclusive_playground": inclusive_playground,
        "amenities": {},
    }
    compute_accessible_restroom(data)
    compute_icon_booleans(data)
    return {
        "accessible_restroom": data["accessible_restroom"],
        "icon_free_wifi": data["icon_free_wifi"],
        "icon_pet_friendly": data["icon_pet_friendly"],
        "icon_public_restroom": data["icon_public_restroom"],
        "icon_wheelchair_accessible": data["icon_wheelchair_accessible"],
    }


# Pull the exact ADA checklist labels from the shared constant (rather than
# retyping them) so compute_accessible_restroom's substring matching is
# guaranteed to line up with what a real admin checkbox would send.
def _restroom_ada_label(prefix: str) -> str:
    return next(item["label"] for item in RESTROOM_ADA_CHECKLIST if item["label"].startswith(prefix))


# ---------------------------------------------------------------------------
# POI definitions
# ---------------------------------------------------------------------------

def create_businesses(db: Session):
    print("\n--- Businesses ---")

    cat_restaurant = get_category(db, "Restaurant & Food")
    cat_retail = get_category(db, "Shopping & Retail")

    businesses = [
        {
            "name": "Chatham Coffee Co.",
            "slug": "chatham-coffee-co-pittsboro",
            "location": "POINT(-79.1762 35.7215)",
            "description_short": "Locally roasted specialty coffee and fresh-baked pastries in downtown Pittsboro.",
            "description_long": (
                "Chatham Coffee Co. is a community gathering place in the heart of "
                "downtown Pittsboro. We roast our beans in small batches using ethically "
                "sourced green coffee from around the world. Our pastry case is stocked "
                "daily with scones, muffins, and seasonal treats baked in-house. Whether "
                "you need a morning pick-me-up or a quiet afternoon workspace, our cozy "
                "shop has you covered."
            ),
            "teaser_paragraph": "Small-batch roasted coffee & fresh pastries daily.",
            "address_street": "42 Hillsboro Street",
            "address_city": "Pittsboro",
            "address_state": "NC",
            "address_zip": "27312",
            "address_county": "Chatham County",
            "address_full": "42 Hillsboro Street, Pittsboro, NC 27312",
            "website_url": "https://chathamcoffee.example.com",
            "phone_number": "(919) 555-0101",
            "price_range": "$$",
            "hours": {
                "monday": [{"open": "06:30", "close": "17:00"}],
                "tuesday": [{"open": "06:30", "close": "17:00"}],
                "wednesday": [{"open": "06:30", "close": "17:00"}],
                "thursday": [{"open": "06:30", "close": "17:00"}],
                "friday": [{"open": "06:30", "close": "18:00"}],
                "saturday": [{"open": "07:00", "close": "18:00"}],
                "sunday": [{"open": "08:00", "close": "15:00"}],
            },
            "category": cat_restaurant,
            "images": {
                "main": "cafe_main",
                "gallery": ["cafe_gallery1", "cafe_gallery2"],
            },
            "ideal_for": ["All Ages", "Families", "Pet Friendly"],
            "payment_methods": ["Cash", "Credit Card", "Apple Pay"],
            "business_amenities": ["Wi-Fi Access", "Public Restroom"],
            "pet_options": ["Dog Friendly"],
        },
        {
            "name": "Pittsboro General Store",
            "slug": "pittsboro-general-store-pittsboro",
            "location": "POINT(-79.1780 35.7202)",
            "description_short": "Vintage-inspired general store carrying local goods, pantry staples, and gifts.",
            "description_long": (
                "Pittsboro General Store is a throwback to a simpler time. We stock "
                "locally made jams, honey, and sauces alongside everyday pantry items "
                "you won't find at the big-box stores. Our shelves also feature handmade "
                "gifts, candles, and pottery from Chatham County artisans. Stop in for a "
                "cold bottle of Cheerwine and a friendly chat."
            ),
            "teaser_paragraph": "Local goods, pantry staples & handmade gifts.",
            "address_street": "15 Sanford Road",
            "address_city": "Pittsboro",
            "address_state": "NC",
            "address_zip": "27312",
            "address_county": "Chatham County",
            "address_full": "15 Sanford Road, Pittsboro, NC 27312",
            "website_url": "https://pittsborogeneral.example.com",
            "phone_number": "(919) 555-0102",
            "price_range": "$",
            "hours": {
                "monday": [{"open": "09:00", "close": "18:00"}],
                "tuesday": [{"open": "09:00", "close": "18:00"}],
                "wednesday": [{"open": "09:00", "close": "18:00"}],
                "thursday": [{"open": "09:00", "close": "18:00"}],
                "friday": [{"open": "09:00", "close": "19:00"}],
                "saturday": [{"open": "10:00", "close": "17:00"}],
                "sunday": {"closed": True},
            },
            "category": cat_retail,
            "images": {
                "main": "store_main",
                "gallery": ["store_gallery1", "store_gallery2"],
            },
            "ideal_for": ["All Ages", "Families"],
            "payment_methods": ["Cash", "Credit Card"],
            "business_amenities": ["Public Restroom", "Parking Facilities"],
        },
        {
            "name": "Southern Roots BBQ",
            "slug": "southern-roots-bbq-pittsboro",
            "location": "POINT(-79.1745 35.7228)",
            "description_short": "Slow-smoked Eastern NC-style barbecue with homemade sides and sweet tea.",
            "description_long": (
                "Southern Roots BBQ has been serving Chatham County's finest pit-cooked "
                "pork since 2018. Our pitmasters start the smokers before dawn, cooking "
                "whole hogs low and slow over hickory and oak. Pair your pulled pork with "
                "our famous vinegar slaw, hush puppies, and banana pudding. We also cater "
                "events large and small — ask about our whole-hog packages."
            ),
            "teaser_paragraph": "Pit-cooked whole hog BBQ & homemade sides since 2018.",
            "address_street": "108 East Street",
            "address_city": "Pittsboro",
            "address_state": "NC",
            "address_zip": "27312",
            "address_county": "Chatham County",
            "address_full": "108 East Street, Pittsboro, NC 27312",
            "website_url": "https://southernrootsbbq.example.com",
            "phone_number": "(919) 555-0103",
            "price_range": "$$",
            "hours": {
                "monday": {"closed": True},
                "tuesday": {"closed": True},
                "wednesday": [{"open": "11:00", "close": "20:00"}],
                "thursday": [{"open": "11:00", "close": "20:00"}],
                "friday": [{"open": "11:00", "close": "21:00"}],
                "saturday": [{"open": "11:00", "close": "21:00"}],
                "sunday": [{"open": "11:00", "close": "15:00"}],
            },
            "category": cat_restaurant,
            "images": {
                "main": "bbq_main",
                "gallery": ["bbq_gallery1", "bbq_gallery2"],
            },
            "ideal_for": ["All Ages", "Families", "For the Kids"],
            "payment_methods": ["Cash", "Credit Card"],
            "business_amenities": ["Public Restroom", "Parking Facilities"],
            "pet_options": ["Dog Friendly"],
        },
    ]

    for biz in businesses:
        existing = db.query(PointOfInterest).filter(
            PointOfInterest.slug == biz["slug"]
        ).first()
        if existing:
            print(f"  Skipping (exists): {biz['name']}")
            continue

        poi = PointOfInterest(
            poi_type=POIType.BUSINESS,
            name=biz["name"],
            slug=biz["slug"],
            listing_type="paid",
            publication_status="published",
            is_verified=True,
            status="Fully Open",
            location=biz["location"],
            description_short=biz["description_short"],
            description_long=biz["description_long"],
            teaser_paragraph=biz.get("teaser_paragraph"),
            address_street=biz["address_street"],
            address_city=biz["address_city"],
            address_state=biz["address_state"],
            address_zip=biz["address_zip"],
            address_county=biz["address_county"],
            address_full=biz["address_full"],
            website_url=biz.get("website_url"),
            phone_number=biz.get("phone_number"),
            hours=biz.get("hours"),
            ideal_for=biz.get("ideal_for"),
            payment_methods=biz.get("payment_methods"),
            business_amenities=biz.get("business_amenities"),
            pet_options=biz.get("pet_options"),
        )
        poi.business = Business(price_range=biz["price_range"])
        db.add(poi)
        db.flush()

        if biz.get("category"):
            db.execute(poi_category_association.insert().values(
                poi_id=poi.id, category_id=biz["category"].id, is_main=True
            ))

        # Images
        imgs = biz["images"]
        attach_image(db, poi.id, ImageType.main, imgs["main"], alt_text=f"{biz['name']} storefront")
        for i, key in enumerate(imgs.get("gallery", [])):
            attach_image(db, poi.id, ImageType.gallery, key, display_order=i)

        db.commit()
        print(f"  Created: {biz['name']} (slug: {poi.slug})")


def create_parks(db: Session):
    print("\n--- Parks ---")

    cat_state = get_category(db, "State Park")
    cat_municipal = get_category(db, "Municipal Park")
    cat_preserve = get_category(db, "Nature Preserve")

    parks = [
        {
            "name": "Haw River State Park",
            "slug": "haw-river-state-park-pittsboro",
            "location": "POINT(-79.1650 35.7350)",
            "description_short": "A scenic state park along the Haw River with camping, fishing, and paddling.",
            "description_long": (
                "Haw River State Park stretches along miles of the Haw River offering "
                "some of the best paddling in the Piedmont. Campsites range from walk-in "
                "tent sites to RV-friendly pads with hookups. Fish for largemouth bass "
                "and catfish from the shore or launch your canoe at the river access. "
                "Picnic shelters and a nature center make this a perfect day-trip "
                "destination for families."
            ),
            "teaser_paragraph": "Paddling, camping & fishing along the scenic Haw River.",
            "address_street": "339 Haw River Road",
            "address_city": "Pittsboro",
            "address_state": "NC",
            "address_zip": "27312",
            "address_county": "Chatham County",
            "address_full": "339 Haw River Road, Pittsboro, NC 27312",
            "category": cat_state,
            "hours": {
                "monday": [{"open": "07:00", "close": "21:00"}],
                "tuesday": [{"open": "07:00", "close": "21:00"}],
                "wednesday": [{"open": "07:00", "close": "21:00"}],
                "thursday": [{"open": "07:00", "close": "21:00"}],
                "friday": [{"open": "07:00", "close": "21:00"}],
                "saturday": [{"open": "07:00", "close": "21:00"}],
                "sunday": [{"open": "07:00", "close": "21:00"}],
            },
            "cost": "0",
            "images": {"main": "park1_main", "gallery": ["park1_gallery1", "park1_gallery2"]},
            # "key_facilities" removed — renamed _deprecated_key_facilities (Migration A #34)
            "pet_options": ["Dog Friendly", "Clean Up Stations"],
            # "wheelchair_accessible" removed — column dropped (Issue #45 PR2 Migration B)
            "public_toilets": ["Wheelchair Accessible"],
        },
        {
            "name": "Robeson Creek Park",
            "slug": "robeson-creek-park-pittsboro",
            "location": "POINT(-79.1830 35.7120)",
            "description_short": "A quiet municipal park with playgrounds, sports fields, and a creek-side walking path.",
            "description_long": (
                "Robeson Creek Park is Pittsboro's favorite neighborhood green space. "
                "The park features two playgrounds (toddler and ages 5-12), a basketball "
                "court, and a large multi-purpose field used for soccer and flag football. "
                "A paved walking path winds along Robeson Creek under towering oaks — "
                "perfect for a morning stroll or an after-dinner walk with the dog."
            ),
            "teaser_paragraph": "Playgrounds, sports fields & a creekside walking path.",
            "address_street": "200 Robeson Street",
            "address_city": "Pittsboro",
            "address_state": "NC",
            "address_zip": "27312",
            "address_county": "Chatham County",
            "address_full": "200 Robeson Street, Pittsboro, NC 27312",
            "category": cat_municipal,
            "hours": {
                "monday": [{"open": "06:00", "close": "22:00"}],
                "tuesday": [{"open": "06:00", "close": "22:00"}],
                "wednesday": [{"open": "06:00", "close": "22:00"}],
                "thursday": [{"open": "06:00", "close": "22:00"}],
                "friday": [{"open": "06:00", "close": "22:00"}],
                "saturday": [{"open": "06:00", "close": "22:00"}],
                "sunday": [{"open": "06:00", "close": "22:00"}],
            },
            "cost": "0",
            "images": {"main": "park2_main", "gallery": ["park2_gallery1"]},
            "playground_available": True,
            "playground_types": ["Toddler (0-25 months)", "Ages 5-12"],
            "playground_surface_types": ["Rubber Mulch", "Sand"],
            # "key_facilities" removed — renamed _deprecated_key_facilities (Migration A #34)
            "pet_options": ["Dog Friendly", "Clean Up Stations"],
            "public_toilets": ["Baby Changing Station"],
        },
        {
            "name": "Chatham Mills Nature Preserve",
            "slug": "chatham-mills-nature-preserve-pittsboro",
            "location": "POINT(-79.1900 35.7180)",
            "description_short": "A 120-acre nature preserve with old-growth forest, birding trails, and a historic mill site.",
            "description_long": (
                "Chatham Mills Nature Preserve protects 120 acres of Piedmont hardwood "
                "forest along the Rocky River. The preserve is managed by the Chatham "
                "Conservation Trust and features two miles of easy hiking trails that "
                "wind through towering tulip poplars, past the ruins of an 1850s grist "
                "mill, and along the river bluffs. It's one of the best birding spots "
                "in the county — look for prothonotary warblers in spring."
            ),
            "teaser_paragraph": "Old-growth forest, historic mill ruins & top birding spot.",
            "address_street": "480 Mill Road",
            "address_city": "Pittsboro",
            "address_state": "NC",
            "address_zip": "27312",
            "address_county": "Chatham County",
            "address_full": "480 Mill Road, Pittsboro, NC 27312",
            "category": cat_preserve,
            "hours": {
                "monday": [{"open": "dawn", "close": "dusk"}],
                "tuesday": [{"open": "dawn", "close": "dusk"}],
                "wednesday": [{"open": "dawn", "close": "dusk"}],
                "thursday": [{"open": "dawn", "close": "dusk"}],
                "friday": [{"open": "dawn", "close": "dusk"}],
                "saturday": [{"open": "dawn", "close": "dusk"}],
                "sunday": [{"open": "dawn", "close": "dusk"}],
            },
            "cost": "0",
            "images": {"main": "park3_main", "gallery": ["park3_gallery1"]},
            # "key_facilities" removed — renamed _deprecated_key_facilities (Migration A #34)
            "pet_options": ["Dog Friendly", "Clean Up Stations"],
        },
    ]

    for p in parks:
        existing = db.query(PointOfInterest).filter(
            PointOfInterest.slug == p["slug"]
        ).first()
        if existing:
            print(f"  Skipping (exists): {p['name']}")
            continue

        poi = PointOfInterest(
            poi_type=POIType.PARK,
            name=p["name"],
            slug=p["slug"],
            listing_type="community_comped",
            publication_status="published",
            is_verified=True,
            status="Fully Open",
            location=p["location"],
            description_short=p["description_short"],
            description_long=p["description_long"],
            teaser_paragraph=p.get("teaser_paragraph"),
            address_street=p["address_street"],
            address_city=p["address_city"],
            address_state=p["address_state"],
            address_zip=p["address_zip"],
            address_county=p["address_county"],
            address_full=p["address_full"],
            hours=p.get("hours"),
            cost=p.get("cost"),
            # key_facilities removed — renamed _deprecated_key_facilities (Migration A #34)
            # wheelchair_accessible removed — column dropped (Issue #45 PR2 Migration B)
            pet_options=p.get("pet_options"),
            public_toilets=p.get("public_toilets"),
            playground_available=p.get("playground_available", False),
            playground_types=p.get("playground_types"),
            playground_surface_types=p.get("playground_surface_types"),
        )
        poi.park = Park(drone_usage_policy="No drones without permit")
        db.add(poi)
        db.flush()

        if p.get("category"):
            db.execute(poi_category_association.insert().values(
                poi_id=poi.id, category_id=p["category"].id, is_main=True
            ))

        imgs = p["images"]
        attach_image(db, poi.id, ImageType.main, imgs["main"], alt_text=f"{p['name']} scenic view")
        for i, key in enumerate(imgs.get("gallery", [])):
            attach_image(db, poi.id, ImageType.gallery, key, display_order=i)

        db.commit()
        print(f"  Created: {p['name']} (slug: {poi.slug})")


def create_trails(db: Session):
    print("\n--- Trails ---")

    cat_moderate = get_category(db, "Moderate")
    cat_easy = get_category(db, "Easy")
    cat_hard = get_category(db, "Hard")

    trails = [
        {
            "name": "Deep River Trail",
            "slug": "deep-river-trail-pittsboro",
            "location": "POINT(-79.1580 35.7280)",
            "description_short": "A 3.2-mile moderate loop through river-bottom forest with scenic bluff overlooks.",
            "description_long": (
                "Deep River Trail follows the banks of the Deep River through one of "
                "the most beautiful stretches of bottomland hardwood in Chatham County. "
                "The 3.2-mile loop gains about 250 feet of elevation as it climbs to "
                "a series of bluff overlooks before descending back to the river. "
                "Wildflowers carpet the forest floor in April and May. The trail is "
                "well-marked with blue blazes and maintained by the Chatham Trails "
                "Association."
            ),
            "teaser_paragraph": "Scenic 3.2-mile river loop with bluff overlooks.",
            "address_street": "Deep River Access Road",
            "address_city": "Pittsboro",
            "address_state": "NC",
            "address_zip": "27312",
            "address_county": "Chatham County",
            "address_full": "Deep River Access Road, Pittsboro, NC 27312",
            "category": cat_moderate,
            "trail": {
                "length_text": "3.2 miles",
                "difficulty": "moderate",
                "route_type": "loop",
                "trail_surfaces": ["Dirt", "Rock"],
                "trail_experiences": ["River Views", "Wildflowers", "Bluff Overlooks"],
            },
            "images": {"main": "trail1_main", "gallery": ["trail1_gallery1", "trail1_gallery2"]},
            "cost": "0",
            "pet_options": ["Dog Friendly", "Clean Up Stations"],
        },
        {
            "name": "Rocky River Greenway",
            "slug": "rocky-river-greenway-pittsboro",
            "location": "POINT(-79.1870 35.7150)",
            "description_short": "An easy 1.5-mile paved greenway along Rocky River — perfect for families and bikes.",
            "description_long": (
                "Rocky River Greenway is a paved multi-use path that follows the Rocky "
                "River for 1.5 miles from the Chatham Park trailhead to the Pittsboro "
                "town limits. The flat, wide surface is ideal for strollers, wheelchairs, "
                "and cyclists. Benches and interpretive signs are placed along the route. "
                "A small nature playground near the midpoint makes this a great outing "
                "for families with young children."
            ),
            "teaser_paragraph": "Flat 1.5-mile paved path perfect for families & bikes.",
            "address_street": "Chatham Park Drive",
            "address_city": "Pittsboro",
            "address_state": "NC",
            "address_zip": "27312",
            "address_county": "Chatham County",
            "address_full": "Chatham Park Drive, Pittsboro, NC 27312",
            "category": cat_easy,
            "trail": {
                "length_text": "1.5 miles",
                "difficulty": "easy",
                "route_type": "out_and_back",
                "trail_surfaces": ["Paved"],
                "trail_experiences": ["River Views", "Nature Playground", "Accessible"],
            },
            "images": {"main": "trail2_main", "gallery": ["trail2_gallery1"]},
            "cost": "0",
            # "wheelchair_accessible" removed — column dropped (Issue #45 PR2 Migration B)
            "pet_options": ["Dog Friendly", "Clean Up Stations"],
        },
        {
            "name": "Devil's Tramping Ground Trail",
            "slug": "devils-tramping-ground-trail-siler-city",
            "location": "POINT(-79.2650 35.6800)",
            "description_short": "A challenging 4.8-mile loop through rugged terrain to a mysterious bare circle in the woods.",
            "description_long": (
                "Devil's Tramping Ground Trail leads hikers through 4.8 miles of "
                "rolling Piedmont forest to one of North Carolina's oldest mysteries — "
                "a 40-foot bare circle where nothing grows. Local legend says the devil "
                "paces here at night. The trail itself is challenging, with steep "
                "ravines, multiple creek crossings, and sections of exposed root. Bring "
                "trekking poles and sturdy boots. The trailhead has limited parking for "
                "about 10 cars."
            ),
            "teaser_paragraph": "Rugged 4.8-mile hike to NC's most mysterious bare circle.",
            "address_street": "Devil's Tramping Ground Road",
            "address_city": "Siler City",
            "address_state": "NC",
            "address_zip": "27344",
            "address_county": "Chatham County",
            "address_full": "Devil's Tramping Ground Road, Siler City, NC 27344",
            "category": cat_hard,
            "trail": {
                "length_text": "4.8 miles",
                "difficulty": "challenging",
                "route_type": "loop",
                "trail_surfaces": ["Dirt", "Rock", "Root"],
                "trail_experiences": ["Historic Site", "Creek Crossings", "Rugged Terrain"],
            },
            "images": {"main": "trail3_main", "gallery": ["trail3_gallery1"]},
            "cost": "0",
            "pet_options": ["Dog Friendly"],
        },
    ]

    for t in trails:
        existing = db.query(PointOfInterest).filter(
            PointOfInterest.slug == t["slug"]
        ).first()
        if existing:
            print(f"  Skipping (exists): {t['name']}")
            continue

        trail_data = t["trail"]
        poi = PointOfInterest(
            poi_type=POIType.TRAIL,
            name=t["name"],
            slug=t["slug"],
            listing_type="community_comped",
            publication_status="published",
            is_verified=True,
            status="Fully Open",
            location=t["location"],
            description_short=t["description_short"],
            description_long=t["description_long"],
            teaser_paragraph=t.get("teaser_paragraph"),
            address_street=t["address_street"],
            address_city=t["address_city"],
            address_state=t["address_state"],
            address_zip=t["address_zip"],
            address_county=t["address_county"],
            address_full=t["address_full"],
            cost=t.get("cost"),
            pet_options=t.get("pet_options"),
            # wheelchair_accessible removed — column dropped (Issue #45 PR2 Migration B)
        )
        poi.trail = Trail(
            length_text=trail_data["length_text"],
            difficulty=trail_data["difficulty"],
            route_type=trail_data["route_type"],
            trail_surfaces=trail_data.get("trail_surfaces"),
            trail_experiences=trail_data.get("trail_experiences"),
        )
        db.add(poi)
        db.flush()

        if t.get("category"):
            db.execute(poi_category_association.insert().values(
                poi_id=poi.id, category_id=t["category"].id, is_main=True
            ))

        imgs = t["images"]
        attach_image(db, poi.id, ImageType.main, imgs["main"], alt_text=f"{t['name']} trailhead")
        for i, key in enumerate(imgs.get("gallery", [])):
            attach_image(db, poi.id, ImageType.gallery, key, display_order=i)

        db.commit()
        print(f"  Created: {t['name']} (slug: {poi.slug})")


def create_events(db: Session):
    print("\n--- Events ---")

    cat_market = get_category(db, "Market")
    cat_festival = get_category(db, "Festival")

    now = datetime.now(timezone.utc)

    events = [
        {
            "name": "Pittsboro First Sunday",
            "slug": "pittsboro-first-sunday-pittsboro",
            "location": "POINT(-79.1770 35.7208)",
            "description_short": "Monthly outdoor market on the Pittsboro courthouse lawn with local vendors and live music.",
            "description_long": (
                "Pittsboro First Sunday is a beloved monthly tradition held on the "
                "courthouse lawn in downtown Pittsboro. Every first Sunday of the month, "
                "30+ local vendors set up booths selling produce, baked goods, crafts, "
                "and art. Live acoustic music plays throughout the afternoon. Food trucks "
                "line Hillsboro Street, and the Chatham Arts Council hosts a kid's craft "
                "table. Free admission — just show up and enjoy."
            ),
            "teaser_paragraph": "30+ local vendors, live music & food trucks monthly.",
            "address_street": "Courthouse Square",
            "address_city": "Pittsboro",
            "address_state": "NC",
            "address_zip": "27312",
            "address_county": "Chatham County",
            "address_full": "Courthouse Square, Pittsboro, NC 27312",
            "category": cat_market,
            "event": {
                "start_datetime": (now + timedelta(days=7)).replace(hour=11, minute=0, second=0),
                "end_datetime": (now + timedelta(days=7)).replace(hour=16, minute=0, second=0),
                "is_repeating": True,
                "repeat_pattern": {"frequency": "monthly", "day_of_month": "first_sunday"},
                "organizer_name": "Downtown Pittsboro Association",
                "venue_settings": ["Outdoor"],
            },
            "cost": "0",
            "images": {"main": "event1_main", "gallery": ["event1_gallery1"]},
            "ideal_for": ["All Ages", "Families", "For the Kids", "Pet Friendly"],
            "pet_options": ["Dog Friendly"],
        },
        {
            "name": "Chatham County Fair",
            "slug": "chatham-county-fair-pittsboro",
            "location": "POINT(-79.1700 35.7300)",
            "description_short": "Annual county fair with rides, livestock shows, a demolition derby, and fried everything.",
            "description_long": (
                "The Chatham County Fair has been a fall tradition for over 60 years. "
                "Held at the fairgrounds on US-64, the week-long event features a midway "
                "with carnival rides, a 4-H livestock exhibition, a Friday-night "
                "demolition derby, and enough fried food to last a lifetime. Gate "
                "admission is $10 for adults, $5 for kids. Ride wristbands sold "
                "separately. Don't miss the homemade pie contest on Saturday."
            ),
            "teaser_paragraph": "Rides, livestock shows, demolition derby & fried everything.",
            "address_street": "1000 US Highway 64 West",
            "address_city": "Pittsboro",
            "address_state": "NC",
            "address_zip": "27312",
            "address_county": "Chatham County",
            "address_full": "1000 US Highway 64 West, Pittsboro, NC 27312",
            "category": cat_festival,
            "event": {
                "start_datetime": (now + timedelta(days=30)).replace(hour=17, minute=0, second=0),
                "end_datetime": (now + timedelta(days=37)).replace(hour=22, minute=0, second=0),
                "is_repeating": False,
                "organizer_name": "Chatham County Agricultural Society",
                "venue_settings": ["Outdoor", "Indoor"],
            },
            "cost": "$10",
            "ticket_link": "https://chathamfair.example.com/tickets",
            "images": {"main": "event2_main", "gallery": ["event2_gallery1"]},
            "ideal_for": ["All Ages", "Families", "For the Kids"],
        },
        {
            "name": "Shakori Hills Music Festival",
            "slug": "shakori-hills-music-festival-pittsboro",
            "location": "POINT(-79.2100 35.7050)",
            "description_short": "A weekend grassroots music festival with four stages, camping, and community workshops.",
            "description_long": (
                "Shakori Hills GrassRoots Festival of Music & Dance is a semi-annual "
                "celebration held on 72 acres of rolling farmland south of Pittsboro. "
                "Four stages host over 30 bands spanning Americana, bluegrass, world "
                "music, and rock. Weekend passes include primitive camping, artisan "
                "vendors, a kids' village, and community workshops on everything from "
                "blacksmithing to fermentation. It's Chatham County's biggest cultural "
                "event and a rite of passage for local music lovers."
            ),
            "teaser_paragraph": "4-stage music fest with camping, workshops & 30+ bands.",
            "address_street": "1439 Henderson Tanyard Road",
            "address_city": "Pittsboro",
            "address_state": "NC",
            "address_zip": "27312",
            "address_county": "Chatham County",
            "address_full": "1439 Henderson Tanyard Road, Pittsboro, NC 27312",
            "category": cat_festival,
            "event": {
                "start_datetime": (now + timedelta(days=60)).replace(hour=12, minute=0, second=0),
                "end_datetime": (now + timedelta(days=63)).replace(hour=23, minute=0, second=0),
                "is_repeating": False,
                "organizer_name": "Shakori Hills Community Arts Center",
                "venue_settings": ["Outdoor"],
                "has_vendors": True,
                "vendor_types": ["Food", "Crafts", "Art"],
            },
            "cost": "$75-$150",
            "ticket_link": "https://shakorihills.example.com/tickets",
            "images": {"main": "event3_main", "gallery": ["event3_gallery1"]},
            "ideal_for": ["All Ages", "Families", "Ages 18+"],
        },
    ]

    for e in events:
        existing = db.query(PointOfInterest).filter(
            PointOfInterest.slug == e["slug"]
        ).first()
        if existing:
            print(f"  Skipping (exists): {e['name']}")
            continue

        evt_data = e["event"]
        poi = PointOfInterest(
            poi_type=POIType.EVENT,
            name=e["name"],
            slug=e["slug"],
            listing_type="community_comped",
            publication_status="published",
            is_verified=True,
            status="Fully Open",
            location=e["location"],
            description_short=e["description_short"],
            description_long=e["description_long"],
            teaser_paragraph=e.get("teaser_paragraph"),
            address_street=e["address_street"],
            address_city=e["address_city"],
            address_state=e["address_state"],
            address_zip=e["address_zip"],
            address_county=e["address_county"],
            address_full=e["address_full"],
            cost=e.get("cost"),
            ideal_for=e.get("ideal_for"),
            pet_options=e.get("pet_options"),
        )
        poi.event = Event(
            start_datetime=evt_data["start_datetime"],
            end_datetime=evt_data.get("end_datetime"),
            is_repeating=evt_data.get("is_repeating", False),
            repeat_pattern=evt_data.get("repeat_pattern"),
            organizer_name=evt_data.get("organizer_name"),
            venue_settings=evt_data.get("venue_settings"),
            has_vendors=evt_data.get("has_vendors", False),
            vendor_types=evt_data.get("vendor_types"),
        )
        db.add(poi)
        db.flush()

        if e.get("category"):
            db.execute(poi_category_association.insert().values(
                poi_id=poi.id, category_id=e["category"].id, is_main=True
            ))

        imgs = e["images"]
        attach_image(db, poi.id, ImageType.main, imgs["main"], alt_text=f"{e['name']} event photo")
        for i, key in enumerate(imgs.get("gallery", [])):
            attach_image(db, poi.id, ImageType.gallery, key, display_order=i)

        db.commit()
        print(f"  Created: {e['name']} (slug: {poi.slug})")


def create_extra_businesses(db: Session):
    """Extra businesses covering hours/holiday/amenity/location-privacy
    scenarios not exercised by create_businesses() above."""
    print("\n--- Extra Businesses (hours, holidays, amenities, location privacy) ---")

    cat_cafe = get_category(db, "Cafe")
    cat_venue = get_category(db, "Live Music Venue")

    pet_options = ["Dogs Allowed", "Clean Up Stations"]
    public_toilets = ["Single Stall", "Wheelchair + ADA Accessible"]
    accessible_restroom_details = [
        _restroom_ada_label("Wide door"),
        _restroom_ada_label("Side grab bar"),
        _restroom_ada_label("Level entry"),
    ]
    accessible_parking_details = [
        "Dedicated accessible parking spaces on site",
        "Van accessible space available (8 foot access aisle)",
    ]
    outfitter_icons = compute_amenity_icons(
        pet_options=pet_options,
        public_toilets=public_toilets,
        accessible_restroom_details=accessible_restroom_details,
        accessible_parking_details=accessible_parking_details,
    )

    outfitter_hours = {
        "regular": {
            "monday": {"status": "open", "periods": [{"open": {"type": "fixed", "time": "09:00"}, "close": {"type": "fixed", "time": "17:00"}}]},
            "tuesday": {"status": "open", "periods": [{"open": {"type": "fixed", "time": "09:00"}, "close": {"type": "fixed", "time": "17:00"}}]},
            "wednesday": {"status": "open", "periods": [{"open": {"type": "fixed", "time": "09:00"}, "close": {"type": "fixed", "time": "17:00"}}]},
            "thursday": {"status": "open", "periods": [{"open": {"type": "fixed", "time": "09:00"}, "close": {"type": "fixed", "time": "17:00"}}]},
            "friday": {"status": "open", "periods": [{"open": {"type": "fixed", "time": "09:00"}, "close": {"type": "fixed", "time": "17:00"}}]},
            "saturday": {"status": "closed"},
            "sunday": {"status": "closed"},
        },
        "holidays": {
            # mode: follows_regular - falls through to the normal Mon-Fri schedule.
            "independence_day": {"name": "Independence Day", "date": "07-04", "mode": "follows_regular", "status": "open"},
            # mode: open, with its own periods + a visitor-facing note.
            "black_friday": {
                "name": "Black Friday", "date": "11-24",
                "mode": "open", "status": "open",
                "periods": [{"open": {"type": "fixed", "time": "08:00"}, "close": {"type": "fixed", "time": "20:00"}}],
                "note": "Extended hours for holiday shopping!",
            },
            # mode: closed.
            "christmas": {
                "name": "Christmas Day", "date": "12-25",
                "mode": "closed", "status": "closed",
                "note": "Closed for the holiday, reopens December 26",
            },
            # Legacy shape (pre-#116): status only, no mode key at all. Exercises
            # get_holiday_mode()'s compat mapping (status=closed -> mode closed).
            "thanksgiving": {"name": "Thanksgiving", "date": "fourth_thursday_november", "status": "closed"},
        },
    }

    no_regular_hours = {
        "no_regular_hours": True,
        "regular": {
            "monday": {"status": "closed"}, "tuesday": {"status": "closed"},
            "wednesday": {"status": "closed"}, "thursday": {"status": "closed"},
            "friday": {"status": "closed"}, "saturday": {"status": "closed"},
            "sunday": {"status": "closed"},
        },
        "notes": "Hours vary week to week. Message us on Instagram for this week's pop-up times.",
    }

    seasonal_only_hours = {
        "regular": {
            "monday": {"status": "closed"}, "tuesday": {"status": "closed"},
            "wednesday": {"status": "closed"}, "thursday": {"status": "closed"},
            "friday": {"status": "closed"}, "saturday": {"status": "closed"},
            "sunday": {"status": "closed"},
        },
        "seasonal_only": True,
        "seasonal": {
            "summer": {
                "useDateRange": True,
                "startDate": "05-15",
                "endDate": "09-15",
                "monday": {"status": "closed"},
                "tuesday": {"status": "open", "periods": [{"open": {"type": "fixed", "time": "12:00"}, "close": {"type": "fixed", "time": "20:00"}}]},
                "wednesday": {"status": "open", "periods": [{"open": {"type": "fixed", "time": "12:00"}, "close": {"type": "fixed", "time": "20:00"}}]},
                "thursday": {"status": "open", "periods": [{"open": {"type": "fixed", "time": "12:00"}, "close": {"type": "fixed", "time": "20:00"}}]},
                "friday": {"status": "open", "periods": [{"open": {"type": "fixed", "time": "12:00"}, "close": {"type": "fixed", "time": "21:00"}}]},
                "saturday": {"status": "open", "periods": [{"open": {"type": "fixed", "time": "12:00"}, "close": {"type": "fixed", "time": "21:00"}}]},
                "sunday": {"status": "open", "periods": [{"open": {"type": "fixed", "time": "12:00"}, "close": {"type": "fixed", "time": "19:00"}}]},
            },
        },
    }

    businesses = [
        {
            "name": "Chatham Trailhead Outfitters",
            "slug": "chatham-trailhead-outfitters-pittsboro",
            "location": "POINT(-79.1810 35.7190)",
            "description_short": "Gear rental, trail snacks, and friendly advice for hikers headed into Chatham County's trail network.",
            "description_long": (
                "Chatham Trailhead Outfitters rents daypacks, trekking poles, and "
                "bear-proof coolers for a day or a week on the trail. Our staff "
                "knows every loop in the county and is happy to point you toward "
                "the right trail for your group. Well-behaved leashed dogs are "
                "always welcome, and our accessible restroom and parking make the "
                "shop easy to visit for everyone. By appointment outside posted hours."
            ),
            "teaser_paragraph": "Gear rental & trail advice, steps from the trailhead.",
            "address_street": "22 Trailhead Way",
            "address_city": "Pittsboro",
            "address_state": "NC",
            "address_zip": "27312",
            "address_county": "Chatham County",
            "address_full": "22 Trailhead Way, Pittsboro, NC 27312",
            "phone_number": "(919) 555-0110",
            "price_range": "$$",
            "hours": outfitter_hours,
            "hours_but_appointment_required": True,
            "images": {"main": "store_main"},
            "pet_options": pet_options,
            "public_toilets": public_toilets,
            "accessible_restroom_details": accessible_restroom_details,
            "accessible_parking_details": accessible_parking_details,
            **outfitter_icons,
        },
        {
            "name": "Whispering Hollow Home Bakery",
            "slug": "whispering-hollow-home-bakery-pittsboro",
            "location": "POINT(-79.1955 35.7267)",
            "description_short": "Small-batch sourdough and seasonal pies baked to order from a home kitchen outside Pittsboro.",
            "description_long": (
                "Whispering Hollow Home Bakery is a one-woman operation running "
                "out of a licensed home kitchen. Because it's a residence, we "
                "don't list an exact address publicly. Message us to arrange "
                "pickup. Baking days and hours shift with the season and with "
                "what's fresh at the farmers market, so check our Instagram "
                "before you plan a visit."
            ),
            "teaser_paragraph": "Small-batch sourdough & pies, pickup by message.",
            "address_street": "Private residence",
            "address_city": "Pittsboro",
            "address_state": "NC",
            "address_zip": "27312",
            "address_county": "Chatham County",
            "address_full": "Pittsboro, NC 27312",
            "price_range": "$",
            "hours": no_regular_hours,
            "dont_display_location": True,
            "category": cat_cafe,
            "images": {"main": "cafe_gallery1"},
        },
        {
            "name": "The Barn at Chatham Mills",
            "slug": "the-barn-at-chatham-mills-pittsboro",
            "location": "POINT(-79.1720 35.7245)",
            "description_short": "A converted textile-mill barn hosting dances, weddings, and community gatherings.",
            "description_long": (
                "The Barn at Chatham Mills is a restored 1940s cotton-mill "
                "warehouse turned event space, with exposed timber trusses and "
                "room for 200 guests. We host everything from contra dances to "
                "wedding receptions to nonprofit fundraisers. A gravel overflow "
                "lot behind the building handles parking for larger events."
            ),
            "teaser_paragraph": "Restored mill barn hosting dances, weddings & fundraisers.",
            "address_street": "480 Hillsboro Street",
            "address_city": "Pittsboro",
            "address_state": "NC",
            "address_zip": "27312",
            "address_county": "Chatham County",
            "address_full": "480 Hillsboro Street, Pittsboro, NC 27312",
            "website_url": "https://thebarnatchathammills.example.com",
            "price_range": "$$$",
            "category": cat_venue,
            "images": {"main": "event2_gallery1"},
        },
        {
            "name": "Chatham Creamery Seasonal Stand",
            "slug": "chatham-creamery-seasonal-stand-pittsboro",
            "location": "POINT(-79.1695 35.7195)",
            "description_short": "A walk-up soft-serve window open only for the warm months, right on the Rocky River Greenway.",
            "description_long": (
                "Chatham Creamery's seasonal stand serves soft-serve, "
                "milkshakes, and frozen custard from a walk-up window "
                "overlooking the Rocky River Greenway. We open when the "
                "weather turns warm and close for the season once the leaves "
                "start to fall. Check the seasonal hours below for exact dates."
            ),
            "teaser_paragraph": "Walk-up soft-serve window, open May through September.",
            "address_street": "6 Greenway Court",
            "address_city": "Pittsboro",
            "address_state": "NC",
            "address_zip": "27312",
            "address_county": "Chatham County",
            "address_full": "6 Greenway Court, Pittsboro, NC 27312",
            "price_range": "$",
            "hours": seasonal_only_hours,
            "category": cat_cafe,
            "images": {"main": "cafe_gallery2"},
        },
    ]

    for biz in businesses:
        existing = db.query(PointOfInterest).filter(
            PointOfInterest.slug == biz["slug"]
        ).first()
        if existing:
            print(f"  Skipping (exists): {biz['name']}")
            continue

        poi = PointOfInterest(
            poi_type=POIType.BUSINESS,
            name=biz["name"],
            slug=biz["slug"],
            listing_type="paid",
            publication_status="published",
            is_verified=True,
            status="Fully Open",
            location=biz["location"],
            description_short=biz["description_short"],
            description_long=biz["description_long"],
            teaser_paragraph=biz.get("teaser_paragraph"),
            address_street=biz["address_street"],
            address_city=biz["address_city"],
            address_state=biz["address_state"],
            address_zip=biz["address_zip"],
            address_county=biz["address_county"],
            address_full=biz["address_full"],
            website_url=biz.get("website_url"),
            phone_number=biz.get("phone_number"),
            hours=biz.get("hours"),
            hours_but_appointment_required=biz.get("hours_but_appointment_required", False),
            dont_display_location=biz.get("dont_display_location", False),
            pet_options=biz.get("pet_options"),
            public_toilets=biz.get("public_toilets"),
            accessible_restroom_details=biz.get("accessible_restroom_details"),
            accessible_parking_details=biz.get("accessible_parking_details"),
            accessible_restroom=biz.get("accessible_restroom", False),
            icon_free_wifi=biz.get("icon_free_wifi", False),
            icon_pet_friendly=biz.get("icon_pet_friendly", False),
            icon_public_restroom=biz.get("icon_public_restroom", False),
            icon_wheelchair_accessible=biz.get("icon_wheelchair_accessible", False),
        )
        poi.business = Business(price_range=biz["price_range"])
        db.add(poi)
        db.flush()

        if biz.get("category"):
            db.execute(poi_category_association.insert().values(
                poi_id=poi.id, category_id=biz["category"].id, is_main=True
            ))

        imgs = biz["images"]
        attach_image(db, poi.id, ImageType.main, imgs["main"], alt_text=f"{biz['name']} photo")

        db.commit()
        print(f"  Created: {biz['name']} (slug: {poi.slug})")


def create_extra_parks_and_trails(db: Session):
    """Bear Creek Nature Park + Loop Trail: restroom point-location coverage
    (one entry missing lat/lng to exercise the Issue #117 fallback default,
    one full-detail entry) sharing a trailhead parking lot."""
    print("\n--- Extra Park & Trail (restroom locations, shared parking) ---")

    cat_preserve = get_category(db, "Nature Preserve")
    cat_trail = get_category(db, "Nature Trail")

    park_lat, park_lng = 35.6950, -79.2200
    park_slug = "bear-creek-nature-park-pittsboro"

    existing_park = db.query(PointOfInterest).filter(PointOfInterest.slug == park_slug).first()
    if existing_park:
        print("  Skipping (exists): Bear Creek Nature Park")
    else:
        park_poi = PointOfInterest(
            poi_type=POIType.PARK,
            name="Bear Creek Nature Park",
            slug=park_slug,
            listing_type="community_comped",
            publication_status="published",
            is_verified=True,
            status="Fully Open",
            location=f"POINT({park_lng} {park_lat})",
            description_short="A 40-acre creekside park with a visitor center, birding trails, and two restroom locations.",
            description_long=(
                "Bear Creek Nature Park protects 40 acres along Bear Creek with "
                "a small visitor center, a butterfly garden, and a mile of "
                "accessible boardwalk trail. A composting toilet sits near the "
                "trailhead kiosk for quick stops, and the visitor center has "
                "full flush restrooms during posted hours."
            ),
            teaser_paragraph="Creekside trails, a butterfly garden & a visitor center.",
            address_street="710 Bear Creek Road",
            address_city="Pittsboro",
            address_state="NC",
            address_zip="27312",
            address_county="Chatham County",
            address_full="710 Bear Creek Road, Pittsboro, NC 27312",
            cost="0",
            public_toilets=["Multi Stall", "Baby Changing Station"],
        )
        park_poi.park = Park(drone_usage_policy="No drones without permit")
        db.add(park_poi)
        db.flush()

        if cat_preserve:
            db.execute(poi_category_association.insert().values(
                poi_id=park_poi.id, category_id=cat_preserve.id, is_main=True
            ))

        attach_image(db, park_poi.id, ImageType.main, "park3_gallery1", alt_text="Bear Creek Nature Park boardwalk")

        # Issue #117: one restroom entry with NO lat/lng (exercises the
        # POI-location fallback default), one with explicit coords + full detail.
        toilet_entries = [
            {
                "restroom_name": "Trailhead Composting Toilet",
                "lat": None,
                "lng": None,
                "description": "Composting toilet at the trailhead kiosk, no running water.",
                "toilet_types": ["Single Stall"],
            },
            {
                "restroom_name": "Visitor Center Restroom",
                "lat": park_lat + 0.0012,
                "lng": park_lng + 0.0009,
                "description": "Flush restrooms inside the visitor center, open during posted hours.",
                "toilet_types": ["Multi Stall", "Baby Changing Station", "Wheelchair + ADA Accessible"],
            },
        ]
        _default_missing_restroom_coords(toilet_entries, park_lat, park_lng)
        sync_point_rows(db, park_poi.id, "toilet_locations", toilet_entries)

        db.commit()
        print(f"  Created: Bear Creek Nature Park (slug: {park_poi.slug})")

    trail_slug = "bear-creek-loop-trail-pittsboro"
    existing_trail = db.query(PointOfInterest).filter(PointOfInterest.slug == trail_slug).first()
    if existing_trail:
        print("  Skipping (exists): Bear Creek Loop Trail")
    else:
        trail_poi = PointOfInterest(
            poi_type=POIType.TRAIL,
            name="Bear Creek Loop Trail",
            slug=trail_slug,
            listing_type="community_comped",
            publication_status="published",
            is_verified=True,
            status="Fully Open",
            location="POINT(-79.2215 35.6935)",
            description_short="An easy 1-mile loop starting from the Bear Creek Nature Park trailhead lot.",
            description_long=(
                "Bear Creek Loop Trail is an easy, mostly flat mile of packed "
                "dirt circling the park's namesake creek. It shares the "
                "trailhead parking lot with Bear Creek Nature Park, so arrive "
                "early on weekends."
            ),
            teaser_paragraph="Easy 1-mile creekside loop, shared trailhead lot.",
            address_street="710 Bear Creek Road",
            address_city="Pittsboro",
            address_state="NC",
            address_zip="27312",
            address_county="Chatham County",
            address_full="710 Bear Creek Road, Pittsboro, NC 27312",
            cost="0",
        )
        trail_poi.trail = Trail(length_text="1.0 miles", difficulty="easy", route_type="loop")
        db.add(trail_poi)
        db.flush()

        if cat_trail:
            db.execute(poi_category_association.insert().values(
                poi_id=trail_poi.id, category_id=cat_trail.id, is_main=True
            ))

        attach_image(db, trail_poi.id, ImageType.main, "trail2_gallery1", alt_text="Bear Creek Loop Trail")

        db.commit()
        print(f"  Created: Bear Creek Loop Trail (slug: {trail_poi.slug})")


def create_extra_events(db: Session):
    """Extra events covering the #127 event-visibility cutoff rules, repeating
    recurrence_end_date semantics, a venue/nearby coordinate tie-break, and
    event sponsors with an image-backed logo."""
    print("\n--- Extra Events (visibility cutoffs, recurrence, sponsors, venue tie-break) ---")

    cat_holiday_market = get_category(db, "Holiday Markets & Bazaars")
    cat_festival = get_category(db, "Festivals, Parade & Fair")
    cat_farmers_market = get_category(db, "Farmers Market")
    cat_spring = get_category(db, "Spring & Easter")
    cat_trivia = get_category(db, "Trivia Night")
    cat_dancing = get_category(db, "Dancing")

    now = datetime.now(timezone.utc)

    # Tie-break with "The Barn at Chatham Mills" business (create_extra_businesses):
    # Barn Dance Social is hosted there and shares its EXACT coordinates.
    barn = db.query(PointOfInterest).filter(
        PointOfInterest.slug == "the-barn-at-chatham-mills-pittsboro"
    ).first()
    barn_location = "POINT(-79.1720 35.7245)"
    barn_id = barn.id if barn else None
    if not barn:
        print("  WARNING: 'The Barn at Chatham Mills' not found; Barn Dance Social will have no venue link.")

    wifi_icons = compute_amenity_icons(wifi_options=["Free Wifi"])

    events = [
        {
            "name": "Chatham Artisans Holiday Market",
            "slug": "chatham-artisans-holiday-market-pittsboro",
            "location": "POINT(-79.1775 35.7210)",
            "description_short": "A one-day indoor market of Chatham County makers, just in time for holiday shopping.",
            "description_long": (
                "Chatham Artisans Holiday Market brings 40+ local makers "
                "indoors for one Saturday of pottery, woodwork, jewelry, and "
                "preserves. Hot cider and live acoustic music round out the "
                "afternoon."
            ),
            "teaser_paragraph": "40+ local makers, one Saturday, hot cider included.",
            "address_street": "365 Renaissance Court",
            "address_city": "Pittsboro",
            "address_state": "NC",
            "address_zip": "27312",
            "address_county": "Chatham County",
            "address_full": "365 Renaissance Court, Pittsboro, NC 27312",
            "category": cat_holiday_market,
            # Scenario: future single-day event.
            "event": {
                "start_datetime": (now + timedelta(days=14)).replace(hour=10, minute=0, second=0, microsecond=0),
                "end_datetime": (now + timedelta(days=14)).replace(hour=16, minute=0, second=0, microsecond=0),
                "is_repeating": False,
                "organizer_name": "Chatham Arts Council",
                "venue_settings": ["Indoor"],
            },
            "cost": "0",
            "images": {"main": "event1_gallery1"},
        },
        {
            "name": "Pittsboro Farmers Market Pop-Up",
            "slug": "pittsboro-farmers-market-pop-up-pittsboro",
            "location": "POINT(-79.1768 35.7212)",
            "description_short": "A one-time midweek pop-up market on the courthouse lawn, today only.",
            "description_long": (
                "A one-time midweek pop-up of the regular Saturday farmers "
                "market, held on the courthouse lawn for a few hours today "
                "only, with the same vendors in a smaller footprint."
            ),
            "teaser_paragraph": "One-time midweek pop-up, today only.",
            "address_street": "Courthouse Square",
            "address_city": "Pittsboro",
            "address_state": "NC",
            "address_zip": "27312",
            "address_county": "Chatham County",
            "address_full": "Courthouse Square, Pittsboro, NC 27312",
            "category": cat_farmers_market,
            # Scenario: started earlier TODAY. Must remain visible per the
            # start-of-today cutoff even though start_datetime is in the past.
            "event": {
                "start_datetime": now - timedelta(hours=3),
                "end_datetime": now + timedelta(hours=2),
                "is_repeating": False,
                "organizer_name": "Downtown Pittsboro Association",
                "venue_settings": ["Outdoor"],
            },
            "cost": "0",
            "images": {"main": "event2_gallery1"},
        },
        {
            "name": "Spring Chatham Blossom Fest",
            "slug": "spring-chatham-blossom-fest-pittsboro",
            "location": "POINT(-79.1900 35.7300)",
            "description_short": "A now-concluded weekend blossom festival along the Haw River, kept for direct-link testing.",
            "description_long": (
                "Spring Chatham Blossom Fest was a weekend celebration of the "
                "dogwoods and redbuds blooming along the Haw River, with "
                "guided walks, a plant swap, and a native-plant sale. This "
                "listing stays published after the fact so past attendees can "
                "still find it by direct link; it no longer appears in search "
                "or browse results."
            ),
            "teaser_paragraph": "Weekend blossom festival along the Haw River (past).",
            "address_street": "339 Haw River Road",
            "address_city": "Pittsboro",
            "address_state": "NC",
            "address_zip": "27312",
            "address_county": "Chatham County",
            "address_full": "339 Haw River Road, Pittsboro, NC 27312",
            "category": cat_spring,
            # Scenario: clearly past. Hidden from browse/search, reachable by link.
            "event": {
                "start_datetime": now - timedelta(days=60),
                "end_datetime": now - timedelta(days=59),
                "is_repeating": False,
                "organizer_name": "Chatham Conservation Trust",
                "venue_settings": ["Outdoor"],
            },
            "cost": "0",
            "images": {"main": "event3_gallery1"},
        },
        {
            "name": "Pittsboro Saturday Farmers Market",
            "slug": "pittsboro-saturday-farmers-market-pittsboro",
            "location": "POINT(-79.1772 35.7206)",
            "description_short": "A weekly Saturday farmers market on the courthouse lawn, running rain or shine, indefinitely.",
            "description_long": (
                "Pittsboro Saturday Farmers Market has run every Saturday "
                "morning for years, with no end date planned. Local produce, "
                "eggs, flowers, and a rotating lineup of food trucks. Free "
                "wifi is available at the market info tent, courtesy of the "
                "Downtown Pittsboro Association."
            ),
            "teaser_paragraph": "Weekly Saturday market, produce & food trucks, no end date.",
            "address_street": "Courthouse Square",
            "address_city": "Pittsboro",
            "address_state": "NC",
            "address_zip": "27312",
            "address_county": "Chatham County",
            "address_full": "Courthouse Square, Pittsboro, NC 27312",
            "category": cat_farmers_market,
            # Scenario: repeating, open-ended (recurrence_end_date NULL), stored
            # start_datetime months ago. Must stay visible regardless.
            "event": {
                "start_datetime": (now - timedelta(days=200)).replace(hour=8, minute=0, second=0, microsecond=0),
                "end_datetime": (now - timedelta(days=200)).replace(hour=12, minute=0, second=0, microsecond=0),
                "is_repeating": True,
                "repeat_pattern": {"frequency": "weekly", "days": ["saturday"]},
                "recurrence_end_date": None,
                "organizer_name": "Downtown Pittsboro Association",
                "venue_settings": ["Outdoor"],
            },
            "cost": "0",
            "images": {"main": "event1_main"},
            "wifi_options": ["Free Wifi"],
            **wifi_icons,
        },
        {
            "name": "Chatham Winter Trivia Nights",
            "slug": "chatham-winter-trivia-nights-pittsboro",
            "location": "POINT(-79.1745 35.7230)",
            "description_short": "A weekly winter trivia series that already wrapped for the season.",
            "description_long": (
                "Chatham Winter Trivia Nights ran every Wednesday through the "
                "winter months. The series has concluded for the season (its "
                "recurrence end date has passed), so it no longer appears in "
                "browse or search, though the listing stays up for reference."
            ),
            "teaser_paragraph": "Weekly winter trivia series (concluded for the season).",
            "address_street": "108 East Street",
            "address_city": "Pittsboro",
            "address_state": "NC",
            "address_zip": "27312",
            "address_county": "Chatham County",
            "address_full": "108 East Street, Pittsboro, NC 27312",
            "category": cat_trivia,
            # Scenario: repeating, recurrence_end_date HAS passed. Hidden.
            "event": {
                "start_datetime": (now - timedelta(days=150)).replace(hour=19, minute=0, second=0, microsecond=0),
                "end_datetime": (now - timedelta(days=150)).replace(hour=21, minute=0, second=0, microsecond=0),
                "is_repeating": True,
                "repeat_pattern": {"frequency": "weekly", "days": ["wednesday"]},
                "recurrence_end_date": now - timedelta(days=20),
                "organizer_name": "Southern Roots BBQ",
                "venue_settings": ["Indoor"],
            },
            "cost": "0",
            "images": {"main": "event2_gallery1"},
        },
        {
            "name": "Barn Dance Social",
            "slug": "barn-dance-social-pittsboro",
            "location": barn_location,
            "description_short": "A monthly contra dance at The Barn at Chatham Mills, no partner or experience required.",
            "description_long": (
                "Barn Dance Social is a beginner-friendly contra dance held at "
                "The Barn at Chatham Mills. A live string band and a caller "
                "walk every dance before the music starts, so no partner or "
                "experience is needed. Shares the venue's coordinates and "
                "parking lot."
            ),
            "teaser_paragraph": "Beginner-friendly contra dance at The Barn.",
            "address_street": "480 Hillsboro Street",
            "address_city": "Pittsboro",
            "address_state": "NC",
            "address_zip": "27312",
            "address_county": "Chatham County",
            "address_full": "480 Hillsboro Street, Pittsboro, NC 27312",
            "category": cat_dancing,
            # Scenario: two published POIs at the EXACT same coordinates (this
            # event + its venue business) for the nearby ordering tie-break.
            "event": {
                "start_datetime": (now + timedelta(days=21)).replace(hour=18, minute=0, second=0, microsecond=0),
                "end_datetime": (now + timedelta(days=21)).replace(hour=23, minute=0, second=0, microsecond=0),
                "is_repeating": False,
                "organizer_name": "Chatham Contra Dance Collective",
                "venue_settings": ["Indoor"],
                "venue_poi_id": barn_id,
            },
            "cost": "$10",
            "images": {"main": "event3_gallery1"},
        },
    ]

    for e in events:
        existing = db.query(PointOfInterest).filter(
            PointOfInterest.slug == e["slug"]
        ).first()
        if existing:
            print(f"  Skipping (exists): {e['name']}")
            continue

        evt_data = e["event"]
        poi = PointOfInterest(
            poi_type=POIType.EVENT,
            name=e["name"],
            slug=e["slug"],
            listing_type="community_comped",
            publication_status="published",
            is_verified=True,
            status="Fully Open",
            location=e["location"],
            description_short=e["description_short"],
            description_long=e["description_long"],
            teaser_paragraph=e.get("teaser_paragraph"),
            address_street=e["address_street"],
            address_city=e["address_city"],
            address_state=e["address_state"],
            address_zip=e["address_zip"],
            address_county=e["address_county"],
            address_full=e["address_full"],
            cost=e.get("cost"),
            wifi_options=e.get("wifi_options"),
            accessible_restroom=e.get("accessible_restroom", False),
            icon_free_wifi=e.get("icon_free_wifi", False),
            icon_pet_friendly=e.get("icon_pet_friendly", False),
            icon_public_restroom=e.get("icon_public_restroom", False),
            icon_wheelchair_accessible=e.get("icon_wheelchair_accessible", False),
        )
        poi.event = Event(
            start_datetime=evt_data["start_datetime"],
            end_datetime=evt_data.get("end_datetime"),
            is_repeating=evt_data.get("is_repeating", False),
            repeat_pattern=evt_data.get("repeat_pattern"),
            recurrence_end_date=evt_data.get("recurrence_end_date"),
            organizer_name=evt_data.get("organizer_name"),
            venue_settings=evt_data.get("venue_settings"),
            venue_poi_id=evt_data.get("venue_poi_id"),
        )
        db.add(poi)
        db.flush()

        if e.get("category"):
            db.execute(poi_category_association.insert().values(
                poi_id=poi.id, category_id=e["category"].id, is_main=True
            ))

        imgs = e["images"]
        attach_image(db, poi.id, ImageType.main, imgs["main"], alt_text=f"{e['name']} event photo")

        db.commit()
        print(f"  Created: {e['name']} (slug: {poi.slug})")

    # Chatham Piedmont Storytelling Festival: separate from the loop above
    # because it needs its POI id before it can attach sponsor logo images.
    # Scenario: multi-day event currently ongoing, PLUS sponsors (one with an
    # image-backed logo, one manual entry with no logo).
    festival_slug = "chatham-piedmont-storytelling-festival-pittsboro"
    existing_festival = db.query(PointOfInterest).filter(
        PointOfInterest.slug == festival_slug
    ).first()
    if existing_festival:
        print("  Skipping (exists): Chatham Piedmont Storytelling Festival")
        return

    festival = PointOfInterest(
        poi_type=POIType.EVENT,
        name="Chatham Piedmont Storytelling Festival",
        slug=festival_slug,
        listing_type="community_comped",
        publication_status="published",
        is_verified=True,
        status="Fully Open",
        location="POINT(-79.2050 35.7080)",
        description_short="A three-day storytelling festival currently underway, with tellers from across the Piedmont.",
        description_long=(
            "Chatham Piedmont Storytelling Festival gathers tellers from "
            "across the NC Piedmont for three days of ghost stories, tall "
            "tales, and family-friendly matinees under a big top tent. Local "
            "sponsors keep admission low for families."
        ),
        teaser_paragraph="Three days of tellers under a big top tent, happening now.",
        address_street="1439 Henderson Tanyard Road",
        address_city="Pittsboro",
        address_state="NC",
        address_zip="27312",
        address_county="Chatham County",
        address_full="1439 Henderson Tanyard Road, Pittsboro, NC 27312",
        cost="$15",
    )
    db.add(festival)
    db.flush()

    if cat_festival:
        db.execute(poi_category_association.insert().values(
            poi_id=festival.id, category_id=cat_festival.id, is_main=True
        ))

    attach_image(db, festival.id, ImageType.main, "event3_main", alt_text="Chatham Piedmont Storytelling Festival")

    sponsor_1_id = "sp-bank"
    sponsor_logo_img = attach_image(
        db, festival.id, ImageType.sponsor_logo, "store_gallery1",
        alt_text="Chatham Bank & Trust logo", image_context=f"sponsor_{sponsor_1_id}",
    )
    sponsors = [
        {
            "_id": sponsor_1_id,
            "name": "Chatham Bank & Trust",
            "url": "https://chathambank.example.com",
            "logo_url": sponsor_logo_img.storage_url if sponsor_logo_img else "",
            "logo_image_id": str(sponsor_logo_img.id) if sponsor_logo_img else None,
            "tier": "Gold",
        },
        {
            "_id": "sp-hardware",
            "name": "Pittsboro Hardware Co.",
            "url": "https://pittsborohardware.example.com",
            "logo_url": "",
            "logo_image_id": None,
            "tier": "Silver",
        },
    ]

    festival.event = Event(
        start_datetime=(now - timedelta(days=1)).replace(hour=12, minute=0, second=0, microsecond=0),
        end_datetime=(now + timedelta(days=2)).replace(hour=21, minute=0, second=0, microsecond=0),
        is_repeating=False,
        organizer_name="Shakori Hills Community Arts Center",
        venue_settings=["Outdoor"],
        has_vendors=True,
        vendor_types=["Food", "Crafts"],
        sponsors=sponsors,
    )
    db.flush()
    db.commit()
    print(f"  Created: Chatham Piedmont Storytelling Festival (slug: {festival.slug})")


# Second column of the public Event page (#142): cost, ticketing, payment,
# venue setting and organizer contact. Kept as an update pass rather than being
# folded into the create dicts above, because those skip any POI that already
# exists, so a database seeded before these fields were added would never get
# them. Keys are POI slugs; "poi" values land on points_of_interest, "event"
# values on the events row.
EVENT_ENRICHMENTS = {
    "chatham-piedmont-storytelling-festival-pittsboro": {
        "poi": {
            "cost": "$15",
            "pricing_details": (
                "<p>Day pass $15, three-day pass $35. Kids under 6 get in free, "
                "and Chatham County students pay $5 with a school ID. The "
                "Saturday family matinee is free to everyone, no ticket needed.</p>"
            ),
            "payment_methods": ["Cash", "Credit Cards", "Apple Pay", "Venmo"],
        },
        "event": {
            "cost_type": "single_price",
            "ticket_links": [
                {"platform": "Eventbrite", "url": "https://eventbrite.example.com/e/chatham-piedmont-storytelling"},
                {"platform": "Box Office", "url": "https://shakorihills.example.com/tickets"},
            ],
            "venue_settings": ["Outdoor", "Hybrid (In-Person and Online)"],
            "organizer_name": "Shakori Hills Community Arts Center",
            "organizer_phone": "(919) 555-0142",
            "organizer_email": "tellers@shakorihills.example.com",
            "organizer_website": "https://shakorihills.example.com",
            "organizer_social_media": {
                "facebook": "https://facebook.com/shakorihillsarts",
                "instagram": "https://instagram.com/shakorihillsarts",
            },
            "contact_organizer_toggle": True,
        },
    },
    "pittsboro-saturday-farmers-market-pittsboro": {
        # cost stays "0" on purpose: it is the regression fixture for a zero
        # amount rendering as "Free" (#142 follow-up). Setting cost_type here
        # would short-circuit that path in formatCost, so it is left unset too.
        "poi": {
            "payment_methods": ["Cash", "Credit Cards", "Venmo", "Zelle"],
        },
        "event": {
            "venue_settings": ["Outdoor"],
        },
    },
}


def enrich_events(db: Session):
    """Fill in the Event page's second column on the seeded events.

    Idempotent: every field is compared before it is written, so a second run
    reports nothing to do.
    """
    print("\n--- Event details (cost, ticketing, payment, organizer) ---")

    for slug, spec in EVENT_ENRICHMENTS.items():
        poi = db.query(PointOfInterest).filter(PointOfInterest.slug == slug).first()
        if not poi:
            print(f"  WARNING: {slug} not found; skipping enrichment.")
            continue
        if not poi.event:
            print(f"  WARNING: {slug} has no event row; skipping enrichment.")
            continue

        changed = []
        for field, value in spec.get("poi", {}).items():
            if getattr(poi, field) != value:
                setattr(poi, field, value)
                changed.append(field)
        for field, value in spec.get("event", {}).items():
            if getattr(poi.event, field) != value:
                setattr(poi.event, field, value)
                changed.append(field)

        if changed:
            db.commit()
            print(f"  Enriched: {poi.name} ({len(changed)} fields: {', '.join(changed)})")
        else:
            print(f"  Already enriched: {poi.name}")


def create_parking_lots(db: Session):
    """Shareable parking lots (issues #90/#161): one owned by a business, one
    standalone lot shared by two POIs with sort_order + a label, and one draft
    standalone lot linked from a POI that must NOT appear in a public read.

    Guarded: parking_lots / poi_parking_links may not exist yet on every local
    dev DB (migration x_parking_lots_001), so a missing-table failure here is
    caught and reported instead of aborting the rest of the seed.
    """
    print("\n--- Parking Lots (owned, standalone shared, draft standalone) ---")
    try:
        barn = db.query(PointOfInterest).filter(
            PointOfInterest.slug == "the-barn-at-chatham-mills-pittsboro"
        ).first()
        park = db.query(PointOfInterest).filter(
            PointOfInterest.slug == "bear-creek-nature-park-pittsboro"
        ).first()
        trail = db.query(PointOfInterest).filter(
            PointOfInterest.slug == "bear-creek-loop-trail-pittsboro"
        ).first()
        outfitters = db.query(PointOfInterest).filter(
            PointOfInterest.slug == "chatham-trailhead-outfitters-pittsboro"
        ).first()

        if not all([barn, park, trail, outfitters]):
            print("  Skipping: one or more owning POIs not found (run the earlier seed steps first).")
            return

        # Lot A: owned by a business, linked back to that same business.
        lot_a_name = "The Barn at Chatham Mills Overflow Lot"
        lot_a = db.query(ParkingLot).filter(ParkingLot.name == lot_a_name).first()
        if lot_a:
            print(f"  Skipping (exists): {lot_a_name}")
        else:
            lot_a = ParkingLot(
                owner_poi_id=barn.id,
                name=lot_a_name,
                parking_types=["Dedicated On-Site Parking Lot"],
                notes="Gravel overflow field behind the barn, opened for larger events.",
                geom="POINT(-79.1722 35.7243)",
                expect_to_pay="no",
                publication_status="published",
            )
            db.add(lot_a)
            db.flush()
            sync_parking_links(db, barn.id, [
                {"parking_lot_id": str(lot_a.id), "sort_order": 0, "label": None},
            ])
            db.commit()
            print(f"  Created: {lot_a_name} (owned by {barn.name})")

        # Lot B: standalone, published, linked from TWO POIs with sort_order + label.
        lot_b_name = "Bear Creek Trailhead Public Lot"
        lot_b = db.query(ParkingLot).filter(ParkingLot.name == lot_b_name).first()
        if lot_b:
            print(f"  Skipping (exists): {lot_b_name}")
        else:
            lot_b = ParkingLot(
                owner_poi_id=None,
                name=lot_b_name,
                parking_types=["Dedicated On-Site Parking Lot", "Bike Rack + Bicycle Parking"],
                accessible_parking_details=["Dedicated accessible parking spaces on site"],
                notes="Gravel lot shared by the park and the loop trail.",
                geom="POINT(-79.2205 35.6945)",
                expect_to_pay="no",
                publication_status="published",
            )
            db.add(lot_b)
            db.flush()
            sync_parking_links(db, park.id, [
                {"parking_lot_id": str(lot_b.id), "sort_order": 0, "label": "Main trailhead lot"},
            ])
            sync_parking_links(db, trail.id, [
                {"parking_lot_id": str(lot_b.id), "sort_order": 0, "label": "Trail parking, arrive early on weekends"},
            ])
            db.commit()
            print(f"  Created: {lot_b_name} (linked from park + trail)")

        # Lot C: standalone, DRAFT - linked from one POI but must not show publicly.
        lot_c_name = "Downtown Pittsboro Overflow Lot (Coming Soon)"
        lot_c = db.query(ParkingLot).filter(ParkingLot.name == lot_c_name).first()
        if lot_c:
            print(f"  Skipping (exists): {lot_c_name}")
        else:
            lot_c = ParkingLot(
                owner_poi_id=None,
                name=lot_c_name,
                parking_types=["Dedicated On-Site Parking Lot"],
                notes="Planned overflow lot, not yet open to the public.",
                publication_status="draft",
            )
            db.add(lot_c)
            db.flush()
            sync_parking_links(db, outfitters.id, [
                {"parking_lot_id": str(lot_c.id), "sort_order": 0, "label": None},
            ])
            db.commit()
            print(f"  Created: {lot_c_name} (draft - linked but not public)")

    except Exception as exc:
        db.rollback()
        print(f"  WARNING: Skipping parking lots - tables may not exist yet ({exc})")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print("=" * 60)
    print("  Nearby Nearby — Local Dev Seed Script")
    print("=" * 60)

    db = SessionLocal()
    try:
        print("\n[1/10] Ensuring test user...")
        ensure_test_user(db)

        print("\n[2/10] Ensuring categories...")
        ensure_categories(db)
        ensure_category_hierarchy(db)

        print("\n[3/10] Creating businesses...")
        create_businesses(db)

        print("\n[4/10] Creating parks...")
        create_parks(db)

        print("\n[5/10] Creating trails...")
        create_trails(db)

        print("\n[6/10] Creating events...")
        create_events(db)

        print("\n[7/10] Creating extra businesses (hours, holidays, amenities, location privacy)...")
        create_extra_businesses(db)

        print("\n[8/10] Creating extra park & trail (restroom locations, shared parking)...")
        create_extra_parks_and_trails(db)

        print("\n[9/10] Creating extra events (visibility cutoffs, recurrence, sponsors, venue tie-break)...")
        create_extra_events(db)
        enrich_events(db)

        print("\n[10/10] Creating parking lots...")
        create_parking_lots(db)

        # Summary
        total = db.query(PointOfInterest).filter(
            PointOfInterest.publication_status == "published"
        ).count()
        img_count = db.query(Image).count()

        print("\n" + "=" * 60)
        print(f"  Done! {total} published POIs, {img_count} image records")
        print("=" * 60)
        print("\nVerify at:")
        print("  - Admin panel: http://localhost:5175")
        print("  - User app:    http://localhost:8003 (dev) or http://localhost:8002 (prod)")

    except Exception as e:
        print(f"\nERROR: {e}")
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
