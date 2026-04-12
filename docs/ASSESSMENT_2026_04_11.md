# Project Assessment — April 11, 2026

**Evaluator role:** Senior GIS Analyst, Application Developer, Project Management Consultant  
**Date:** April 11, 2026  
**Codebase snapshot:** Git HEAD + uncommitted affordable housing work  
**Prior evaluation:** March 16, 2026 (see `docs/project-evaluation.md`)

---

## Executive Summary

Parcela is a well-architected late-prototype / early-beta spatial query system that lets non-technical users ask natural language questions about housing, land use, and equity in Santa Fe. The core engineering is solid — the constrained query schema, dual-CRS discipline, and layered validation pipeline are correct design decisions that show real GIS understanding. The project is in a common position: the hard infrastructure work is done, but there's a gap between "technically functional" and "useful to its intended audience."

Since the March 2026 evaluation, 13 of 15 recommendations have been addressed. The two most impactful remaining gaps are the equity explanation system (the project's core differentiator) and production deployment readiness.

---

## Current State

### What's Built and Working

- **14 loaded spatial layers** (109K+ features) covering parcels, zoning, census, transit, STRs, flood zones, parks, bikeways, affordable housing (LIHTC), and more
- **Full NL-to-SQL pipeline:** intent grounding → LLM parse → Zod validation → registry check → normalization → limit enforcement → parameterized DuckDB execution → GeoJSON output
- **Dual-CRS geometry columns** (WGS84 for display/topology, UTM 13N for metric ops) — correctly implemented
- **Working React frontend** with MapLibre, Zustand state, multi-turn conversation, choropleth support, GeoJSON/CSV export
- **CI pipeline** (lint → typecheck → test → Docker build), 37+ passing tests including 34 frontend tests
- **LLM provider abstraction** (Ollama dev / Together.ai prod)
- **Pre-built equity analysis templates** (displacement pressure, transit access, flood risk, etc.)
- **Accessibility improvements** — ARIA labels, keyboard navigation, screen reader support
- **Docker deployment** — multi-stage build with data volume mount

### What's In-Flight (Uncommitted)

- Affordable housing layer loaded via automated HUD LIHTC fetch (35 properties, script complete)
- Dynamic port discovery for dev server
- Updated tests and docs reflecting affordable housing integration

### Quantitative Snapshot

| Metric | Value |
|--------|-------|
| Loaded layers | 14 of 18 planned |
| Total features | ~109,400 |
| API source lines | ~4,300 |
| Frontend source lines | ~1,850 |
| Test count (API) | 37+ passing |
| Test count (frontend) | 34 passing |
| Pending layers (data governance) | 4 |

---

## March 2026 Evaluation: Scorecard Update

| # | Recommendation | Status | Notes |
|---|---------------|--------|-------|
| 1 | Fix type mismatches (VARCHAR vs numeric) | **Done** | `VARCHAR_NUMERIC_FIELDS` with `TRY_CAST` in builder |
| 2 | Add spatial indexes | **Done** | R-tree indexes on geom_4326 and geom_utm13 |
| 3 | Extract duplicated code | **Done** | `convertBigInts`, `rowToFeature` in shared utils |
| 4 | Environment-based API URL | **Done** | `VITE_API_BASE` env var with fallback |
| 5 | Add LLM timeout | **Done** | AbortController with configurable timeout |
| 6 | LLM-driven equity explanations | **Partial** | `generateEquityExplanation()` exists but falls back to deterministic |
| 7 | Integration tests with fixture DB | **Done** | 24 pipeline integration tests |
| 8 | Dockerfile and CI | **Done** | Multi-stage Docker + GitHub Actions |
| 9 | `.env.example` | **Done** | Both `api/.env.example` and `web/.env.example` |
| 10 | Production LLM client | **Done** | Together.ai client implemented |
| 11 | Multi-turn conversation | **Done** | Conversation context in Zustand store |
| 12 | Frontend state management | **Done** | Zustand store with full state |
| 13 | Accessibility audit | **Done** | ARIA labels, keyboard nav, screen reader |
| 14 | Better example queries | **Done** | Equity-focused examples in ChatPanel |
| 15 | Export functionality | **Done** | GeoJSON + CSV export with metadata |

**Score: 14/15 addressed (1 partial)**

---

## Pain Points and Blockages

### 1. The Equity Explanation Gap (Highest Impact)

The architecture docs and templates promise equity-aware, LLM-driven explanations — contextualizing results within displacement pressure, affordability thresholds, HUD AMI bands, etc. The actual code generates deterministic template strings ("Found X parcels where..."). This is the project's core differentiator from a generic spatial query tool and it's not delivered. The `generateEquityExplanation()` function exists but falls back to the deterministic path. Without this, users get a technically competent GIS tool but miss the "so what" that makes the data actionable for advocates, journalists, and policymakers.

### 2. Pending Data Layers Are Real-World Governance Problems

| Layer | Blocker | Difficulty |
|-------|---------|------------|
| `school_zones` | City GIS has school *points* (layer 22), not attendance boundaries. Need district-level polygon data or Voronoi approximation. | Medium — contact SFPS GIS office |
| `wildfire_risk` | USFS data is 270m raster. Needs vectorization, clipping to city limits, and risk classification. | Medium — technical, not political |
| `vacancy_status` | Derived layer combining assessor records + USPS vacancy data. Neither source is readily available as a download. | Hard — multi-source, ongoing updates |
| `eviction_filings` | NM Courts + legal aid records. Privacy-sensitive, requires geocoding, likely needs a data sharing agreement. | Hard — legal/institutional |

The honest assessment: `school_zones` and `wildfire_risk` are achievable with focused effort. `vacancy_status` and `eviction_filings` are institutional/legal challenges that could take months. The project should not block on them.

### 3. Type System Friction Between Schema and Reality

The type definitions in `shared/types/geo.ts` declare fields like `year_built`, `price_per_night`, and `accommodates` as `number`, but the actual DuckDB data stores them as VARCHAR. The builder has `VARCHAR_NUMERIC_FIELDS` to handle this with `TRY_CAST`, which works — but it's a workaround for a data preparation problem. If a user queries "parcels where year_built > 1990" and the cast fails silently on malformed data, they get incomplete results with no warning.

### 4. No Real-World User Testing Feedback Loop

The example queries in ChatPanel are developer-written. There are equity analysis templates, but no evidence they've been run against the actual data by someone from the target audience (housing advocates, planners, journalists). The LLM parsing prompt has 15+ few-shot examples, but they're synthetic. The gap between "this query works in tests" and "a housing advocate can actually get answers" is where projects like this stall.

### 5. Production Deployment Not Close

- No auth, rate limiting, or abuse controls
- No structured logging or observability
- No graceful shutdown handlers (container restarts will drop in-flight queries)
- DuckDB connection management is per-request with no pooling
- The Together.ai production LLM path exists but isn't battle-tested
- No load testing against the 63K parcel layer with spatial joins

### 6. Frontend Functional but Not Polished

- No loading skeletons or progressive rendering for large result sets
- Results table caps at 100 rows with no pagination
- No saved queries or shareable URLs
- Choropleth only works for `census_tracts` — no thematic mapping of parcels by assessed value, year built, etc.
- No mobile responsiveness (3-panel layout is desktop-only)

---

## Productive Path Forward

Three tracks that can run in parallel:

### Track 1: Close the Equity Explanation Gap (High Impact, Medium Effort)

This is the feature that justifies the project's existence. Without it, you have a spatial query tool; with it, you have an equity analysis platform.

1. Wire up `generateEquityExplanation()` to actually call the LLM with context about the results — layer-specific equity hints are already defined in `explanation.ts`
2. Add result-aware context to the explanation prompt: feature counts, distributions (e.g., "median income range across matched tracts"), spatial patterns ("concentrated in the south side")
3. Test with the pre-built templates as golden-path scenarios — these are the queries your users will actually care about
4. Add a simple feedback mechanism (thumbs up/down on explanations) to start building a quality signal

### Track 2: Data Completeness & Quality (Medium Impact, Variable Effort)

Focus on what's achievable and stop blocking on what isn't:

1. **Commit the affordable housing work** — it's done, it's uncommitted, and it closes a real gap
2. **School zones** — contact Santa Fe Public Schools for attendance boundary polygons. If unavailable, generate Voronoi polygons from school points as an approximation (document the limitation)
3. **Wildfire risk** — this is a tractable GIS processing task: download USFS Wildfire Hazard Potential raster, clip to Santa Fe County, vectorize into risk zones, load as layer
4. **Fix VARCHAR numeric fields at the data preparation step** — cast them to proper numeric types in `prepare-data.ts` rather than working around it in the query builder. This eliminates silent failures
5. **Defer vacancy and eviction layers** — document them as "future" and remove them from the active layer count. They require institutional relationships, not code

### Track 3: Production Hardening (Required Before Any Real Users)

1. **Auth & rate limiting** — even basic API key auth prevents abuse. Hono middleware is straightforward
2. **Graceful shutdown** — add SIGTERM/SIGINT handlers that drain in-flight requests and close DuckDB
3. **Environment-driven config** — the frontend API URL issue is already partially fixed (`VITE_API_BASE`), verify it works end-to-end in Docker
4. **Connection management** — singleton DuckDB instance (already partially there with `let dbInstance`) with proper lifecycle
5. **Structured logging** — at minimum, log every query with timing, layer, feature count, and grounding status. This is your usage analytics
6. **Load test** — run the spatial join queries against 63K parcels under concurrent load. DuckDB is fast but single-writer; understand the limits

---

## Strategic Observations

**The constrained query schema is this project's best decision.** Most NL-to-SQL projects let the LLM generate arbitrary SQL and then try to sandbox it. By constraining to `StructuredQuery` with Zod validation, you've made the LLM's job tractable, made injection impossible, and made the system auditable. This is the right architecture for a tool that might inform policy decisions.

**The dual-CRS handling is correct and rare.** Most web GIS projects store everything in 4326 and do distance calculations in degrees (wrong) or reproject on the fly (slow). Having `geom_utm13` pre-computed for metric operations is how production GIS systems work.

**The biggest risk is scope creep, not technical debt.** The codebase is clean, well-typed, and well-tested. The temptation will be to add more layers, more query types, more UI features. The actual need is to get the 14 existing layers into the hands of 5 real users and learn what they actually need. The equity explanation gap, not missing data layers, is what separates "interesting prototype" from "useful tool."

**The data pipeline is solid but needs operational maturity.** The fetch scripts work, but there's no scheduled refresh, no data freshness monitoring, and no way to know if upstream sources change their schemas. For a production system with policy implications, stale data is worse than no data.

---

## Documentation Cleanup Recommendations

This assessment coincides with a docs reorganization:

| Action | File | Reason |
|--------|------|--------|
| **Archive** | `QUICK_START.md` | Week 1 setup guide; project is past this phase |
| **Archive** | `LEARNING_ROADMAP.md` | Learning overview; project is past the learning phase |
| **Archive** | `IMPLEMENTATION_PLAN.md` | Supplements BUILD_PLAN with learning framing; superseded |
| **Archive** | `DATA_PROCESSING_SUMMARY.md` | Dec 6, 2025 snapshot showing 3 layers; now 14 loaded |
| **Archive** | `WEEK4_SUMMARY.md` | Week 4 completion report; historical |
| **Archive** | `WEEK4_SETUP.md` | Ollama setup guide; still valid but not primary docs |
| **Archive** | `WEEK4_TEST_RESULTS.md` | LLM test results from Dec 2025; historical |
| **Keep** | `ARCHITECTURE.md` | Foundational design doc; still accurate |
| **Keep** | `BUILD_PLAN.md` | Rewritten as forward-looking action plan |
| **Keep** | `PROJECT_STATUS.md` | Updated to current state |
| **Keep** | `DATA_SOURCES.md` | Layer provenance; updated |
| **Keep** | `DATA_CATALOG.md` | Live metadata snapshot; needs periodic refresh |
| **Keep** | `DATA_ACQUISITION_GUIDE.md` | How to acquire datasets; still needed for pending layers |
| **Move to docs/** | `project-evaluation.md` | March 2026 evaluation; belongs with other docs |

---

## Recommended Immediate Actions

1. **Commit the affordable housing work** — it's done and sitting uncommitted
2. **Wire up LLM-driven equity explanations** — this is a weekend of work with high leverage
3. **Pick 3-5 real users** from the target audience and have them use the tool. Record what they try, what works, what confuses them
4. **Set a deployment target date** and work backward from it — the hardening work won't happen without a deadline
5. **Update project-evaluation.md** to reflect current status (the March assessment is now outdated)

The bones of this project are strong. The path forward is about closing the gap between "technically functional" and "useful to people making housing decisions in Santa Fe."
