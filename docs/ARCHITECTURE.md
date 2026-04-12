# Parcela — Technical Architecture

A tool for investigating housing affordability, land use patterns, and equity in Santa Fe, NM through natural language spatial queries. Users ask questions like "Which parcels are within 500m of an arroyo and zoned residential?" and receive map-rendered results with explanations.

---

## Design Principles

1. **Constrained query space** — Support a defined set of spatial operations, not arbitrary SQL. This makes LLM translation tractable and results predictable.

2. **Type-safe end-to-end** — TypeScript from frontend to API to query builder. Types are the contract between LLM output and spatial execution.

3. **Portable infrastructure** — DuckDB (single file) over PostGIS. Deployable to Railway/Fly without database provisioning.

4. **Swappable LLM** — Ollama locally, Together.ai/Groq in production. Same interface, different backend.

5. **Auditable results** — Every query shows the structured operation that was executed, not just results. Users can verify what the system did.

6. **Explicit CRS discipline** — Store geometries in WGS84 (EPSG:4326) for interchange, but run distance/buffer/nearest operations in a projected CRS (UTM 13N, EPSG:32613) to keep meters correct.

---

## Project Goals

This tool serves two purposes:

1. **Technical learning** — Building a full-stack spatial application with LLM integration.
2. **Community impact** — Providing accessible tools for understanding Santa Fe's housing challenges.

### Housing Questions We Aim to Help Answer

- Where is housing stock being converted to short-term rentals?
- Which neighborhoods have seen the steepest price increases?
- Where is affordable housing located relative to jobs and transit?
- What land is zoned for housing but sitting vacant?
- How do zoning restrictions affect housing supply?
- Where do eviction filings, transit access, and affordable housing intersect?

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React)                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │  Chat UI    │  │  MapLibre   │  │  Results Panel          │ │
│  │  (input +   │  │  GL JS      │  │  (table + explanation)  │ │
│  │  history)   │  │  (map view) │  │                         │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        API (Hono/TS)                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │  /chat      │  │  /query     │  │  /layers                │ │
│  │  (NL input) │  │  (direct)   │  │  (available datasets)   │ │
│  └──────┬──────┘  └─────────────┘  └─────────────────────────┘ │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                  Query Orchestrator                         ││
│  │  1. Parse NL → structured intent (LLM)                      ││
│  │  2. Validate intent against schema                          ││
│  │  3. Build spatial query (typed query builder)               ││
│  │  4. Execute against DuckDB                                  ││
│  │  5. Format response + generate explanation (LLM)            ││
│  └─────────────────────────────────────────────────────────────┘│
│         │                         │                             │
│         ▼                         ▼                             │
│  ┌─────────────┐           ┌─────────────┐                     │
│  │  LLM Client │           │  DuckDB     │                     │
│  │  (Ollama /  │           │  (spatial)  │                     │
│  │  Together)  │           │             │                     │
│  └─────────────┘           └─────────────┘                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Core Components

### Frontend (`/web`)

**Stack:** React 18 + TypeScript + Vite + MapLibre GL JS + TailwindCSS

**Key modules:**

| Module | Responsibility |
|--------|----------------|
| `ChatPanel` | Message input, history display, loading states |
| `MapView` | MapLibre instance, layer management, feature highlighting |
| `ResultsPanel` | Tabular results, feature details on click |
| `QueryExplainer` | Shows the structured query that was executed |

**State management:** Zustand or React Context — keep it simple. Core state:

```typescript
interface AppState {
  messages: ChatMessage[];
  currentQuery: StructuredQuery | null;
  queryResult: QueryResult | null;
  selectedFeature: GeoJSON.Feature | null;
  visibleLayers: string[];
}
```

**Map interaction pattern:**
- Base layers: parcels, census tracts, hydrology, zoning (loaded as vector tiles or GeoJSON)
- Query results rendered as a highlight layer
- Click on feature → populate ResultsPanel

