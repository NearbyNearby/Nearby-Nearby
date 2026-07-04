# app/main.py
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from .core.sentry import init_sentry
from .core.config import settings

init_sentry()
from .api.endpoints import (
    pois, waitlist, community_interest, contact, feedback, business_claims,
    event_suggestions, sitemap,
)
from .database import engine, get_db
from sqlalchemy import text
from sqlalchemy.orm import Session
import os
import re
from pathlib import Path
from . import models

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address)

app = FastAPI(
    title="Nearby Nearby API",
    description="API for the Nearby Nearby platform.",
    version="1.0.0"
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

@app.on_event("startup")
async def startup_event():
    """Test database connection and enable extensions on startup"""
    try:
        with engine.connect() as connection:
            result = connection.execute(text("SELECT 1"))
            print("[SUCCESS] Database connection successful!")
            print(f"[SUCCESS] Connected to: {settings.DATABASE_URL.split('@')[1].split('/')[0]}")

            # Enable pg_trgm extension for fuzzy search
            try:
                connection.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))
                connection.commit()
                print("[SUCCESS] pg_trgm extension enabled for fuzzy search!")
            except Exception as ext_error:
                print(f"[WARNING] Could not enable pg_trgm extension: {ext_error}")
                print("[INFO] Fuzzy search will still work with basic matching")
                connection.rollback()

            # Enable pgvector extension for semantic search.
            #
            # NOTE: The canonical source for the pgvector extension, the
            # `embedding vector(768)` column, and its HNSW index is the admin
            # Alembic migration `k_embedding_001` (admin owns the shared
            # schema). This startup `CREATE EXTENSION IF NOT EXISTS` is kept
            # ONLY as belt-and-suspenders for app-only local databases that
            # never run admin migrations — it is idempotent and intentionally
            # does NOT create the column/index (the app must not own schema).
            # Failure here is non-fatal: semantic search degrades to keyword
            # search.
            try:
                connection.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
                connection.commit()
                print("[SUCCESS] pgvector extension enabled for semantic search!")
            except Exception as ext_error:
                print(f"[WARNING] Could not enable pgvector extension: {ext_error}")
                print("[INFO] Semantic search will not be available")
                connection.rollback()

            # Create trigram indexes for better search performance
            try:
                connection.execute(text(
                    "CREATE INDEX IF NOT EXISTS poi_name_trgm_idx ON points_of_interest USING gin (name gin_trgm_ops)"
                ))
                connection.execute(text(
                    "CREATE INDEX IF NOT EXISTS poi_city_trgm_idx ON points_of_interest USING gin (address_city gin_trgm_ops)"
                ))
                connection.commit()
                print("[SUCCESS] Search indexes created for optimal performance!")
            except Exception as idx_error:
                print(f"[WARNING] Could not create search indexes: {idx_error}")

            # Create tsvector search_document column for full-text search
            try:
                # Check if column already exists
                col_exists = connection.execute(text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_name = 'points_of_interest' AND column_name = 'search_document'"
                )).fetchone()

                if not col_exists:
                    connection.execute(text("""
                        ALTER TABLE points_of_interest
                        ADD COLUMN search_document tsvector
                        GENERATED ALWAYS AS (
                            setweight(to_tsvector('english', COALESCE(name, '')), 'A') ||
                            setweight(to_tsvector('english', COALESCE(description_short, '')), 'B') ||
                            setweight(to_tsvector('english', COALESCE(address_city, '')), 'B') ||
                            setweight(to_tsvector('english', COALESCE(description_long, '')), 'C')
                        ) STORED
                    """))
                    connection.commit()
                    print("[SUCCESS] search_document tsvector column created!")

                connection.execute(text(
                    "CREATE INDEX IF NOT EXISTS idx_poi_search_document "
                    "ON points_of_interest USING GIN (search_document)"
                ))
                connection.commit()
                print("[SUCCESS] Full-text search index created!")
            except Exception as fts_error:
                print(f"[WARNING] Could not create full-text search column: {fts_error}")
                try:
                    connection.rollback()
                except Exception:
                    pass

    except Exception as e:
        print(f"[ERROR] Database connection failed: {e}")
        raise

    # Wire up the shared embedding client for semantic search. The model is now
    # served out-of-process by a TEI container, so this is a cheap, fail-soft
    # HTTP client — no ~1GB model is loaded into this process. If the service
    # URL is unset or the service is down, the client is disabled and semantic
    # search transparently degrades to keyword search.
    print("\n[EMBEDDING] Configuring shared embedding client...")
    try:
        from shared.embeddings import get_embedding_client
        app.state.embedding_client = get_embedding_client()
        if app.state.embedding_client.enabled:
            print(f"[SUCCESS] Embedding client configured (service: {app.state.embedding_client.base_url})")
        else:
            print("[INFO] Embedding service not configured (EMBEDDING_SERVICE_URL unset)")
            print("[INFO] Semantic search will fall back to keyword search")
    except Exception as e:
        print(f"[WARNING] Could not configure embedding client: {e}")
        print("[INFO] Semantic search will fall back to keyword search")
        app.state.embedding_client = None

