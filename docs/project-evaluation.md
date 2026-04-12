# Parcela — Project Evaluation

**Evaluator role:** Senior Project Manager, Solutions Architect, GIS Application Developer
**Date:** March 16, 2026
**Codebase snapshot:** Git HEAD as of February 23, 2026

---

## Executive Summary

Parcela is a well-architected natural language interface for querying spatial data about housing, land use, and equity in Santa Fe, NM. The project translates plain-English questions into constrained spatial queries executed against DuckDB, rendering results on a MapLibre GL map with equity-aware explanations.

The architecture is sound and reflects strong design discipline: a constrained query schema (not arbitrary SQL), dual-CRS geometry handling, type-safe TypeScript end-to-end, Zod validation of LLM output, and parameterized queries. The codebase is clean, well-organized, and shows evidence of iterative hardening (grounding checks, query normalization, result caps).

**Overall maturity: Late prototype / Early beta.** The backend orchestration pipeline is substantially complete. The frontend is functional but minimal. Several planned data layers are absent, there are no integration tests against a fixture DB, and production deployment infrastructure is not yet in place.

---

## Architecture Assessment

### What's Working Well

**Constrained query space.** The `StructuredQuery` schema is one of the strongest design decisions in the project. Rather than letting the LLM emit arbitrary SQL, queries are constrained to a well-defined set of attribute filters, spatial operations, aggregations, and temporal comparisons. This makes LLM translation tractable, results predictable, and SQL injection impossible by construction.

**Dual-CRS discipline.** The builder correctly uses `geom_utm13` (EPSG:32613) for metric operations (distance, nearest) and `geom_4326` for topological operations (intersects, contains, within). This avoids the common mistake of running distance calculations in geographic coordinates.

**Multi-layer grounding pipeline.** The chat endpoint runs through a deliberate sequence: intent grounding (deterministic keyword match) → LLM parsing → Zod validation → registry validation → query normalization → limit application → SQL execution. This layered approach catches problems early and provides clear error messages at each stage.

**LRU caching.** Both parse results (NL → StructuredQuery) and query results (SQL → GeoJSON) are cached with appropriate TTLs, which is critical given the LLM latency overhead.

**Layer registry with runtime introspection.** The registry merges static schema definitions with runtime table introspection and manifest metadata, providing an accurate picture of what's actually queryable.

### Architecture Concerns

