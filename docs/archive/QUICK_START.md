# Quick Start Checklist

**Goal**: Complete Week 1 repo audit and TypeScript foundation setup

**Important**: Week 1 follows an **audit-first approach**. Check what exists before creating new structure to avoid overwriting existing work.

---

## Prerequisites Check

- [ ] Node.js 20+ installed (`node --version`)
- [ ] npm installed (`npm --version`)
- [ ] Git installed (`git --version`)
- [ ] Ollama installed ([ollama.ai](https://ollama.ai))
- [ ] Code editor (VS Code recommended)

---

## Week 1 Setup Tasks

### 1. Audit Existing Repo Structure

**First, check what exists:**
```bash
# Check for existing directories
ls -la api/ web/ shared/ scripts/ 2>/dev/null || echo "Directories don't exist yet"

# Check for existing package.json files
[ -f api/package.json ] && echo "api/package.json exists" || echo "api/package.json missing"
[ -f web/package.json ] && echo "web/package.json exists" || echo "web/package.json missing"

# Check for existing tsconfig files
[ -f api/tsconfig.json ] && echo "api/tsconfig.json exists" || echo "api/tsconfig.json missing"
[ -f web/tsconfig.json ] && echo "web/tsconfig.json exists" || echo "web/tsconfig.json missing"
```

**Only create missing directories:**
```bash
# Only create if they don't exist
[ ! -d api/src ] && mkdir -p api/src/{routes,lib/{orchestrator,llm,db},types} || echo "api/src exists"
[ ! -d web/src ] && mkdir -p web/src/{components/{ChatPanel,MapView,ResultsPanel,QueryExplainer},hooks,lib,types,styles} || echo "web/src exists"
[ ! -d shared/types ] && mkdir -p shared/types || echo "shared/types exists"
[ ! -d scripts ] && mkdir -p scripts || echo "scripts exists"
[ ! -d api/data ] && mkdir -p api/data || echo "api/data exists"
```

### 2. Set Up API Project

**Check if api/package.json exists first:**
```bash
cd api

# Only initialize if package.json doesn't exist
[ ! -f package.json ] && npm init -y || echo "package.json exists, skipping init"

# Install dependencies (safe to run even if already installed)
npm install hono
npm install -D typescript @types/node tsx nodemon
```

**Configure `api/tsconfig.json` (edge-ready, align with ARCHITECTURE.md):**
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

**Note**: Using `moduleResolution: "NodeNext"` (not "node") for edge-ready Hono deployment, as per ARCHITECTURE.md.

**Create `api/src/index.ts`:**
```typescript
import { Hono } from 'hono';

const app = new Hono();

app.get('/api/health', (c) => {
  return c.json({ status: 'ok' });
});

export default app;
```

**Add to `api/package.json`:**
```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  }
}
```

### 3. Set Up Web Project

**Check if web/ already exists:**
```bash
cd ../web

# Only create Vite project if it doesn't exist
[ ! -f package.json ] && npm create vite@latest . -- --template react-ts || echo "web/ exists, skipping Vite init"

# Install dependencies
npm install
npm install maplibre-gl
npm install -D @types/maplibre-gl
```

**Configure `web/tsconfig.json`** (add strict options, align with ARCHITECTURE.md):
```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "moduleResolution": "NodeNext",
    // ... other Vite defaults
  }
}
```

**Create basic map component** (`web/src/components/MapView/index.tsx`):
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

### 4. Configure Tooling

**Install ESLint and Prettier:**
```bash
# In both api/ and web/
npm install -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin
npm install -D prettier eslint-config-prettier
```

**Create `.eslintrc.json`** (in both projects):
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

**Add to `package.json`:**
```json
{
  "scripts": {
    "lint": "eslint src --ext .ts,.tsx",
    "format": "prettier --write \"src/**/*.{ts,tsx}\""
  }
}
```

### 5. Test Setup

```bash
# Terminal 1: Start API
cd api
npm run dev
# Should see: Server running on port 3000 (or configured port)

# Terminal 2: Start Web
cd web
npm run dev
# Should see: Vite dev server on port 5173
```

**Verify:**
- [ ] API health endpoint: `curl http://localhost:3000/api/health` returns `{"status":"ok"}`
- [ ] Web app loads at `http://localhost:5173`
- [ ] Map renders centered on Santa Fe
- [ ] `npm run typecheck` passes in both projects
- [ ] `npm run lint` passes in both projects

### 6. Set Up Ollama

```bash
# Install Ollama (if not already)
# macOS: brew install ollama
# Or download from ollama.ai

# Start Ollama service
ollama serve

# In another terminal, pull a model
ollama pull qwen2.5:7b
# or
ollama pull llama3.1:8b

# Test it
ollama run qwen2.5:7b "Hello, can you parse JSON?"
```

---

## Week 1 Deliverables Checklist

- [ ] Repo structure audited (existing directories/package.json/tsconfig noted)
- [ ] Missing directories created (only if needed)
- [ ] API runs on port 3000
- [ ] Web app runs on port 5173
- [ ] Map renders centered on Santa Fe (-105.94, 35.69)
- [ ] `/api/health` endpoint returns `{ status: 'ok' }`
- [ ] TypeScript strict mode enabled (with `noUncheckedIndexedAccess`, `noImplicitReturns`)
- [ ] `moduleResolution: "NodeNext"` configured (edge-ready)
- [ ] ESLint configured and passing
- [ ] Ollama installed and model pulled
- [ ] `npm run typecheck` passes in both packages
- [ ] `npm run lint` passes in both packages

---

## Common Issues & Solutions

### Issue: TypeScript errors in strict mode
**Solution**: Fix errors one by one. Common fixes:
- Add `| null` or `| undefined` to types
- Use optional chaining (`?.`)
- Add type guards

### Issue: MapLibre not rendering
**Solution**: 
- Check CSS import: `import 'maplibre-gl/dist/maplibre-gl.css'`
- Verify container has width/height
- Check browser console for errors

### Issue: Ollama connection refused
**Solution**:
- Ensure `ollama serve` is running
- Check `OLLAMA_BASE_URL` environment variable
- Test with: `curl http://localhost:11434/api/tags`

### Issue: Port already in use
**Solution**:
- Change port in Vite config or Hono app
- Or kill process using port: `lsof -ti:3000 | xargs kill`

---

## Next Steps After Week 1

Once Week 1 is complete, proceed to:
1. **Week 2**: Domain types + data pipeline
2. Review `docs/IMPLEMENTATION_PLAN.md` for detailed Week 2 tasks
3. Research Santa Fe data sources
4. Set up DuckDB and spatial extension

---

## Getting Help

- **TypeScript issues**: [TypeScript Discord](https://discord.gg/typescript)
- **Hono questions**: [Hono GitHub Discussions](https://github.com/honojs/hono/discussions)
- **MapLibre help**: [MapLibre Slack](https://slack.openstreetmap.us/)
- **DuckDB questions**: [DuckDB Discord](https://discord.gg/duckdb)

---

**Last Updated**: Initial creation  
**Status**: Ready to begin Week 1
