"""Task 2.5: one representation per concept (photos, contact, payments).

Covers the EXPAND step (this release), per concept:

  PHOTOS  — the ``images`` table wins. Admin create/update/autosave stop writing
    ``featured_image`` / ``photos`` / ``gallery_photos`` (stripped from the
    payload); the public detail + admin reads DERIVE those three from images; the
    card / nearby hero is derived from images too; the idempotent backfill moves
    legacy-only URLs into ``images`` (dedupe, one main per POI, re-run is a no-op).

  CONTACT — the ``main_contact_*`` columns win. The write path stops writing
    ``contact_info``; the backfill fills ``main_contact_*`` /
    ``offsite_emergency_contact`` from ``contact_info`` ONLY where the column is
    empty (conflicts kept + counted); ``contact_info`` / ``main_contact_*`` never
    appear in a public response (PII).

  PAYMENTS — the ``payment_methods`` column wins. The write path strips
    ``amenities.payment_methods``; the backfill unions it into ``payment_methods``
    (order-preserving, deduped, idempotent), which the Task 2.2 facet queries.
"""

import uuid

import pytest
from sqlalchemy import text

from conftest import orm_create_business, create_business
from shared.models.enums import ImageType
from shared.models.image import Image
from shared.poi_media import (
    backfill_images_from_legacy,
    derive_media,
    hero_url_from_images,
)
from shared.poi_contact_payments import (
    backfill_contact_info,
    backfill_payment_methods,
    strip_amenities_payment_methods,
)

_ORIGIN = "POINT(-79.0 35.8)"
_NEAR_A = "POINT(-79.001 35.8)"

_PII_KEYS = {
    "main_contact_name", "main_contact_email", "main_contact_phone",
    "offsite_emergency_contact", "emergency_protocols", "contact_info",
    "compliance", "admin_notes",
}


def _col(db, poi_id, *cols):
    row = db.execute(
        text(f"SELECT {', '.join(cols)} FROM points_of_interest WHERE id = :id"),
        {"id": str(poi_id)},
    ).mappings().first()
    return row


def _add_image(db, poi_id, image_type, url, order=0):
    img = Image(
        poi_id=poi_id,
        image_type=ImageType(image_type),
        filename=(url.rsplit("/", 1)[-1] or "img.jpg"),
        storage_url=url,
        storage_provider="s3",
        image_size_variant="original",
        display_order=order,
    )
    db.add(img)
    db.flush()
    return img


def _image_rows(db, poi_id):
    return db.execute(
        text(
            "SELECT image_type::text AS t, storage_url, display_order "
            "FROM images WHERE poi_id = :id AND parent_image_id IS NULL "
            "ORDER BY display_order, id"
        ),
        {"id": str(poi_id)},
    ).mappings().all()


# =========================================================================== #
# PHOTOS
# =========================================================================== #
class TestPhotosWritePath:
    def test_create_strips_legacy_photo_columns(self, admin_client, db_session):
        biz = create_business(
            admin_client, name="Photo Create",
            featured_image="https://x/feat.jpg",
            photos={"featured": "https://x/f.jpg", "gallery": ["https://x/g.jpg"]},
            gallery_photos=["https://x/gp.jpg"],
        )
        row = _col(db_session, biz["id"], "featured_image", "photos", "gallery_photos")
        assert row["featured_image"] is None
        assert row["photos"] is None
        assert row["gallery_photos"] is None

    def test_update_strips_legacy_photo_columns(self, admin_client, db_session):
        biz = create_business(admin_client, name="Photo Update")
        resp = admin_client.put(f"/api/pois/{biz['id']}", json={
            "featured_image": "https://x/new.jpg",
            "photos": {"featured": "https://x/new.jpg"},
            "gallery_photos": ["https://x/g2.jpg"],
        })
        assert resp.status_code == 200
        row = _col(db_session, biz["id"], "featured_image", "photos", "gallery_photos")
        assert row["featured_image"] is None
        assert row["photos"] is None
        assert row["gallery_photos"] is None


