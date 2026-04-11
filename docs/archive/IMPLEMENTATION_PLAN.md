# Santa Fe Spatial Chat — Implementation Plan

**Status**: Planning phase complete, ready to begin implementation  
**Created**: Based on review of ARCHITECTURE.md, BUILD_PLAN.md, and DATA_SOURCES.md

**Important**: This document provides implementation guidance. For the authoritative week-by-week plan, see **BUILD_PLAN.md**. This document supplements BUILD_PLAN with learning objectives, risk mitigation, and detailed task breakdowns.

---

## Current State Assessment

**Last Updated**: Check project structure to verify current state

### ✅ What Exists
- **Architecture documentation** — Complete technical design with housing focus
- **Build plan** — 8-week structured roadmap + Week 9 housing stretch goals
- **Data sources** — Documented datasets (some TBDs need filling)
- **Project vision** — Clear goals focused on housing equity in Santa Fe
- **Directory structure**: `api/`, `web/`, `shared/`, `scripts/` directories created
- **API setup**: `api/package.json` exists with Hono and TypeScript dependencies
- **API config**: `api/tsconfig.json` exists (needs configuration per Week 1 steps)

### ⚠️ In Progress / Needs Completion
- `api/tsconfig.json` — ✅ Configured (edge-ready with `moduleResolution: "NodeNext"`)
- `api/src/index.ts` — ⚠️ **File has corrupted content** (contains markdown code blocks) - needs to be replaced with clean TypeScript code from step 4
- `web/tsconfig.app.json` — ✅ Updated with strict options
- `web/src/App.tsx` — Needs update to use MapView (step 9)
- `web/src/components/MapView/index.tsx` — Needs to be created (step 8)
- ESLint/Prettier — Needs configuration in both projects (steps 10-12)
- Development environment — Needs verification that both apps run

### ❌ What's Missing
- No data files yet
- No domain types defined (`shared/types/geo.ts`)
- No DuckDB setup
- No LLM integration

**Status**: Week 1 setup in progress. Follow remaining Week 1 tasks to complete initialization.

---

## Learning & Implementation Strategy

### Phase 1: Foundation & Learning (Weeks 1-2)

#### Week 1: Repo Setup + TypeScript Foundation

**Goal**: Create project structure from scratch, set up strict TypeScript/lint configs, ensure both apps run cleanly.

**Learning Objectives:**
- Set up monorepo structure with strict TypeScript
- Configure development tooling (ESLint, Prettier)
- Learn Hono framework basics (edge-ready setup)
- Get basic React app with MapLibre rendering

**Implementation Tasks (Execute Manually):**

1. **Create directory structure**
   ```bash
   # From project root
   mkdir -p api/src/{routes,lib/{orchestrator,llm,db},types}
   mkdir -p web/src/{components/{ChatPanel,MapView,ResultsPanel,QueryExplainer},hooks,lib,types,styles}
   mkdir -p shared/types
   mkdir -p scripts
   mkdir -p api/data
   ```

2. **Initialize API project**
   ```bash
   cd api
   npm init -y
   npm install hono @hono/node-server
   npm install -D typescript @types/node tsx nodemon
   ```

3. **Create `api/tsconfig.json`** (edge-ready, strict mode)
   ```json
   {
     "compilerOptions": {
       "target": "ES2022",
       "module": "ESNext",
       "lib": ["ES2022"],
       "moduleResolution": "NodeNext",
       "strict": true,
       "noUncheckedIndexedAccess": true,
       "noImplicitReturns": true,
       "esModuleInterop": true,
       "skipLibCheck": true,
       "forceConsistentCasingInFileNames": true,
       "outDir": "./dist",
       "rootDir": "./src"
     },
     "include": ["src/**/*"],
     "exclude": ["node_modules", "dist"]
   }
   ```

