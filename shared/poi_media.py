"""Task 2.5 (photos): the ``images`` table is the single source of truth.

Three legacy representations stored photo URLs redundantly alongside the real
``images`` table:

    legacy field (points_of_interest)   maps to image_type
    ---------------------------------   ------------------
    featured_image  (String URL)        main       (the hero)
    photos          (JSONB dict)        main / gallery
        {"featured": "<url>", "gallery": ["<url>", ...]}
    gallery_photos  (JSONB list)        gallery

This module makes ``images`` win:
  * the admin write path stops writing the three legacy columns (they are stripped
    from the payload — see ``LEGACY_PHOTO_FIELDS``);
  * the migration ``t_one_representation_001`` backfills any URL living ONLY in a
    legacy field into an ``images`` row (``backfill_images_from_legacy``);
  * reads derive the three legacy fields FROM ``images`` so every existing payload
    shape (``featured_image`` / ``photos`` / ``gallery_photos`` and the card hero)
    stays byte-compatible — ``enrich_poi_media_fields`` (detail + admin) and
    ``attach_hero_images`` (the card / nearby batch path).

Hero rule (deterministic, documented once here):
  the hero is the POI's ``main``-type image with the lowest ``display_order``; if
  the POI has no ``main`` image, the first original image by ``display_order``.
  ``featured_image`` == the hero URL. ``gallery_photos`` == the ``gallery``-type
  image URLs in ``display_order``. ``photos`` == ``{"featured": hero, "gallery":
  [...]}`` when the POI has at least one image, else ``None``.

The three legacy columns are RETAINED this release (expand/contract); the backfill
never modifies or drops them, so they remain the recovery source until a later
contract release drops them.
"""

from __future__ import annotations

import os
import uuid
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse

from sqlalchemy import text

# Legacy photo columns the write path must STOP writing (stripped from the
# create / update / autosave payloads; derived from ``images`` on read).
LEGACY_PHOTO_FIELDS: Tuple[str, ...] = ("featured_image", "photos", "gallery_photos")

HERO_IMAGE_TYPE = "main"
GALLERY_IMAGE_TYPE = "gallery"


# --------------------------------------------------------------------------- #
# Normalized image accessors (accept the get_poi_images dict shape OR ORM Image)
# --------------------------------------------------------------------------- #
def _img_url(img: Any) -> Optional[str]:
    if isinstance(img, dict):
        return img.get("url") or img.get("storage_url")
    return getattr(img, "storage_url", None) or getattr(img, "url", None)


def _img_type(img: Any) -> Optional[str]:
    if isinstance(img, dict):
        t = img.get("type")
    else:
        t = getattr(img, "image_type", None)
    return t.value if hasattr(t, "value") else t


def hero_url_from_images(images: List[Any]) -> Optional[str]:
    """Deterministic hero URL: the first ``main`` image (in the given order),
    else the first image with a URL. Assumes ``images`` is already ordered by
    ``display_order`` (both get_poi_images and the ORM query below guarantee it).
    """
    first_any: Optional[str] = None
    for img in images or []:
        url = _img_url(img)
        if not url:
            continue
        if first_any is None:
            first_any = url
        if _img_type(img) == HERO_IMAGE_TYPE:
            return url
    return first_any


def gallery_urls_from_images(images: List[Any]) -> List[str]:
    """The ``gallery``-type image URLs, in order."""
    out: List[str] = []
    for img in images or []:
        if _img_type(img) != GALLERY_IMAGE_TYPE:
            continue
        url = _img_url(img)
        if url:
            out.append(url)
    return out


def derive_media(images: List[Any]) -> Tuple[Optional[str], Optional[dict], Optional[list]]:
    """Return ``(featured_image, photos, gallery_photos)`` derived from ``images``.

    Shapes match the legacy columns so payloads are unchanged:
      * featured_image -> hero URL (or None)
      * photos         -> ``{"featured": hero, "gallery": [...]}`` when the POI has
                          any image, else None
      * gallery_photos -> the gallery URL list (or None when empty)
    """
    hero = hero_url_from_images(images)
    gallery = gallery_urls_from_images(images)
    has_any = bool(images) and any(_img_url(i) for i in images)
    photos = {"featured": hero, "gallery": gallery} if has_any else None
    return hero, photos, (gallery or None)


