import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { type Server } from 'node:http';
import layers, { setLayerRegistry as setLayersRegistry } from './routes/layers';
import queryRoute, {
  setDatabase as setQueryDatabase,
  setLayerRegistry as setQueryLayerRegistry,
} from './routes/query';
import chatRoute, {
  setDatabase as setChatDatabase,
  setLayerRegistry as setChatLayerRegistry,
} from './routes/chat';
import templatesRoute, {
  setAvailableLayers as setTemplateAvailableLayers,
} from './routes/templates';
import { initDatabase } from './lib/db/init';
import { createServer as createNetServer } from 'node:net';
import { join } from 'path';
import { buildLayerRegistry } from './lib/layers/registry';
import { RateLimiter, createRateLimitMiddleware } from './lib/middleware/rate-limiter';
import type { Database } from 'duckdb';

const app = new Hono();

// ── CORS ───────────────────────────────────────────────────────────────────────
// Allow origin from CORS_ORIGIN env var; default to '*' for local development.
// Set CORS_ORIGIN=https://myapp.com in production.
const corsOrigin = process.env.CORS_ORIGIN ?? '*';
app.use(
  '/api/*',
  cors({
    origin: corsOrigin,
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
  })
);

// ── In-flight request tracking (for graceful shutdown) ─────────────────────────
let activeRequests = 0;
app.use('*', async (c, next) => {
  activeRequests++;
  try {
    await next();
  } finally {
    activeRequests--;
  }
});

// ── Rate limiting ──────────────────────────────────────────────────────────────
// 10 req/min on /api/chat (LLM-backed), 30 req/min on /api/query (direct SQL).
// /api/layers, /api/health, /api/templates are unrestricted.
const chatLimiter = new RateLimiter(10, 60_000);
const queryLimiter = new RateLimiter(30, 60_000);

app.use('/api/chat/*', createRateLimitMiddleware(chatLimiter));
app.use('/api/query/*', createRateLimitMiddleware(queryLimiter));

// Prune expired rate-limit entries every 5 minutes (keeps memory bounded).
setInterval(() => {
  chatLimiter.pruneExpired();
  queryLimiter.pruneExpired();
}, 5 * 60_000).unref();

// ── Routes ────────────────────────────────────────────────────────────────────
app.get('/api/health', (c) => {
  return c.json({ status: 'ok' });
});

app.route('/api/layers', layers);
app.route('/api/query', queryRoute);
app.route('/api/chat', chatRoute);
app.route('/api/templates', templatesRoute);

// ── Graceful shutdown ─────────────────────────────────────────────────────────
let httpServer: Server | null = null;
let dbForShutdown: Database | null = null;

async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);

  // Stop accepting new connections.
  httpServer?.close();

  // Wait up to 5 seconds for in-flight requests to finish.
  const deadline = Date.now() + 5_000;
  while (activeRequests > 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (activeRequests > 0) {
    console.warn(
      `Shutdown: ${activeRequests} in-flight request(s) did not finish within 5 s`
    );
  }

  // Close DuckDB.
  const closable = dbForShutdown as unknown as { close?: () => void };
  closable?.close?.();

  console.log('Shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => {
  gracefulShutdown('SIGTERM').catch(console.error);
});
process.on('SIGINT', () => {
  gracefulShutdown('SIGINT').catch(console.error);
});

// ── Port discovery ────────────────────────────────────────────────────────────

/** Try binding to startPort, then startPort+1, … (only when PORT env is not set). */
function findAvailablePort(startPort: number, maxAttempts: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const tryAt = (offset: number) => {
      if (offset >= maxAttempts) {
        reject(
          new Error(`No free port found in range ${startPort}-${startPort + maxAttempts - 1}`)
        );
        return;
      }
      const candidate = startPort + offset;
      const probe = createNetServer();
      probe.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          tryAt(offset + 1);
        } else {
          reject(err);
        }
      });
      probe.listen(candidate, () => {
        probe.close((closeErr) => {
          if (closeErr) reject(closeErr);
          else resolve(candidate);
        });
      });
    };
    tryAt(0);
  });
}

async function resolveListenPort(): Promise<number> {
  const raw = process.env.PORT;
  const unset = raw === undefined || raw === '';
  const preferred = unset ? 3000 : Number(raw);
  if (!unset && (Number.isNaN(preferred) || preferred < 1 || preferred > 65535)) {
    throw new Error(`Invalid PORT: ${JSON.stringify(raw)}`);
  }
  if (unset) {
    return findAvailablePort(preferred, 30);
  }
  return preferred;
}

// ── Startup ───────────────────────────────────────────────────────────────────

async function startServer() {
  try {
    console.log('Initializing DuckDB...');
    const dataDir = join(process.cwd(), 'data');
    const db = await initDatabase(':memory:', dataDir);
    setQueryDatabase(db);
    setChatDatabase(db);
    dbForShutdown = db;
    console.log('✓ DuckDB initialized with spatial extension');

    const manifestPath = join(dataDir, 'manifest.json');
    const layerRegistry = await buildLayerRegistry(db, manifestPath);
    setLayersRegistry(layerRegistry);
    setQueryLayerRegistry(layerRegistry);
    setChatLayerRegistry(layerRegistry);
    setTemplateAvailableLayers(layerRegistry.loadedLayerNames);
    console.log(
      `✓ Layer registry initialized (${layerRegistry.loadedLayerNames.length} loaded layers)`
    );

    const port = await resolveListenPort();
    const portEnvUnset = process.env.PORT === undefined || process.env.PORT === '';
    if (portEnvUnset && port !== 3000) {
      console.warn(
        `Port 3000 is in use; listening on ${port}. Point the web app at this API (e.g. VITE_API_BASE=http://localhost:${port}).`
      );
    }

    httpServer = serve(
      {
        fetch: app.fetch,
        port,
      },
      (addr) => {
        const p =
          addr && typeof addr === 'object' && 'port' in addr ? (addr as { port: number }).port : port;
        console.log(`Server is listening on http://localhost:${p}`);
      }
    ) as Server;
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
