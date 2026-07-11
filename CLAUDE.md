nn-templates submodule is Barry's designs / templates. 

# Claude Code Guidelines - Nearby Nearby Projects

This file provides guidance to Claude Code (claude.ai/code) when working with the Nearby Nearby platform.

---

## Working Principles

Guardrails to cut common LLM coding mistakes. They bias toward caution over speed; use judgment on trivial tasks.

1. **Think before coding.** State assumptions; if uncertain, ask. If multiple interpretations exist, surface them instead of silently picking one. If a simpler approach exists, say so and push back when warranted. If something is unclear, stop, name what's confusing, and ask.
2. **Simplicity first.** Write the minimum code that solves the problem, nothing speculative: no unrequested features, no abstractions for single-use code, no configurability nobody asked for, no error handling for impossible cases. If 200 lines could be 50, rewrite it. If a senior engineer would call it overcomplicated, simplify.
3. **Surgical changes.** Touch only what the request requires; every changed line should trace directly to it. Match existing style even if you'd do it differently. Don't "improve" adjacent code, refactor what isn't broken, or reformat working code. Remove only the imports/vars/functions your own change orphaned; mention pre-existing dead code, don't delete it unless asked.
4. **Goal-driven execution.** Turn tasks into verifiable goals ("fix the bug" becomes "write a test that reproduces it, then make it pass"; "refactor X" becomes "tests pass before and after"). For multi-step work, state a brief numbered plan with a verify check per step, then loop until verified.
5. **Be concise.** Keep prose, comments, commit messages, and docs as short as the content allows. Cut filler; don't pad.
6. **No em dashes.** Do not use em dashes in prose, comments, commit messages, or docs. Use commas, parentheses, colons, or separate sentences instead.

---

## Documentation Reference (Source of Truth)

The `docs/` folder contains the authoritative documentation for each system:

### Architecture
- `docs/architecture/overview.md` - High-level system architecture, tech stack, data flow diagrams
- `docs/architecture/database-schema.md` - All database models, relationships, and field definitions
- `docs/architecture/api-reference.md` - Complete REST API endpoint documentation for both apps

### Core Systems
- `docs/systems/authentication.md` - JWT token auth, login flow, token management
- `docs/systems/authorization.md` - Role-based access control (Admin/Editor/Viewer)
- `docs/systems/poi-management.md` - CRUD operations for all 8 POI types
- `docs/systems/categories.md` - Hierarchical category system with parent-child relationships
- `docs/systems/images.md` - Image upload, S3/MinIO storage, variant generation
- `docs/systems/attributes.md` - Dynamic configurable fields for POIs
- `docs/systems/relationships.md` - POI-to-POI linking (event_venue, trail_in_park, etc.)
- `docs/systems/search.md` - Keyword (pg_trgm), semantic (pgvector), and hybrid search
- `docs/systems/geospatial.md` - **Nearby Nearby Feature**, PostGIS queries, distance calculations, map integration
- `docs/systems/seo.md` - Meta tags, Open Graph, structured data
- `docs/systems/users.md` - User management and admin scripts

### Infrastructure
- `docs/infrastructure/docker.md` - Container setup, compose files, multi-stage builds
- `docs/infrastructure/database.md` - PostgreSQL, PostGIS, migrations, extensions
- `docs/infrastructure/deployment.md` - CI/CD pipeline, AWS ECS, production deployment
- `docs/infrastructure/networking.md` - Docker networks, port mappings, DNS

### Frontend
- `docs/frontend/admin-frontend.md` - React/Mantine admin panel components
- `docs/frontend/app-frontend.md` - User-facing React app with Leaflet maps

### Testing
- `docs/testing/strategy.md` - Test priorities, folder structure, frameworks, CI/CD integration

---

## Google Sheets Project Tracker

The project task list, test coverage matrix, and bug log live in a shared Google Sheet. A CLI/Python client at `scripts/google_sheets/` provides full read/write access.

