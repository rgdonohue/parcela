import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { Database, DuckDbError } from 'duckdb';
import chatRoute, {
  setDatabase,
  setLayerRegistry,
  setLLMClientForTests,
} from '../src/routes/chat';
import type { LayerRegistry } from '../src/lib/layers/registry';
import type { LLMClient } from '../src/lib/llm/types';
import {
  __clearConversationSessionsForTests,
  createSession,
  getSession,
  pruneOldSessions,
} from '../src/lib/conversation/store';
import { clearAllCaches } from '../src/lib/cache';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const registry: LayerRegistry = {
  generatedAt: '2026-04-30T00:00:00.000Z',
  loadedLayerNames: ['parcels'],
  layers: {
    parcels: {
      name: 'parcels',
      geometryType: 'Polygon',
      schemaFields: {
        parcel_id: 'string',
        address: 'string | null',
        acres: 'number',
        assessed_value: 'number | null',
      },
      loadedFields: ['parcel_id', 'address', 'acres', 'assessed_value'],
      queryableFields: ['parcel_id', 'address', 'acres', 'assessed_value'],
      featureCount: 1,
      isLoaded: true,
    },
  },
};

function exec(db: Database, sql: string): Promise<void> {
  return new Promise((resolve, reject) => {
    db.exec(sql, (err: DuckDbError | null) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

async function makeDatabase(): Promise<Database> {
  const db = new Database(':memory:');
  await exec(db, 'INSTALL spatial; LOAD spatial;');
  await exec(db, `
    CREATE TABLE parcels AS
    SELECT
      'P001' AS parcel_id,
      'Fixture address' AS address,
      1.0 AS acres,
      100000 AS assessed_value,
      ST_GeomFromText('POINT(-105.94 35.69)') AS geom_4326,
      ST_Transform(ST_GeomFromText('POINT(-105.94 35.69)'), 'EPSG:4326', 'EPSG:32613', true) AS geom_utm13;
  `);
  return db;
}

async function makeChatApp(): Promise<{ app: Hono; db: Database }> {
  const db = await makeDatabase();
  const client: LLMClient = {
    providerName: 'test-provider',
    modelName: 'test-model',
    complete: vi.fn().mockResolvedValue(JSON.stringify({
      selectLayer: 'parcels',
      limit: 1,
    })),
  };
  setDatabase(db);
  setLayerRegistry(registry);
  setLLMClientForTests(client);
  const app = new Hono();
  app.route('/api/chat', chatRoute);
  return { app, db };
}

describe('conversation store', () => {
  beforeEach(() => {
    __clearConversationSessionsForTests();
    clearAllCaches();
  });

  afterEach(() => {
    __clearConversationSessionsForTests();
  });

  it('creates sessions with UUID identifiers', () => {
    const id = createSession();
    expect(id).not.toBeNull();
    expect(id).toMatch(UUID_RE);
  });

  it('retrieves stored context on a second turn', () => {
    const id = createSession();
    expect(id).not.toBeNull();
    const session = getSession(id!);
    expect(session).not.toBeNull();
    session!.previousQuery = { selectLayer: 'parcels', limit: 1 };
    session!.previousExplanation = 'Found one parcel.';
    session!.turnCount = 1;

    const secondTurn = getSession(id!);
    expect(secondTurn?.previousQuery?.selectLayer).toBe('parcels');
    expect(secondTurn?.previousExplanation).toBe('Found one parcel.');
    expect(secondTurn?.turnCount).toBe(1);
  });

  it('creates a new session for an unknown conversationId', async () => {
    const { app, db } = await makeChatApp();
    const response = await app.request('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        message: 'show parcels',
        conversationId: '00000000-0000-4000-8000-000000000000',
      }),
    });
    const body = (await response.json()) as { conversationId?: string; conversationTurn: number };

    expect(response.status).toBe(200);
    expect(body.conversationId).toMatch(UUID_RE);
    expect(body.conversationId).not.toBe('00000000-0000-4000-8000-000000000000');
    expect(body.conversationTurn).toBe(1);
    db.close();
  });

  it('prunes sessions older than 2 hours', () => {
    const id = createSession();
    expect(id).not.toBeNull();
    const session = getSession(id!);
    session!.lastAccessedAt = new Date(Date.now() - (2 * 60 * 60 * 1000) - 1);

    const pruned = pruneOldSessions();

    expect(pruned).toBe(1);
    expect(getSession(id!)).toBeNull();
  });

  it('rejects the 1001st session and lets chat continue statelessly', async () => {
    for (let i = 0; i < 1000; i++) {
      expect(createSession()).not.toBeNull();
    }
    expect(createSession()).toBeNull();

    const { app, db } = await makeChatApp();
    const response = await app.request('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'show parcels' }),
    });
    const body = (await response.json()) as {
      conversationId?: string;
      conversationTurn: number;
      result: { features: unknown[] };
    };

    expect(response.status).toBe(200);
    expect(body.conversationId).toBeUndefined();
    expect(body.conversationTurn).toBe(0);
    expect(body.result.features).toHaveLength(1);
    db.close();
  });
});
