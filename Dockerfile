# Multi-stage build for Parcela
# Stage 1: Build API and Web
# Stage 2: Production runtime with DuckDB + spatial extension

# ── Build stage ──────────────────────────────────────────────────
FROM node:20-slim AS build

WORKDIR /app

# Copy shared types first (both packages depend on these)
COPY shared/ shared/

# Install and build API
COPY api/package*.json api/
RUN cd api && npm ci
COPY api/ api/

# Install and build Web
COPY web/package*.json web/
RUN cd web && npm ci
COPY web/ web/
RUN cd web && npm run build

# ── Production stage ─────────────────────────────────────────────
FROM node:20-slim AS production

WORKDIR /app

# DuckDB spatial extension needs libstdc++ at runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    libstdc++6 \
    && rm -rf /var/lib/apt/lists/*

# Copy shared types
COPY --from=build /app/shared/ shared/

# Copy API with node_modules (DuckDB has native bindings)
COPY --from=build /app/api/ api/

# Copy built web assets
COPY --from=build /app/web/dist/ web/dist/

# Data directory (mount or copy parquet files here)
RUN mkdir -p /app/api/data
VOLUME /app/api/data

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

WORKDIR /app/api

# Use tsx to run TypeScript directly (matches dev workflow)
CMD ["npx", "tsx", "src/index.ts"]