**Housing-focused data layers (recommended):**

| Layer | Purpose |
|-------|---------|
| `short_term_rentals` | Airbnb/VRBO impact on housing stock |
| `affordable_housing_units` | Locations of deed-restricted or income-restricted units |
| `vacancy_status` | Vacant parcels/structures from assessor data |
| `eviction_filings` | Geocoded court records for housing stability |
| `transit_access` | Bus routes/stops for housing + transit equity |
| `school_zones` | Family housing considerations |
| `historic_districts` | Development constraints |
| `flood_zones` / `wildfire_risk` | Climate risks intersecting housing |
| `water_rights` / `acequia_service` | NM-specific development considerations |
---

### API (`/api`)

**Stack:** Hono (lightweight, edge-ready) + TypeScript + Zod for validation

**Endpoints:**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/chat` | POST | Accept NL query, return structured result + explanation |
| `/api/query` | POST | Accept structured query directly (bypass LLM) |
| `/api/layers` | GET | Return available layers and their schemas |
| `/api/health` | GET | Service status |

**Request/response types:**

```typescript
// POST /api/chat
interface ChatRequest {
  message: string;
  conversationId?: string;
}

interface ChatResponse {
  query: StructuredQuery;      // What we executed
  result: QueryResult;         // GeoJSON + stats
  explanation: string;         // Human-readable summary
  confidence: number;          // How sure we are about the parse
  suggestions?: string[];      // "Did you mean..." alternatives
}

// Query result shape
interface QueryResult {
  type: 'FeatureCollection';
  features: GeoJSON.Feature[];
  metadata: {
    count: number;
    executionTimeMs: number;
    queryHash: string;         // For caching/debugging
  };
}
```

---

### Query Orchestrator (`/api/lib/orchestrator`)

The core logic that translates NL → structured query → results.

**Step 1: Intent Parsing (LLM)**

Prompt the LLM with:
- Available layers and their attributes
- Supported spatial operations
- Few-shot examples

Output: a `StructuredQuery` object (JSON).

**Step 2: Validation**

Zod schema validates the LLM output before execution. If invalid, return error with suggestions.

**Step 3: Query Building**

Type-safe query builder constructs DuckDB SQL from `StructuredQuery`. Chooses projected geometry (`geom_utm13`) for metric ops and geographic (`geom_4326`) for intersects/contains. Supports aggregation when `aggregate` is present (group + metrics) and guards temporal comparisons behind available metrics. No string interpolation — parameterized queries only.

**Step 4: Execution**

Run against DuckDB, return GeoJSON.

**Step 5: Explanation Generation (LLM)**

Given the query and results, generate a 2-3 sentence explanation that includes an equity lens where applicable: "Found 47 residential parcels within 500m of arroyos, primarily in the Agua Fria area; these overlap lower-income tracts and may indicate flood risk near affordable units."

Example equity-aware prompt:

```text
Given this spatial query about Santa Fe housing/land use, write a 2-3 sentence explanation.

Consider equity implications:
- Does this pattern correlate with income levels?
- Are certain neighborhoods disproportionately affected?
- What historical context (redlining, displacement) might be relevant?

Query: {QUERY}
Result count: {COUNT}
Sample features: {SAMPLE}
```

---

### Structured Query Schema

The constrained query language. This is what the LLM outputs and what we execute.

```typescript
type LogicalOp = 'and' | 'or';

// Supported spatial operations
type SpatialOp = 
  | 'within_distance'    // Features within X meters of Y
  | 'intersects'         // Features that intersect Y
  | 'contains'           // Features that contain Y
  | 'within'             // Features within Y boundary
  | 'nearest'            // N nearest features to point/feature

// Supported attribute filters
type AttributeOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'like';

interface AttributeFilter {
  field: string;
  op: AttributeOp;
  value: string | number | (string | number)[];
}

