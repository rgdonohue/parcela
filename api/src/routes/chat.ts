/**
 * Chat endpoint
 *
 * Natural language -> grounding -> StructuredQuery -> SQL -> GeoJSON
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { createLLMClient } from '../lib/llm';
import { LLMProviderError } from '../lib/llm/types';
import { IntentParser } from '../lib/orchestrator/parser';
import {
  parseCache,
  stableJsonKey,
} from '../lib/cache';
import type { LayerRegistry } from '../lib/layers/registry';
import type { Database } from 'duckdb';
import type { ParseResult, ConversationContext } from '../lib/orchestrator/parser';
import type { ChatRequest, ChatResponse } from '../../../shared/types/api';
import {
  getQuerySourceLayers,
} from '../lib/orchestrator/query-grounding';
import {
  assessGroundingRequest,
  type GroundingAssessment,
} from '../lib/orchestrator/intent-router';
import { prepareQuery, executeQuery } from '../lib/utils/query-executor';
import { generateExplanation, generateEquityExplanation } from '../lib/utils/explanation';
import { log } from '../lib/logger';
import { getRequestId } from '../lib/request-id';
import {
  createSession,
  getSession,
  updateSession,
} from '../lib/conversation/store';

// ── Request validation schema ─────────────────────────────────────────────────
const chatBodySchema = z.object({
  message: z.string().min(1, 'message must be a non-empty string'),
  lang: z.enum(['en', 'es']).optional(),
  conversationId: z.string().optional(),
}) satisfies z.ZodType<ChatRequest>;

let dbInstance: Database | null = null;
let layerRegistry: LayerRegistry | null = null;

const chatRoute = new Hono();

let llmClient = createLLMClient();
let parser = new IntentParser(llmClient);

function getLLMMetadata(): { llmProvider: string; llmModel: string } {
  return {
    llmProvider: llmClient.providerName ?? 'unknown',
    llmModel: llmClient.modelName ?? 'unknown',
  };
}

function classifyLLMFailure(error: unknown): {
  status: 500 | 502 | 503;
  error: string;
  message: string;
  retryAfter?: string;
  statusCode?: number;
} | null {
  if (error instanceof LLMProviderError) {
    if (error.kind === 'auth') {
      return {
        status: 502,
        error: 'LLM authentication failure',
        message: 'The configured LLM provider rejected the API credentials.',
        statusCode: error.statusCode,
      };
    }
    if (error.kind === 'rate_limit') {
      return {
        status: 503,
        error: 'LLM provider rate limited',
        message: 'The LLM provider is rate limiting requests.',
        retryAfter: error.retryAfter,
        statusCode: error.statusCode,
      };
    }
    if (error.kind === 'network' || error.kind === 'timeout') {
      return {
        status: 503,
        error: 'LLM service unavailable',
        message: error.message,
        statusCode: error.statusCode,
      };
    }
    return {
      status: 500,
      error: 'LLM provider failure',
      message: error.message,
      statusCode: error.statusCode,
    };
  }

  if (error instanceof Error) {
    const modelFailure =
      error.message.includes('LLM did not return valid JSON') ||
      error.message.includes('Failed to parse JSON from LLM response') ||
      error.message.includes('Query validation failed');
    if (modelFailure) {
      return {
        status: 500,
        error: 'LLM model error',
        message: 'The LLM returned an invalid structured query.',
      };
    }
  }

  return null;
}

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
  log({ level: 'info', event: 'chat.config', layers: registry.loadedLayerNames });
}

export function setLLMClientForTests(client: typeof llmClient): void {
  llmClient = client;
  parser = new IntentParser(llmClient);
  if (layerRegistry) {
    setLayerRegistry(layerRegistry);
  }
}

function generateDynamicSuggestions(availableLayers: string[]): string[] {
  const suggestions: string[] = [];

  if (availableLayers.includes('short_term_rentals') && availableLayers.includes('parks')) {
    suggestions.push('Try: "Short-term rental permits near parks"');
  }
  if (availableLayers.includes('parcels') && availableLayers.includes('transit_access')) {
    suggestions.push('Try: "Parcels near transit stops"');
  }
  if (availableLayers.includes('census_tracts')) {
    suggestions.push('Try: "Census tracts where median income is below 40000"');
  }
  if (availableLayers.includes('parks')) {
    suggestions.push('Try: "Parks larger than 10 acres"');
  }
  if (availableLayers.includes('parcels') && availableLayers.includes('flood_zones')) {
    suggestions.push('Try: "Parcels that intersect flood zones"');
  }
  if (availableLayers.includes('parcels')) {
    suggestions.push('Try: "Parcels with assessed value over 1 million dollars"');
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
  const requestId = getRequestId(c.req.raw);
  const llmMetadata = getLLMMetadata();
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

    // Resolve language: explicit body field → Accept-Language header → 'en'
    const acceptLang = c.req.header('Accept-Language') ?? '';
    const lang: 'en' | 'es' = body.lang
      ?? (acceptLang.toLowerCase().startsWith('es') ? 'es' : 'en');

    let conversationId: string | undefined;
    let conversationTurn = 0;
    let conversationContext: ConversationContext | null = null;
    let statelessConversation = false;
    const requestedSession = body.conversationId ? getSession(body.conversationId) : null;

    if (requestedSession) {
      conversationId = body.conversationId;
      conversationTurn = requestedSession.turnCount;
      if (requestedSession.previousQuery) {
        conversationContext = {
          previousQuery: requestedSession.previousQuery,
          previousLayer: requestedSession.previousQuery.selectLayer,
        };
      }
    } else {
      const createdConversationId = createSession();
      if (createdConversationId) {
        conversationId = createdConversationId;
      } else {
        statelessConversation = true;
        log({
          level: 'warn',
          event: 'chat.conversation_stateless',
          requestId,
          conversationStoreFull: true,
        });
      }
    }

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

    const parseCacheKey = stableJsonKey({
      message: body.message,
      lang,
      previousQuery: conversationContext?.previousQuery ?? null,
    });
    const cachedParse = parseCache.get(parseCacheKey);
    if (cachedParse) {
      parseResult = cachedParse;
      parseCacheHit = true;
    } else {
      try {
        const parseStart = performance.now();
        // Trust boundary: parser.parse builds the only LLM prompt for NL parsing.
        // It receives raw user text as delimited data plus validated structured
        // context; client-supplied explanation text is never forwarded.
        parseResult = await parser.parse(body.message, conversationContext, lang);
        parseTimeMs = performance.now() - parseStart;
        parseCache.set(parseCacheKey, parseResult);
      } catch (error) {
        const failure = classifyLLMFailure(error);
        if (failure) {
          log({
            level: 'error',
            event: 'llm.failure',
            phase: 'parse',
            requestId,
            ...llmMetadata,
            statusCode: failure.statusCode,
            httpStatus: failure.status,
            error: error instanceof Error ? error.message : 'unknown',
          });
          if (failure.retryAfter) {
            c.header('Retry-After', failure.retryAfter);
          }
          return c.json(
            {
              error: failure.error,
              message: failure.message,
              grounding,
              suggestions: generateDynamicSuggestions(availableLayers),
            },
            failure.status
          );
        }

        const errorMessage =
          error instanceof Error ? error.message : 'Unknown parsing error';
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

    log({
      level: 'info',
      event: 'chat.parse',
      requestId,
      parseTimeMs: Math.round(parseTimeMs * 100) / 100,
      llmLatencyMs: Math.round(parseTimeMs * 100) / 100,
      ...llmMetadata,
      parseCacheHit,
      confidence: parseResult.confidence,
    });

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

    log({
      level: 'info',
      event: 'chat.execute',
      requestId,
      executionTimeMs: Math.round(executionTimeMs * 100) / 100,
      queryCacheHit,
      featureCount: result.features.length,
      layer: prepared.executableQuery.selectLayer,
      queryHash: prepared.queryHash,
    });

    const deterministicExplanation = generateExplanation(
      prepared.executableQuery,
      result.features.length,
      lang
    );

    // Attempt LLM equity explanation (5s timeout); fall back to deterministic on failure
    let equityNarrative: string | null = null;
    let equityLatencyMs = 0;
    try {
      const equityStart = performance.now();
      const equity = await generateEquityExplanation(
        llmClient,
        prepared.executableQuery,
        result.features.length,
        result.features as Array<{ properties: Record<string, unknown> | null }>,
        { timeoutMs: 12_000, lang }
      );
      equityLatencyMs = performance.now() - equityStart;
      equityNarrative = equity.equityNarrative;
    } catch (error) {
      log({
        level: 'warn',
        event: 'llm.failure',
        phase: 'equity',
        requestId,
        ...llmMetadata,
        error: error instanceof Error ? error.message : 'unknown',
      });
      // Graceful degradation — equity narrative is optional
    }

    log({
      level: 'info',
      event: 'chat.equity',
      requestId,
      llmLatencyMs: Math.round(equityLatencyMs * 100) / 100,
      ...llmMetadata,
      equityNarrativeReturned: equityNarrative !== null,
    });

    const explanation = equityNarrative ?? deterministicExplanation;
    if (conversationId) {
      const updatedSession = updateSession(
        conversationId,
        prepared.executableQuery,
        explanation
      );
      conversationTurn = updatedSession?.turnCount ?? conversationTurn;
    } else if (statelessConversation) {
      conversationTurn = 0;
    }

    const response: ChatResponse = {
      ...(conversationId ? { conversationId } : {}),
      conversationTurn,
      query: prepared.executableQuery,
      result: result as ChatResponse['result'],
      summary: deterministicExplanation,
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
    };

    return c.json(response);
  } catch (error) {
    if (error instanceof Error) {
      log({
        level: 'error',
        event: 'chat.error',
        requestId,
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

    log({ level: 'error', event: 'chat.error', requestId, errorType: 'unknown', errorMessage: 'Unknown error' });
    return c.json({ error: 'Unknown error' }, 500);
  }
});

export default chatRoute;