# --------------------------------------------------------------------------- #
# Read enrichment (detail + admin) — set_committed_value so the instance is
# never marked dirty (a later autoflush can therefore never write the derived
# values back into the retained legacy columns).
# --------------------------------------------------------------------------- #
def _original_images(db, poi_id) -> List[Any]:
    """ORM Image rows for a POI: originals only (no size variants), a URL present,
    ordered by display_order then id (stable)."""
    from shared.models.image import Image

    return (
        db.query(Image)
        .filter(
            Image.poi_id == poi_id,
            Image.parent_image_id.is_(None),
            Image.storage_url.isnot(None),
        )
        .order_by(Image.display_order, Image.id)
        .all()
    )


def enrich_poi_media_fields(db, poi, images: Optional[List[Any]] = None):
    """Reconstruct featured_image / photos / gallery_photos on ``poi`` from the
    ``images`` table so responses that serialize those attributes reflect images,
    not the stale retained legacy columns.

    ``images`` may be the get_poi_images dict list (app detail path). When None,
    the POI's original image rows are queried (admin path).
    """
    if poi is None:
        return poi
    from sqlalchemy.orm.attributes import set_committed_value

    if images is None:
        images = _original_images(db, poi.id)
    featured_image, photos, gallery_photos = derive_media(images)
    set_committed_value(poi, "featured_image", featured_image)
    set_committed_value(poi, "photos", photos)
    set_committed_value(poi, "gallery_photos", gallery_photos)
    return poi


def attach_hero_images(db, pois: List[Any]) -> None:
    """Batch-attach the hero URL onto ``poi.featured_image`` for a list of POIs in
    ONE query (the card / nearby / vendor / sponsor path, where loading the images
    relation per row would be N+1). set_committed_value keeps the instances clean.
    """
    if not pois:
        return
    from sqlalchemy.orm.attributes import set_committed_value
    from shared.models.image import Image

    ids = [p.id for p in pois if getattr(p, "id", None) is not None]
    if not ids:
        return

    # ORM query so the UUID list binds correctly (Postgres orders NULL
    # display_order last for ASC, matching _original_images).
    rows = (
        db.query(Image.poi_id, Image.image_type, Image.storage_url)
        .filter(
            Image.poi_id.in_(ids),
            Image.parent_image_id.is_(None),
            Image.storage_url.isnot(None),
        )
        .order_by(Image.display_order, Image.id)
        .all()
    )

    # Per POI (rows already ordered by display_order): the first ``main`` image
    # wins; else the first image of any type. Mirrors ``hero_url_from_images``.
    main_hero: Dict[str, str] = {}
    first_hero: Dict[str, str] = {}
    for poi_id, image_type, storage_url in rows:
        if not storage_url:
            continue
        pid = str(poi_id)
        first_hero.setdefault(pid, storage_url)
        itype = image_type.value if hasattr(image_type, "value") else image_type
        if itype == HERO_IMAGE_TYPE:
            main_hero.setdefault(pid, storage_url)

    for p in pois:
        pid = str(p.id)
        set_committed_value(p, "featured_image", main_hero.get(pid) or first_hero.get(pid))


# --------------------------------------------------------------------------- #
# Backfill: legacy photo URLs -> images rows (idempotent)
# --------------------------------------------------------------------------- #
def _extract_url(entry: Any) -> Optional[str]:
    """A URL string out of a gallery/photos entry (str or dict)."""
    if isinstance(entry, str):
        return entry.strip() or None
    if isinstance(entry, dict):
        for k in ("url", "storage_url", "src"):
            v = entry.get(k)
            if isinstance(v, str) and v.strip():
                return v.strip()
    return None


def _filename_for(url: str) -> str:
    base = os.path.basename(urlparse(url).path)
    return base or "backfilled-image"


