/**
 * Unit tests for QueryBuilder
 */

import { describe, expect, it } from 'vitest';
import { QueryBuilder } from '../src/lib/orchestrator/builder';
import type { StructuredQuery } from '../../shared/types/query';

describe('QueryBuilder', () => {
  describe('Simple attribute queries', () => {
    it('builds simple numeric attribute filter query', () => {
      const query: StructuredQuery = {
        selectLayer: 'parcels',
        attributeFilters: [{ field: 'assessed_value', op: 'gt', value: 500000 }],
      };

      const builder = new QueryBuilder(query);
      const { sql, params } = builder.build();

      expect(sql).toContain('FROM "parcels"');
      expect(sql).toContain('"assessed_value" > $1');
      expect(sql).toContain('WHERE');
      expect(params).toEqual([500000]);
    });

    it('builds query with multiple attribute filters (AND)', () => {
      const query: StructuredQuery = {
        selectLayer: 'parcels',
        attributeFilters: [
          { field: 'assessed_value', op: 'gt', value: 500000 },
          { field: 'acres', op: 'lt', value: 1 },
        ],
        attributeLogic: 'and',
      };

      const builder = new QueryBuilder(query);
      const { sql } = builder.build();

      expect(sql).toContain('"assessed_value" > $1');
      expect(sql).toContain('"acres" < $2');
      expect(sql).toContain('AND');
    });

    it('builds query with multiple attribute filters (OR)', () => {
      const query: StructuredQuery = {
        selectLayer: 'parcels',
        attributeFilters: [
          { field: 'address', op: 'like', value: '%Main%' },
          { field: 'address', op: 'like', value: '%Palace%' },
        ],
        attributeLogic: 'or',
      };

      const builder = new QueryBuilder(query);
      const { sql } = builder.build();

      expect(sql).toContain('OR');
      expect(sql).toContain('ILIKE');
    });

    it('builds query with IN operator', () => {
      const query: StructuredQuery = {
        selectLayer: 'parcels',
        attributeFilters: [
          { field: 'parcel_id', op: 'in', value: ['P001', 'P002', 'P003'] },
        ],
      };

      const builder = new QueryBuilder(query);
      const { sql, params } = builder.build();

      expect(sql).toContain('IN');
      expect(params).toEqual(['P001', 'P002', 'P003']);
    });

    it('uses ILIKE for case-insensitive pattern matching', () => {
      const query: StructuredQuery = {
        selectLayer: 'parcels',
        attributeFilters: [{ field: 'address', op: 'like', value: '%Main St%' }],
      };

      const builder = new QueryBuilder(query);
      const { sql, params } = builder.build();

      expect(sql).toContain('"address" ILIKE $1');
      expect(params).toContain('%Main St%');
    });
  });

  describe('Spatial queries', () => {
    it('builds within_distance query using projected geometry', () => {
      const query: StructuredQuery = {
        selectLayer: 'parcels',
        spatialFilters: [
          {
            op: 'within_distance',
            targetLayer: 'hydrology',
            distance: 500,
          },
        ],
      };

      const builder = new QueryBuilder(query);
      const { sql, params } = builder.build();

      expect(sql).toContain('ST_DWithin');
      expect(sql).toContain('geom_utm13');
      expect(params).toContain(500);
    });

    it('builds intersects query using geographic geometry', () => {
      const query: StructuredQuery = {
        selectLayer: 'parcels',
        spatialFilters: [{ op: 'intersects', targetLayer: 'flood_zones' }],
      };

      const builder = new QueryBuilder(query);
      const { sql } = builder.build();

      expect(sql).toContain('ST_Intersects');
      expect(sql).toContain('geom_4326');
    });

    it('builds contains query using geographic geometry', () => {
      const query: StructuredQuery = {
        selectLayer: 'zoning_districts',
        spatialFilters: [{ op: 'contains', targetLayer: 'parcels' }],
      };

      const builder = new QueryBuilder(query);
      const { sql } = builder.build();

      expect(sql).toContain('ST_Contains');
      expect(sql).toContain('geom_4326');
    });

    it('builds spatial query with target filter', () => {
      const query: StructuredQuery = {
        selectLayer: 'parcels',
        spatialFilters: [
          {
            op: 'within_distance',
            targetLayer: 'hydrology',
            targetFilter: [{ field: 'type', op: 'eq', value: 'ARROYO' }],
            distance: 500,
          },
        ],
      };

      const builder = new QueryBuilder(query);
      const { sql, params } = builder.build();

      expect(sql).toContain('ST_DWithin');
      expect(sql).toContain('"type" = $1');
      expect(params).toContain('ARROYO');
    });

    it('builds query with multiple spatial filters', () => {
      const query: StructuredQuery = {
        selectLayer: 'parcels',
        spatialFilters: [
          {
            op: 'within_distance',
            targetLayer: 'hydrology',
            distance: 500,
          },
          {
            op: 'intersects',
            targetLayer: 'flood_zones',
          },
        ],
        spatialLogic: 'and',
      };

      const builder = new QueryBuilder(query);
      const { sql } = builder.build();

      expect(sql).toContain('ST_DWithin');
      expect(sql).toContain('ST_Intersects');
      expect(sql).toContain('AND');
    });
  });

  describe('Aggregate queries', () => {
    it('builds aggregate query with groupBy and metrics', () => {
      const query: StructuredQuery = {
        selectLayer: 'parcels',
        aggregate: {
          groupBy: ['address'],
          metrics: [
            { field: 'assessed_value', op: 'median', alias: 'median_value' },
            { field: '*', op: 'count', alias: 'count' },
          ],
        },
      };

      const builder = new QueryBuilder(query);
      const { sql } = builder.build();

      expect(sql).toContain('GROUP BY');
      expect(sql).toContain('address');
      expect(sql).toContain('MEDIAN');
      expect(sql).toContain('COUNT');
      expect(sql).toContain('median_value');
    });
  });

  describe('Combined queries', () => {
    it('builds query with both attribute and spatial filters', () => {
      const query: StructuredQuery = {
        selectLayer: 'parcels',
        attributeFilters: [{ field: 'assessed_value', op: 'gt', value: 500000 }],
        spatialFilters: [
          {
            op: 'within_distance',
            targetLayer: 'hydrology',
            distance: 500,
          },
        ],
      };

      const builder = new QueryBuilder(query);
      const { sql } = builder.build();

      expect(sql).toContain('"assessed_value" > $1');
      expect(sql).toContain('ST_DWithin');
      expect(sql.split('AND').length).toBeGreaterThan(1);
    });

    it('builds query with limit and orderBy', () => {
      const query: StructuredQuery = {
        selectLayer: 'parcels',
        limit: 50,
        orderBy: { field: 'assessed_value', direction: 'desc' },
      };

      const builder = new QueryBuilder(query);
      const { sql } = builder.build();

      expect(sql).toContain('LIMIT 50');
      expect(sql).toContain('ORDER BY');
      expect(sql).toContain('assessed_value');
      expect(sql).toContain('DESC');
    });
  });

  describe('Error handling', () => {
    it('throws error for unknown layer', () => {
      const query: StructuredQuery = {
        selectLayer: 'unknown_layer',
      };

      expect(() => new QueryBuilder(query)).toThrow('Unknown layer');
    });

    it('throws error for within_distance without distance', () => {
      const query: StructuredQuery = {
        selectLayer: 'parcels',
        spatialFilters: [{ op: 'within_distance', targetLayer: 'hydrology' }],
      };

      const builder = new QueryBuilder(query);
      expect(() => builder.build()).toThrow('within_distance requires distance');
    });
  });

  describe('Nearest neighbor queries', () => {
    it('builds proper k-NN query with ORDER BY distance LIMIT', () => {
      const query: StructuredQuery = {
        selectLayer: 'parcels',
        spatialFilters: [{ op: 'nearest', targetLayer: 'transit_access', limit: 5 }],
      };

      const builder = new QueryBuilder(query);
      const { sql, params } = builder.build();

      expect(sql).toContain('ORDER BY distance ASC');
      expect(sql).toContain('LIMIT 5');
      expect(params).toHaveLength(0);
      expect(sql).toContain('geom_utm13');
      expect(sql).toContain('ST_Distance');
      expect(sql).not.toContain('10000');
      expect(sql).not.toContain('ST_DWithin');
    });

    it('builds k-NN query with target filter', () => {
      const query: StructuredQuery = {
        selectLayer: 'parcels',
        spatialFilters: [
          {
            op: 'nearest',
            targetLayer: 'transit_access',
            targetFilter: [{ field: 'stop_type', op: 'eq', value: 'bus' }],
            limit: 3,
          },
        ],
      };

      const builder = new QueryBuilder(query);
      const { sql } = builder.build();

      expect(sql).toContain('ORDER BY distance ASC');
      expect(sql).toContain('stop_type');
      expect(sql).toContain('LIMIT');
    });

    it('builds k-NN query with attribute filters', () => {
      const query: StructuredQuery = {
        selectLayer: 'parcels',
        attributeFilters: [{ field: 'assessed_value', op: 'gt', value: 500000 }],
        spatialFilters: [{ op: 'nearest', targetLayer: 'transit_access', limit: 10 }],
      };

      const builder = new QueryBuilder(query);
      const { sql } = builder.build();

      expect(sql).toContain('ORDER BY distance ASC');
      expect(sql).toContain('assessed_value');
      expect(sql).toContain('LIMIT');
    });

    it('throws error for nearest without limit', () => {
      const query: StructuredQuery = {
        selectLayer: 'parcels',
        spatialFilters: [{ op: 'nearest', targetLayer: 'transit_access' }],
      };

      const builder = new QueryBuilder(query);
      expect(() => builder.build()).toThrow('nearest operation requires limit');
    });
  });

  describe('CRS selection', () => {
    it('uses projected geometry for metric operations', () => {
      const metricOps: Array<'within_distance' | 'nearest'> = [
        'within_distance',
        'nearest',
      ];

      for (const op of metricOps) {
        const query: StructuredQuery = {
          selectLayer: 'parcels',
          spatialFilters: [
            {
              op,
              targetLayer: 'hydrology',
              distance: op === 'within_distance' ? 500 : undefined,
              limit: op === 'nearest' ? 5 : undefined,
            },
          ],
        };

        const builder = new QueryBuilder(query);
        const { sql } = builder.build();

        expect(sql).toContain('geom_utm13');
      }
    });

    it('uses geographic geometry for topological operations', () => {
      const topologicalOps: Array<'intersects' | 'contains' | 'within'> = [
        'intersects',
        'contains',
        'within',
      ];

      for (const op of topologicalOps) {
        const query: StructuredQuery = {
          selectLayer: 'parcels',
          spatialFilters: [{ op, targetLayer: 'flood_zones' }],
        };

        const builder = new QueryBuilder(query);
        const { sql } = builder.build();

        expect(sql).toContain('geom_4326');
      }
    });
  });

  describe('attribute filter SQL generation', () => {
    it('generates gt comparison for numeric field', () => {
      const query: StructuredQuery = {
        selectLayer: 'parcels',
        attributeFilters: [{ field: 'acres', op: 'gt', value: 1 }],
      };

      const builder = new QueryBuilder(query);
      const { sql } = builder.build();

      expect(sql).toContain('"acres" > $1');
      expect(sql).not.toContain('TRY_CAST');
    });

    it('generates eq comparison with correct placeholder', () => {
      const query: StructuredQuery = {
        selectLayer: 'parcels',
        attributeFilters: [{ field: 'parcel_id', op: 'eq', value: 'P001' }],
      };

      const builder = new QueryBuilder(query);
      const { sql } = builder.build();

      expect(sql).toContain('"parcel_id" = $1');
    });

    it('generates lte comparison for building height', () => {
      const query: StructuredQuery = {
        selectLayer: 'building_footprints',
        attributeFilters: [{ field: 'height', op: 'lte', value: 30 }],
      };

      const builder = new QueryBuilder(query);
      const { sql } = builder.build();

      expect(sql).toContain('"height" <= $1');
      expect(sql).not.toContain('TRY_CAST');
    });

    it('generates gt comparison for assessed_value', () => {
      const query: StructuredQuery = {
        selectLayer: 'parcels',
        attributeFilters: [{ field: 'assessed_value', op: 'gt', value: 500000 }],
      };

      const builder = new QueryBuilder(query);
      const { sql } = builder.build();

      expect(sql).not.toContain('TRY_CAST');
      expect(sql).toContain('"assessed_value" > $1');
    });
  });
});
