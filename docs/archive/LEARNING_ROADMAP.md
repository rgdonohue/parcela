# Learning & Implementation Roadmap

**Project**: Santa Fe Spatial Chat  
**Status**: Planning Complete → Ready for Implementation  
**Timeline**: 8-week structured learning path + Week 9 housing stretch goals

**Important**: This document provides a high-level overview. For the authoritative week-by-week plan with detailed tasks, see **BUILD_PLAN.md**. This roadmap supplements BUILD_PLAN with learning objectives and topic-focused guidance.

---

## Executive Summary

This document synthesizes the planning documents into a clear learning and implementation roadmap. The project is a **natural language interface for spatial data** that helps answer housing equity questions in Santa Fe, NM.

### Key Learning Outcomes

By completing this project, you will master:
1. **TypeScript** (strict mode, type safety, advanced patterns)
2. **Spatial databases** (DuckDB, CRS, spatial operations)
3. **LLM integration** (prompt engineering, structured output)
4. **Map rendering** (MapLibre GL JS, GeoJSON)
5. **Full-stack development** (React + Hono API)
6. **Production deployment** (Docker, cloud platforms)

---

## Project Overview

### What We're Building

A **housing equity-focused** web application where users can:
- Ask questions in plain English: *"Show me vacant residential parcels near bus stops"* or *"Which neighborhoods have the most short-term rentals?"*
- See results on an interactive map
- Understand what query was executed (transparency)
- Get plain-English explanations with **equity context** (income correlations, neighborhood disparities, historical context)
- Use pre-built analysis templates for housing crisis insights (STR density, affordability gap, vacancy hotspots)

### Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | React 18 + TypeScript + Vite | Modern, type-safe UI |
| Map | MapLibre GL JS | Open-source, no vendor lock-in |
| Backend | Hono (TypeScript) | Lightweight, edge-ready |
| Database | DuckDB + Spatial | Single-file, no server needed |
| LLM | Ollama (local) / Together.ai (prod) | Local dev, cloud production |

---

## 8-Week Implementation Plan

**Note**: See **BUILD_PLAN.md** for complete week-by-week tasks and deliverables. This section provides a high-level overview with housing equity focus.

### Phase 1: Foundation (Weeks 1-2)

