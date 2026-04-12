/**
 * API types for the Parcela frontend
 */

import type { Feature, Geometry } from 'geojson';
import type { StructuredQuery } from '../../../shared/types/query';

export type {
  StructuredQuery,
  AttributeFilter,
  SpatialFilter,
  AggregateSpec,
  TemporalQuery,
} from '../../../shared/types/query';

export interface GroundingInfo {
  status: 'exact_match' | 'partial_match' | 'unsupported';
  requestedConcepts: string[];
  matchedLayers: string[];
  missingConcepts: string[];
  missingLayers: string[];
  disambiguationPrompt?: string;
  suggestions: string[];
}

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

export interface QueryMetadata {
  count: number;
  executionTimeMs: number;
  parseTimeMs?: number;
  queryHash?: string;
  sourceLayers?: string[];
  truncated?: boolean;
  maxFeaturesApplied?: number;
  hardCap?: number;
  defaultLimitApplied?: boolean;
  normalizationNotes?: string[];
  cache?: {
    parseHit: boolean;
    queryHit: boolean;
  };
}

export interface QueryResult {
  type: 'FeatureCollection';
  features: Feature<Geometry, Record<string, unknown>>[];
  metadata?: QueryMetadata;
}

export interface ChatRequest {
  message: string;
  conversationId?: string;
}

export interface ChatResponse {
  query: StructuredQuery;
  result: QueryResult;
  explanation: string;
  equityNarrative?: string | null;
  confidence: number;
  grounding: GroundingInfo;
  metadata: QueryMetadata;
  suggestions?: string[];
}

export interface QueryRequest {
  query: StructuredQuery;
}

export interface LayerSummary {
  name: string;
  geometryType: string;
  schemaFields: string[];
  isLoaded: boolean;
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