interface SpatialFilter {
  op: SpatialOp;
  targetLayer: string;
  targetFilter?: AttributeFilter[];  // Optional filter on target
  distance?: number;                  // For within_distance (meters)
  limit?: number;                     // For nearest
}

interface AggregateMetric {
  field: string;
  op: 'count' | 'sum' | 'avg' | 'median' | 'min' | 'max';
  alias?: string;
}

interface AggregateSpec {
  groupBy: string[];
  metrics: AggregateMetric[];
}

interface TemporalQuery {
  baseline: { year: number } | { date: string };
  comparison: { year: number } | { date: string };
  metric: string; // e.g., 'assessed_value', 'str_count'
}

interface StructuredQuery {
  selectLayer: string;                // Primary layer to query
  selectFields?: string[];            // Fields to return (default: all)
  attributeFilters?: AttributeFilter[];
  attributeLogic?: LogicalOp;         // Default: 'and'
  spatialFilters?: SpatialFilter[];   // Combine with spatialLogic (default: 'and')
  spatialLogic?: LogicalOp;
  aggregate?: AggregateSpec;          // Optional aggregation (group/metrics)
  temporal?: TemporalQuery;           // Optional before/after comparison
  limit?: number;
  orderBy?: { field: string; direction: 'asc' | 'desc' };
}
```

**Example queries this supports:**

| Natural Language | Structured Query |
|------------------|------------------|
| "Show all residential parcels" | `{ selectLayer: 'parcels', attributeFilters: [{ field: 'zoning', op: 'eq', value: 'R-1' }] }` |
| "Parcels within 500m of Santa Fe River" | `{ selectLayer: 'parcels', spatialFilters: [{ op: 'within_distance', targetLayer: 'hydrology', targetFilter: [{ field: 'name', op: 'like', value: '%Santa Fe River%' }], distance: 500 }], spatialLogic: 'and' }` |
| "Census tracts with median income below $40k" | `{ selectLayer: 'census_tracts', attributeFilters: [{ field: 'median_income', op: 'lt', value: 40000 }] }` |
| "5 nearest parcels to downtown plaza" | `{ selectLayer: 'parcels', spatialFilters: [{ op: 'nearest', targetLayer: 'pois', targetFilter: [{ field: 'name', op: 'eq', value: 'Santa Fe Plaza' }], limit: 5 }] }` |
| "Parcels within 500m of arroyos and inside floodplain" | `{ selectLayer: 'parcels', spatialFilters: [ { op: 'within_distance', targetLayer: 'hydrology', targetFilter: [{ field: 'type', op: 'like', value: '%arroyo%' }], distance: 500 }, { op: 'intersects', targetLayer: 'floodplain' } ], spatialLogic: 'and' }` |
| "Median assessed value by zoning district" | `{ selectLayer: 'parcels', aggregate: { groupBy: ['zoning'], metrics: [{ field: 'assessed_value', op: 'median', alias: 'median_value' }] } }` |
| "Vacant residential parcels within 800m of transit stops" | `{ selectLayer: 'vacancy_status', attributeFilters: [{ field: 'land_use', op: 'eq', value: 'residential' }], spatialFilters: [{ op: 'within_distance', targetLayer: 'transit_access', distance: 800 }], spatialLogic: 'and' }` |
| "Change in assessed value near the Railyard since 2018" | `{ selectLayer: 'parcels', spatialFilters: [{ op: 'within_distance', targetLayer: 'pois', targetFilter: [{ field: 'name', op: 'like', value: '%Railyard%' }], distance: 800 }], temporal: { baseline: { year: 2018 }, comparison: { year: 2024 }, metric: 'assessed_value' } }` |

**Composition notes:**
- If multiple `spatialFilters` are provided, they combine with `spatialLogic` (default `and`).
- `attributeLogic` defaults to `and`. No nested parentheses for v1; keep to flat conjunction/disjunction.
- `aggregate` enables group/metric calculations (e.g., counts by zoning). Use sparingly to keep UI simple.
- `temporal` is optional and assumes availability of time-stamped metrics; UI should guard when absent.
- LLM prompt should bias toward a single select layer with multiple predicates instead of multi-join fanout.

### Analysis Templates (curated queries)

```typescript
interface AnalysisTemplate {
  id: string;
  name: string;
  description: string;
  query: StructuredQuery;
  visualizationType: 'choropleth' | 'graduated_symbol' | 'heatmap';
}

