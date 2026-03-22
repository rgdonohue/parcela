/**
 * API client for Santa Fe Spatial Chat
 */

import type {
  ChatRequest,
  ChatResponse,
  QueryRequest,
  LayersResponse,
  GroundingInfo,
  QueryResult,
  StructuredQuery,
} from '../types/api';

/**
 * API base URL — reads from VITE_API_BASE env var at build time.
 * Falls back to '/api' for same-origin production deployments,
 * or 'http://localhost:3000' for local development when no env var is set.
 */
const API_BASE: string =
  import.meta.env.VITE_API_BASE ??
  (typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : '');

/**
 * Custom error class for API errors
 */
export class ApiClientError extends Error {
  statusCode: number;
  details?: string;
  suggestions?: string[];
  grounding?: GroundingInfo;

  constructor(
    message: string,
    statusCode: number,
    details?: string,
    suggestions?: string[],
    grounding?: GroundingInfo
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.statusCode = statusCode;
    this.details = details;
    this.suggestions = suggestions;
    this.grounding = grounding;
  }
}

/**
 * Generic fetch wrapper with error handling
 */
async function apiFetch<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      let errorMessage = `API error: ${response.status}`;
      let details: string | undefined;
      let suggestions: string[] | undefined;
      let grounding: GroundingInfo | undefined;

      try {
        const errorBody = (await response.json()) as Record<string, unknown>;
        errorMessage = (errorBody.error as string) ?? errorMessage;
        // API returns 'message' field with more details
        details = (errorBody.message as string) ?? (errorBody.details as string);
        // API may return suggestions for how to fix the query
        suggestions = errorBody.suggestions as string[] | undefined;
        grounding = errorBody.grounding as GroundingInfo | undefined;
      } catch {
        // Ignore JSON parse errors for error response
      }

      throw new ApiClientError(
        errorMessage,
        response.status,
        details,
        suggestions,
        grounding
      );
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ApiClientError) {
      throw error;
    }

    // Network or other errors
    throw new ApiClientError(
      error instanceof Error ? error.message : 'Unknown error',
      0
    );
  }
}

/**
 * Conversation context for multi-turn refinement.
 */
export interface ConversationContext {
  previousQuery: StructuredQuery;
  previousLayer: string;
  previousResultCount: number;
  previousExplanation: string;
}

/**
 * Send a natural language chat message, optionally with conversation context
 * for multi-turn refinement ("filter those to...", "now show just...").
 */
export async function sendChatMessage(
  message: string,
  context?: ConversationContext
): Promise<ChatResponse> {
  const request: ChatRequest & { context?: ConversationContext } = {
    message,
    context,
  };

  return apiFetch<ChatResponse>('/api/chat', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

/**
 * Execute a structured query directly
 */
export async function executeQuery(
  query: StructuredQuery
): Promise<QueryResult> {
  const request: QueryRequest = { query };

  return apiFetch<QueryResult>('/api/query', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

/**
 * Get available layers and their schemas
 */
export async function getLayers(): Promise<LayersResponse> {
  return apiFetch<LayersResponse>('/api/layers');
}

/**
 * Check API health
 */
export async function checkHealth(): Promise<{ status: string }> {
  return apiFetch<{ status: string }>('/api/health');
}
