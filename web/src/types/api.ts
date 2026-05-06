/**
 * API types for the Parcela frontend
 */

import type { StructuredQuery } from '../../../shared/types/query';
import type {
  ChatRequest as SharedChatRequest,
  ChatResponse as SharedChatResponse,
  GroundingInfo as SharedGroundingInfo,
  QueryMetadata as SharedQueryMetadata,
  QueryResult as SharedQueryResult,
} from '../../../shared/types/api';

export type {
  StructuredQuery,
  AttributeFilter,
  SpatialFilter,
  AggregateSpec,
  TemporalQuery,
} from '../../../shared/types/query';

export type GroundingInfo = SharedGroundingInfo;

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  query?: StructuredQuery;
  result?: QueryResult;
  metadata?: QueryMetadata;
  grounding?: GroundingInfo;
  equityNarrative?: string | null;
  error?: string;
}

export type QueryMetadata = SharedQueryMetadata;

export type QueryResult = SharedQueryResult;

export type ChatRequest = SharedChatRequest;

export type ChatResponse = SharedChatResponse;

export interface QueryRequest {
  query: StructuredQuery;
}

export interface LayerSummary {
  name: string;
  geometryType: string;
  schemaFields: string[];
  isLoaded: boolean;
  isValidated?: boolean;
  loadedFields: string[];
  featureCount: number | null;
  description?: string;
}

export interface LayersResponse {
  layers: LayerSummary[];
  count: number;
  loadedCount: number;
  generatedAt?: string;
}

export interface ApiError {
  error: string;
  details?: string;
  message?: string;
  suggestions?: string[];
  grounding?: GroundingInfo;
}