const HOUSING_TEMPLATES: AnalysisTemplate[] = [
  {
    id: 'str-density',
    name: 'Short-Term Rental Density',
    description: 'Concentration of Airbnb/VRBO listings by neighborhood',
    query: { selectLayer: 'short_term_rentals', aggregate: { groupBy: ['neighborhood'], metrics: [{ field: '*', op: 'count', alias: 'count' }] } },
    visualizationType: 'choropleth',
  },
  {
    id: 'affordability-gap',
    name: 'Affordability Gap Analysis',
    description: 'Compare median income to median home price by tract',
    query: { selectLayer: 'census_tracts', aggregate: { groupBy: ['geoid'], metrics: [{ field: 'median_income', op: 'median', alias: 'income' }, { field: 'median_home_price', op: 'median', alias: 'home_price' }] } },
    visualizationType: 'choropleth',
  },
  {
    id: 'vacancy-hotspots',
    name: 'Vacant Parcel Analysis',
    description: 'Identify concentrations of vacant land zoned residential',
    query: { selectLayer: 'vacancy_status', attributeFilters: [{ field: 'land_use', op: 'eq', value: 'residential' }], aggregate: { groupBy: ['zoning'], metrics: [{ field: '*', op: 'count', alias: 'vacant_count' }] } },
    visualizationType: 'graduated_symbol',
  },
];
```

---

### LLM Client (`/api/lib/llm`)

Abstraction over LLM providers. Same interface for local Ollama and hosted APIs.

```typescript
interface LLMClient {
  complete(prompt: string, options?: CompletionOptions): Promise<string>;
  completeJSON<T>(prompt: string, schema: z.ZodSchema<T>): Promise<T>;
}

interface CompletionOptions {
  temperature?: number;
  maxTokens?: number;
  stop?: string[];
}

// Factory function
function createLLMClient(config: LLMConfig): LLMClient {
  switch (config.provider) {
    case 'ollama':
      return new OllamaClient(config.baseUrl, config.model);
    case 'together':
      return new TogetherClient(config.apiKey, config.model);
    case 'groq':
      return new GroqClient(config.apiKey, config.model);
  }
}
```

**Model selection:**
- Local dev: Ollama with `qwen2.5:7b` or `llama3.1:8b`
- Production: Together.ai or Groq with same models (or larger)

---

### Spatial Database (`/api/lib/db`)

**DuckDB with spatial extension**

Why DuckDB over PostGIS:
- Single-file database, ships with the app
- Spatial extension supports ST_* functions
- Fast for analytical queries on static data
- No server to manage

**Data loading:**

Export Santa Fe datasets to GeoParquet or GeoJSON, load into DuckDB on startup:

```typescript
async function initDatabase(dbPath: string, dataDir: string): Promise<Database> {
  const db = await Database.create(dbPath);
  
  await db.exec(`INSTALL spatial; LOAD spatial;`);
  
  // Load layers: normalize to WGS84, plus projected geom for metric ops (UTM 13N)
  await db.exec(`
    CREATE TABLE parcels AS 
    SELECT
      *, 
      ST_Transform(ST_GeomFromWKB(geom), 4326) AS geom_4326,
      ST_Transform(ST_GeomFromWKB(geom), 32613) AS geom_utm13
    FROM ST_Read('${dataDir}/parcels.parquet');
  `);
  
  await db.exec(`
    CREATE TABLE census_tracts AS 
    SELECT
      *, 
      ST_Transform(ST_GeomFromWKB(geom), 4326) AS geom_4326,
      ST_Transform(ST_GeomFromWKB(geom), 32613) AS geom_utm13
    FROM ST_Read('${dataDir}/census_tracts.parquet');
  `);
  
  // ... other layers
  
  // Create spatial indexes (projected for distance, geographic for intersects)
  await db.exec(`CREATE INDEX parcels_geom_idx ON parcels USING RTREE (geom_utm13);`);
  await db.exec(`CREATE INDEX parcels_geom_geo_idx ON parcels USING RTREE (geom_4326);`);
  
  return db;
}
```

**Query builder output example (distance uses projected CRS):**

```sql
SELECT p.*, ST_AsGeoJSON(p.geom_4326) as geometry
FROM parcels p
WHERE p.zoning = 'R-1'
  AND ST_DWithin(
    p.geom_utm13,
    (SELECT ST_Union(ST_Transform(h.geom_4326, 32613)) FROM hydrology h WHERE h.name LIKE '%Santa Fe River%'),
    500
  )