**Week 1: Repo Audit + TypeScript Foundation**
- **Audit existing repo structure** (don't overwrite existing work)
- Configure strict TypeScript with edge-ready settings (`moduleResolution: "NodeNext"`)
- Create/verify basic Hono API
- Create/verify basic React app with map
- **Goal**: Both apps run, types check, map renders

**Week 2: Domain Types + CRS-Aware Data Pipeline**
- Define GeoJSON types (including **housing-focused layers**: STR, vacancy, affordable housing, eviction filings)
- Set up DuckDB with **dual-geom CRS handling** (WGS84 + UTM 13N)
- Create data preparation scripts
- Load Santa Fe datasets (note: DATA_SOURCES.md has TBDs to fill)
- **Goal**: Data loaded with dual geometries, DuckDB working, layers endpoint returns schemas

### Phase 2: Core Query System (Weeks 3-4)

**Week 3: Spatial Query Builder**
- Define StructuredQuery types (including **temporal queries** for change-over-time analysis)
- Build type-safe SQL query builder with **CRS-aware geometry selection**
- Implement Zod validation
- Create `/api/query` endpoint
- **Goal**: Query builder works with temporal support, tests pass, can execute structured queries

**Week 4: LLM Integration**
- Set up Ollama locally
- Create LLM client abstraction
- Build IntentParser (NL → StructuredQuery) with **housing equity examples**
- Test parsing quality (include housing-focused queries)
- **Goal**: LLM parses queries correctly including temporal, confidence scoring works

### Phase 3: User Interface (Weeks 5-6)

**Week 5: Map UI + Results Display**
- Build ChatPanel component
- Build MapView with results layer
- Build ResultsPanel component
- Wire up App component
- **Goal**: UI components built, can send queries and see results

**Week 6: End-to-End Orchestration**
- Create `/api/chat` endpoint
- Build **ResultExplainer with equity-aware explanations**
- Add QueryExplainer component
- Handle edge cases
- **Goal**: End-to-end flow works, equity-aware explanations generated

### Phase 4: Production Readiness (Weeks 7-8)

**Week 7: Testing + Security**
- Expand test coverage (80%+)
- Add error boundaries
- Implement security (API key, CORS, rate limits)
- Add observability (logging, metrics)
- **Goal**: Tests pass, security in place, errors handled

**Week 8: Deployment + Polish**
- Dockerize API
- Deploy to Railway/Fly.io
- Deploy frontend to Vercel
- Swap LLM provider for production
- Documentation and polish
- **Goal**: Deployed, documented, demo-ready

### Phase 5: Housing Equity Features (Week 9 - Stretch)

**Week 9: Housing Crisis Analysis Features** (see BUILD_PLAN.md Week 9)
- Add housing datasets (STR, vacancy, affordable housing, eviction filings, transit, flood/wildfire risk)
- Implement aggregation queries (if not complete)
- Pre-built analysis templates (STR density, affordability gap, vacancy hotspots)
- Visualization for aggregates (choropleth with standardized values)
- Export and reporting (GeoJSON/CSV/PDF)
- **Goal**: Housing-focused capabilities shipped, templates available in UI

---

## Learning Path by Topic

### TypeScript Mastery

**Week 1**: Strict mode, basic types, configuration  
**Week 2**: Generic types, type guards, GeoJSON typing  
**Week 3**: Discriminated unions, Zod inference, parameterized types  
**Week 4**: Interface-based abstractions, async patterns  
**Week 5**: React component typing, event handlers  
**Week 6**: Error handling types, result types  
**Week 7**: Test typing, mock types  
**Week 8**: Production config types, environment variables

**Resources**:
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [Effective TypeScript](https://effectivetypescript.com/)
- [TypeScript Deep Dive](https://basarat.gitbook.io/typescript/)

### Spatial Data & Databases

**Week 2**: CRS concepts, DuckDB spatial extension, GeoJSON, **dual-geom CRS handling**  
**Week 3**: Spatial operations (distance, intersects, contains), SQL generation, **temporal queries**  
**Week 6**: CRS-aware query execution, performance optimization

**Key Concepts**:
- **CRS (Coordinate Reference System)**: WGS84 (`geom_4326`) for interchange, UTM 13N (`geom_utm13`) for metric operations
- **Dual Geometry Approach**: Store both CRSs, choose based on operation type
- **Spatial Operations**: `ST_DWithin` (uses UTM), `ST_Intersects` (uses WGS84), `ST_Contains`
- **Temporal Queries**: Compare metrics over time (e.g., "Change in assessed value since 2018")
- **Geometry Types**: Point, LineString, Polygon

**Resources**:
- [DuckDB Spatial Extension](https://duckdb.org/docs/extensions/spatial.html)
- [Understanding CRS](https://docs.qgis.org/latest/en/docs/gentle_gis_introduction/coordinate_reference_systems.html)
- [PostGIS in Action](https://www.postgis.us/) (concepts apply)

### LLM Integration

**Week 4**: Ollama setup, prompt engineering, JSON extraction, **housing equity examples**  
**Week 6**: **Equity-aware explanation generation**, confidence scoring  
**Week 8**: Production LLM providers (Together.ai/Groq)

**Key Concepts**:
- **Prompt Engineering**: Few-shot examples, structured output, **housing-focused query patterns**
- **JSON Extraction**: Parsing LLM responses safely
- **Confidence Scoring**: Validating LLM output quality
- **Equity-Aware Explanations**: Consider income correlations, neighborhood disparities, historical context (redlining, displacement)

**Resources**:
- [Ollama Documentation](https://ollama.ai/)
- [Prompt Engineering Guide](https://www.promptingguide.ai/)
- [JSON Mode for LLMs](https://jsonmode.com/)

### Map Rendering

**Week 1**: MapLibre setup, basic map rendering  
**Week 5**: Layer management, feature highlighting, interactions  
**Week 6**: Results visualization, styling

**Key Concepts**:
- **MapLibre GL JS**: Open-source map library
- **GeoJSON**: Feature collections, properties
- **Layer Management**: Base layers, result layers, styling

**Resources**:
- [MapLibre GL JS Docs](https://maplibre.org/maplibre-gl-js/docs/)
- [MapLibre Examples](https://maplibre.org/maplibre-gl-js-docs/example/)
- [GeoJSON Specification](https://geojson.org/)

---

## Knowledge Gaps & Prerequisites

### What You Should Know

✅ **Required**:
- TypeScript basics
- React basics
- Node.js/npm
- Git

⚠️ **Learn As You Go**:
- Spatial databases (DuckDB/PostGIS)
- Coordinate Reference Systems
- LLM integration
- Map rendering (MapLibre)

### Recommended Pre-Study

**Before Starting**:
1. Review TypeScript strict mode features
2. Read Hono quickstart guide
3. Install Ollama and test a model
4. Review React hooks patterns

**During Project**:
- Week 2: Study CRS concepts
- Week 3: Review SQL injection prevention
- Week 4: Study prompt engineering
- Week 5: Review React component patterns

---

## Risk Mitigation

### Technical Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Data acquisition delays | High | Start with mock data, research in parallel |
| LLM parsing quality | Medium | Iterate on prompts, add validation |
| DuckDB limitations | Low | Test early, PostGIS as backup |
| Performance issues | Medium | Cache queries, limit results |

### Learning Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Spatial concepts unfamiliar | Medium | Extra time Week 2, external resources |
| LLM integration complexity | Medium | Start simple, iterate |
| TypeScript strict errors | Low | Enable gradually, fix as you go |

---

## Success Metrics

### Weekly Checkpoints

- **Week 1**: ✅ Both apps run, types check, map renders
- **Week 2**: ✅ Data loaded, DuckDB working
- **Week 3**: ✅ Query builder works, tests pass
- **Week 4**: ✅ LLM parses queries correctly
- **Week 5**: ✅ UI components built and working
- **Week 6**: ✅ End-to-end flow works
- **Week 7**: ✅ Tests pass, security in place
- **Week 8**: ✅ Deployed and documented

### Final Success Criteria

1. ✅ Type NL query → see results on map
2. ✅ Understand what query was executed
3. ✅ Get plain-English explanation
4. ✅ Code is type-safe, tested, documented
5. ✅ Application is deployed and accessible

---

## Documentation Structure

```
docs/
├── ARCHITECTURE.md          # Technical design with housing focus (complete)
├── BUILD_PLAN.md            # 8-week roadmap + Week 9 stretch (complete) ⭐ AUTHORITATIVE
├── DATA_SOURCES.md          # Dataset documentation (some TBDs need filling)
├── IMPLEMENTATION_PLAN.md   # Implementation guide with learning objectives
├── QUICK_START.md           # Week 1 audit-first setup checklist
└── LEARNING_ROADMAP.md      # This document - high-level overview
```

### How to Use These Docs

1. **Start Here**: Read `LEARNING_ROADMAP.md` (this document) for overview
2. **Authoritative Plan**: Follow `BUILD_PLAN.md` for week-by-week tasks and deliverables ⭐
3. **Week 1 Setup**: Follow `QUICK_START.md` for immediate next steps (audit-first approach)
4. **Learning Guide**: Reference `IMPLEMENTATION_PLAN.md` for learning objectives and risk mitigation
5. **Architecture Reference**: Consult `ARCHITECTURE.md` for technical decisions (housing layers, CRS, temporal queries)
6. **Data Planning**: Use `DATA_SOURCES.md` when acquiring datasets (fill TBDs as data is found)

---

## Next Steps

### Immediate Actions

1. **Review this roadmap** - Understand the full journey
2. **Follow QUICK_START.md** - Set up Week 1 environment
3. **Begin Week 1 tasks** - Create project structure
4. **Research data sources** - Start finding Santa Fe datasets

### Week 1 Focus

- Set up development environment
- Initialize TypeScript projects
- Get basic apps running
- Configure tooling (ESLint, Prettier)
- Test Ollama setup

---

## Resources

### Documentation
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [DuckDB Spatial](https://duckdb.org/docs/extensions/spatial.html)
- [MapLibre GL JS](https://maplibre.org/maplibre-gl-js/docs/)
- [Hono Framework](https://hono.dev/)
- [Ollama](https://ollama.ai/)
- [Zod](https://zod.dev/)

### Learning Materials
- [Effective TypeScript](https://effectivetypescript.com/)
- [PostGIS in Action](https://www.postgis.us/)
- [Prompt Engineering Guide](https://www.promptingguide.ai/)

### Community
- DuckDB Discord
- MapLibre Slack
- TypeScript Discord
- Hono GitHub Discussions

---

## Notes

- **Start simple**: Get basic flow working before adding complexity
- **Iterate on prompts**: LLM integration requires experimentation
- **Test early**: Write tests as you build, not after
- **Document decisions**: Note why you made choices
- **Ask for help**: Use community resources when stuck

---

**Status**: Ready to begin implementation  
**Next Step**: Follow `QUICK_START.md` to audit and set up Week 1 environment

**Key Reminders**:
- Week 1: **Audit existing repo first**, don't overwrite existing work
- Housing focus: Include equity-aware explanations, housing layers, analysis templates
- Temporal queries: Support change-over-time analysis (Week 3)
- Data sources: Fill TBDs in DATA_SOURCES.md as data is acquired
- Tech config: Use `moduleResolution: "NodeNext"` for edge-ready deployment