# CORS Middleware — restrict methods/headers explicitly. With
# allow_credentials=True, wildcard methods/headers expand the cross-origin
# attack surface to anything an allowed-origin page can issue.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS.split(','),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With", "Accept"],
    max_age=600,
)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    """
    Apply baseline security headers to every response. The nearby-app serves
    its own SPA via FastAPI (no fronting nginx for the user app), so headers
    must originate here.

    - HSTS: force HTTPS for one year on all subdomains.
    - X-Content-Type-Options: stop browsers from MIME-sniffing.
    - Referrer-Policy: leak as little URL info as possible to third parties.
    - Permissions-Policy: disable powerful browser APIs by default.
    - X-Frame-Options: clickjacking guard.
    - CSP: blocks injected <script> from running. 'unsafe-inline' is kept for
      Vite's build runtime; migrate to nonces if/when feasible.
    """
    response = await call_next(request)
    response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault(
        "Permissions-Policy",
        "camera=(), microphone=(), geolocation=(self), payment=()",
    )
    response.headers.setdefault(
        "Content-Security-Policy",
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline'; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com data:; "
        "img-src 'self' data: https: blob:; "
        "connect-src 'self' https: wss:; "
        "frame-ancestors 'self'; "
        "base-uri 'self'; "
        "form-action 'self'; "
        "object-src 'none'",
    )
    return response

# Include API Routers
app.include_router(pois.router, prefix="/api", tags=["Points of Interest"])
app.include_router(waitlist.router, prefix="/api", tags=["Waitlist"])
app.include_router(community_interest.router, prefix="/api", tags=["Community Interest"])
app.include_router(contact.router, prefix="/api", tags=["Contact"])
app.include_router(feedback.router, prefix="/api", tags=["Feedback"])
app.include_router(business_claims.router, prefix="/api", tags=["Business Claims"])
app.include_router(event_suggestions.router, prefix="/api", tags=["Event Suggestions"])
app.include_router(sitemap.router, tags=["Sitemap"])

# Static files configuration
BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"

# Mount static files (CSS, JS, images, etc.)
if STATIC_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(STATIC_DIR / "assets")), name="assets")

def get_poi_from_path(path: str, db: Session):
    """Extract POI identifier from path and fetch POI data"""
    # Match patterns: /places/{slug}, /parks/{slug}, /trails/{slug}, /events/{slug}, /poi/{uuid}
    patterns = [
        (r'^places/(.+)$', 'slug'),
        (r'^parks/(.+)$', 'slug'),
        (r'^trails/(.+)$', 'slug'),
        (r'^events/(.+)$', 'slug'),
        (r'^poi/([a-f0-9-]{36})$', 'uuid'),
    ]

    for pattern, id_type in patterns:
        match = re.match(pattern, path)
        if match:
            identifier = match.group(1)
            if id_type == 'uuid':
                return db.query(models.poi.PointOfInterest).filter(
                    models.poi.PointOfInterest.id == identifier,
                    models.poi.PointOfInterest.publication_status == 'published'
                ).first()
            else:
                return db.query(models.poi.PointOfInterest).filter(
                    models.poi.PointOfInterest.slug == identifier,
                    models.poi.PointOfInterest.publication_status == 'published'
                ).first()
    return None