LIMIT 100;
```

**CRS policy:**
- Canonical storage: WGS84 (`geom_4326`) for interchange and map display.
- Metric operations: use UTM 13N (`geom_utm13`) or geodesic helpers (e.g., `ST_DistanceSphere`) where appropriate.
- Ingest pipeline should enforce CRS checks and log mismatches; reject layers with missing SRID.

---

## Data Flow

```
User: "Which residential parcels are near the Santa Fe River?"
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 1. PARSE INTENT (LLM)                                           │
│    Prompt: system context + few-shot examples + user message    │
│    Output: StructuredQuery JSON                                 │
│    {                                                            │
│      selectLayer: 'parcels',                                    │
│      attributeFilters: [{ field: 'zoning', op: 'in',            │
│                           value: ['R-1','R-2','R-3'] }],        │
│      spatialFilters: [                                          │
│        {                                                        │
│          op: 'within_distance',                                 │
│          targetLayer: 'hydrology',                              │
│          targetFilter: [{ field: 'name', op: 'like',            │
│                           value: '%Santa Fe%' }],               │
│          distance: 200                                          │
│        }                                                        │
│      ],                                                         │
│      spatialLogic: 'and'                                        │
│    }                                                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. VALIDATE                                                     │
│    - Schema validation (Zod)                                    │
│    - Layer exists? Fields exist? Values reasonable?             │
│    - If invalid: return error + suggestions                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. BUILD QUERY                                                  │
│    QueryBuilder.fromStructured(query) → parameterized SQL       │
│    No string interpolation, type-safe construction              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. EXECUTE                                                      │
│    DuckDB spatial query → GeoJSON FeatureCollection             │
│    + timing metadata                                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. EXPLAIN (LLM)                                                │
│    Prompt: query + result count + sample features               │
│    Output: "Found 34 residential parcels within 200m of         │
│             Santa Fe River segments, concentrated in the        │
│             downtown and Agua Fria areas."                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 6. RESPOND                                                      │
│    {                                                            │
│      query: { ... },           // What we executed              │
│      result: { features: [...], metadata: {...} },              │
│      explanation: "Found 34 residential parcels...",            │
│      confidence: 0.9                                            │
│    }                                                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Directory Structure