class TestPhotosDerive:
    def test_hero_rule_and_derive(self):
        # main wins regardless of order; gallery in order; photos dict shape.
        images = [
            {"type": "gallery", "url": "g1"},
            {"type": "main", "url": "hero"},
            {"type": "gallery", "url": "g2"},
        ]
        assert hero_url_from_images(images) == "hero"
        featured, photos, gallery = derive_media(images)
        assert featured == "hero"
        assert photos == {"featured": "hero", "gallery": ["g1", "g2"]}
        assert gallery == ["g1", "g2"]

    def test_hero_falls_back_to_first_when_no_main(self):
        images = [{"type": "gallery", "url": "g1"}, {"type": "entry", "url": "e1"}]
        assert hero_url_from_images(images) == "g1"

    def test_derive_none_when_no_images(self):
        assert derive_media([]) == (None, None, None)


class TestPhotosReadDerivation:
    def test_public_detail_derives_photos_from_images(self, db_session, app_client):
        # PAID so gallery_photos (tier=paid) also surfaces in the public payload.
        poi = orm_create_business(db_session, name="Derive Pub", location=_ORIGIN,
                                  published=True, listing_type="paid",
                                  featured_image="https://stale/should-not-win.jpg")
        _add_image(db_session, poi.id, "gallery", "https://img/g1.jpg", order=1)
        _add_image(db_session, poi.id, "main", "https://img/hero.jpg", order=0)
        _add_image(db_session, poi.id, "gallery", "https://img/g2.jpg", order=2)
        db_session.commit()

        data = app_client.get(f"/api/pois/{poi.id}").json()
        assert data["featured_image"] == "https://img/hero.jpg"
        assert data["photos"] == {
            "featured": "https://img/hero.jpg",
            "gallery": ["https://img/g1.jpg", "https://img/g2.jpg"],
        }
        assert data["gallery_photos"] == ["https://img/g1.jpg", "https://img/g2.jpg"]

    def test_public_detail_shape_unchanged_without_images(self, db_session, app_client):
        poi = orm_create_business(db_session, name="No Imgs", location=_ORIGIN,
                                  published=True, listing_type="paid")
        db_session.commit()
        data = app_client.get(f"/api/pois/{poi.id}").json()
        # Keys still present (shape unchanged), values None/empty.
        assert "featured_image" in data and data["featured_image"] is None
        assert "photos" in data and data["photos"] is None
        assert "gallery_photos" in data

    def test_card_hero_derived_from_images(self, db_session, app_client):
        origin = orm_create_business(db_session, name="Origin", location=_ORIGIN,
                                     published=True)
        near = orm_create_business(db_session, name="Card Hero", location=_NEAR_A,
                                   published=True,
                                   featured_image="https://stale/ignore.jpg")
        _add_image(db_session, near.id, "main", "https://img/card-hero.jpg")
        db_session.commit()

        resp = app_client.get(f"/api/pois/{origin.id}/nearby", params={"radius_miles": "10"})
        assert resp.status_code == 200
        card = next(c for c in resp.json() if c["name"] == "Card Hero")
        assert card["featured_image"] == "https://img/card-hero.jpg"