**Spreadsheet**: [NearbyNearby Project Tracker](https://docs.google.com/spreadsheets/d/1TXnwzQaY1RH7qWUCcFZzzlWMnrlAzBmwt7PekR8JrZg/edit)
**Full docs**: `scripts/google_sheets/README.md`

### Sheets

| Sheet | Alias | Contents |
|---|---|---|
| `PLAN` | `plan` | 186 tasks — priority, status, assignments, dependencies, PR# |
| `Feature Implementation List` | `features` / `impl` | 500+ test cases by feature area |
| `Edge Cases Causing Failures` | `bugs` / `edge` | Bug log with reproduction steps |

### CLI Quick Reference

```bash
# All commands: python -m scripts.google_sheets.sheets_client <command>

# Read
sheets head plan                              # First 10 rows (formatted table)
sheets cat plan --json                        # Entire sheet as JSON
sheets row plan 5                             # Single row as key:value
sheets headers plan                           # Column letters + names
sheets count plan                             # Row count
sheets info                                   # All sheets with dimensions

# Search
sheets grep plan "HTTP 500"                   # Regex search all columns
sheets grep plan "Manav" -c "Assigned To"     # Search specific column
sheets find plan Status "Not Started"         # Exact match
sheets filter plan Status="Not Started" "Assigned To"=Manav  # AND filter
sheets summary plan Status                    # Value counts with percentages

# Task shortcuts
sheets task 1                                 # Get task #1 as JSON
sheets status 1 "In Progress"                 # Update status
sheets status 1 "Complete" -n "Fixed in abc"  # Status + notes
sheets blocked-by 1                           # Tasks depending on task 1
sheets next-task                              # Next available task number

# Write
sheets set plan 5 Status="In Progress"        # Update columns by name
sheets append plan "113,,NEW,Title,..."        # Append row
sheets add-bug "Desc" "Location" "Repro"      # Log edge case
```

### Coding Agent Workflow

When picking up a task:

```python
from scripts.google_sheets.sheets_client import SheetsClient
client = SheetsClient()

task = client.get_task_by_number(5)           # Read task
client.update_task_status(5, "In Progress")   # Mark started
# ... do the work ...
client.update_task_status(5, "Complete", notes="Fixed in commit abc123")
```

---

## The "Nearby Nearby" Feature

The platform's namesake and flagship feature. Nearby Nearby is "The World's First Local Discovery Platform, Built for Rural America" - designed to help users discover local businesses, parks, trails, and events in areas underserved by traditional discovery platforms like Yelp or Google Maps.

### How It Works

When viewing any POI detail page, users see a **"NEARBY" section** that answers the question: *"I'm here... what else is around?"* The feature shows other places within a configurable radius, enabling users to:

1. **Discover hidden gems** - Find local businesses and outdoor spaces that don't show up on mainstream platforms
2. **Plan outings** - See what's nearby before visiting (e.g., "Is there a coffee shop near this trailhead?")
3. **Navigate easily** - Get directions via Google Maps, Apple Maps, or Waze with one click
4. **Check availability** - See hours for a specific date, filter out closed places and past events

### User Flow

```
User views POI detail page (e.g., "Jordan Lake State Park")
    ↓
"NEARBY" section loads with POIs within default 5-mile radius
    ↓
User can:
  • Filter by type using horizontal scrolling pills (All, Businesses, Events, Parks, Trails)
  • Search within nearby results using hybrid AI search (keyword + semantic)
  • Adjust radius via dropdown (1, 3, 5, 10, 15 miles)
  • Select date via smart dropdown (Today, Tomorrow, This Weekend, or pick custom)
  • Click map markers to highlight cards (and vice versa)
  • Get directions via modal (Google Maps, Apple Maps, Waze)
  • Copy address or lat/long to clipboard
```

### Controls Layout

```
┌─────────────────────────────────────────────────┐
│  NEARBY                                         │
│  12 listings                                    │
│                                                 │
│  [All] [Businesses] [Events] [Parks] [Trails] →│  ← Horizontal scroll
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │ 🔍 Search nearby... try "pet friendly"  │   │  ← Full-width search
│  └─────────────────────────────────────────┘   │
│                                                 │
│  [📍 5 miles ▼] [📅 Any Date ▼] [↺ Clear]      │  ← Dropdowns row
└─────────────────────────────────────────────────┘
```

### Key Components

| File | Purpose |
|------|---------|
| `nearby-app/app/src/components/nearby-feature/NearbySection.jsx` | Main container with map, filters, search, pagination, directions modal |
| `nearby-app/app/src/components/nearby-feature/NearbyCard.jsx` | POI cards with distance, hours, amenities, action buttons |
| `nearby-app/app/src/components/nearby-feature/NearbyFilters.jsx` | Horizontal scrolling filter pills with lucide-react icons |
| `nearby-app/app/src/components/Map.jsx` | Leaflet map with Carto Voyager tiles and numbered markers |

### Features

**Filtering & Search:**
- **Type filter pills**: All, Businesses, Events, Parks, Trails (with lucide icons)
- **Horizontal scroll**: Filter pills scroll horizontally on mobile with hidden scrollbar
- **Hybrid AI search**: Uses `/api/pois/hybrid-search` filtered to nearby results only
- **Date presets**: Today, Tomorrow, This Weekend, or pick a custom date (no manual entry)
- **Configurable radius**: 1, 3, 5, 10, or 15 miles via dropdown
- **Past event exclusion**: Automatically hides events that have already ended

**Map Features:**
- **Carto Voyager tiles**: Warm, MapQuest-like colors
- **Numbered markers**: Purple circles with numbers matching card positions
- **Current location**: Gold/yellow circle for the current POI
- **Auto-fit bounds**: Map zooms to show all markers
- **Click to highlight**: Clicking a marker scrolls to and highlights the card

**Mobile-First UX:**
- **44px+ touch targets**: All buttons meet WCAG accessibility standards
- **Horizontal scrolling**: Filter pills scroll on mobile
- **Icon-only mode**: On very small screens (< 480px), dropdowns show only icons
- **Responsive breakpoints**: 768px, 480px, 360px

**Other Features:**
- **Directions modal**: Choose Google Maps, Apple Maps, or Waze
- **Copy functionality**: Copy lat/long or address to clipboard
- **Amenity icons**: Restrooms, wheelchair accessible, WiFi, pet-friendly
- **Type-specific info**: Trail length/difficulty, park type, event dates
- **Pagination**: Handles large result sets with page navigation

### API

```
GET /api/pois/{poi_id}/nearby?radius_miles={radius}
```

Returns POIs within radius sorted by distance. Uses PostGIS `ST_DWithin` for efficient spatial queries.

**Full documentation**: `docs/systems/geospatial.md`

---

## Project Structure

This is a **monorepo** containing two applications:

- **[nearby-admin](nearby-admin/)**: Admin panel for managing POI database (frontend + backend)
- **[nearby-app](nearby-app/)**: User-facing application with ML-powered search (frontend + backend)

Both applications share the same production PostgreSQL database. Documentation lives in the root `docs/` folder (single source of truth).

---

## Database Safety Rules

**� CRITICAL: Production Database Protection**

- The production PostgreSQL database (`nearby-admin-db.ce3mwk2ymjh4.us-east-1.rds.amazonaws.com`) is **shared between both applications**
- **NEVER modify production data** - data loss is unacceptable
- **ONLY CONSUME** data from the production database (read-only operations)
- Never perform INSERT, UPDATE, DELETE, or any data modification operations on production data
- All write operations should only target development or test databases
- Database migrations should be tested locally first, then carefully applied to production
- **Before applying any Alembic migration to prod**: take a manual RDS snapshot first (`aws rds create-db-snapshot --db-instance-identifier nearby-admin-db --db-snapshot-identifier pre-migration-<rev>-<date> --profile nn-prod`)
- **Expand/contract only**: never rename or drop a column that live code reads in the same release. Sequence: add new, deploy code reading both, backfill, stop writing old, drop old in a later release (the `m_payphone` rename outage is the precedent)

This rule ensures data integrity and prevents accidental modifications to live production data.

---

## Run Only in Docker

**Always run the apps, scripts, migrations, and tests inside Docker — never directly on the host** (no Python venv; only a partial `node_modules`).

This includes frontend tests and builds. Do NOT run `npx vitest` / `npx vite build` on the host, even if a host `node_modules` happens to work. Host runs are unreproducible and hide platform-specific breakage (example: macOS is case-insensitive, so a host build can pass or fail differently than the Linux Docker build that actually ships). Use the compose `frontend` service:

```bash
cd nearby-app
docker compose -f docker-compose.dev.yml run --rm frontend npx vitest run
docker compose -f docker-compose.dev.yml run --rm frontend npx vite build
```

`docker compose run` does NOT rebuild an existing image. After any `package.json` change (or if a dependency seems missing in the container), rebuild first: `docker compose -f docker-compose.dev.yml build frontend`.

Known exception: the root `tests/` Python integration suite has no runner container yet (`tests/docker-compose.test.yml` only provides PostGIS + MinIO), so `pytest` runs from the host `.venv-test` against those containers. That is the only tooling allowed on the host.

---

## Production Deployment (AWS ECS Fargate)

Production runs on **AWS ECS Fargate** with fully automated CI/CD. There are no manual rebuilds or SSH sessions — push to `main` and it deploys automatically.

```
Internet → Cloudflare (HTTPS) → ALB (HTTP port 80) → ECS Fargate
                                    │
                    ┌───────────────┴───────────────┐
           nearbynearby.com              admin.nearbynearby.com
           nearby-app service            nearby-admin service
           1 vCPU / 3GB                  0.5 vCPU / 1GB
           1 container                   2 containers (nginx + backend)
                    └───────────────┬───────────────┘
                                    │  both reach (Service Connect, private):
                                    ▼  http://embedding:80/v1   — no ALB
                       nearbynearby-prod-embedding service
                       1 vCPU / 3GB — llama.cpp serving EmbeddingGemma
                       Q8_0 GGUF via an OpenAI-compatible /v1/embeddings API
                                    │
                              RDS PostgreSQL (existing, via VPC peering)
                              S3 + CloudFront (existing)
```

### AWS Account & CLI Profile

> **All prod AWS commands use the `nn-prod` profile (the `manav-terraform` user): `--profile nn-prod --region us-east-1`.** The default profile is a different org account with no NN resources. (NN is ECS Fargate — no `kubectl`. ECR images are tagged with the git commit SHA, so a task's image tag = the deployed commit.)

### How to Deploy

> **⚠️ CI auto-deploy is BROKEN (repo moved to `NearbyNearby/Nearby-Nearby` on 2026-07-01); deploy manually until you update Terraform `github_repo`→new org + `terraform apply` + re-add the `AWS_ROLE_TO_ASSUME` secret. AWS unaffected.**

**Automatic** (once CI OIDC is re-enabled): Push code changes to `main` branch. GitHub Actions builds, tests, and deploys.
- `nearby-app/**` or `shared/**` changes → triggers app workflow
- `nearby-admin/**` or `shared/**` changes → triggers admin workflow

**Manual**: Go to GitHub → Actions → Select workflow → "Run workflow" → optionally check "Skip integration tests"

### Deployment Timing

| Workflow | Tests | Build + Push | ECS Deploy | Total |
|----------|-------|-------------|------------|-------|
| nearby-app | ~12 min | ~8 min | ~2 min | **~20 min** |
| nearby-app (skip tests) | skipped | ~8 min | ~2 min | **~10 min** |
| nearby-admin | none | ~2 min | ~1 min | **~3 min** |

### CI/CD Workflows

**`.github/workflows/deploy-app.yml`**:
1. Runs 225 integration tests against PostGIS service container
2. Builds multi-stage Docker image (~5.7GB with ML model)
3. Pushes to ECR with `latest` + `sha` tags
4. Forces new ECS deployment
5. Has `skip_tests` checkbox for manual triggers (push always runs tests)

**`.github/workflows/deploy-admin.yml`**:
1. Builds admin backend image (monorepo root context)
2. Builds admin frontend image
3. Pushes both to ECR
4. Forces new ECS deployment

Both use **GitHub OIDC** for AWS auth — no static credentials. Only secret: `AWS_ROLE_TO_ASSUME`.

### Monitoring Production

```bash
# View app logs (use MSYS_NO_PATHCONV=1 on Windows/Git Bash)
MSYS_NO_PATHCONV=1 aws logs tail '/ecs/nearbynearby-prod/app' --follow

# View admin logs
MSYS_NO_PATHCONV=1 aws logs tail '/ecs/nearbynearby-prod/admin' --follow

# Check service health
aws ecs describe-services \
  --cluster nearbynearby-prod \
  --services nearbynearby-prod-app nearbynearby-prod-admin \
  --query 'services[].{name:serviceName,running:runningCount,desired:desiredCount}'

# Check health endpoints directly
curl http://nearbynearby-prod-1716569837.us-east-1.elb.amazonaws.com/api/health
```

### Rollback

```bash
# List recent task definition revisions
aws ecs list-task-definitions --family-prefix nearbynearby-prod-app --sort DESC --max-items 5

# Roll back to previous revision
aws ecs update-service \
  --cluster nearbynearby-prod \
  --service nearbynearby-prod-app \
  --task-definition nearbynearby-prod-app:PREVIOUS_REVISION
```

### Infrastructure (Terraform)

All AWS infrastructure is managed in `terraform/`:
- **Modules used**: networking, ecr, ecs, alb, secrets, monitoring
- **Not used in prod**: database, storage (existing RDS and S3 kept as-is)
- **VPC peering**: ECS VPC (10.0.0.0/16) ↔ Default VPC (172.31.0.0/16) for RDS connectivity
- **State**: S3 backend. The DynamoDB lock table was removed — run with `-lock=false`.

```bash
# Apply infrastructure changes (prod).
# MUST use the nn-prod profile or terraform hits the wrong AWS account (403 on the
# S3 state backend, which has no `profile` set). Lock table is gone → -lock=false.
cd terraform/environments/prod
export AWS_PROFILE=nn-prod AWS_REGION=us-east-1
export TF_VAR_database_url="$(aws ssm get-parameter --name /nearbynearby/prod/database-url --with-decryption --query Parameter.Value --output text)"
export TF_VAR_forms_database_url="$(aws ssm get-parameter --name /nearbynearby/prod/forms-database-url --with-decryption --query Parameter.Value --output text)"
export TF_VAR_secret_key="$(aws ssm get-parameter --name /nearbynearby/prod/secret-key --with-decryption --query Parameter.Value --output text)"
terraform plan  -lock=false
terraform apply -lock=false
```

### Monthly Cost (~$196)

| Resource | Cost |
|----------|------|
| ECS Fargate (app: 1 vCPU/3GB) | ~$73 |
| ECS Fargate (admin: 0.5 vCPU/1GB) | ~$18 |
| ECS Fargate (embedding: 1 vCPU/3GB, llama.cpp) | ~$40 |
| NAT Gateway | ~$32 |
| ALB | ~$16 |
| RDS (existing) | ~$13 |
| ECR + CloudWatch | ~$4 |

---

## nearby-admin (Admin Panel)

### Architecture
- **Frontend**: React + Vite → nginx (production)
- **Backend**: FastAPI (Python)
- **ECS**: 2 containers in 1 task sharing localhost (awsvpc mode)
- **Deployment**: Automatic via GitHub Actions on push to `main`

---

## Local Development with Shared Local Database

For local development, both applications can share a local PostGIS database instead of connecting to production RDS.

### Prerequisites
- Docker and Docker Compose installed

### Step 1: Configure Environment Files

**nearby-admin/.env** - Uses internal Docker network hostname:
```
DATABASE_URL=postgresql://nearby:nearby@db:5432/nearbynearby
POSTGRES_USER=nearby
POSTGRES_PASSWORD=nearby
POSTGRES_DB=nearbynearby
```

**nearby-app/backend/.env** - Uses the nearby-admin database container name:
```
DATABASE_URL=postgresql://nearby:nearby@nearby-admin-db-1:5432/nearbynearby
```

### Step 2: Start nearby-admin (Creates Database)

```bash
cd nearby-admin
docker compose up --build -d
```

This creates:
- `nearby-admin_default` network (shared between apps)
- `nearby-admin-db-1` PostGIS database container
- Backend on port 8001
- Frontend on port 5175

### Step 3: Start nearby-app

```bash
cd nearby-app
docker build -t nearby-app:latest .
docker run -d --name nearby-app \
  -p 8002:8000 \
  --network nearby-admin_default \
  --env-file backend/.env \
  nearby-app:latest
```

### Step 4: Create Admin User

```bash
docker exec nearby-admin-backend-1 python scripts/manage_users.py create admin@nearby.com admin123 --role admin
```

### Local Access Points

| Service | URL |
|---------|-----|
| nearby-app (user app) | http://localhost:8002 |
| nearby-admin frontend | http://localhost:5175 |
| nearby-admin API docs | http://localhost:8001/docs |

### Local Development Notes

- The local PostGIS database does NOT include `pgvector` extension - semantic/vector search is disabled
- Fuzzy text search (`pg_trgm`) works normally
- The ML embedding model (~1GB) loads on nearby-app startup - first request may be slow
- Data persists in Docker volume `nearby-admin_postgres_data`
- To reset the database: `docker volume rm nearby-admin_postgres_data`

### Stop Local Development

```bash
# Stop nearby-app
docker stop nearby-app && docker rm nearby-app

# Stop nearby-admin (keeps database volume)
cd nearby-admin && docker compose down

# Stop and remove database volume (full reset)
cd nearby-admin && docker compose down -v
```

---

## nearby-app (User-Facing Application)

### Architecture
- **Combined Build**: Frontend + Backend in single container (~5.7GB image)
- **Frontend**: React + Vite (compiled to static files, served by FastAPI)
- **Backend**: FastAPI (Python) with ML model (`embeddinggemma-300m`, ~1GB)
- **ECS**: 1 vCPU / 3GB, single container, auto-scales 1-3 tasks
- **Deployment**: Automatic via GitHub Actions on push to `main`
- **Health check**: `/api/health` with 120s start period (ML model loading)

---

## Testing

### Automated Tests (225 integration tests)

Tests live in the root `tests/` directory and cover admin CRUD, cross-app data flow, search engine, public forms, and real S3 image uploads. They run against disposable PostGIS + MinIO containers — never production.

```bash
# 1. Start test containers (PostGIS on port 5434, MinIO on port 9100)
docker compose -f tests/docker-compose.test.yml up -d

# 2. Run all tests
pytest tests/ -v

# Run a specific file
pytest tests/test_admin_business.py -v

# Stop on first failure
pytest tests/ -v -x

# 3. Stop test containers when done
docker compose -f tests/docker-compose.test.yml down
```

No manual environment variable setup needed — `tests/conftest.py` handles everything.

### CI/CD Test Integration

- Tests run automatically in GitHub Actions on every push to `main` (for nearby-app)
- Tests run on **GitHub-hosted Ubuntu runners** — nothing runs on your AWS or local machine
- GitHub free tier: 2,000 min/month (private repos), unlimited (public)
- Test job takes ~12 minutes (PostGIS service container + 225 tests)
- Tests gate deployment — build-and-deploy only runs if tests pass
- Manual workflow_dispatch has "Skip integration tests" checkbox for hotfixes

**When to run tests locally:**
- Before pushing code (catch bugs before CI)
- After any backend code change (models, schemas, CRUD, endpoints)
- After modifying shared enums or constants

**Full docs:** `docs/testing/strategy.md`

---

## Quick Reference

### Production (ECS)

```bash
# Check service health
aws ecs describe-services \
  --cluster nearbynearby-prod \
  --services nearbynearby-prod-app nearbynearby-prod-admin \
  --query 'services[].{name:serviceName,running:runningCount,desired:desiredCount,events:events[0].message}'

# View logs (use MSYS_NO_PATHCONV=1 on Windows/Git Bash)
MSYS_NO_PATHCONV=1 aws logs tail '/ecs/nearbynearby-prod/app' --follow
MSYS_NO_PATHCONV=1 aws logs tail '/ecs/nearbynearby-prod/admin' --follow

# Force redeploy (without code changes)
aws ecs update-service --cluster nearbynearby-prod --service nearbynearby-prod-app --force-new-deployment
aws ecs update-service --cluster nearbynearby-prod --service nearbynearby-prod-admin --force-new-deployment

# Check GitHub Actions workflow status
gh run list --limit 5

# Manually trigger deployment
gh workflow run "Deploy nearby-app to AWS ECR/ECS" --ref main
gh workflow run "Deploy nearby-admin to AWS ECR/ECS" --ref main
```

### Local Development

```bash
# nearby-admin (dev mode)
cd nearby-admin && docker compose up --build

# nearby-app (dev mode with hot reload)
cd nearby-app && docker compose -f docker-compose.dev.yml up --build

# Run tests
docker compose -f tests/docker-compose.test.yml up -d
pytest tests/ -v
docker compose -f tests/docker-compose.test.yml down
```

---

## Important Notes

### Port Mapping

#### Complete Port Reference

| Service | Dev Port | Prod Port | Internal | Purpose |
|---------|----------|-----------|----------|---------|
| nearby-admin Frontend | 5175 | 5175 | 5173 | Admin UI (Vite dev server / nginx in prod) |
| nearby-admin Backend | 8001 | 8001 | 8000 | Admin API (FastAPI) |
| nearby-app Backend | 8002 | 8002 | 8000 | User App API (serves prebuilt frontend in prod) |
| nearby-app Frontend | **8003** | N/A | 5173 | User App UI (Vite dev server - **dev only**) |
| MinIO S3 | 9000, 9001 | 9000, 9001 | N/A | Object Storage |
| PostgreSQL (Local) | 5433 | N/A | 5432 | Database (local dev only) |

#### Understanding Port 8002 vs 8003 (nearby-app)

**Port 8002 - Backend API (always used)**
- Maps to internal port 8000 (FastAPI)
- In **production**: Serves BOTH the API AND the prebuilt Vite dist (static files baked into container via multi-stage build)
- In **development**: Only serves the API; frontend uses port 8003

**Port 8003 - Frontend Dev Server (development only)**
- Maps to internal port 5173 (Vite)
- Provides hot module reloading (HMR) for frontend development
- **NOT used in production** - frontend is prebuilt and served by backend on 8002
- Set `VITE_API_BASE_URL=http://localhost:8002` to connect to backend

#### nearby-app Development Mode (with hot reload)

```bash
# Start both frontend and backend with hot reloading
cd nearby-app
docker compose -f docker-compose.dev.yml up --build

# Access points in dev mode:
# - Frontend (hot reload): http://localhost:8003
# - Backend API: http://localhost:8002
# - API docs: http://localhost:8002/docs
```

#### Summary
- **Production**: Use port 8002 only (serves both API and prebuilt frontend)
- **Development**: Use port 8003 for frontend (hot reload) + port 8002 for API

### Network Configuration
- Both applications can communicate via `nearby-admin_default` network
- nearby-app container connects to this network to share resources

### Database Connection
- Both applications connect to the same RDS PostgreSQL instance
- Connection string stored in environment variables
- Never hardcode database credentials

### Git Configuration

**IMPORTANT**: When making commits, ALWAYS use the user's identity:
- **Git User Name**: Manav M
- **Git User Email**: manavmaj2001@gmail.com

Claude is NEVER a contributor or co-author. All commits should be attributed to the user only.

---

## App-Specific Documentation

For detailed documentation about each application:
- [nearby-admin/CLAUDE.md](nearby-admin/CLAUDE.md) - Comprehensive admin panel documentation
- [nearby-app/CLAUDE.md](nearby-app/CLAUDE.md) - User-facing app documentation

---

## Emergency Procedures

### If Production is Down

1. **Check ECS service status**:
   ```bash
   aws ecs describe-services \
     --cluster nearbynearby-prod \
     --services nearbynearby-prod-app nearbynearby-prod-admin \
     --query 'services[].{name:serviceName,running:runningCount,desired:desiredCount,events:events[0:3]}'
   ```

2. **Check CloudWatch logs for errors**:
   ```bash
   MSYS_NO_PATHCONV=1 aws logs tail '/ecs/nearbynearby-prod/app' --since 30m
   MSYS_NO_PATHCONV=1 aws logs tail '/ecs/nearbynearby-prod/admin' --since 30m
   ```

3. **Force redeploy** (pulls latest image and restarts):
   ```bash
   aws ecs update-service --cluster nearbynearby-prod --service nearbynearby-prod-app --force-new-deployment
   aws ecs update-service --cluster nearbynearby-prod --service nearbynearby-prod-admin --force-new-deployment
   ```

4. **Rollback to previous version**:
   ```bash
   # List recent task definition revisions
   aws ecs list-task-definitions --family-prefix nearbynearby-prod-app --sort DESC --max-items 5

   # Deploy a specific previous revision
   aws ecs update-service --cluster nearbynearby-prod --service nearbynearby-prod-app \
     --task-definition nearbynearby-prod-app:PREVIOUS_REVISION_NUMBER
   ```

5. **Check health endpoints**:
   ```bash
   curl http://nearbynearby-prod-1716569837.us-east-1.elb.amazonaws.com/api/health
   ```

### Database Connection Issues

1. **Check if ECS tasks can reach RDS** (look for "Connection timed out" in logs):
   ```bash
   MSYS_NO_PATHCONV=1 aws logs tail '/ecs/nearbynearby-prod/app' --filter-pattern "Connection" --since 10m
   ```

2. **Verify VPC peering is active**:
   ```bash
   aws ec2 describe-vpc-peering-connections \
     --filters "Name=status-code,Values=active" \
     --query 'VpcPeeringConnections[].{Id:VpcPeeringConnectionId,Status:Status.Code}'
   ```

3. **Check SSM parameter values** (secrets):
   ```bash
   MSYS_NO_PATHCONV=1 aws ssm get-parameter --name '/nearbynearby/prod/database-url' --with-decryption --query 'Parameter.Value' --output text
   ```

---

For EDITS to the database structure, make migrations not manual edits.

---

## POI Field Registry — Single Source of Truth (READ BEFORE CHANGING POI FIELDS)

POI fields are no longer hand-wired in four places. A single registry,
**`shared/poi_fields.json`**, describes every POI field (its `audience`,
`tier`, `applies_to` types, `group`, `value_source`, `source` ORM path,
`render` mode, etc.). The public API serializer, the user-facing app, the SEO
output, and the contract tests all **derive** from it. The registry is
**generated** from the admin POI model by `scripts/gen_poi_registry.py` — never
hand-edit the JSON.

**🔴 If you add or change an admin field / the data model / an admin form, you
MUST propagate it through the registry or it will silently NOT appear in the
user-facing app.** The cost of a new field is now ~2 steps, not 4 — but skipping
the registry step means the field is captured in admin and invisible to users.

When you add or rename a POI column (or change which types it applies to, its
audience, or its option list):

1. **Migration first** — add/alter the column via an alembic migration in
   `nearby-admin/backend/alembic` (admin owns the shared schema). Add the column
   to the ORM model(s) (`nearby-admin/.../models/poi.py`, and
   `nearby-app/.../models/poi.py` if the app must read it).
2. **Regenerate the registry** — run `python3 scripts/gen_poi_registry.py`. This
   reflects the new column and writes **BOTH** the source of truth
   `shared/poi_fields.json` **AND** the Vite frontend mirror
   `nearby-app/app/src/data/poi_fields.json` (the frontend build context can't
   reach repo-root `shared/`, so the mirror is required and must stay
   byte-identical).
3. **Review the generated entry** — set `audience` correctly (`public` |
   `admin` | `partner`). **Anything containing PII / contact people / emergency
   / internal-ops data MUST be `audience: "admin"`** (the serializer emits every
   `audience=="public"` field regardless of `render`). Set `tier`
   (`free`/`paid`/`any`), `applies_to`, `group`/`order`, and `value_source`
   (must name a real constant in `shared/constants/field_options.py`). Encode any
   override in the generator's override maps (`ADMIN_FIELDS`, `PAID_FIELDS`,
   `VALUE_SOURCE`, `GROUP_BY_FIELD`, …) so re-running stays deterministic.
4. **If you add an option list** (Radio/Select/multi values) in an admin form,
   add the matching constant to `shared/constants/field_options.py` and point the
   field's `value_source` at it.
5. **Run the guards** — `pytest tests/test_registry_valid.py` (validity + the
   PII regression guard + the mirror-drift check) and
   `pytest tests/test_poi_field_contract.py` (the derivation contract: public
   response keys == public registry fields, no drop, no leak, no orphans).

Key files: `shared/poi_fields.json` (source of truth), `shared/poi_fields.schema.json`
(meta-schema), `scripts/gen_poi_registry.py` (generator),
`shared/constants/poi_registry.py` + `nearby-app/app/src/utils/poiRegistry.js`
(loaders), `nearby-app/app/src/data/poi_fields.json` (frontend mirror — generated,
do not hand-edit).

## User Management

The nearby-admin backend includes a user management script. In production (ECS), use `aws ecs execute-command`:

```bash
# Get the running task ID
TASK_ID=$(aws ecs list-tasks --cluster nearbynearby-prod --service-name nearbynearby-prod-admin --query 'taskArns[0]' --output text | awk -F/ '{print $NF}')

# Create a new user
aws ecs execute-command --cluster nearbynearby-prod --task $TASK_ID \
  --container backend --interactive \
  --command "python scripts/manage_users.py create admin@nearby.com password123 --role admin"

# List all users
aws ecs execute-command --cluster nearbynearby-prod --task $TASK_ID \
  --container backend --interactive \
  --command "python scripts/manage_users.py list"
```

For local development:
```bash
docker exec nearby-admin-backend-1 python scripts/manage_users.py create <email> <password> --role admin
docker exec nearby-admin-backend-1 python scripts/manage_users.py list
```

---

## Development Best Practices

1. **Always test locally first** before deploying to production
2. **Read logs** after rebuilding to catch errors early
3. **Never commit secrets** or database credentials
4. **Keep .env files secure** and never commit them
5. **Test database migrations locally** before applying to production
6. **Monitor resource usage** (especially ML model memory in nearby-app)
7. **Use proper error handling** and logging in all code changes

---

## Embedding / Semantic Search

Semantic + hybrid search use **EmbeddingGemma** (768-dim) through a shared, fail-soft HTTP client (`shared/embeddings/client.py`). The model is served **out-of-process** — never bundled in the app image — and the SERVER differs per environment while the client code is identical (it speaks one of two wire protocols, selected by `EMBEDDING_BACKEND`).

| Environment | Server | `EMBEDDING_BACKEND` | `EMBEDDING_SERVICE_URL` | Model |
|---|---|---|---|---|
| **Local (Mac/PC)** | Docker Model Runner (GGUF, native — the amd64 TEI image crashes under emulation on Apple Silicon) | `openai` | `http://model-runner.docker.internal/engines/v1` | `ai/embeddinggemma` (`docker model pull ai/embeddinggemma`) |
| **Prod (cloud)** | llama.cpp `:server` on Fargate (Service Connect, internal) | `openai` | `http://embedding:80/v1` | unsloth `embeddinggemma-300M-Q8_0.gguf` |
| **Tests** | deterministic mock client (no network, no torch) | — | unset | hashed 768-vec |

If `EMBEDDING_SERVICE_URL` is unset the client is **disabled** and every call returns `None` with no network I/O → search degrades to keyword. The gemma prompt prefixes (`task: search result | query: ` / `title: none | text: `) are applied by the client.

**Why not TEI in prod:** TEI's CPU/Candle backend crash-loops on EmbeddingGemma's Gemma3 dense/matryoshka layers (`Intel MKL ERROR ... SGEMM`); the ungated ONNX export lacks pooling/dense config. llama.cpp serves the GGUF cleanly.

**Prod gotchas (each silently breaks embedding — all fixed in terraform):**
- **Service Connect resolves the SHORT name only** (`embedding`), not the FQDN — the namespace is an HTTP (not private-DNS) namespace. URL is `http://embedding:80/v1`.
- **The ECS SG self-ingress must be INLINE** in `aws_security_group.ecs` (`self = true`). A separate `aws_security_group_rule` conflicts with the SG's inline blocks and is silently wiped on every SG apply → embedding becomes unreachable.
- The embedding port mapping needs **`appProtocol = "http"`** (else SC's Envoy resets connections). Changing it on a live SC service is immutable → `terraform apply -replace=module.ecs.aws_ecs_service.embedding`.
- **Never hardcode the embedding task IP** — it changes on every redeploy. App/admin reach it by Service Connect name; one-off tasks must fetch the current IP.
- Deploys are safe: CI uses `aws ecs update-service --force-new-deployment`, which re-pulls `:latest` into the EXISTING terraform task defs, preserving all `EMBEDDING_*` env. **CI does not run terraform.**

**Backfill existing rows** (one-time; new/edited POIs self-embed via admin embed-on-write): run `nearby-admin/backend/scripts/backfill_embeddings.py` as an ECS `run-task` on the admin task def with a `command` override, `EMBEDDING_SERVICE_URL` pointed at the embedding task's current private IP (`http://<ip>:80/v1`, `EMBEDDING_BACKEND=openai`), and **`--batch-size 1`** (llama.cpp on 1 vCPU returns 504 on larger batches; the live single-doc path is unaffected). Populating the derived `embedding` column this way is the sanctioned exception to the "never modify prod data" rule — it is index data, not user content.

---

## Known Issues & Solutions

### Docker DNS Collision (CRITICAL)

**Problem**: Both `nearby-admin` and `nearby-app` have backend services named `backend` in their docker-compose files. When both are running on the same Docker network (`nearby-admin_default`), DNS lookups for `backend` return BOTH IP addresses, causing requests to randomly route to the wrong backend.

**Symptoms**:
- `405 Method Not Allowed` errors on POST/PUT requests
- Intermittent failures (works sometimes, fails other times)
- Requests not appearing in expected backend logs

**Root Cause**:
```bash
# DNS lookup returns two IPs:
docker exec nearby-admin-frontend-1 nslookup backend
# Returns: 172.20.0.5 (nearby-admin-backend) AND 172.20.0.4 (nearby-app-backend)
```

**Solution**: Use explicit container names instead of service names in proxy configurations:
```javascript
// nearby-admin/frontend/vite.config.js
proxy: {
  '/api': {
    target: 'http://nearby-admin-backend-1:8000',  // NOT 'http://backend:8000'
    changeOrigin: true,
    secure: false,
  },
},
```

### Vite Proxy Configuration

**Location**: `nearby-admin/frontend/vite.config.js`

**Key Settings**:
```javascript
server: {
  host: '0.0.0.0',
  strictPort: true,
  port: 5173,
  watch: { usePolling: true },  // Required for Docker
  allowedHosts: ['.tesslate.com', '.nearbynearby.com'],
  proxy: {
    '/api': {
      target: 'http://nearby-admin-backend-1:8000',
      changeOrigin: true,
      secure: false,
    },
  },
},
```

### pgvector / Embedding Column

Semantic search is **live in prod** (EmbeddingGemma via llama.cpp — see "Embedding / Semantic Search" above). Don't regress it:

- The `embedding vector(768)` column exists in prod via migration `k_embedding_001` (pgvector extension + HNSW index). It is **populated** by admin embed-on-write and the one-time backfill, and **read** by the app's hybrid/semantic search.
- The column is **intentionally NOT mapped on the `nearby-app` SQLAlchemy ORM**. If it were, every `SELECT *` would emit the vector and fail where pgvector is absent (older local DBs). The search path reads/writes it via **raw SQL**, gated on column existence, with a keyword fallback if the column OR the embedding service is unavailable.
- Local dev: the embedding model is served by Docker Model Runner (see the per-environment table above), not bundled in the app image.

```python
# Search still gates on column existence and falls back to keyword if absent:
from sqlalchemy import text
result = db.execute(text(
    "SELECT column_name FROM information_schema.columns "
    "WHERE table_name = 'points_of_interest' AND column_name = 'embedding'"
)).fetchone()
if not result:
    return search_pois(db, query)  # keyword fallback
```

### Publication Status Filtering

**Important**: All `nearby-app` endpoints filter by `publication_status == 'published'`. Draft POIs created in nearby-admin will NOT appear in nearby-app until published.

**Endpoints that filter**:
- `/api/pois/search`
- `/api/pois/semantic-search`
- `/api/pois/hybrid-search`
- `/api/pois/{poi_id}`
- `/api/pois/by-slug/{slug}`
- `/api/pois/by-type/{type}`
- `/api/pois/by-category/{slug}`
- `/api/nearby`

---

## Debugging Tips

### Check Docker DNS Resolution
```bash
docker exec nearby-admin-frontend-1 nslookup backend
```

### Test API Endpoints Directly
```bash
# Test backend directly (bypassing proxy)
curl -X POST http://localhost:8001/api/pois/ -H "Content-Type: application/json" -d '{"name":"test"}'

# Test through Vite proxy
curl -X POST http://localhost:5175/api/pois/ -H "Content-Type: application/json" -d '{"name":"test"}'
```

### Check Database Column Existence
```bash
docker exec nearby-admin-backend-1 python -c "
from app.database import SessionLocal
from sqlalchemy import text
db = SessionLocal()
result = db.execute(text(\"SELECT column_name FROM information_schema.columns WHERE table_name = 'points_of_interest' AND column_name = 'embedding'\")).fetchone()
print('embedding column exists:', result is not None)
db.close()
"
```

### Check POI Publication Status
```bash
docker exec nearby-admin-backend-1 python -c "
from app.database import SessionLocal
from app.models.poi import PointOfInterest
db = SessionLocal()
for poi in db.query(PointOfInterest).all():
    print(f'{poi.name}: {poi.publication_status}')
db.close()
"
```

### View Container Network Info
```bash
docker network inspect nearby-admin_default
```

---

## File Locations Reference

| Purpose | File |
|---------|------|
| Admin Vite proxy config | `nearby-admin/frontend/vite.config.js` |
| Admin backend routes | `nearby-admin/backend/app/api/endpoints/pois.py` |
| Admin POI model | `nearby-admin/backend/app/models/poi.py` |
| App search functions | `nearby-app/backend/app/crud/crud_poi.py` |
| App POI model | `nearby-app/backend/app/models/poi.py` |
| Admin docker compose (dev) | `nearby-admin/docker-compose.yml` |
| Admin docker compose (local prod) | `nearby-admin/docker-compose.prod.yml` |
| App docker compose (dev) | `nearby-app/docker-compose.dev.yml` |
| App CI/CD workflow | `.github/workflows/deploy-app.yml` |
| Admin CI/CD workflow | `.github/workflows/deploy-admin.yml` |
| App Dockerfile (ECS + local prod) | `nearby-app/Dockerfile` |
| Admin backend Dockerfile (ECS) | `nearby-admin/backend/Dockerfile.ecs` |
| Admin frontend Dockerfile (ECS) | `nearby-admin/frontend/Dockerfile.prod` |
| Nginx template (ECS) | `nearby-admin/frontend/nginx.conf.template` |
| Terraform root | `terraform/environments/prod/main.tf` |
| Terraform modules | `terraform/modules/{networking,ecr,ecs,alb,secrets,monitoring}/` |
| Integration tests | `tests/` (225 tests) |
| Test containers | `tests/docker-compose.test.yml` |
| Shared enums | `shared/models/enums.py` |