4. **Create `api/src/index.ts`** (basic Hono app with server)
   
   **Important**: If the file already exists with corrupted content (markdown code blocks), replace it entirely with this clean code:
   
   ```typescript
   import { Hono } from 'hono';
   import { serve } from '@hono/node-server';

   const app = new Hono();

   app.get('/api/health', (c) => {
     return c.json({ status: 'ok' });
   });

   const port = Number(process.env.PORT) || 3000;
   console.log(`Server is running on port ${port}`);

   serve({
     fetch: app.fetch,
     port,
   });
   ```
   
   **Note**: The `@hono/node-server` package should already be installed from step 2. If not, run:
   ```bash
   npm install @hono/node-server
   ```

5. **Add scripts to `api/package.json`**
   
   **Important**: If `package.json` already has a `"scripts"` key, merge the new scripts into the existing one. Do NOT create a duplicate `"scripts"` key (invalid JSON).
   
   The scripts section should look like:
   ```json
   {
     "scripts": {
       "dev": "tsx watch src/index.ts",
       "build": "tsc",
       "typecheck": "tsc --noEmit",
       "start": "node dist/index.js"
     }
   }
   ```
   
   If you see a duplicate `"scripts"` key, remove one and merge the contents.

6. **Initialize Web project**
   ```bash
   cd ../web
   npm create vite@latest . -- --template react-ts
   npm install
   npm install maplibre-gl
   npm install -D @types/maplibre-gl
   ```

7. **Update `web/tsconfig.app.json`** (add strict options)
   ```json
   {
     "compilerOptions": {
       // ... existing Vite options ...
       "strict": true,  // Already present
       "noUncheckedIndexedAccess": true,  // Add this
       "noImplicitReturns": true,  // Add this
       // Note: moduleResolution stays "bundler" (Vite's default, not "NodeNext")
     }
   }
   ```
   
   **Note**: Vite uses project references (`tsconfig.app.json` for app code, `tsconfig.node.json` for config). Update `tsconfig.app.json`, not the root `tsconfig.json`.

8. **Create `web/src/components/MapView/index.tsx`** (basic map)
   ```typescript
   import { useEffect, useRef } from 'react';
   import maplibregl from 'maplibre-gl';
   import 'maplibre-gl/dist/maplibre-gl.css';

   export function MapView() {
     const mapContainer = useRef<HTMLDivElement>(null);
     const map = useRef<maplibregl.Map | null>(null);

     useEffect(() => {
       if (!mapContainer.current || map.current) return;

       map.current = new maplibregl.Map({
         container: mapContainer.current,
         style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
         center: [-105.94, 35.69], // Santa Fe
         zoom: 12,
       });

       return () => map.current?.remove();
     }, []);

     return <div ref={mapContainer} style={{ width: '100%', height: '100vh' }} />;
   }
   ```
   
   **Note**: Create the file at `web/src/components/MapView/index.tsx` (the directory should already exist from step 1).

9. **Update `web/src/App.tsx`** (use MapView)
   ```typescript
   import { MapView } from './components/MapView';
   import './App.css';

   function App() {
     return <MapView />;
   }

   export default App;
   ```
   
   **Note**: Replace the default Vite template content with this. The `App.css` import can stay for future styling.

10. **Set up ESLint/Prettier** (both projects)
    ```bash
    # In api/
    cd ../api
    npm install -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin prettier eslint-config-prettier

    # In web/
    cd ../web
    npm install -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin prettier eslint-config-prettier
    ```

11. **Create `.eslintrc.json`** (in both `api/` and `web/`)
    ```json
    {
      "parser": "@typescript-eslint/parser",
      "extends": [
        "eslint:recommended",
        "plugin:@typescript-eslint/recommended",
        "prettier"
      ],
      "rules": {
        "@typescript-eslint/no-explicit-any": "error",
        "@typescript-eslint/no-unused-vars": "warn"
      }
    }
    ```

