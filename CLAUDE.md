# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Parcela (parcela.app) is a natural language interface for querying spatial data about housing, land use, and equity in Santa Fe, NM. Users ask questions like "Show me vacant residential parcels within 500 meters of a bus stop" and receive map-rendered results with explanations.

## Common Commands

### API (in `api/` directory)
```bash
npm run dev          # Start Hono dev server on :3000 (tsx watch)
npm run typecheck    # TypeScript check (strict mode)
npm run lint         # ESLint
npm test             # Vitest
npm run test:parser  # Test LLM parser script
```

### Web (in `web/` directory)
```bash
npm run dev          # Start Vite dev server on :5173
npm run build        # TypeScript build + Vite build
npm run typecheck    # TypeScript check
npm run lint         # ESLint
```

### Docker
```bash
docker build -t parcela .
docker run -p 3000:3000 -v ./api/data:/app/api/data parcela
```

### CI
GitHub Actions runs lint → typecheck → test (API), lint → typecheck → build (web), then Docker build. See `.github/workflows/ci.yml`.

### Prerequisites
- Node.js 20+
- Ollama running locally with a model pulled (`ollama pull qwen2.5:7b` or `ollama pull llama3.1:8b`)
- Or set `TOGETHER_API_KEY` for production LLM (see `api/.env.example`)

## Architecture

### Query Flow
1. User submits natural language query via `/api/chat` (optionally with conversation context)
2. LLM parses query into `StructuredQuery` (constrained query schema, not arbitrary SQL)
3. Zod validates the parsed query
4. Query builder generates parameterized DuckDB SQL
5. Results returned as GeoJSON + LLM generates explanation
6. Conversation context (previous query + result summary) stored for multi-turn refinement

### Key Directories
- `api/src/lib/orchestrator/` - NL parsing, validation, SQL building
- `api/src/lib/llm/` - LLM provider abstraction (Ollama for dev, Together.ai for prod)
- `api/src/lib/db/` - DuckDB initialization with spatial extension + R-tree indexes
- `api/src/lib/utils/` - Shared utilities: query executor pipeline, explanation generation, GeoJSON helpers
- `api/src/lib/templates/` - Pre-built equity analysis query templates
- `shared/types/` - TypeScript types shared between api/web (`query.ts`, `geo.ts`)
- `web/src/store/` - Zustand store for chat state, query results, and multi-turn context
- `web/src/components/MapView/` - MapLibre GL integration

### CRS Convention
- `geom_4326` (WGS84): Used for display and intersects/contains operations
- `geom_utm13` (EPSG:32613): Used for metric operations (distance, buffer)

### StructuredQuery Schema
Supports: attribute filters (`eq`, `in`, `like`, `gt`, etc.), spatial filters (`within_distance`, `intersects`, `contains`, `nearest`), aggregations, and temporal comparisons. See `shared/types/query.ts` for full schema.

### VARCHAR Numeric Fields
Some DuckDB columns are VARCHAR but represent numbers (e.g., `year_built`, `price_per_night`, `accommodates`, `trail_miles`). The query builder auto-wraps these in `TRY_CAST(... AS DOUBLE)` for numeric comparisons. The field map is `VARCHAR_NUMERIC_FIELDS` in `builder.ts`.

## Coding Conventions

- TypeScript with `strict`, `noUncheckedIndexedAccess`, `noImplicitReturns`
- ESM in web, NodeNext in API
- kebab-case for files, PascalCase for components/types, camelCase for variables
- No `any` (errors), unused vars warn
- Parameterized queries only - no string interpolation for SQL
- LLM provider selected by env vars: `TOGETHER_API_KEY` → Together.ai, else Ollama
- Environment config via `.env` files (see `api/.env.example`, `web/.env.example`)

## API Endpoints
- `POST /api/chat` - Natural language query → results + explanation
- `POST /api/query` - Direct structured query (bypass LLM)
- `GET /api/layers` - Available data layers and schemas
- `GET /api/templates` - Pre-built analysis templates
- `GET /api/health` - Health check