```
parcela/
├── api/                          # Backend
│   ├── src/
│   │   ├── index.ts              # Hono app entry
│   │   ├── routes/
│   │   │   ├── chat.ts
│   │   │   ├── query.ts
│   │   │   └── layers.ts
│   │   ├── lib/
│   │   │   ├── orchestrator/
│   │   │   │   ├── index.ts
│   │   │   │   ├── parser.ts     # NL → StructuredQuery
│   │   │   │   ├── validator.ts
│   │   │   │   ├── builder.ts    # StructuredQuery → SQL
│   │   │   │   └── explainer.ts
│   │   │   ├── llm/
│   │   │   │   ├── index.ts
│   │   │   │   ├── ollama.ts
│   │   │   │   ├── together.ts
│   │   │   │   └── prompts/
│   │   │   │       ├── parse-intent.txt
│   │   │   │       └── explain-result.txt
│   │   │   └── db/
│   │   │       ├── index.ts
│   │   │       ├── init.ts
│   │   │       └── queries.ts
│   │   └── types/
│   │       ├── query.ts          # StructuredQuery types
│   │       ├── api.ts            # Request/response types
│   │       └── geo.ts            # GeoJSON + domain types
│   ├── data/                     # GeoParquet/GeoJSON source files
│   ├── tests/
│   ├── package.json
│   └── tsconfig.json
│
├── web/                          # Frontend
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── ChatPanel/
│   │   │   ├── MapView/
│   │   │   ├── ResultsPanel/
│   │   │   └── QueryExplainer/
│   │   ├── hooks/
│   │   │   ├── useChat.ts
│   │   │   └── useMap.ts
│   │   ├── lib/
│   │   │   └── api.ts            # API client
│   │   ├── types/
│   │   │   └── index.ts          # Shared with API via symlink or package
│   │   └── styles/
│   ├── public/
│   ├── package.json
│   └── tsconfig.json
│
├── shared/                       # Shared types (optional: can be npm package)
│   └── types/
│       ├── query.ts
│       └── api.ts
│
├── scripts/
│   ├── prepare-data.ts           # Export santa-fe data to GeoParquet
│   ├── seed-db.ts                # Initialize DuckDB
│   └── test-queries.ts           # Validate query patterns
│
├── docs/
│   ├── ARCHITECTURE.md           # This file
│   ├── BUILD_PLAN.md
│   └── QUERY_PATTERNS.md         # Supported query examples
│
├── docker-compose.yml            # Local dev: Ollama + app
├── Dockerfile                    # Production API build
├── .env.example
└── README.md
```

---

## Deployment Architecture

### Local Development

```
┌─────────────────┐     ┌─────────────────┐
│  Vite Dev       │     │  Hono Dev       │
│  (localhost:    │────▶│  (localhost:    │
│   5173)         │     │   3000)         │
└─────────────────┘     └────────┬────────┘
                                 │
                    ┌────────────┴────────────┐
                    │                         │
                    ▼                         ▼
           ┌─────────────────┐     ┌─────────────────┐
           │  Ollama         │     │  DuckDB         │
           │  (localhost:    │     │  (file:         │
           │   11434)        │     │   ./data/sf.db) │
           └─────────────────┘     └─────────────────┘
```

### Production (Railway / Fly.io)

```
┌─────────────────┐
│  Cloudflare     │
│  Pages / Vercel │──── Static frontend
└─────────────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│  Railway /      │     │  Together.ai /  │
│  Fly.io         │────▶│  Groq API       │
│  (API + DuckDB) │     │                 │
└─────────────────┘     └─────────────────┘
```

**Key deployment notes:**

1. **DuckDB ships with the container** — the database file is baked into the Docker image or loaded from object storage on startup. No managed database needed.

2. **LLM is external in production** — Ollama requires GPU; Together.ai/Groq are cheaper and faster for inference at this scale.

3. **Frontend is static** — deploy to any CDN.

4. **API footprint** — single-instance API + DuckDB to avoid DuckDB write contention. If scaling later, split stateless API pods from a single-writer DB process and treat the DB file as read-mostly.

5. **Environment switching:**
   ```
   # .env.local
   LLM_PROVIDER=ollama
   OLLAMA_BASE_URL=http://localhost:11434
   
   # .env.production
   LLM_PROVIDER=together
   TOGETHER_API_KEY=xxx
   ```

---

## Security Considerations

