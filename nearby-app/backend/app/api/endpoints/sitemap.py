# app/api/endpoints/sitemap.py
"""Sitemap endpoints for SEO."""

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.orm import Session, joinedload
from datetime import datetime, timezone
from ...database import get_db
from ... import models

router = APIRouter()

_EXCLUDED_STATUSES = ("Canceled", "Rescheduled")
_BASE_URL = "https://nearbynearby.com"

_STATIC_PAGES = [
    ("", "weekly", "1.0"),
    ("explore", "daily", "0.9"),
    ("events-calendar", "daily", "0.8"),
    ("updates", "weekly", "0.7"),
    ("disaster-network", "monthly", "0.7"),
    ("claim-business", "monthly", "0.6"),
    ("suggest-event", "monthly", "0.6"),
    ("community-interest", "monthly", "0.5"),
    ("services", "monthly", "0.5"),
    ("feedback", "monthly", "0.4"),
    ("contact", "monthly", "0.4"),
    ("sitemap", "monthly", "0.3"),
    ("privacy-policy", "monthly", "0.3"),
    ("terms-of-service", "monthly", "0.3"),
]

# Update (blog) posts. These live in the frontend registry
# (app/src/data/updates.jsx), not the database, so the slugs are mirrored here.
# Keep in sync when a post is added or removed.
_UPDATE_POSTS = [
    ("rural-and-small-town-america-deserves-better-here-is-what-we-have-been-doing-about-it", "2026-06-05"),
    ("rural-america-was-never-broken-its-just-been-overlooked", "2025-02-27"),
    ("looking-ahead-through-2025-strengthening-rural-connections-and-opportunities", "2025-01-22"),
    ("a-day-of-service-chatham-county-volunteer-fair", "2024-09-11"),
    ("nearby-nearby-joins-the-ced-gro-accelerator-driving-innovation-in-tech", "2024-05-24"),
    ("sharing-the-vision-of-nearby-nearby-featured-speaker-at-two-chatham-county-networking-events", "2024-05-24"),
    ("from-innovation-to-impact-the-evolution-of-nearby-nearby-and-our-vision-for-the-future", "2024-05-24"),
]

_TYPE_PREFIX = {
    "BUSINESS": "places",
    "SERVICES": "places",
    "PARK": "parks",
    "TRAIL": "trails",
}


def _url_tag(loc: str, changefreq: str, priority: str, lastmod: str = None) -> str:
    lastmod_tag = f"\n    <lastmod>{lastmod}</lastmod>" if lastmod else ""
    return (
        f"  <url>\n"
        f"    <loc>{loc}</loc>{lastmod_tag}\n"
        f"    <changefreq>{changefreq}</changefreq>\n"
        f"    <priority>{priority}</priority>\n"
        f"  </url>"
    )


def _xml_response(urls: list[str]) -> Response:
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "\n".join(urls) + "\n"
        + '</urlset>'
    )
    return Response(content=xml, media_type="application/xml")


# ── Sitemap index ─────────────────────────────────────────────────────────────

@router.get("/sitemap.xml")
def sitemap_index():
    """Master sitemap index pointing to all sub-sitemaps."""
    sitemaps = [
        "sitemap-pages.xml",
        "sitemap-updates.xml",
        "sitemap-places.xml",
        "sitemap-parks.xml",
        "sitemap-trails.xml",
        "sitemap-events.xml",
    ]
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    entries = "\n".join(
        f"  <sitemap>\n"
        f"    <loc>{_BASE_URL}/{s}</loc>\n"
        f"    <lastmod>{today}</lastmod>\n"
        f"  </sitemap>"
        for s in sitemaps
    )
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + entries + "\n"
        + '</sitemapindex>'
    )
    return Response(content=xml, media_type="application/xml")


# ── Static pages ──────────────────────────────────────────────────────────────

