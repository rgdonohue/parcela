import { describe, expect, it } from 'vitest';
import type { LayerRegistry } from '../src/lib/layers/registry';
import type { StructuredQuery } from '../../shared/types/query';
import {
  applyQueryLimits,
  normalizeStructuredQuery,
  validateQueryAgainstRegistry,
} from '../src/lib/orchestrator/query-grounding';

const registry: LayerRegistry = {
  generatedAt: '2026-01-01T00:00:00.000Z',
  loadedLayerNames: ['parcels', 'zoning_districts', 'hydrology'],
  layers: {
    parcels: {
      name: 'parcels',
      geometryType: 'Polygon',
      schemaFields: {
        parcel_id: 'string',
        address: 'string | null',
        assessed_value: 'number | null',
      },
      loadedFields: ['parcel_id', 'address', 'assessed_value'],
      queryableFields: ['parcel_id', 'address', 'assessed_value'],
      featureCount: 10,
      isLoaded: true,
      description: 'Parcels',
    },
    zoning_districts: {
      name: 'zoning_districts',
      geometryType: 'Polygon',
      schemaFields: {
        zone_code: 'string',
        zone_name: 'string',
        allows_residential: 'boolean',
        allows_commercial: 'boolean',
      },
      loadedFields: ['zone_code', 'zone_name'],
      queryableFields: [
        'zone_code',
        'zone_name',
        'allows_residential',
        'allows_commercial',
      ],
      featureCount: 10,
      isLoaded: true,
      description: 'Zoning',
    },
    hydrology: {
      name: 'hydrology',
      geometryType: 'LineString',
      schemaFields: {
        name: 'string',
      },
      loadedFields: ['name'],
      queryableFields: ['name'],
      featureCount: 10,
      isLoaded: true,
      description: 'Hydrology',
    },
  },
};

describe('normalizeStructuredQuery', () => {
  it('maps allows_residential filter to zone_code LIKE', () => {
    const input: StructuredQuery = {
      selectLayer: 'zoning_districts',
      attributeFilters: [
        { field: 'allows_residential', op: 'eq', value: true },
      ],
    };

    const normalized = normalizeStructuredQuery(input);
    expect(normalized.query.attributeFilters?.[0]).toEqual({
      field: 'zone_code',
      op: 'like',
      value: 'R%',
    });
    expect(normalized.notes).toContain(
      'Mapped allows_residential=true to a case-insensitive zone_code match on R%'
    );
  });
});

describe('validateQueryAgainstRegistry', () => {
  it('flags temporal queries as unsupported', () => {
    const input: StructuredQuery = {
      selectLayer: 'parcels',
      temporal: {
        baseline: { year: 2018 },
        comparison: { year: 2024 },
        metric: 'assessed_value',
      },
    };

    const issues = validateQueryAgainstRegistry(input, registry);
    expect(issues.some((issue) => issue.path === 'temporal')).toBe(true);
  });
});

describe('applyQueryLimits', () => {
  it('applies default limits for missing limit values', () => {
    const input: StructuredQuery = { selectLayer: 'parcels' };
    const result = applyQueryLimits(input, registry);

    expect(result.defaultLimitApplied).toBe(true);
    expect(result.query.limit).toBeGreaterThan(0);
  });

  it('caps limits over hard cap and marks truncated', () => {
    const input: StructuredQuery = {
      selectLayer: 'parcels',
      limit: 20000,
    };
    const result = applyQueryLimits(input, registry);

    expect(result.truncated).toBe(true);
    expect(result.query.limit).toBe(result.hardCap);
  });
});