class TestPhotosBackfill:
    def test_backfill_creates_images_dedup_and_idempotent(self, db_session):
        poi = orm_create_business(
            db_session, name="Backfill Photos",
            featured_image="https://x/feat.jpg",
            photos={"featured": "https://x/feat.jpg",  # dup of featured -> one main
                    "gallery": ["https://x/pg1.jpg"]},
            gallery_photos=["https://x/gp1.jpg", "https://x/pg1.jpg"],  # pg1 dup
        )
        db_session.flush()

        counts = backfill_images_from_legacy(db_session)
        rows = _image_rows(db_session, poi.id)
        mains = [r for r in rows if r["t"] == "main"]
        galleries = [r for r in rows if r["t"] == "gallery"]

        assert len(mains) == 1  # exactly one hero
        assert mains[0]["storage_url"] == "https://x/feat.jpg"
        # Two distinct gallery URLs (pg1 deduped across photos.gallery + gallery_photos).
        assert {g["storage_url"] for g in galleries} == {
            "https://x/pg1.jpg", "https://x/gp1.jpg",
        }
        assert counts["main"] == 1
        assert counts["gallery"] == 2

        # Idempotent: re-run writes nothing new.
        counts2 = backfill_images_from_legacy(db_session)
        assert counts2 == {"main": 0, "gallery": 0, "skipped": counts2["skipped"]}
        assert len(_image_rows(db_session, poi.id)) == len(rows)

    def test_backfill_skips_url_already_in_images(self, db_session):
        poi = orm_create_business(db_session, name="Dedup Existing",
                                  featured_image="https://x/exists.jpg")
        _add_image(db_session, poi.id, "main", "https://x/exists.jpg")
        db_session.flush()

        counts = backfill_images_from_legacy(db_session)
        # URL already present AND a main already exists -> nothing added.
        assert counts["main"] == 0 and counts["gallery"] == 0
        assert len(_image_rows(db_session, poi.id)) == 1

    def test_backfill_existing_main_pushes_featured_to_gallery(self, db_session):
        poi = orm_create_business(db_session, name="Has Main",
                                  featured_image="https://x/other.jpg")
        _add_image(db_session, poi.id, "main", "https://x/existing-hero.jpg")
        db_session.flush()

        backfill_images_from_legacy(db_session)
        rows = _image_rows(db_session, poi.id)
        mains = [r for r in rows if r["t"] == "main"]
        galleries = [r for r in rows if r["t"] == "gallery"]
        assert len(mains) == 1  # still just the pre-existing main
        # The legacy featured_image URL was preserved as a gallery image.
        assert "https://x/other.jpg" in {g["storage_url"] for g in galleries}


# =========================================================================== #
# CONTACT
# =========================================================================== #
class TestContactWritePath:
    def test_create_strips_contact_info(self, admin_client, db_session):
        biz = create_business(admin_client, name="Contact Create",
                              contact_info={"best": {"name": "Bob", "phone": "555"}})
        row = _col(db_session, biz["id"], "contact_info")
        assert row["contact_info"] is None

    def test_update_strips_contact_info(self, admin_client, db_session):
        biz = create_business(admin_client, name="Contact Update")
        resp = admin_client.put(f"/api/pois/{biz['id']}", json={
            "contact_info": {"best": {"name": "Later"}},
        })
        assert resp.status_code == 200
        row = _col(db_session, biz["id"], "contact_info")
        assert row["contact_info"] is None


class TestContactBackfill:
    def test_fills_empty_columns_only(self, db_session):
        poi = orm_create_business(
            db_session, name="Contact Fill",
            contact_info={
                "best": {"name": "Rhonda", "phone": "919-1", "email": "r@x.com"},
                "emergency": {"name": "Dale", "phone": "919-9"},
            },
        )
        db_session.flush()

        counts = backfill_contact_info(db_session)
        row = _col(db_session, poi.id, "main_contact_name", "main_contact_phone",
                   "main_contact_email", "offsite_emergency_contact")
        assert row["main_contact_name"] == "Rhonda"
        assert row["main_contact_phone"] == "919-1"
        assert row["main_contact_email"] == "r@x.com"
        assert row["offsite_emergency_contact"] == "Dale (919-9)"
        assert counts["filled"] == 4

        # Idempotent: columns now equal the source, so nothing re-fills.
        counts2 = backfill_contact_info(db_session)
        assert counts2["filled"] == 0

    def test_existing_column_value_wins_conflict_logged(self, db_session):
        poi = orm_create_business(
            db_session, name="Contact Conflict",
            main_contact_name="Preset Name",
            contact_info={"best": {"name": "JSONB Name", "phone": "919-2"}},
        )
        db_session.flush()

        counts = backfill_contact_info(db_session)
        row = _col(db_session, poi.id, "main_contact_name", "main_contact_phone")
        assert row["main_contact_name"] == "Preset Name"  # JSONB loses
        assert row["main_contact_phone"] == "919-2"        # empty col filled
        assert counts["conflicts"] == 1
        assert counts["filled"] == 1


