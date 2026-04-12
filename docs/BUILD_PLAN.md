# Parcela — Build Plan

**Last updated:** April 11, 2026  
**Status:** Initial build complete. Entering hardening, user testing, and deployment phase.

---

## Build History

The initial 8-week build (Nov 2025 - Feb 2026) delivered the core system. A stretch week added housing-specific layers and analysis templates. See `docs/archive/` for the original weekly plans and learning materials.

### Completed Milestones

| Phase | Deliverable | Status |
|-------|------------|--------|
| Foundation (Wk 1-2) | Strict TS, data pipeline, DuckDB with dual CRS, 14 layers loaded | Done |
| Query Engine (Wk 3) | StructuredQuery schema, Zod validation, parameterized SQL builder | Done |
| LLM Integration (Wk 4) | Ollama + Together.ai clients, IntentParser, confidence scoring | Done |
| Frontend (Wk 5) | ChatPanel, MapView (MapLibre), ResultsPanel, API client | Done |
| Orchestration (Wk 6) | End-to-end NL → map flow, caching, query grounding | Done |
| Hardening (Wk 7) | 37+ API tests, 34 frontend tests, error handling, accessibility | Done |
| Deployment (Wk 8) | Dockerfile, CI pipeline, env config, README | Done |
| Housing Focus (Wk 9) | STR/transit/flood/affordable housing layers, equity templates, choropleth, export | Done |

### March 2026 Evaluation Results (14/15 addressed)

Type casting, spatial indexes, code dedup, env vars, LLM timeouts, integration tests, Docker/CI, production LLM, Zustand state, multi-turn conversation, example queries, accessibility, export — all addressed. See `docs/project-evaluation.md` for the full evaluation and `docs/ASSESSMENT_2026_04_11.md` for the current scorecard.

**Remaining from evaluation:** LLM-driven equity explanations (partial — function exists, falls back to deterministic).

---

## Current Phase: Ship It

The infrastructure is built. The remaining work is about making the tool useful to real people and deployable to a production environment. Three parallel tracks:

### Track 1: Equity Explanations (the differentiator)

**Why this matters:** Without equity-aware explanations, this is a generic spatial query tool. With them, it's an equity analysis platform that helps advocates, planners, and journalists understand what the data means for housing in Santa Fe.

**Current state:** `generateEquityExplanation()` in `api/src/lib/utils/explanation.ts` exists with layer-specific equity hints defined. It falls back to a deterministic template ("Found N features where...") instead of calling the LLM.

#### Action Items

- [ ] **Wire up the LLM call in `generateEquityExplanation()`** — the equity hints per layer are already defined; construct a prompt that includes the query, result summary statistics, and the relevant equity context hints
- [ ] **Add result-aware context to the prompt** — include feature count, value distributions (min/max/median of key numeric fields), spatial clustering description if applicable
- [ ] **Test against the pre-built equity templates** — run each template query from `api/src/lib/templates/equity-queries.ts` and evaluate whether the explanations are accurate, useful, and appropriately contextualized
- [ ] **Add explanation quality signal** — thumbs up/down in ResultsPanel that logs to a file or endpoint for review
- [ ] **Set a fallback timeout** — if LLM explanation takes >5s, return the deterministic version; don't block the response

#### Definition of Done

A user asking "Show census tracts where median income is below $40,000" gets back not just the map and table, but an explanation like: "Found 12 census tracts where median household income falls below $40,000. These tracts are concentrated in the south and west sides of Santa Fe, where 8 of the 12 are majority-renter communities. At less than 52% of the 2023 Santa Fe County AMI ($77,000), residents in these tracts qualify for HUD Low-Income Housing Tax Credit units."

---

### Track 2: Data Completeness

**Current state:** 14 of 18 planned layers loaded (109K+ features). 4 pending.

#### Achievable Now

- [ ] **Commit the affordable housing work** — HUD LIHTC script is complete, 35 properties loaded, tests updated. Just needs `git add` and commit
- [ ] **School zones** — Contact Santa Fe Public Schools GIS office for attendance boundary polygons. Fallback: generate Voronoi polygons from school point locations (City layer 22) and document the approximation
- [ ] **Wildfire risk** — Download USFS Wildfire Hazard Potential GeoTIFF, clip to Santa Fe County extent, classify into risk zones (extreme/high/moderate/low), vectorize, load as layer. This is a standard GIS processing task
- [ ] **Fix VARCHAR numeric fields at source** — In `scripts/prepare-data.ts`, cast `year_built`, `price_per_night`, `accommodates`, `trail_miles` to proper numeric types during parquet generation instead of relying on `TRY_CAST` workarounds in the query builder

#### Deferred (Institutional Blockers)

- **`vacancy_status`** — Requires combining assessor records with USPS vacancy data. Neither is readily downloadable. Document as a future enhancement requiring a data partnership
- **`eviction_filings`** — NM Courts records are privacy-sensitive, require geocoding, and likely need a formal data sharing agreement with legal aid organizations. Document as future work