@router.get("/sitemap-pages.xml")
def sitemap_pages():
    """Sitemap for static/non-POI pages."""
    urls = [
        _url_tag(
            loc=f"{_BASE_URL}/{path}" if path else _BASE_URL,
            changefreq=changefreq,
            priority=priority,
        )
        for path, changefreq, priority in _STATIC_PAGES
    ]
    return _xml_response(urls)


# ── Update (blog) posts ───────────────────────────────────────────────────────

@router.get("/sitemap-updates.xml")
def sitemap_updates():
    """Sitemap for Update (blog) posts."""
    urls = [
        _url_tag(
            loc=f"{_BASE_URL}/updates/{slug}",
            changefreq="yearly",
            priority="0.6",
            lastmod=published,
        )
        for slug, published in _UPDATE_POSTS
    ]
    return _xml_response(urls)


# ── Places (businesses) ───────────────────────────────────────────────────────

@router.get("/sitemap-places.xml")
def sitemap_places(db: Session = Depends(get_db)):
    """Sitemap for published business/service POIs."""
    pois = db.query(models.poi.PointOfInterest).filter(
        models.poi.PointOfInterest.poi_type.in_(["BUSINESS", "SERVICES"]),
        models.poi.PointOfInterest.publication_status == "published",
    ).all()

    urls = [
        _url_tag(
            loc=f"{_BASE_URL}/places/{poi.slug or poi.id}",
            changefreq="weekly",
            priority="0.7",
            lastmod=poi.last_updated.strftime("%Y-%m-%d") if poi.last_updated else None,
        )
        for poi in pois
    ]
    return _xml_response(urls)


# ── Parks ─────────────────────────────────────────────────────────────────────

@router.get("/sitemap-parks.xml")
def sitemap_parks(db: Session = Depends(get_db)):
    """Sitemap for published park POIs."""
    pois = db.query(models.poi.PointOfInterest).filter(
        models.poi.PointOfInterest.poi_type == "PARK",
        models.poi.PointOfInterest.publication_status == "published",
    ).all()

    urls = [
        _url_tag(
            loc=f"{_BASE_URL}/parks/{poi.slug or poi.id}",
            changefreq="monthly",
            priority="0.7",
            lastmod=poi.last_updated.strftime("%Y-%m-%d") if poi.last_updated else None,
        )
        for poi in pois
    ]
    return _xml_response(urls)


# ── Trails ────────────────────────────────────────────────────────────────────

@router.get("/sitemap-trails.xml")
def sitemap_trails(db: Session = Depends(get_db)):
    """Sitemap for published trail POIs."""
    pois = db.query(models.poi.PointOfInterest).filter(
        models.poi.PointOfInterest.poi_type == "TRAIL",
        models.poi.PointOfInterest.publication_status == "published",
    ).all()

    urls = [
        _url_tag(
            loc=f"{_BASE_URL}/trails/{poi.slug or poi.id}",
            changefreq="monthly",
            priority="0.7",
            lastmod=poi.last_updated.strftime("%Y-%m-%d") if poi.last_updated else None,
        )
        for poi in pois
    ]
    return _xml_response(urls)


# ── Events ────────────────────────────────────────────────────────────────────

@router.get("/sitemap-events.xml")
def sitemap_events(db: Session = Depends(get_db)):
    """Sitemap for published event POIs."""
    now = datetime.now(timezone.utc)

    pois = db.query(models.poi.PointOfInterest).options(
        joinedload(models.poi.PointOfInterest.event)
    ).filter(
        models.poi.PointOfInterest.poi_type == "EVENT",
        models.poi.PointOfInterest.publication_status == "published",
    ).all()

    urls = []
    for poi in pois:
        event = poi.event
        if not event:
            continue
        if getattr(event, 'event_status', None) in _EXCLUDED_STATUSES:
            continue

        end_dt = event.end_datetime or event.start_datetime
        is_upcoming = end_dt and end_dt > now

        urls.append(_url_tag(
            loc=f"{_BASE_URL}/events/{poi.slug or poi.id}",
            changefreq="daily" if is_upcoming else "monthly",
            priority="0.8" if is_upcoming else "0.4",
        ))

    return _xml_response(urls)
