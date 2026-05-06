import type { StructuredQuery } from './query';

export interface GroundingInfo {
  status: 'exact_match' | 'partial_match' | 'unsupported';
  requestedConcepts: string[];
  matchedLayers: string[];
  missingConcepts: string[];
  missingLayers: string[];
  disambiguationPrompt?: string;
  suggestions: string[];
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
  features: GeoJSON.Feature<GeoJSON.Geometry, Record<string, unknown>>[];
  metadata?: QueryMetadata;
}

export interface ChatRequest {
  message: string;
  lang?: 'en' | 'es';
  conversationId?: string;
}

export interface ChatResponse {
  conversationId?: string;
  conversationTurn: number;
  query: StructuredQuery;
  result: QueryResult;
  summary: string;
  explanation: string;
  equityNarrative?: string | null;
  confidence: number;
  grounding: GroundingInfo;
  metadata: QueryMetadata;
  suggestions?: string[];
}