12. **Add lint scripts** (to both `package.json` files)
    ```json
    {
      "scripts": {
        "lint": "eslint src --ext .ts,.tsx",
        "format": "prettier --write \"src/**/*.{ts,tsx}\""
      }
    }
    ```

13. **Test setup**
    ```bash
    # Terminal 1: Start API
    cd api
    npm run dev
    # Should start on port 3000 (or configured port)

    # Terminal 2: Start Web
    cd web
    npm run dev
    # Should start on port 5173

    # Terminal 3: Test API
    curl http://localhost:3000/api/health
    # Should return: {"status":"ok"}
    ```

14. **Verify**
    - [ ] API runs: `npm run dev` in `api/` starts without errors
    - [ ] Web runs: `npm run dev` in `web/` starts without errors
    - [ ] Map renders: Open `http://localhost:5173`, see map centered on Santa Fe
    - [ ] Health check: `curl http://localhost:3000/api/health` returns `{"status":"ok"}`
    - [ ] TypeScript: `npm run typecheck` passes in both projects
    - [ ] Linting: `npm run lint` passes in both projects

**Learning Resources:**
- [TypeScript Handbook - Strict Mode](https://www.typescriptlang.org/docs/handbook/tsconfig-json.html#strict)
- [Hono Documentation](https://hono.dev/)
- [MapLibre GL JS Docs](https://maplibre.org/maplibre-gl-js/docs/)

**Deliverables:**
- [ ] Directory structure created (`api/`, `web/`, `shared/`, `scripts/`)
- [ ] Both `api/` and `web/` run with `npm run dev`
- [ ] `npm run typecheck` passes with zero errors in both projects
- [ ] `npm run lint` passes in both projects
- [ ] Map renders centered on Santa Fe (-105.94, 35.69) at `http://localhost:5173`
- [ ] `/api/health` returns `{ status: 'ok' }` at `http://localhost:3000/api/health`

---

#### Week 2: Domain Types + Data Pipeline

**Learning Objectives:**
- Understand GeoJSON types and spatial data structures
- Learn DuckDB spatial extension
- Master CRS (Coordinate Reference Systems) concepts
- Practice data transformation and validation

**Implementation Tasks:**

1. **Define domain types** (`shared/types/geo.ts`)
   - Parcel, Census Tract, Hydrology types
   - **Housing-focused types**: Short-term rentals, vacancy status, affordable housing, eviction filings
   - Layer schema registry
   - Type guards for runtime validation

2. **Set up DuckDB with dual-geom CRS handling**
   - Install `duckdb` and `@duckdb/node-api`
   - Learn spatial extension syntax
   - Create initialization script with **dual geometry columns**:
     - `geom_4326` (WGS84) for interchange/map display
     - `geom_utm13` (EPSG:32613) for metric operations (distance, buffer, nearest)
   - Enforce SRID checks on ingest; fail fast on unknown/missing SRID

3. **Create data preparation script** (`scripts/prepare-data.ts`)
   - Research Santa Fe data sources (see DATA_SOURCES.md — **note TBDs need filling**)
   - Download sample datasets (or use mock data initially to unblock)
   - Transform CRS: WGS84 + UTM 13N (dual geometry approach)
   - Export to GeoParquet
   - Generate `data/manifest.json` with layer name, CRS, extent, fields, counts
   - Record provenance/update cadence/licensing in `docs/DATA_SOURCES.md`

4. **Implement `/api/layers` endpoint**
   - Return available layers and schemas
   - Validate against type definitions
   - Include housing-focused layers in schema registry

**Learning Resources:**
- [DuckDB Spatial Extension](https://duckdb.org/docs/extensions/spatial.html)
- [GeoJSON Specification](https://geojson.org/)
- [Understanding CRS](https://docs.qgis.org/latest/en/docs/gentle_gis_introduction/coordinate_reference_systems.html)
- [GeoParquet Format](https://github.com/opengeospatial/geoparquet)

**Data Acquisition Strategy:**
- **Start with mock/sample data** to unblock development
- **Research real sources** in parallel:
  - Santa Fe County Assessor (parcels)
  - US Census Bureau (census tracts)
  - City of Santa Fe GIS (zoning, hydrology)
  - **Housing-focused sources**: STR platforms, housing departments, court records (see DATA_SOURCES.md)
- **Document findings** in `docs/DATA_SOURCES.md` — **Note**: Many entries are TBD and need filling as data is acquired
- **Fill TBDs** for sources, licensing, update cadence to enable proper attribution and credibility

**Deliverables:**
- [ ] Domain types defined in `shared/types/geo.ts`
- [ ] DuckDB initializes with spatial extension
- [ ] At least one layer loaded (parcels or census_tracts)
- [ ] `/api/layers` returns layer schemas
- [ ] Data manifest documents CRS and schema

---

### Phase 2: Core Query System (Weeks 3-4)

#### Week 3: Spatial Query Builder

**Learning Objectives:**
- Build type-safe SQL query builders
- Understand spatial operations (distance, intersects, contains)
- Master parameterized queries (security)
- Learn Zod for runtime validation

**Implementation Tasks:**
1. **Define StructuredQuery types** (`shared/types/query.ts`)
   - Attribute filters, spatial filters, aggregates
   - **Temporal queries**: `baseline`, `comparison`, `metric` (e.g., "Change in assessed value since 2018")
   - Logical operators (and/or)
   - Type-safe discriminated unions
   - Reference ARCHITECTURE.md for complete schema

2. **Create Zod validation schemas**
   - Validate LLM output before execution
   - Catch invalid queries early
   - Include temporal query validation

3. **Build QueryBuilder class**
   - Convert StructuredQuery → SQL
   - **CRS-aware**: Choose correct geometry (UTM 13N for distance/buffer/nearest, WGS84 for intersects/contains/within)
   - Parameterized queries (no SQL injection)
   - Support aggregates (groupBy + metrics)
   - **Support temporal comparisons** (baseline vs comparison metrics)

4. **Create `/api/query` endpoint**
   - Accept structured queries directly
   - Execute and return GeoJSON
   - Handle temporal queries (guard when time-stamped metrics unavailable)

5. **Write unit tests**
   - Test query builder edge cases
   - Test CRS selection logic (projected vs geographic)
   - Test temporal query building

**Learning Resources:**
- [Zod Documentation](https://zod.dev/)
- [SQL Injection Prevention](https://owasp.org/www-community/attacks/SQL_Injection)
- [PostGIS Spatial Functions](https://postgis.net/docs/reference.html) (concepts apply to DuckDB)

**Deliverables:**
- [ ] StructuredQuery type with all operations
- [ ] Zod validation catches invalid queries
- [ ] QueryBuilder produces correct SQL
- [ ] `/api/query` executes and returns GeoJSON
- [ ] 5+ unit tests passing

---

#### Week 4: LLM Integration

**Learning Objectives:**
- Integrate local LLM (Ollama) with application
- Design effective prompts for structured output
- Handle LLM errors gracefully
- Understand few-shot learning

**Implementation Tasks:**
1. **Set up Ollama**
   - Install Ollama locally
   - Pull model (`qwen2.5:7b` or `llama3.1:8b`)
   - Test API connectivity

2. **Create LLM client abstraction**
   - Interface for swappable providers
   - Ollama implementation
   - Error handling

3. **Build IntentParser**
   - Design prompt with layer schemas (include housing-focused layers)
   - Few-shot examples (include housing equity examples: "vacant parcels near transit", "STR density by neighborhood")
   - JSON extraction and validation
   - Confidence scoring
   - **Support temporal queries** in prompt examples

4. **Test parsing quality**
   - 10+ test queries (include housing-focused queries)
   - Document success/failure cases
   - Iterate on prompt

**Learning Resources:**
- [Ollama Documentation](https://ollama.ai/)
- [Prompt Engineering Guide](https://www.promptingguide.ai/)
- [JSON Mode for LLMs](https://jsonmode.com/)

**Deliverables:**
- [ ] Ollama running with chosen model
- [ ] LLMClient interface with Ollama implementation
- [ ] IntentParser converts NL → StructuredQuery
- [ ] 10+ test queries documented
- [ ] Confidence scoring implemented

---

### Phase 3: User Interface (Weeks 5-6)

#### Week 5: Map UI + Results Display

**Learning Objectives:**
- Build React components with TypeScript
- Integrate MapLibre GL JS
- Manage component state effectively
- Handle async operations (API calls)

**Implementation Tasks:**
1. **Create API client** (`web/src/lib/api.ts`)
   - Type-safe fetch wrappers
   - Error handling
   - Loading states

2. **Build ChatPanel component**
   - Message history
   - Input handling
   - Loading indicators
   - Error display

3. **Build MapView component**
   - MapLibre initialization
   - Base layers
   - Results layer
   - Feature highlighting

4. **Build ResultsPanel component**
   - Feature table
   - Property display
   - Click interactions

5. **Wire up App component**
   - State management
   - Component communication
   - Layout

**Learning Resources:**
- [React TypeScript Cheatsheet](https://react-typescript-cheatsheet.netlify.app/)
- [MapLibre Examples](https://maplibre.org/maplibre-gl-js-docs/example/)
- [React Hooks Best Practices](https://react.dev/reference/react)

**Deliverables:**
- [ ] ChatPanel with message history
- [ ] MapView displays results
- [ ] ResultsPanel shows feature table
- [ ] Click interactions work (map ↔ table)
- [ ] Responsive layout

---

#### Week 6: End-to-End Orchestration

**Learning Objectives:**
- Integrate all components
- Handle edge cases
- Implement logging and metrics
- Optimize performance

**Implementation Tasks:**
1. **Create `/api/chat` endpoint**
   - Full orchestration flow
   - Error handling
   - Response formatting

2. **Build ResultExplainer** (equity-aware)
   - Generate contextual summaries with **equity lens**
   - Consider: income correlations, neighborhood disparities, historical context (redlining, displacement)
   - Example: "Found 47 residential parcels within 500m of arroyos, primarily in the Agua Fria area; these overlap lower-income tracts and may indicate flood risk near affordable units."
   - Reference ARCHITECTURE.md for equity-aware prompt template

3. **Add QueryExplainer component**
   - Show structured query
   - Help users understand system

4. **Handle edge cases**
   - Empty results
   - Too many results
   - Unknown layers/fields
   - LLM failures

5. **Add query caching**
   - In-memory LRU cache
   - Reduce LLM calls

6. **Implement logging/metrics**
   - Request IDs
   - Query hashes
   - Latency tracking

**Learning Resources:**
- [Error Handling Patterns](https://kentcdodds.com/blog/get-a-catch-block-error-message-with-typescript)
- [Performance Optimization](https://web.dev/performance/)

**Deliverables:**
- [ ] `/api/chat` works end-to-end
- [ ] ResultExplainer generates summaries
- [ ] QueryExplainer shows executed query
- [ ] Error handling with helpful messages
- [ ] Logging/metrics in place
- [ ] Demo: NL query → map results

---

### Phase 4: Production Readiness (Weeks 7-8)

#### Week 7: Testing + Security

**Learning Objectives:**
- Write comprehensive tests
- Implement security best practices
- Handle errors gracefully
- Monitor application health

**Implementation Tasks:**
1. **Expand test coverage**
   - Unit tests for query builder
   - Component tests
   - Integration tests

2. **Add error boundaries**
   - React error boundary
   - API error responses

3. **Implement security**
   - API key authentication
   - CORS configuration
   - Rate limiting
   - Parameter validation/caps

4. **Add observability**
   - Structured logging
   - Health checks
   - Metrics endpoint

**Learning Resources:**
- [Vitest Documentation](https://vitest.dev/)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [React Error Boundaries](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary)

**Deliverables:**
- [ ] 80%+ test coverage
- [ ] Error boundary in React app
- [ ] API key + CORS + rate limits
- [ ] Request logging
- [ ] All tests pass

---

#### Week 8: Deployment + Polish

**Learning Objectives:**
- Deploy to production
- Configure production LLM
- Document the project
- Create portfolio-ready demo

**Implementation Tasks:**
1. **Dockerize API**
   - Create Dockerfile
   - Include data files
   - Test locally

2. **Deploy API**
   - Railway or Fly.io
   - Environment variables
   - Health checks

3. **Deploy frontend**
   - Vercel or Cloudflare Pages
   - Environment configuration

4. **Swap LLM provider**
   - Together.ai or Groq
   - Test in production

5. **Documentation**
   - Update README
   - Add setup instructions
   - Document architecture

6. **Polish**
   - Loading animations
   - Empty states
   - Mobile responsive
   - Favicon/meta tags

**Learning Resources:**
- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)
- [Railway Documentation](https://docs.railway.app/)
- [Vercel Documentation](https://vercel.com/docs)

**Deliverables:**
- [ ] API deployed and accessible
- [ ] Frontend deployed and accessible
- [ ] LLM working in production
- [ ] README complete
- [ ] 5+ example queries work
- [ ] Demo video (optional)

---

### Phase 5: Housing Equity Features (Week 9 - Stretch)

**Goal**: Ship housing-focused capabilities that surface affordability and equity insights.

**Note**: See BUILD_PLAN.md Week 9 for complete details. This is a stretch goal after core functionality is complete.

**Key Tasks:**
1. **Add housing datasets**
   - Short-term rentals (Airbnb/VRBO), vacancy status, affordable housing units, transit, eviction filings, historic districts, flood/wildfire risk
   - Document provenance, update frequency, and licensing in `docs/DATA_SOURCES.md` (fill remaining TBDs)

2. **Implement aggregation queries** (if not already complete)
   - Group-by + metrics in `StructuredQuery.aggregate` (count/avg/median)
   - Validate allowed fields/ops; cap group cardinality

3. **Pre-built analysis templates**
   - Add 3–5 templates: STR density, affordability gap, vacancy hotspots, transit proximity
   - Expose in UI as quick-start cards; show underlying structured query for transparency

4. **Visualization for aggregates**
   - Choropleth/graduated symbol rendering for grouped results
   - Legend with metric ranges
   - **Note**: User preference for standardized values (percentages) over raw counts in choropleths

5. **Exports and reporting**
   - Export options: GeoJSON/CSV/PDF with query + explanation
   - PDF: map snapshot + summary + table for council/community use

**Deliverables:**
- [ ] New housing layers loaded and documented
- [ ] Aggregation supported end-to-end
- [ ] Templates available in UI with explanations
- [ ] Choropleth/graduated symbol for aggregate views
- [ ] Export (GeoJSON/CSV) and simple PDF report

---

## Knowledge Gaps & Learning Path

### Prerequisites Assessment

**Required Knowledge:**
- ✅ TypeScript basics
- ✅ React basics
- ✅ Node.js/npm
- ⚠️ Spatial databases (DuckDB/PostGIS) — **Learn as you go**
- ⚠️ Coordinate Reference Systems — **Learn as you go**
- ⚠️ LLM integration — **Learn as you go**
- ⚠️ Map rendering (MapLibre) — **Learn as you go**

### Recommended Learning Sequence

1. **Before Week 1:**
   - Review TypeScript strict mode features
   - Read Hono quickstart
   - Install Ollama and test a model

2. **During Week 2:**
   - Study CRS concepts (WGS84 vs UTM)
   - Read DuckDB spatial docs
   - Practice with sample GeoJSON data

3. **During Week 3:**
   - Study SQL injection prevention
   - Learn Zod validation patterns
   - Review spatial operation concepts

4. **During Week 4:**
   - Study prompt engineering
   - Practice with Ollama API
   - Learn JSON extraction from LLM output

5. **During Week 5:**
   - Review React hooks patterns
   - Study MapLibre examples
   - Practice component composition

---

## Risk Mitigation

### Technical Risks

| Risk | Mitigation |
|------|------------|
| Data acquisition delays | Start with mock data, research real sources in parallel |
| LLM parsing quality | Iterate on prompts, add validation, provide fallbacks |
| DuckDB spatial limitations | Test early, have PostGIS as backup plan |
| Performance issues | Cache queries, limit result sizes, optimize queries |

### Learning Risks

| Risk | Mitigation |
|------|------------|
| Spatial concepts unfamiliar | Allocate extra time Week 2, use external resources |
| LLM integration complexity | Start simple, iterate, use proven patterns |
| TypeScript strict mode errors | Enable gradually, fix as you go |

---

## Success Metrics

### Week-by-Week Checkpoints

- **Week 1**: Both apps run, types check, map renders
- **Week 2**: Data loaded, DuckDB working, layers endpoint returns schemas
- **Week 3**: Query builder works, tests pass, can execute structured queries
- **Week 4**: LLM parses queries correctly, confidence scoring works
- **Week 5**: UI components built, can send queries and see results
- **Week 6**: End-to-end flow works, explanations generated
- **Week 7**: Tests pass, security in place, errors handled
- **Week 8**: Deployed, documented, demo-ready

### Final Success Criteria

1. ✅ Type a natural language query → see results on map
2. ✅ Understand what query was executed (transparency)
3. ✅ Get plain-English explanation of results
4. ✅ Code is type-safe, tested, and documented
5. ✅ Application is deployed and accessible

---

## Next Steps

### Immediate Actions (This Week)

1. **Set up development environment**
   ```bash
   # Install Node.js 20+ if not already
   # Install Ollama
   # Clone/verify repo structure
   ```

2. **Begin Week 1 tasks**
   - Create directory structure
   - Initialize TypeScript projects
   - Set up basic Hono API
   - Set up basic React app

3. **Research data sources**
   - Contact Santa Fe County/City GIS departments
   - Find public data portals
   - Document findings in DATA_SOURCES.md

4. **Set up learning resources**
   - Bookmark documentation sites
   - Set up development environment
   - Install required tools

### Week 1 Focus Areas

- **TypeScript**: Master strict mode, understand type safety
- **Hono**: Learn routing and middleware
- **MapLibre**: Get map rendering working
- **Tooling**: Configure ESLint, Prettier, scripts

---

## Resources & References

### Documentation
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [DuckDB Spatial](https://duckdb.org/docs/extensions/spatial.html)
- [MapLibre GL JS](https://maplibre.org/maplibre-gl-js/docs/)
- [Hono Framework](https://hono.dev/)
- [Ollama](https://ollama.ai/)
- [Zod](https://zod.dev/)

### Learning Materials
- [Effective TypeScript](https://effectivetypescript.com/) (book)
- [PostGIS in Action](https://www.postgis.us/) (spatial concepts)
- [Prompt Engineering Guide](https://www.promptingguide.ai/)

### Community
- DuckDB Discord
- MapLibre Slack
- TypeScript Discord

---

## Notes

- **Start simple**: Get basic flow working before adding complexity
- **Iterate on prompts**: LLM integration requires experimentation
- **Test early**: Write tests as you build, not after
- **Document decisions**: Note why you made choices
- **Ask for help**: Use community resources when stuck

---

**Last Updated**: Based on planning docs review  
**Next Review**: After Week 1 completion
