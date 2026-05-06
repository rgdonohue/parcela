# Project Status Report

**Date:** May 6, 2026  
**Phase:** Late prototype / review build  
**Source of truth:** current workspace plus `api/data/manifest.json`

## Current Summary

Parcela has a working local API, web app, data manifest, Docker build, and test suite. The current review build supports natural-language spatial queries, server-owned multi-turn context, direct structured queries, map rendering, exports, bilingual UI strings, and LLM-backed explanations with deterministic fallback.

The next phase is production readiness: deploy the API/web app, automate data refreshes, validate real user workflows, and replace placeholder operational controls with production-grade secret/key management.

## System Snapshot

| Component | State |
|-----------|-------|
| Spatial layers loaded | 14 |
| Total loaded features | 109,417 |
| API tests passing | 95 |
| Web tests passing | 37 |
| Shared typecheck | Passing |
| CI pipeline | API lint/typecheck/test/shared typecheck, web lint/typecheck/test/build, Docker build |
| LLM providers | Ollama local, Together.ai hosted |
| Conversation state | Server-owned in-memory sessions, 2-hour TTL, 1000-session cap |
| Export formats | GeoJSON, CSV |
| Production deployment | Pending |

## Loaded Layers

| Layer | Features | Geometry |
|-------|----------|----------|
| parcels | 63,439 | Polygon |
| building_footprints | 42,630 | Polygon |
| zoning_districts | 851 | Polygon |
| short_term_rentals | 897 | Point |
| bikeways | 536 | LineString |
| transit_access | 447 | Point |
| flood_zones | 227 | Polygon |
| hydrology | 109 | LineString |
| neighborhoods | 106 | Polygon |
| parks | 77 | Polygon |
| census_tracts | 57 | Polygon |
| affordable_housing_units | 35 | Polygon / Point |
| historic_districts | 5 | Polygon |
| city_limits | 1 | Polygon |

## Completed Since April Assessment

- Added server-owned conversation sessions; clients now send `conversationId` instead of prior query state.
- Added shared package metadata and typecheck for `shared/`.
- Current local validation passes: API typecheck, API tests, web typecheck, web tests, shared typecheck.
- Updated current-state docs and moved the internal remediation review log to `docs/archive/`.
- Removed template/macOS artifacts from the review surface.

## Known Gaps

1. **No public deployment yet** — Docker build exists, but hosted API/web infrastructure is not documented as live.
2. **Operational key handling is basic** — production requires `API_KEY`, but rotated keys or user auth are not implemented.
3. **Data refresh is manual** — fetch/prepare scripts exist, but there is no scheduled refresh or freshness SLA.
4. **Pending data layers** — school zones, wildfire risk, vacancy, and eviction layers remain unavailable.
5. **User validation is still needed** — tests cover implementation behavior, not whether housing advocates/planners can reliably answer their real questions.
6. **Historical docs lag** — older assessment/build-plan docs remain useful context but are no longer exact current-state references.

## Validation Snapshot

Run from the repo root:

```bash
npm --prefix api run typecheck
npm --prefix api test -- --run
npm --prefix web run typecheck
npm --prefix web test -- --run
npm --prefix shared run typecheck
npm run lint
npm --prefix web run build
```

Latest local result: all commands passed.

## Immediate Next Work

1. Decide the production hosting target and environment contract.
2. Add production-grade API key rotation or a real auth layer.
3. Add data freshness metadata and a repeatable refresh workflow.
4. Run guided user testing with 3-5 housing/planning users.
5. Prioritize the next data layer: school zones or wildfire risk.