**Monolithic state injection.** The `setDatabase()` / `setLayerRegistry()` pattern used to wire dependencies into route modules is fragile. Each route module holds a mutable module-level `let dbInstance` that gets set imperatively at startup. This makes testing harder (can't easily inject mocks) and could lead to race conditions if the startup sequence changes. A dependency injection container or Hono middleware context would be more robust.

**Connection management.** `getConnection(db)` creates a new DuckDB connection on every request. DuckDB connections are not pooled, and while DuckDB is tolerant of this pattern, it's wasteful. The connection created in the `loadParquetLayer` function is also never explicitly closed in the success path of `initDatabase`. This should be addressed before production.

**No graceful shutdown.** The server has no signal handlers for SIGTERM/SIGINT. In a containerized deployment, this means in-flight queries could be interrupted without cleanup.

**Shared types not a proper package.** The `shared/` directory is referenced via relative path imports (`../../../shared/types/query`). This works but is fragile and doesn't play well with monorepo tooling. Consider using TypeScript project references or a workspace package.

---

## API Layer

### Strengths

The query builder (`builder.ts`) is well-tested with 425 lines of unit tests covering attribute filters (AND/OR/IN/LIKE), all five spatial operations, aggregation, k-NN nearest neighbor, CRS selection, combined queries, and error cases. The k-NN implementation correctly uses `ORDER BY distance ASC LIMIT k` rather than a buffer-based approximation.

The `query-grounding.ts` module adds important safety layers: query normalization (rewriting `allows_residential=true` to `zone_code LIKE 'R%'`), registry validation (checking that fields actually exist in loaded tables), and limit enforcement with geometry-aware defaults (1500 for polygons, 4000 for points).

The intent router (`intent-router.ts`) provides a fast, deterministic pre-check before invoking the LLM, rejecting queries for unavailable layers with helpful suggestions.

### Issues

**`convertBigInts` is duplicated.** The exact same function exists in both `chat.ts` and `query.ts`. This should be extracted to a shared utility.

**`rowToFeature` is duplicated.** Same issue — identical implementation in both route files.

**Explanation generation is hardcoded, not LLM-driven.** The architecture doc describes LLM-generated equity-aware explanations ("Consider equity implications..."), but the actual implementation in `chat.ts` uses a deterministic `generateExplanation()` function that just templates "Found N features where..." This is a significant gap between the documented architecture and the implementation. The equity-aware explanation was a key differentiator in the project vision.

**No request validation on `/api/chat` body.** The body is cast with `as { message: string }` but there's no Zod schema validating the incoming request shape. A malformed body would produce unclear errors.

**`parquetPath` is interpolated into SQL.** In `init.ts`, the parquet file path is embedded directly in the SQL string: `FROM read_parquet('${parquetPath}')`. Since this path comes from the filesystem (not user input), it's not a security issue, but it's inconsistent with the project's stated policy of "no string interpolation for SQL."

**LLM client has no timeout.** The Ollama client's `fetch()` call has no `AbortSignal` timeout. A hung Ollama server would block the request indefinitely.

**No retry logic for LLM calls.** If the LLM returns malformed JSON (which small models do regularly), the request fails immediately. The architecture doc mentions retry with a cheaper/backup model, but this isn't implemented.

---

## Data Layer

### Strengths

13 layers are loaded from GeoParquet files with a versioned manifest (`manifest.json`) that records source, CRS, feature counts, fields, and extents. The data prep scripts fetch from authoritative public sources (Santa Fe County GIS, Census Bureau, City ArcGIS REST endpoints, GTFS).

The manifest is a good practice for data provenance tracking and was clearly iterated on — sources are documented per-layer with CRS metadata.

### Issues

**Type mismatches between schema and data.** The `LAYER_SCHEMAS` in `geo.ts` declares fields like `wheelchair_accessible: 'boolean | null'` and `avg_headway_minutes: 'number | null'`, but the manifest shows these are actually `VARCHAR` in DuckDB. Similarly, `year_built` in parcels is declared as `'number | null'` but is `VARCHAR` in the manifest. `accommodates`, `price_per_night`, `availability_365` in short_term_rentals are all `VARCHAR` in the DB but declared as `'number | null'` in the schema. This will cause silent failures when the LLM generates numeric comparisons against string fields.

**Five planned layers are missing.** `affordable_housing_units`, `eviction_filings`, `school_zones`, `wildfire_risk`, and `vacancy_status` are defined in the type system and schema registry but have no data. The intent router handles this gracefully, but the schema registry returns `isLoaded: false` for these layers while still including them in `LAYER_SCHEMAS`, which could confuse the LLM prompt.

**No spatial indexes.** The architecture doc mentions creating R-tree indexes, but the actual `initDatabase` code doesn't create any. For 63K parcels, this likely causes full table scans on spatial joins.

**Manifest is gitignored.** The `.gitignore` excludes `api/data/manifest.json`, which means the layer registry metadata that controls runtime behavior is not version-controlled. This makes the project harder to set up from a fresh clone.

---

## Frontend

### Strengths

The MapView component is well-implemented with proper geometry-type-aware rendering (separate layers for polygons, lines, and points), selected-feature highlighting across all geometry types, bounds fitting, and hover tooltips with XSS protection (`escapeHtml`). The choropleth module uses meaningful policy-based class breaks (AMI thresholds for income, HUD income limits) rather than arbitrary quantiles — this is excellent for an equity-focused tool.

### Issues

**API base URL is hardcoded.** `const API_BASE = 'http://localhost:3000'` in `api.ts` makes the frontend non-deployable without modification. This should use `import.meta.env.VITE_API_BASE` or a similar environment variable.

**No state management library.** The App component manages 8 separate `useState` calls. This is manageable at current complexity but will become unwieldy as multi-turn conversation and saved queries are added. The architecture doc mentions Zustand or React Context — neither is implemented.

**No loading/error states for map.** If the map tiles fail to load (CARTO CDN down), there's no fallback or error indicator.

**No frontend tests.** The web directory has no test files at all. The ChatPanel, ResultsPanel, and API client are all untested.

**No accessibility.** The map interaction (hover/click) has no keyboard navigation support. The results table lacks ARIA attributes. The chat input is a bare textarea without proper labeling.

**Example queries are stale.** ChatPanel shows "Show all zoning districts," "Show all census tracts," "Show the hydrology network" — these are simple layer dumps, not the housing equity questions the project exists to answer. Suggestions like "Which neighborhoods have the most short-term rentals?" would better showcase the tool's value.

---

## Testing

### Strengths

The API test suite is solid: 37 tests pass across 5 test files (~970 lines total). The builder tests have excellent coverage of the query builder's core functionality including all spatial operations, CRS selection, aggregation, k-NN, and error cases.

### Gaps

**No integration tests against a fixture DB.** The `routes.integration.test.ts` file exists (198 lines) but the test suite doesn't initialize a real DuckDB with test data. This means the full pipeline (parse → validate → build → execute → format) is never tested end-to-end.

**No LLM integration tests.** The parser tests exist but can't test actual LLM output quality without a running Ollama instance. Consider adding snapshot tests with recorded LLM responses.

**No frontend tests at all.** No component tests, no API client tests, no choropleth logic tests.

**No test for the caching layer.** The LRU cache has no unit tests.

---

## DevOps & Deployment Readiness

**No Dockerfile.** The architecture doc mentions Docker and Railway/Fly.io deployment, but there's no Dockerfile, docker-compose.yml, or CI configuration.

**No .env.example file.** The README references `cp .env.example .env.local` but no `.env.example` exists in the repo.

**No CI/CD pipeline.** No GitHub Actions, no pre-commit hooks, no automated linting or type-checking on push.

**No production LLM client.** Only `OllamaClient` is implemented. The `TogetherClient` and `GroqClient` mentioned in the architecture doc don't exist.

**No rate limiting middleware.** The architecture doc and AGENTS.md both mention rate limiting as a requirement, but no middleware is configured.

---

## Risk Assessment

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| Type mismatches cause silent query failures | High | High | Audit manifest types vs schema declarations; add runtime type coercion in query builder |
| LLM generates invalid queries for edge cases | Medium | High | Add retry with fallback model; expand few-shot examples |
| No spatial indexes on 63K parcels → slow spatial joins | Medium | High | Add R-tree indexes in initDatabase |
| Hardcoded localhost API URL blocks deployment | High | Certain | Use environment variable |
| Missing .env.example frustrates new contributors | Low | High | Create template file |
| No graceful shutdown in containerized deploy | Medium | Medium | Add SIGTERM handler |

---

## Prioritized Recommendations

### Immediate (Sprint 1)

1. **Fix type mismatches.** Audit every field in `manifest.json` against `LAYER_SCHEMAS` in `geo.ts`. Add type coercion in the query builder for VARCHAR fields that should be numeric (cast to `::DOUBLE` or `::INTEGER` in SQL).

2. **Add spatial indexes.** After table creation in `initDatabase`, create R-tree indexes on `geom_4326` and `geom_utm13` for all polygon and point layers.

3. **Extract duplicated code.** Move `convertBigInts`, `rowToFeature`, and other shared utilities from `chat.ts`/`query.ts` into a common module.

4. **Environment-based API URL.** Replace the hardcoded `http://localhost:3000` with `import.meta.env.VITE_API_BASE || '/api'`.

5. **Add LLM timeout.** Use `AbortController` with a 30-second timeout on the Ollama fetch call.

### Short-term (Sprint 2-3)

6. **Implement LLM-driven explanations.** The deterministic `generateExplanation()` should be replaced (or augmented) with the equity-aware LLM explanation described in the architecture doc. This is a core differentiator.

7. **Integration tests with fixture DB.** Create a small test dataset (10-50 features per layer) and write end-to-end tests that exercise the full parse → execute → format pipeline.

8. **Add Dockerfile and CI.** Create a multi-stage Dockerfile (build TypeScript → run with Node), add GitHub Actions for lint + typecheck + test on PR.

9. **Create `.env.example`.** Document all required and optional environment variables.

10. **Implement a production LLM client.** At minimum, add a Together.ai or Groq client so the app can deploy without Ollama.

### Medium-term (Sprint 4-6)

11. **Multi-turn conversation.** Add conversation context so users can refine queries ("Now filter those to just the Southside").

12. **Frontend state management.** Adopt Zustand or similar to manage the growing state surface.

13. **Accessibility audit.** Add keyboard navigation for map features, ARIA labels, screen reader support.

14. **Better example queries.** Replace the generic examples with housing-equity-focused questions that demonstrate the tool's unique value.

15. **Export functionality.** Add GeoJSON/CSV download with query metadata and data provenance.

---

## Conclusion

This is a thoughtfully designed project with a clear mission, sound architecture, and solid backend implementation. The constrained query schema, dual-CRS handling, and layered validation pipeline reflect genuine expertise in both GIS and application development. The main gaps are in the last mile of execution: type mismatches between schema and data, missing LLM-driven explanations, absence of production deployment infrastructure, and no frontend tests.

The project is well-positioned to move from prototype to a deployable beta with 2-3 focused sprints addressing the immediate recommendations above. The data foundation (13 layers from authoritative sources) and the query pipeline are the hard parts — and they're largely done.