def _legacy_candidates(featured_image: Any, photos: Any, gallery_photos: Any):
    """Return ``(main_candidates, gallery_candidates)`` URL lists from the three
    legacy fields, in a stable priority order. No dedup yet."""
    main_candidates: List[str] = []
    gallery_candidates: List[str] = []

    if isinstance(featured_image, str) and featured_image.strip():
        main_candidates.append(featured_image.strip())

    if isinstance(photos, dict):
        feat = photos.get("featured")
        if isinstance(feat, str) and feat.strip():
            main_candidates.append(feat.strip())
        gal = photos.get("gallery")
        if isinstance(gal, (list, tuple)):
            for e in gal:
                u = _extract_url(e)
                if u:
                    gallery_candidates.append(u)

    if isinstance(gallery_photos, (list, tuple)):
        for e in gallery_photos:
            u = _extract_url(e)
            if u:
                gallery_candidates.append(u)

    return main_candidates, gallery_candidates


def backfill_images_from_legacy(bind) -> Dict[str, int]:
    """Idempotent backfill: create ``images`` rows for photo URLs that live ONLY
    in a legacy field (``featured_image`` / ``photos`` / ``gallery_photos``).

    ``bind`` is a SQLAlchemy Connection (alembic ``op.get_bind()``) or Session.
    Returns ``{"main": n, "gallery": m, "skipped": k}`` where ``skipped`` counts
    URLs already present as an ``images.storage_url`` (dedup) for that POI.

    Rules:
      * dedup against existing ``images.storage_url`` (per POI) AND within this run;
      * one ``main`` image per POI — if the POI already has a ``main`` image (or one
        is chosen from the first main-candidate), remaining main-candidate URLs fall
        through to ``gallery`` so no URL is lost;
      * ordering preserved via ``display_order`` (appended after the POI's current
        max), so a re-run is a pure no-op (every URL now exists as an image).
    """
    counts = {"main": 0, "gallery": 0, "skipped": 0}

    # Existing images per POI: url set + whether a main already exists + max order.
    existing_urls: Dict[str, set] = {}
    has_main: Dict[str, bool] = {}
    max_order: Dict[str, int] = {}
    for r in bind.execute(
        text(
            "SELECT poi_id, image_type, storage_url, display_order "
            "FROM images WHERE parent_image_id IS NULL"
        )
    ).mappings():
        pid = str(r["poi_id"])
        if r["storage_url"]:
            existing_urls.setdefault(pid, set()).add(r["storage_url"])
        if r["image_type"] == HERO_IMAGE_TYPE:
            has_main[pid] = True
        do = r["display_order"]
        if do is not None:
            max_order[pid] = max(max_order.get(pid, 0), do)

    insert_sql = text(
        "INSERT INTO images "
        "(id, poi_id, image_type, filename, storage_provider, storage_url, "
        " image_size_variant, display_order, created_at) "
        "VALUES (:id, :poi, CAST(:t AS imagetype), :fn, 's3', :url, "
        "        'original', :ord, now())"
    )

    def _insert(pid: str, url: str, image_type: str) -> None:
        ord_ = max_order.get(pid, 0) + 1
        max_order[pid] = ord_
        bind.execute(insert_sql, {
            "id": str(uuid.uuid4()), "poi": pid, "t": image_type,
            "fn": _filename_for(url), "url": url, "ord": ord_,
        })
        existing_urls.setdefault(pid, set()).add(url)
        counts[image_type] += 1

    for row in bind.execute(
        text("SELECT id, featured_image, photos, gallery_photos FROM points_of_interest")
    ).mappings():
        pid = str(row["id"])
        main_c, gallery_c = _legacy_candidates(
            row["featured_image"], row["photos"], row["gallery_photos"]
        )
        urls_here = existing_urls.get(pid, set())

        # Choose the single main (only if the POI has none yet).
        if not has_main.get(pid):
            chosen_main = None
            for u in main_c:
                if u in urls_here:
                    counts["skipped"] += 1
                    continue
                chosen_main = u
                break
            if chosen_main is not None:
                _insert(pid, chosen_main, HERO_IMAGE_TYPE)
                has_main[pid] = True
                # Any OTHER distinct main-candidate URLs become gallery.
                gallery_c = [u for u in main_c if u != chosen_main] + gallery_c
            else:
                gallery_c = list(main_c) + gallery_c
        else:
            # POI already has a main image: all main-candidates fall to gallery.
            gallery_c = list(main_c) + gallery_c

        seen_run: set = set()
        for u in gallery_c:
            if u in urls_here or u in seen_run:
                counts["skipped"] += 1
                continue
            seen_run.add(u)
            _insert(pid, u, GALLERY_IMAGE_TYPE)

    return counts
