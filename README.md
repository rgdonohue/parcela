# Parcela

**Explore Santa Fe housing, land use, and equity — in plain English.**

Parcela is a natural language interface for exploring spatial data about Santa Fe, New Mexico. Type a question like *"Show me vacant residential parcels within 500 meters of a bus stop"* and see the results on an interactive map with a plain-English explanation.

**[parcela.app](https://parcela.app)**

---

## Why This Project?

Santa Fe faces a housing crisis. Home prices have risen faster than incomes, short-term rentals have reduced available housing stock, and many residents struggle to find affordable places to live. Understanding *where* these problems occur—and how they intersect with transit access, zoning, flood risk, and neighborhood demographics—requires spatial analysis that's typically locked behind expensive GIS software and specialized expertise.

This tool aims to make that analysis accessible to anyone: residents, journalists, advocates, city planners, and policymakers. No GIS experience required—just ask your question.

### Questions you can ask

- "Which neighborhoods have the most short-term rentals?"
- "Show parcels zoned residential that are currently vacant"
- "Census tracts with median income below $40,000"
- "Affordable housing units within 800 meters of transit stops"
- "How has assessed value changed near the Railyard since 2018?"
- "Parcels within 500 meters of an arroyo and inside flood zones"

---

## Features

- **Natural language queries** — Ask questions in plain English; an LLM translates them to spatial queries
- **Interactive map** — Results displayed on a MapLibre GL map centered on Santa Fe
- **Transparent queries** — See exactly what spatial operation was executed, not just the results
- **Equity-aware explanations** — AI-generated summaries that consider demographic and equity context
- **Multiple data layers** — Parcels, census tracts, zoning, hydrology, transit, and more
- **Export results** — Download findings as GeoJSON or CSV for further analysis

---

## Demo

> *Coming soon* — The project is under active development. Check back for a live demo link.

---

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│  You type: "Residential parcels near the Santa Fe River"   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  1. LLM parses your question into a structured query        │
│  2. Query validated against available layers/fields         │
│  3. Spatial SQL executed against DuckDB                     │
│  4. Results returned as GeoJSON + rendered on map           │
│  5. LLM generates plain-English explanation                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  "Found 34 residential parcels within 200m of Santa Fe     │
│   River segments, concentrated in the downtown and Agua    │
│   Fria areas. These overlap census tracts with median      │
│   incomes below the city average."                         │
└─────────────────────────────────────────────────────────────┘
```

Every query shows the structured operation that was executed, so you can verify what the system did and reproduce it.

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | React 19, TypeScript, Vite, MapLibre GL JS, Zustand |
| Backend | Hono (TypeScript), Zod validation |
| Database | DuckDB with spatial extension |
| LLM | Ollama (local) or Together.ai/Groq (production) |
| Deployment | Railway/Fly.io (API), Vercel/Cloudflare Pages (frontend) |

### Why these choices?

- **DuckDB** — Single-file database with spatial support. No server to manage, ships with the app.
- **Hono** — Lightweight, edge-ready API framework. Fast and TypeScript-native.
- **MapLibre GL** — Open-source map rendering. No vendor lock-in.
- **Ollama** — Run LLMs locally during development. No API costs, no data leaves your machine.

---

## Data Sources

This project uses publicly available data about Santa Fe:

| Layer | Source | Features |
|-------|--------|----------|
| Parcels, Building Footprints | County Assessor / City GIS | 106K |
| Census Tracts | US Census ACS 5-Year | 57 |
| Zoning, Neighborhoods, City Limits, Historic Districts | City of Santa Fe | 963 |
| Hydrology, Flood Zones | City GIS / FEMA NFHL | 336 |
| Transit Access | City GTFS | 447 |
| Short-Term Rentals | City Permits | 897 |
| Parks, Bikeways | City GIS | 613 |
| Affordable Housing | HUD LIHTC | 35 |

See [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md) for complete documentation of data provenance, update cadence, and licensing.

---

## Docker

### Build and run

```bash
# Build the image
docker build -t parcela .

# Run with local parquet data mounted
docker run --rm -p 3000:3000 \
  -v $(pwd)/api/data:/app/api/data \
  parcela
```

The API is now available at `http://localhost:3000`.

### Environment variables

Pass env vars with `-e` flags:

```bash
docker run --rm -p 3000:3000 \
  -v $(pwd)/api/data:/app/api/data \
  -e TOGETHER_API_KEY=your_key_here \
  -e CORS_ORIGIN=https://your-frontend.com \
  parcela
```

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Port the API listens on |
| `CORS_ORIGIN` | `*` | Allowed CORS origin (use specific domain in production) |
| `TOGETHER_API_KEY` | — | Use Together.ai for LLM; falls back to Ollama if unset |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama endpoint |
| `OLLAMA_MODEL` | `qwen2.5:7b` | Ollama model name |

### Quick health check

```bash
curl http://localhost:3000/api/health
# → {"status":"ok"}
```

---

## Local Development

### Prerequisites

- Node.js 20+
- [Ollama](https://ollama.ai/) installed and running
- Git

### Setup

```bash
# Clone the repository
git clone https://github.com/rgdonohue/parcela.git
cd parcela

# Install dependencies
cd api && npm install && cd ..
cd web && npm install && cd ..

# Pull an LLM model (choose one)
ollama pull qwen2.5:7b
# or
ollama pull llama3.1:8b

# Start the API (in one terminal)
cd api && npm run dev

# Start the frontend (in another terminal)
cd web && npm run dev
```

The frontend runs at `http://localhost:5173` and the API at `http://localhost:3000`.

### Environment Variables

See `api/.env.example` and `web/.env.example` for all available options. Key variables:

```bash
# Development (default — uses local Ollama)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:7b

# Production (set TOGETHER_API_KEY to switch from Ollama to Together.ai)
TOGETHER_API_KEY=your_api_key_here
```

---

## Project Structure

```
parcela/
├── api/                    # Backend (Hono + DuckDB)
│   ├── src/
│   │   ├── routes/         # API endpoints (chat, query, layers, templates)
│   │   ├── lib/
│   │   │   ├── orchestrator/   # NL → query → results pipeline
│   │   │   ├── llm/            # LLM provider abstraction
│   │   │   ├── middleware/     # Rate limiting
│   │   │   ├── db/             # DuckDB setup and queries
│   │   │   └── utils/          # Explanation, logging, query executor
│   │   └── types/          # TypeScript types
│   ├── tests/              # Vitest test suites (91 tests)
│   └── data/               # GeoParquet data files + manifest
│
├── web/                    # Frontend (React + MapLibre)
│   ├── src/
│   │   ├── components/     # ChatPanel, MapView, ResultsPanel
│   │   ├── store/          # Zustand state management
│   │   └── lib/            # API client, choropleth
│   └── public/
│
├── shared/                 # Shared types between api/web
├── scripts/                # Data fetch and preparation scripts
└── docs/                   # Architecture, planning, assessments
```

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chat` | POST | Natural language query → results + explanation |
| `/api/query` | POST | Direct structured query (bypass LLM) |
| `/api/layers` | GET | Available data layers and their schemas |
| `/api/templates` | GET | Pre-built equity analysis queries |
| `/api/health` | GET | Service health check |

### Example: Natural Language Query

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Show residential parcels near the river"}'
```

Response:
```json
{
  "query": {
    "selectLayer": "parcels",
    "attributeFilters": [{"field": "zoning", "op": "in", "value": ["R-1", "R-2"]}],
    "spatialFilters": [{
      "op": "within_distance",
      "targetLayer": "hydrology",
      "distance": 200
    }]
  },
  "result": {
    "type": "FeatureCollection",
    "features": [...],
    "metadata": {"count": 34, "executionTimeMs": 127}
  },
  "explanation": "Found 34 residential parcels within 200m of river segments...",
  "confidence": 0.9
}
```

---

## Contributing

This project is in active development. Contributions are welcome!

### Areas where help is needed

- **Data acquisition** — Sourcing and cleaning Santa Fe spatial datasets
- **Query patterns** — Expanding the types of spatial queries supported
- **UI/UX** — Improving the map interface and results display
- **Testing** — Unit and integration tests for the query builder
- **Documentation** — Improving this README and adding tutorials

### Development workflow

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Make your changes
4. Run tests (`npm test` in both `api/` and `web/`)
5. Submit a pull request

Please ensure TypeScript compiles without errors (`npm run typecheck`) and linting passes (`npm run lint`).

---

## Roadmap

### Done
- [x] NL query engine with constrained StructuredQuery schema
- [x] Spatial operations (distance, intersects, contains, within, nearest)
- [x] Multi-turn conversation refinement
- [x] LLM-driven equity-aware explanations
- [x] GeoJSON/CSV export with query metadata
- [x] Accessibility (ARIA labels, keyboard nav, screen reader)
- [x] Rate limiting, CORS, graceful shutdown
- [x] Docker + CI/CD pipeline
- [x] Structured JSON logging
- [x] 14 spatial layers loaded (109K+ features)

### Next
- [ ] Production deployment (Railway/Fly.io + Vercel)
- [ ] User testing with housing advocates and planners
- [ ] School zones and wildfire risk data layers

### Future
- [ ] PDF report export for council/community presentations
- [ ] Shareable query URLs
- [ ] User-uploaded data layers
- [ ] Voice input for accessibility

---

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — Technical design and system overview
- [Build Plan](docs/BUILD_PLAN.md) — Forward-looking action plan
- [Data Sources](docs/DATA_SOURCES.md) — Dataset provenance and licensing
- [Project Assessment](docs/ASSESSMENT_2026_04_11.md) — Current state and next steps
- [Code Evaluation](docs/project-evaluation.md) — Architecture review and recommendations

---

## Acknowledgments

- Santa Fe County and City of Santa Fe for publishing open GIS data
- US Census Bureau for demographic data
- The open-source communities behind DuckDB, MapLibre, Hono, and Ollama

---

## License

MIT License. See [LICENSE](LICENSE) for details.

---

## Contact

Questions, ideas, or feedback? Open an issue or reach out:

- GitHub Issues: [github.com/rgdonohue/parcela/issues](https://github.com/rgdonohue/parcela/issues)

---

*Built with the goal of making spatial data accessible for housing equity research in Santa Fe, NM.*
