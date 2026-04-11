import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
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

const app = new Hono();

// Enable CORS for development
app.use(
  '/api/*',
  cors({
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
  })
);

app.get('/api/health', (c) => {
  return c.json({ status: 'ok' });
});

// Mount routes
app.route('/api/layers', layers);
app.route('/api/query', queryRoute);
app.route('/api/chat', chatRoute);
app.route('/api/templates', templatesRoute);

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

// Initialize DuckDB on startup
async function startServer() {
  try {
    console.log('Initializing DuckDB...');
    const dataDir = join(process.cwd(), 'data');
    const db = await initDatabase(':memory:', dataDir);
    setQueryDatabase(db);
    setChatDatabase(db);
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

    serve(
      {
        fetch: app.fetch,
        port,
      },
      (addr) => {
        const p =
          addr && typeof addr === 'object' && 'port' in addr ? (addr as { port: number }).port : port;
        console.log(`Server is listening on http://localhost:${p}`);
      }
    );
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
