# Project Status Report

**Date:** April 11, 2026  
**Phase:** Post-build — hardening, user testing, and deployment prep  
**Prior status:** February 23, 2026 (grounding hardening)

## Current Summary

The initial 8-week build and a March 2026 evaluation are complete. 14 of 15 evaluation recommendations have been addressed. The system runs with a full NL-to-map pipeline, 14 loaded spatial layers, 71+ tests (37 API + 34 frontend), and a CI/CD pipeline with Docker support.

The project is transitioning from "build" to "ship" — the remaining work is equity explanations, user testing, and production deployment.

## System Snapshot

| Component | State |
|-----------|-------|
| Spatial layers loaded | 14 (109K+ features) |
| API tests passing | 37+ |
| Frontend tests passing | 34 |
| CI pipeline | Lint → typecheck → test → Docker build |
| LLM providers | Ollama (dev), Together.ai (prod) |
| State management | Zustand with multi-turn context |
| Export formats | GeoJSON, CSV |
| Accessibility | ARIA labels, keyboard nav, screen reader |

## Loaded Layers

| Layer | Features | Geometry |
|-------|----------|----------|
| parcels | 63,439 | Polygon |
| building_footprints | 42,630 | Polygon |
| zoning_districts | 851 | Polygon |
| flood_zones | 227 | Polygon |
| neighborhoods | 106 | Polygon |
| parks | 77 | Polygon |
| census_tracts | 57 | Polygon |
| historic_districts | 5 | Polygon |
| city_limits | 1 | Polygon |
| short_term_rentals | 897 | Point |
| transit_access | 447 | Point |
| affordable_housing_units | 35 | Point |
| bikeways | 536 | LineString |
| hydrology | 109 | LineString |

**Total: 109,417 features across 14 layers**

## Pending Layers

| Layer | Blocker | Priority |
|-------|---------|----------|
| school_zones | Need attendance boundary polygons from SFPS | Medium |
| wildfire_risk | USFS raster needs vectorization | Medium |
| vacancy_status | Multi-source derivation (assessor + USPS) | Deferred |
| eviction_filings | Privacy-sensitive, needs data agreement | Deferred |

## What Changed Since Last Status (Feb 23)

- **Affordable housing loaded** — HUD LIHTC data fetched, processed, 35 features (uncommitted)
- **Frontend tests added** — 34 tests for store, ChatPanel, ResultsPanel
- **Accessibility improvements** — ARIA labels, keyboard navigation, screen reader support
- **GeoJSON/CSV export** — Implemented in ResultsPanel with query metadata
- **March evaluation completed** — 15 recommendations; 14 addressed
- **April assessment completed** — Full project review and forward plan

## Evaluation Scorecard

| # | Recommendation | Status |
|---|---------------|--------|
| 1 | Fix type mismatches | Done |
| 2 | Spatial indexes | Done |
| 3 | Extract duplicated code | Done |
| 4 | Env-based API URL | Done |
| 5 | LLM timeout | Done |
| 6 | LLM equity explanations | **Partial** |
| 7 | Integration tests | Done |
| 8 | Dockerfile + CI | Done |
| 9 | .env.example | Done |
| 10 | Production LLM client | Done |
| 11 | Multi-turn conversation | Done |
| 12 | Frontend state (Zustand) | Done |
| 13 | Accessibility | Done |
| 14 | Better example queries | Done |
| 15 | Export functionality | Done |

## Known Gaps

1. **Equity explanations fall back to deterministic** — `generateEquityExplanation()` exists but doesn't consistently call the LLM. This is the project's core differentiator
2. **No production deployment yet** — Dockerfile works, no hosting configured
3. **No auth/rate limiting** — Required before public access
4. **No graceful shutdown** — Risk for containerized deploys
5. **No real user testing** — All testing is developer-driven
6. **VARCHAR numeric fields** — Handled via TRY_CAST workaround, should be fixed at data prep

## Validation Snapshot

- `api`: typecheck passes
- `api`: lint passes
- `api`: tests pass (37+)
- `web`: typecheck passes
- `web`: lint passes
- `web`: tests pass (34)

## Immediate Next Work

1. Commit affordable housing layer work
2. Wire up LLM-driven equity explanations
3. Recruit 3-5 real users for testing
4. Add rate limiting and auth middleware
5. Deploy to public URL

See `BUILD_PLAN.md` for the full forward-looking action plan with detailed tasks.