class TestContactPII:
    def test_pii_never_in_public_response(self, db_session, app_client):
        poi = orm_create_business(
            db_session, name="PII Guard", location=_ORIGIN, published=True,
            listing_type="paid",
            main_contact_name="Secret Person",
            main_contact_email="secret@internal.com",
            main_contact_phone="919-secret",
            offsite_emergency_contact="Call 911",
            emergency_protocols="Evacuate north",
            admin_notes="internal",
            contact_info={"best": {"name": "Secret"}},
            compliance={"pre_approval_required": True},
        )
        db_session.commit()
        data = app_client.get(f"/api/pois/{poi.id}").json()
        for key in _PII_KEYS:
            assert key not in data, f"PII key leaked into public response: {key}"


# =========================================================================== #
# PAYMENTS
# =========================================================================== #
class TestPaymentsWritePath:
    def test_create_strips_amenities_payment_methods(self, admin_client, db_session):
        biz = create_business(
            admin_client, name="Pay Create",
            amenities={"payment_methods": ["Cash", "Card"], "wifi": "Free Wifi"},
        )
        row = _col(db_session, biz["id"], "amenities")
        assert "payment_methods" not in (row["amenities"] or {})
        assert (row["amenities"] or {}).get("wifi") == "Free Wifi"  # rest kept

    def test_update_strips_amenities_payment_methods(self, admin_client, db_session):
        biz = create_business(admin_client, name="Pay Update")
        resp = admin_client.put(f"/api/pois/{biz['id']}", json={
            "amenities": {"payment_methods": ["Cash"], "parking": "free"},
        })
        assert resp.status_code == 200
        row = _col(db_session, biz["id"], "amenities")
        assert "payment_methods" not in (row["amenities"] or {})

    def test_strip_helper_is_surgical(self):
        poi = {"amenities": {"payment_methods": ["Cash"], "wifi": "x"}}
        strip_amenities_payment_methods(poi)
        assert poi["amenities"] == {"wifi": "x"}
        # No-op cases.
        no_am = {"name": "x"}
        strip_amenities_payment_methods(no_am)
        assert no_am == {"name": "x"}


class TestPaymentsBackfill:
    def test_union_dedup_order_preserving_idempotent(self, db_session):
        poi = orm_create_business(
            db_session, name="Pay Backfill",
            payment_methods=["Cash", "Card"],
            amenities={"payment_methods": ["Card", "Crypto"], "wifi": "x"},
        )
        db_session.flush()

        counts = backfill_payment_methods(db_session)
        row = _col(db_session, poi.id, "payment_methods", "amenities")
        # Existing column values first, then amenities extras not already present.
        assert row["payment_methods"] == ["Cash", "Card", "Crypto"]
        # amenities retained (not modified by the backfill).
        assert row["amenities"].get("payment_methods") == ["Card", "Crypto"]
        assert counts["updated"] == 1 and counts["added"] == 1

        # Idempotent: the union already equals the column -> no update.
        counts2 = backfill_payment_methods(db_session)
        assert counts2["updated"] == 0

    def test_backfill_when_column_empty(self, db_session):
        poi = orm_create_business(
            db_session, name="Pay From Amenities",
            amenities={"payment_methods": ["Cash", "Cash", "Card"]},
        )
        db_session.flush()
        backfill_payment_methods(db_session)
        row = _col(db_session, poi.id, "payment_methods")
        assert row["payment_methods"] == ["Cash", "Card"]  # deduped

    def test_backfilled_payment_methods_is_facet_queryable(self, db_session, app_client):
        origin = orm_create_business(db_session, name="Origin", location=_ORIGIN,
                                     published=True)
        near = orm_create_business(db_session, name="Crypto Only", location=_NEAR_A,
                                   published=True, payment_methods=[],
                                   amenities={"payment_methods": ["Crypto"]})
        db_session.flush()
        backfill_payment_methods(db_session)
        db_session.commit()

        resp = app_client.get(f"/api/pois/{origin.id}/nearby",
                              params={"radius_miles": "10", "payment": "Crypto"})
        assert resp.status_code == 200
        assert "Crypto Only" in {c["name"] for c in resp.json()}