1. **Query injection** — The query builder never interpolates user input directly. All values are parameterized.

2. **LLM output validation** — Zod schema validates every LLM response before execution. Malformed output returns an error, not a crash.

3. **Rate limiting** — API endpoints rate-limited per IP (use Hono middleware or Cloudflare). Add per-endpoint budgets for `/api/chat` to cap LLM costs.

4. **Auth / CORS** — Even with public data, protect `/api/chat` and `/api/query` with an API key or simple token in production. Restrict CORS origins to the deployed frontend.

5. **No sensitive data** — Santa Fe parcels/census data is public. If adding private layers later, add auth and per-layer ACL checks.

6. **Abuse controls** — Cap max features/rows returned and max distance/limit parameters; log and reject oversized requests before LLM invocation.

7. **Auditing** — Persist hashed prompt/output pairs and `queryHash` for offline inspection; redact PII if user data is added later.

---

## Observability & Operations

- **Structured logging** — Log request id, queryHash, LLM provider/model, latency (LLM + DuckDB), and validation errors. Tie logs to feature counts to spot slow/large queries.
- **Health checks** — `/api/health` should verify DuckDB connectivity and LLM provider reachability (or report degraded).
- **Fallbacks** — On LLM errors/timeouts, retry with a cheaper/backup model; serve cached parsed queries when available.
- **Metrics** — Track parse success rate, validation reject rate, average/95p LLM latency, and DuckDB execution time. Use these to set alert thresholds.

---

## Data Pipeline & Reproducibility

- Document source datasets, download URLs, and expected CRS/SRID per layer.
- `scripts/prepare-data.ts` should: load source → enforce SRID → simplify if needed → export to GeoParquet → emit schema manifest (fields, types, CRS).
- Version layer manifests (e.g., `data/manifest.json`) so changes to schemas/CRS are diffable.
- If generating PMTiles for base layers, note the tile zoom ranges and simplification settings in the manifest.
- Maintain `docs/DATA_SOURCES.md` with provenance, update cadence, and license/attribution for each layer.

---

## Export & Reporting

```typescript
interface ExportOptions {
  format: 'geojson' | 'csv' | 'pdf_report';
  includeQuery: boolean;
  includeExplanation: boolean;
}
```

- Allow downloading results + executed query for transparency.
- A simple PDF (query, map snapshot, explanation, table) helps communicate findings in meetings or council settings.

---

## Near-term Enhancements (single-dev friendly)

- Extend the query builder and LLM prompt to support multiple `spatialFilters` with `and`/`or` logic as defined above; add unit tests covering combined predicates.
- Add a CRS validation step in the data ingest script with a hard failure on unknown SRID; emit per-layer summary (extent, feature count).
- Implement basic API key auth + origin-restricted CORS + rate limiting middleware.
- Add structured logging (request id + queryHash) and a minimal metrics endpoint (or stdout counters) to watch LLM/DuckDB latency.
- Cache parsed queries (NL → StructuredQuery) in-memory with an LRU to hit the warm query target.

---

## Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| Cold query (with LLM) | < 3s | Depends on LLM latency |
| Warm query (cached parse) | < 500ms | DuckDB is fast |
| Map render | < 1s | Depends on result size |
| Max result features | 1000 | Paginate larger results |

**Optimization levers:**
- Cache parsed queries (same NL → same structured query)
- Pre-compute common spatial joins
- Use PMTiles for base layers (avoid loading full GeoJSON)

---

## Future Extensions (Out of Scope for v1)

- **Multi-turn conversation** — context-aware follow-ups ("Now filter those to just the Southside")
- **User-uploaded data** — query against user's own GeoJSON
- **Export** — download results as GeoJSON/CSV/Shapefile
- **Saved queries** — bookmark and share query URLs
- **Comparison queries** — "Compare income in tracts near vs. far from transit"

These are noted for architecture awareness but not planned for initial build.
