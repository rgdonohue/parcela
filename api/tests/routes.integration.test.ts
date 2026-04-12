import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { join } from 'path';
import type { Database } from 'duckdb';
import layersRoute, { setLayerRegistry as setLayersRegistry } from '../src/routes/layers';
import queryRoute, {
  setDatabase as setQueryDatabase,
  setLayerRegistry as setQueryLayerRegistry,
} from '../src/routes/query';
import chatRoute, {
  setDatabase as setChatDatabase,
  setLayerRegistry as setChatLayerRegistry,
} from '../src/routes/chat';
import templatesRoute, {
  setAvailableLayers as setTemplateAvailableLayers,
} from '../src/routes/templates';
import { initDatabase } from '../src/lib/db/init';
import {
  buildLayerRegistry,
  type LayerRegistry,
} from '../src/lib/layers/registry';

let app: Hono;
let db: Database | null = null;
let layerRegistry: LayerRegistry;

beforeAll(async () => {
  const dataDir = join(process.cwd(), 'data');
  db = await initDatabase(':memory:', dataDir);
  layerRegistry = await buildLayerRegistry(db, join(dataDir, 'manifest.json'));

  setLayersRegistry(layerRegistry);
  setQueryDatabase(db);
  setQueryLayerRegistry(layerRegistry);
  setChatDatabase(db);
  setChatLayerRegistry(layerRegistry);
  setTemplateAvailableLayers(layerRegistry.loadedLayerNames);

  app = new Hono();
  app.route('/api/layers', layersRoute);
  app.route('/api/query', queryRoute);
  app.route('/api/chat', chatRoute);
  app.route('/api/templates', templatesRoute);
}, 120000);

afterAll(() => {
  const closable = db as unknown as { close?: () => void };
  closable?.close?.();
});

describe('/api/layers', () => {
  it('returns runtime availability and loaded count from registry', async () => {
    const response = await app.request('/api/layers');
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      layers: Array<{
        name: string;
        isLoaded: boolean;
        loadedFields: string[];
        featureCount: number | null;
      }>;
      loadedCount: number;
    };

    expect(body.loadedCount).toBe(layerRegistry.loadedLayerNames.length);
    const zoning = body.layers.find((layer) => layer.name === 'zoning_districts');
    expect(zoning).toBeDefined();
    expect(Array.isArray(zoning?.loadedFields)).toBe(true);
    expect(typeof zoning?.isLoaded).toBe('boolean');
    expect(typeof zoning?.featureCount === 'number' || zoning?.featureCount === null).toBe(
      true
    );
  });
});

describe('/api/query', () => {
  it('accepts canonical wrapped payload and normalizes zoning aliases', async () => {
    const response = await app.request('/api/query', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query: {
          selectLayer: 'zoning_districts',
          attributeFilters: [{ field: 'allows_residential', op: 'eq', value: true }],
          limit: 5,
        },
      }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      type: string;
      metadata: {
        requestFormat: 'wrapped' | 'direct';
        normalizationNotes?: string[];
      };
    };

    expect(body.type).toBe('FeatureCollection');
    expect(body.metadata.requestFormat).toBe('wrapped');
    expect(body.metadata.normalizationNotes).toContain(
      'Mapped allows_residential=true to a case-insensitive zone_code match on R%'
    );
  });

  it('accepts deprecated direct payload during migration window', async () => {
    const response = await app.request('/api/query', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        selectLayer: 'zoning_districts',
        attributeFilters: [{ field: 'allows_residential', op: 'eq', value: true }],
        limit: 5,
      }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      metadata: { requestFormat: 'wrapped' | 'direct' };
    };
    expect(body.metadata.requestFormat).toBe('direct');
  });

  it('returns truncation metadata when limit exceeds hard cap', async () => {
    const response = await app.request('/api/query', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query: {
          selectLayer: 'zoning_districts',
          spatialFilters: [
            {
              op: 'nearest',
              targetLayer: 'transit_access',
              limit: 20000,
            },
          ],
        },
      }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      metadata: {
        truncated: boolean;
        maxFeaturesApplied: number;
        hardCap: number;
      };
    };
    expect(body.metadata.truncated).toBe(true);
    expect(body.metadata.maxFeaturesApplied).toBeLessThanOrEqual(body.metadata.hardCap);
  });
});

describe('/api/chat', () => {
  it('returns unsupported grounding for unavailable eviction data', async () => {
    const response = await app.request('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'Show eviction filings in low-income tracts' }),
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      error: string;
      grounding: { status: string; missingLayers: string[] };
    };
    expect(body.error).toBe('Unsupported request for current datasets');
    expect(body.grounding.status).toBe('unsupported');
    expect(body.grounding.missingLayers).toContain('eviction_filings');
  });
});

describe('/api/templates', () => {
  it('does not expose unrunnable templates by default', async () => {
    const response = await app.request('/api/templates');
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      templates: Array<{ id: string }>;
    };

    const templateIds = body.templates.map((template) => template.id);
    expect(templateIds).not.toContain('evictions-low-income');
  });

  it('marks unrunnable templates when includeUnavailable=true', async () => {
    const response = await app.request('/api/templates?includeUnavailable=true');
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      templates: Array<{ id: string; runnable: boolean }>;
    };

    const template = body.templates.find((candidate) => candidate.id === 'evictions-low-income');
    expect(template).toBeDefined();
    expect(template?.runnable).toBe(false);
  });
});
