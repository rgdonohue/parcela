/**
 * Chat endpoint
 *
 * Natural language -> grounding -> StructuredQuery -> SQL -> GeoJSON
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { createLLMClient } from '../lib/llm';
import { IntentParser } from '../lib/orchestrator/parser';
import {
  parseCache,
  getCacheStats,
} from '../lib/cache';
import type { LayerRegistry } from '../lib/layers/registry';
import type { Database } from 'duckdb';
import type { ParseResult, ConversationContext } from '../lib/orchestrator/parser';
import type { StructuredQuery } from '../../../shared/types/query';
import {
  getQuerySourceLayers,
} from '../lib/orchestrator/query-grounding';
import {
  assessGroundingRequest,
  type GroundingAssessment,
} from '../lib/orchestrator/intent-router';
import { prepareQuery, executeQuery } from '../lib/utils/query-executor';
import { generateExplanation, generateEquityExplanation } from '../lib/utils/explanation';

// ── Request validation schema ─────────────────────────────────────────────────
const chatBodySchema = z.object({
  message: z.string().min(1, 'message must be a non-empty string'),
  context: z
    .object({
      previousQuery: z.record(z.string(), z.unknown()),
      previousLayer: z.string(),
      previousResultCount: z.number(),
      previousExplanation: z.string(),
    })
    .optional(),
});

let dbInstance: Database | null = null;
let layerRegistry: LayerRegistry | null = null;

const chatRoute = new Hono();

const llmClient = createLLMClient();
const parser = new IntentParser(llmClient);

export function setDatabase(db: Database): void {
  dbInstance = db;
}

export function setLayerRegistry(registry: LayerRegistry): void {
  layerRegistry = registry;
  parser.setAvailableLayers(registry.loadedLayerNames);
  parser.setAvailableLayerFields(
    Object.fromEntries(
      Object.values(registry.layers).map((layer) => [layer.name, layer.queryableFields])
    )
  );
  console.log(`  Parser configured with layers: ${registry.loadedLayerNames.join(', ')}`);
}

function generateDynamicSuggestions(availableLayers: string[]): string[] {
  const suggestions: string[] = [];

  if (availableLayers.includes('short_term_rentals') && availableLayers.includes('neighborhoods')) {
    suggestions.push('Try: "Which neighborhoods have the most short-term rentals?"');
  }
  if (availableLayers.includes('parcels') && availableLayers.includes('transit_access')) {
    suggestions.push('Try: "Show residential parcels within 300m of a bus stop"');
  }
  if (availableLayers.includes('census_tracts')) {
    suggestions.push('Try: "Census tracts where median income is below 40000"');
  }
  if (availableLayers.includes('parcels') && availableLayers.includes('flood_zones')) {
    suggestions.push('Try: "Parcels that intersect flood zones"');
  }
  if (availableLayers.includes('parcels')) {
    suggestions.push('Try: "Show parcels built after 2010 with assessed value over 500000"');
  }

  if (suggestions.length === 0) {
    suggestions.push('No data layers are currently loaded.');
  }

  return suggestions.slice(0, 3);
}

function unsupportedResponse(
  grounding: GroundingAssessment,
  availableLayers: string[]
): {
  error: string;
  message: string;
  grounding: GroundingAssessment;
  availableLayers: string[];
  suggestions: string[];
} {
  const missing = grounding.missingLayers.join(', ');
  const requested = grounding.requestedConcepts.join(', ');
  const reason =
    grounding.status === 'unsupported'
      ? `This request requires unavailable dataset(s): ${missing}`
      : `This request is only partially supported. Missing dataset(s): ${missing}`;

  return {
    error:
      grounding.status === 'unsupported'
        ? 'Unsupported request for current datasets'
        : 'Partially supported request',
    message: requested ? `${reason}. Requested concepts: ${requested}` : reason,
    grounding,
    availableLayers,
    suggestions:
      grounding.suggestions.length > 0
        ? grounding.suggestions
        : generateDynamicSuggestions(availableLayers),
  };
}

chatRoute.post('/', async (c) => {
  if (!dbInstance) {
    return c.json({ error: 'Database not initialized' }, 503);
  }
  if (!layerRegistry) {
    return c.json({ error: 'Layer registry not initialized' }, 503);
  }

  try {
    const rawBody: unknown = await c.req.json();
    const bodyValidation = chatBodySchema.safeParse(rawBody);
    if (!bodyValidation.success) {
      return c.json(
        {
          error: 'Invalid request body',
          details: bodyValidation.error.issues.map((i) => i.message).join('; '),
        },
        400
      );
    }
    const body = bodyValidation.data;

    const conversationContext: ConversationContext | null = body.context
      ? (body.context as unknown as ConversationContext)
      : null;
    const availableLayers = layerRegistry.loadedLayerNames;
    const grounding = assessGroundingRequest(body.message, availableLayers);
    if (grounding.disambiguationPrompt) {
      return c.json(
        {
          error: 'Clarification required',
          message: grounding.disambiguationPrompt,
          grounding,
          suggestions: grounding.suggestions,
        },
        400
      );
    }
    if (grounding.status !== 'exact_match') {
      return c.json(unsupportedResponse(grounding, availableLayers), 400);
    }

    // --- LLM parsing (with cache) ---
    let parseResult: ParseResult;
    let parseTimeMs = 0;
    let parseCacheHit = false;

    const cachedParse = parseCache.get(body.message);
    if (cachedParse) {
      parseResult = cachedParse;
      parseCacheHit = true;
    } else {
      try {
        const parseStart = performance.now();
        parseResult = await parser.parse(body.message, conversationContext);
        parseTimeMs = performance.now() - parseStart;
        parseCache.set(body.message, parseResult);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown parsing error';
        if (errorMessage.includes('Cannot connect to Ollama') || errorMessage.includes('timed out')) {
          return c.json(
            {
              error: 'LLM service unavailable',
              message: errorMessage,
              grounding,
              suggestions: [
                'Make sure Ollama is installed and running',
                'Check that the model is pulled: ollama pull qwen2.5:7b',
              ],
            },
            503
          );
        }

        return c.json(
          {
            error: 'Could not understand query',
            message: errorMessage,
            grounding,
            suggestions: generateDynamicSuggestions(availableLayers),
          },
          400
        );
      }
    }

    // --- Shared prepare + execute pipeline ---
    let prepared;
    try {
      prepared = prepareQuery(parseResult.query, layerRegistry);
    } catch (err) {
      const prepErr = err as Error & { validationIssues?: string[]; normalizationNotes?: string[] };
      if (prepErr.validationIssues) {
        return c.json(
          {
            error: 'Parsed query does not match loaded data',
            details: prepErr.validationIssues,
            grounding,
            normalizationNotes: prepErr.normalizationNotes ?? [],
            suggestions: generateDynamicSuggestions(availableLayers),
          },
          400
        );
      }
      throw err;
    }

    const { result, executionTimeMs, queryCacheHit } = await executeQuery(prepared, dbInstance);

    const deterministicExplanation = generateExplanation(
      prepared.executableQuery,
      result.features.length
    );

    // Attempt LLM equity explanation (5s timeout); fall back to deterministic on failure
    let equityNarrative: string | null = null;
    try {
      const equity = await generateEquityExplanation(
        llmClient,
        prepared.executableQuery,
        result.features.length,
        result.features as Array<{ properties: Record<string, unknown> | null }>,
        { timeoutMs: 5000 }
      );
      equityNarrative = equity.equityNarrative;
    } catch {
      // Graceful degradation — equity narrative is optional
    }

    const explanation = equityNarrative ?? deterministicExplanation;

    return c.json({
      query: prepared.executableQuery,
      result,
      explanation,
      equityNarrative,
      confidence: parseResult.confidence,
      grounding,
      metadata: {
        count: result.features.length,
        executionTimeMs: Math.round(executionTimeMs * 100) / 100,
        parseTimeMs: Math.round(parseTimeMs * 100) / 100,
        queryHash: prepared.queryHash,
        sourceLayers: getQuerySourceLayers(prepared.executableQuery),
        truncated: prepared.truncated,
        maxFeaturesApplied: prepared.maxFeaturesApplied,
        hardCap: prepared.hardCap,
        defaultLimitApplied: prepared.defaultLimitApplied,
        normalizationNotes: prepared.normalizationNotes,
        cache: {
          parseHit: parseCacheHit,
          queryHit: queryCacheHit,
        },
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      return c.json(
        {
          error: 'Query execution failed',
          message: error.message,
        },
        500
      );
    }

    return c.json({ error: 'Unknown error' }, 500);
  }
});

chatRoute.get('/stats', (c) => {
  return c.json({
    cache: getCacheStats(),
  });
});

export default chatRoute;
