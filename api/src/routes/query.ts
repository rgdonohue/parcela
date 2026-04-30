/**
 * Query endpoint
 *
 * Canonical request: { query: StructuredQuery }
 * Backward-compatible request: StructuredQuery (deprecated)
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { validateQuery } from '../lib/orchestrator/validator';
import type { LayerRegistry } from '../lib/layers/registry';
import type { Database } from 'duckdb';
import { prepareQuery, executeQuery } from '../lib/utils/query-executor';
import { log } from '../lib/logger';

// Store database instance (initialized on startup)
let dbInstance: Database | null = null;
let layerRegistry: LayerRegistry | null = null;

export function setDatabase(db: Database): void {
  dbInstance = db;
}

export function setLayerRegistry(registry: LayerRegistry): void {
  layerRegistry = registry;
}

function extractStructuredQueryPayload(body: unknown): {
  payload: unknown;
  requestFormat: 'wrapped' | 'direct';
} {
  if (
    typeof body === 'object' &&
    body !== null &&
    'query' in body &&
    typeof (body as Record<string, unknown>).query === 'object'
  ) {
    return {
      payload: (body as { query: unknown }).query,
      requestFormat: 'wrapped',
    };
  }

  return { payload: body, requestFormat: 'direct' };
}

function buildValidationSuggestions(layerRegistryValue: LayerRegistry): string[] {
  const loaded = layerRegistryValue.loadedLayerNames;
  return [
    `Use only loaded layers: ${loaded.join(', ')}`,
    'Check field names from GET /api/layers',
    'Temporal queries are not supported yet',
  ];
}

function formatZodIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
    return `${path}${issue.message}`;
  });
}

const queryRoute = new Hono();

queryRoute.post('/', async (c) => {
  if (!dbInstance) {
    return c.json({ error: 'Database not initialized' }, 503);
  }
  if (!layerRegistry) {
    return c.json({ error: 'Layer registry not initialized' }, 503);
  }

  try {
    const body = await c.req.json();
    const { payload, requestFormat } = extractStructuredQueryPayload(body);

    const validatedQuery = validateQuery(payload);

    let prepared;
    try {
      prepared = prepareQuery(validatedQuery, layerRegistry);
    } catch (err) {
      const prepErr = err as Error & { validationIssues?: string[]; normalizationNotes?: string[] };
      if (prepErr.validationIssues) {
        return c.json(
          {
            error: 'Query validation failed against loaded data',
            details: prepErr.validationIssues,
            suggestions: buildValidationSuggestions(layerRegistry),
            normalizationNotes: prepErr.normalizationNotes ?? [],
          },
          400
        );
      }
      throw err;
    }

    const { result, executionTimeMs, prepared: p } = await executeQuery(prepared, dbInstance);

    log({
      level: 'info',
      event: 'query.execute',
      executionTimeMs: Math.round(executionTimeMs * 100) / 100,
      featureCount: result.features.length,
      layer: p.executableQuery.selectLayer,
      queryHash: p.queryHash,
      requestFormat,
    });

    return c.json({
      ...result,
      metadata: {
        count: result.features.length,
        executionTimeMs: Math.round(executionTimeMs * 100) / 100,
        query: p.executableQuery,
        queryHash: p.queryHash,
        sourceLayers: p.sourceLayers,
        truncated: p.truncated,
        maxFeaturesApplied: p.maxFeaturesApplied,
        hardCap: p.hardCap,
        defaultLimitApplied: p.defaultLimitApplied,
        simplifyToleranceDeg: p.simplifyToleranceDeg,
        normalizationNotes: p.normalizationNotes,
        requestFormat,
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error instanceof z.ZodError) {
        return c.json(
          {
            error: 'Invalid query payload',
            details: formatZodIssues(error),
            expected: 'POST { "query": StructuredQuery }',
          },
          400
        );
      }

      const isBinderError =
        error.message.includes('Binder Error') ||
        error.message.includes('Referenced column');
      if (isBinderError) {
        return c.json(
          {
            error: 'Query references unavailable fields',
            message: error.message,
            suggestions: layerRegistry
              ? buildValidationSuggestions(layerRegistry)
              : [],
          },
          400
        );
      }

      log({
        level: 'error',
        event: 'query.error',
        errorType: error.name,
        errorMessage: error.message,
      });
      return c.json(
        {
          error: 'Query execution failed',
          message: error.message,
        },
        500
      );
    }

    log({ level: 'error', event: 'query.error', errorType: 'unknown', errorMessage: 'Unknown error' });
    return c.json({ error: 'Unknown error' }, 500);
  }
});

export default queryRoute;