#### Data Quality

- [ ] **Audit numeric field values** — Run `SELECT COUNT(*) FROM parcels WHERE TRY_CAST(year_built AS DOUBLE) IS NULL AND year_built IS NOT NULL` (and similar) to quantify data quality issues from VARCHAR-to-numeric casting
- [ ] **Document data freshness** — Add a `last_fetched` timestamp to manifest.json entries so users know how current the data is

---

### Track 3: Production Hardening

**Current state:** Dockerfile works, CI passes, Together.ai client exists. Not yet deployed or hardened for real users.

#### Security & Stability

- [ ] **Rate limiting** — Add Hono middleware: 10 req/min on `/api/chat` (LLM-backed), 30 req/min on `/api/query` (direct SQL), unlimited on `/api/layers` and `/api/health`
- [ ] **CORS configuration** — Restrict to known frontend origin via env var
- [ ] **Graceful shutdown** — Add SIGTERM/SIGINT handlers that stop accepting new connections, drain in-flight requests (5s timeout), then close DuckDB
- [ ] **Connection management** — Verify singleton DuckDB instance pattern; ensure connections are closed after use (not leaked per-request)
- [ ] **Request validation** — Add Zod schema for `/api/chat` request body (currently uses `as { message: string }`)

#### Observability

- [ ] **Structured logging** — Log every request with: timestamp, endpoint, query layer, feature count, grounding status, LLM latency, DuckDB latency, cache hit/miss. JSON format for parseability
- [ ] **Health check enrichment** — `/api/health` should report: DuckDB status, loaded layer count, LLM provider reachability, uptime
- [ ] **Error tracking** — Log LLM parse failures with the original query and raw LLM response for prompt improvement

#### Deployment

- [ ] **Choose a platform** — Railway or Fly.io for API (needs persistent disk for parquet files); Vercel or Netlify for frontend SPA
- [ ] **End-to-end Docker verification** — Run `docker build` and test all endpoints including a spatial join query against the 63K parcel layer
- [ ] **Load test** — Run 10 concurrent spatial queries against parcels + transit_access to understand DuckDB's concurrency limits
- [ ] **Production LLM verification** — Run the full test suite using Together.ai instead of Ollama to validate model behavior differences

---

## User Testing Plan

Before investing more engineering time, get the tool in front of real users:

1. **Identify 3-5 testers** from the target audience: a housing advocate, a city planner, a journalist covering housing, a community organizer, a researcher
2. **Prepare 5 guided scenarios** based on the equity templates:
   - "How many short-term rentals are in the downtown area?"
   - "Show me census tracts where most residents are renters"
   - "Are there affordable housing units near bus stops?"
   - "Which neighborhoods are in the flood zone?"
   - Plus one open-ended: "Ask any question about housing in Santa Fe"
3. **Record observations:** What queries do they try? Where do they get confused? What do they wish they could ask? Do they understand the results?
4. **Iterate on prompts and examples** based on what real users actually say vs. what the synthetic few-shot examples assume

---

## Active Documentation

After the archive cleanup, these docs are current and maintained:

| Document | Purpose | Update Cadence |
|----------|---------|---------------|
| `ARCHITECTURE.md` | Technical design, data flow, security | When architecture changes |
| `BUILD_PLAN.md` | Forward-looking action plan (this file) | Each phase |
| `PROJECT_STATUS.md` | Current state dashboard | After significant milestones |
| `ASSESSMENT_2026_04_11.md` | April 2026 comprehensive assessment | One-time |
| `project-evaluation.md` | March 2026 code review (15 recommendations) | One-time |
| `DATA_SOURCES.md` | Layer provenance, licensing, update cadence | When layers change |
| `DATA_CATALOG.md` | Live metadata snapshot (feature counts, schemas) | When data refreshes |
| `DATA_ACQUISITION_GUIDE.md` | How to acquire each dataset | When new sources found |

Historical docs from the initial build phase are in `docs/archive/`.

---

## Success Criteria for Next Milestone

The project is ready for a public beta when:

1. **Equity explanations work** — Every query returns a contextual, equity-aware explanation (not just "Found N features")
2. **5 real users have tested it** — And their feedback has been incorporated into prompts, examples, and UI
3. **Deployed to a public URL** — API + frontend accessible without local setup
4. **Rate limiting and auth in place** — Basic abuse prevention
5. **Data freshness documented** — Users can see when each layer was last updated

---

## Resources

- [DuckDB Spatial](https://duckdb.org/docs/extensions/spatial.html)
- [MapLibre GL JS](https://maplibre.org/maplibre-gl-js/docs/)
- [Hono Framework](https://hono.dev/)
- [Together.ai](https://together.ai/) — Production LLM provider
- [Ollama](https://ollama.ai/) — Local development LLM
- [HUD LIHTC Database](https://lihtc.huduser.gov/) — Affordable housing data source
- [Santa Fe County GIS](https://sfcounty.maps.arcgis.com/) — Primary spatial data source
