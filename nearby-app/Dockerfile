# Multi-stage build for Nearby Nearby
# Build context: monorepo root (NearbyNearby/)

# Stage 1: Build frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy package files
COPY nearby-app/app/package*.json ./

# Install dependencies
RUN npm install

# Copy frontend source
COPY nearby-app/app/ ./

# Vite inlines VITE_* vars at build time (CARTO basemap key)
ARG VITE_CARTO_BASEMAPS_KEY
ENV VITE_CARTO_BASEMAPS_KEY=$VITE_CARTO_BASEMAPS_KEY

# Build the frontend
RUN npm run build

# Stage 2: Setup Python backend and serve frontend
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for PostGIS/PostgreSQL
RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy backend requirements
COPY nearby-app/backend/requirements.txt ./

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# No in-process ML model is bundled anymore: embeddings are served by a
# separate TEI container and consumed via the shared fail-soft HTTP client.

# Copy shared package first (for imports)
COPY shared/ ./shared/

# Copy backend source
COPY nearby-app/backend/ ./

# Copy built frontend from stage 1
# Vite is configured to emit to ../backend/static, so copy from that location
COPY --from=frontend-builder /app/backend/static ./static

# Expose port
EXPOSE 8000

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:8000/api/health || exit 1

# Run the application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
