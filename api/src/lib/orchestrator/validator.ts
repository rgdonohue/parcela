/**
 * Zod validation schemas for StructuredQuery
 * 
 * Validates LLM output before execution to catch invalid queries early.
 */

import { z } from 'zod';
import type {
  StructuredQuery,
  AttributeFilter,
  SpatialFilter,
  AggregateMetric,
  AggregateSpec,
  TemporalQuery,
} from '../../../../shared/types/query';

export const MAX_DISTANCE_METERS = 50_000;

// ============================================================================
// Attribute Filter Schema
// ============================================================================

export const attributeFilterSchema: z.ZodType<AttributeFilter> = z.object({
  field: z.string().min(1),
  op: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'like']),
  value: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.union([z.string(), z.number(), z.boolean()])),
  ]),
});

// ============================================================================
// Spatial Filter Schema
// ============================================================================

export const spatialFilterSchema: z.ZodType<SpatialFilter> = z.object({
  op: z.enum([
    'within_distance',
    'intersects',
    'contains',
    'within',
    'nearest',
  ]),
  targetLayer: z.string().min(1),
  targetFilter: z.array(attributeFilterSchema).optional(),
  distance: z
    .number()
    .positive()
    .max(MAX_DISTANCE_METERS, `distance must be <= ${MAX_DISTANCE_METERS} meters`)
    .optional(),
  limit: z.number().int().positive().optional(),
}).superRefine((filter, ctx) => {
  if (filter.op === 'within_distance' && filter.distance === undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['distance'],
      message: 'within_distance spatial filters require distance',
    });
  }
});

// ============================================================================
// Aggregate Schema
// ============================================================================

export const aggregateMetricSchema: z.ZodType<AggregateMetric> = z.object({
  field: z.string().min(1),
  op: z.enum(['count', 'sum', 'avg', 'median', 'min', 'max']),
  alias: z.string().optional(),
});

export const aggregateSpecSchema: z.ZodType<AggregateSpec> = z.object({
  groupBy: z.array(z.string().min(1)).min(1),
  metrics: z.array(aggregateMetricSchema).min(1),
});

// ============================================================================
// Temporal Query Schema
// ============================================================================

export const temporalQuerySchema: z.ZodType<TemporalQuery> = z.object({
  baseline: z.union([
    z.object({ year: z.number().int().min(1900).max(2100) }),
    z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  ]),
  comparison: z.union([
    z.object({ year: z.number().int().min(1900).max(2100) }),
    z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  ]),
  metric: z.string().min(1),
});

// ============================================================================
// Main Structured Query Schema
// ============================================================================

export const structuredQuerySchema: z.ZodType<StructuredQuery> = z.object({
  selectLayer: z.string().min(1),
  selectFields: z.array(z.string().min(1)).optional(),
  attributeFilters: z.array(attributeFilterSchema).optional(),
  attributeLogic: z.enum(['and', 'or']).optional(),
  spatialFilters: z.array(spatialFilterSchema).optional(),
  spatialLogic: z.enum(['and', 'or']).optional(),
  aggregate: aggregateSpecSchema.optional(),
  temporal: temporalQuerySchema.optional(),
  limit: z.number().int().positive().max(1000).optional(),
  orderBy: z
    .object({
      field: z.string().min(1),
      direction: z.enum(['asc', 'desc']),
    })
    .optional(),
});

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate a StructuredQuery
 * 
 * @param input - Unknown input to validate
 * @returns Validated StructuredQuery
 * @throws ZodError if validation fails
 */
export function validateQuery(input: unknown): StructuredQuery {
  return structuredQuerySchema.parse(input);
}

/**
 * Safely validate a StructuredQuery, returning a result
 * 
 * @param input - Unknown input to validate
 * @returns Validation result with success flag
 */
export function safeValidateQuery(
  input: unknown
): { success: true; data: StructuredQuery } | { success: false; error: z.ZodError } {
  const result = structuredQuerySchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}