def generate_og_meta_tags(poi, base_url: str) -> str:
    """Generate Open Graph meta tags for a POI"""
    title = f"{poi.name} | NearbyNearby"
    description = (
        poi.teaser_paragraph or
        poi.description_short or
        (poi.description_long[:150] + '...' if poi.description_long and len(poi.description_long) > 150 else poi.description_long) or
        f"Discover {poi.name} in {poi.address_city or 'your area'}. Find local businesses, parks, trails, and events on NearbyNearby."
    )
    # Strip HTML tags from description
    description = re.sub(r'<[^>]+>', '', description or '')

    # Determine URL based on slug or fallback to UUID
    if poi.slug:
        type_prefixes = {
            'BUSINESS': 'places',
            'SERVICES': 'places',
            'PARK': 'parks',
            'TRAIL': 'trails',
            'EVENT': 'events',
        }
        prefix = type_prefixes.get(poi.poi_type.value if hasattr(poi.poi_type, 'value') else poi.poi_type, 'places')
        url = f"{base_url}/{prefix}/{poi.slug}"
    else:
        url = f"{base_url}/poi/{poi.id}"

    # Get image URL (featured image or default logo)
    image_url = poi.featured_image if poi.featured_image else f"{base_url}/Logo.png"

    return f'''
    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website" />
    <meta property="og:url" content="{url}" />
    <meta property="og:title" content="{title}" />
    <meta property="og:description" content="{description}" />
    <meta property="og:image" content="{image_url}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:site_name" content="NearbyNearby" />

    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:url" content="{url}" />
    <meta name="twitter:title" content="{title}" />
    <meta name="twitter:description" content="{description}" />
    <meta name="twitter:image" content="{image_url}" />
    <meta name="twitter:site" content="@itsnearbynearby" />

    <!-- Standard Meta -->
    <meta name="description" content="{description}" />
    <title>{title}</title>
'''


def inject_meta_tags(html: str, meta_tags: str) -> str:
    """Inject meta tags into HTML, replacing defaults"""
    # Remove existing OG tags, Twitter tags, and title
    html = re.sub(r'<meta property="og:[^"]*"[^>]*>', '', html)
    html = re.sub(r'<meta name="twitter:[^"]*"[^>]*>', '', html)
    html = re.sub(r'<meta name="description"[^>]*>', '', html)
    html = re.sub(r'<title>[^<]*</title>', '', html)

    # Inject new meta tags after <head>
    html = html.replace('<head>', f'<head>{meta_tags}', 1)
    return html


# Health check endpoint for ECS/ALB. Return only the minimum signal needed
# for liveness probes — never raw exception text (leaks driver state, host
# names, etc.).
import logging as _logging
_health_logger = _logging.getLogger("nearby_app.health")

@app.get("/api/health")
async def health_check():
    health = {"status": "healthy", "service": "nearby-app"}
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
            health["database"] = "connected"
    except Exception:
        _health_logger.exception("Health check database probe failed")
        health["status"] = "degraded"
        health["database"] = "disconnected"
    # Report the embedding service status. This is informational only and must
    # NOT affect overall health: if the embedding service is unconfigured or
    # down, semantic search simply degrades to keyword search — the app stays
    # healthy. We never make a network call here (the health probe must be fast
    # and cannot depend on a third-party container being up).
    client = getattr(app.state, 'embedding_client', None)
    if client is not None and getattr(client, 'enabled', False):
        health["embedding_service"] = "configured"
    else:
        health["embedding_service"] = "disabled"
    status_code = 200 if health["status"] == "healthy" else 503
    return JSONResponse(content=health, status_code=status_code)


# Catch-all route for SPA (must be last)
@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    """
    Serve the React SPA for all non-API routes.
    This enables client-side routing with dynamic meta tags for social sharing.
    """
    # If it's an API route, let FastAPI handle it (shouldn't reach here)
    if full_path.startswith("api/"):
        return {"message": "API route not found"}

    # Check if the requested file exists in static directory (images, fonts, etc.)
    file_path = STATIC_DIR / full_path
    if file_path.is_file():
        return FileResponse(str(file_path))

    # Check if this is a POI detail page - if so, inject dynamic meta tags
    index_file = STATIC_DIR / "index.html"
    if not index_file.exists():
        return {"message": "Frontend not built yet. Run 'npm run build' in the app directory."}

    # Check if this is a POI page that needs dynamic meta tags
    poi_patterns = ['places/', 'parks/', 'trails/', 'events/', 'poi/']
    is_poi_page = any(full_path.startswith(p) for p in poi_patterns)

    if is_poi_page:
        # Get database session
        db = next(get_db())
        try:
            poi = get_poi_from_path(full_path, db)
            if poi:
                # Task 2.5: the OG image reads poi.featured_image, now derived from
                # the images table (the retained column is no longer written).
                from shared.poi_media import enrich_poi_media_fields
                enrich_poi_media_fields(db, poi)
                # Read HTML and inject dynamic meta tags
                with open(index_file, 'r') as f:
                    html = f.read()

                base_url = "https://nearbynearby.com"
                meta_tags = generate_og_meta_tags(poi, base_url)
                html = inject_meta_tags(html, meta_tags)

                return HTMLResponse(content=html)
        except Exception as e:
            print(f"[ERROR] Failed to generate meta tags: {e}")
        finally:
            db.close()

    # Default: serve index.html for client-side routing
    return FileResponse(str(index_file))