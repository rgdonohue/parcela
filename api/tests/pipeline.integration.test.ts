import { describe, expect, it } from 'vitest';
import type { StructuredQuery } from '../../shared/types/query';
import type { LayerRegistry } from '../src/lib/layers/registry';
import { prepareQuery } from '../src/lib/utils/query-executor';

const registry: LayerRegistry = {
  generatedAt: '2026-01-01T00:00:00.000Z',
  loadedLayerNames: [
    'parcels',
    'transit_access',
    'zoning_districts',
    'flood_zones',
    'short_term_rentals',
    'parks',
    'building_footprints',
    'hydrology',
  ],
  layers: {
    parcels: {
      name: 'parcels',
      geometryType: 'Polygon',
      schemaFields: {
        parcel_id: 'string',
        address: 'string | null',
        acres: 'number',
        assessed_value: 'number | null',
      },
      loadedFields: [
        'parcel_id',
        'address',
        'acres',
        'assessed_value',
        'zoning',
        'land_use',
        'year_built',
      ],
      queryableFields: ['parcel_id', 'address', 'acres', 'assessed_value'],
      featureCount: 63439,
      isLoaded: true,
      description: 'Parcels',
      source: 'fixture',
    },
    transit_access: {
      name: 'transit_access',
      geometryType: 'Point',
      schemaFields: {
        stop_id: 'string',
        stop_type: 'string',
      },
      loadedFields: [
        'stop_id',
        'stop_type',
        'stop_name',
        'route_ids',
        'route_names',
      ],
      queryableFields: ['stop_id', 'stop_type'],
      featureCount: 447,
      isLoaded: true,
      description: 'Transit stops',
      source: 'fixture',
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
      featureCount: 851,
      isLoaded: true,
      description: 'Zoning districts',
      source: 'fixture',
    },
    flood_zones: {
      name: 'flood_zones',
      geometryType: 'Polygon',
      schemaFields: {
        zone_id: 'string',
        zone_code: 'string',
        zone_name: 'string',
        flood_risk_level: 'string',
        base_flood_elevation: 'number | null',
        source: 'string',
      },
      loadedFields: [
        'zone_id',
        'zone_code',
        'zone_name',
        'flood_risk_level',
        'base_flood_elevation',
        'source',
      ],
      queryableFields: [
        'zone_id',
        'zone_code',
        'zone_name',
        'flood_risk_level',
        'base_flood_elevation',
        'source',
      ],
      featureCount: 227,
      isLoaded: true,
      description: 'Flood zones',
      source: 'fixture',
    },
    short_term_rentals: {
      name: 'short_term_rentals',
      geometryType: 'Point',
      schemaFields: {
        listing_id: 'string',
        address: 'string | null',
        business_name: 'string | null',
        permit_issued_date: 'string | null',
        permit_expiry_date: 'string | null',
      },
      loadedFields: [
        'listing_id',
        'address',
        'business_name',
        'permit_issued_date',
        'permit_expiry_date',
        'price_per_night',
        'room_type',
      ],
      queryableFields: [
        'listing_id',
        'address',
        'business_name',
        'permit_issued_date',
        'permit_expiry_date',
      ],
      featureCount: 897,
      isLoaded: true,
      description: 'Short-term rental permits',
      source: 'fixture',
    },
    parks: {
      name: 'parks',
      geometryType: 'Polygon',
      schemaFields: {
        park_id: 'string',
        name: 'string',
        park_type: 'string',
        owner: 'string',
        acres: 'number | null',
        council_district: 'string | null',
      },
      loadedFields: [
        'park_id',
        'name',
        'park_type',
        'owner',
        'acres',
        'council_district',
        'trail_miles',
        'status',
      ],
      queryableFields: [
        'park_id',
        'name',
        'park_type',
        'owner',
        'acres',
        'council_district',
      ],
      featureCount: 77,
      isLoaded: true,
      description: 'Parks',
      source: 'fixture',
    },
    building_footprints: {
      name: 'building_footprints',
      geometryType: 'Polygon',
      schemaFields: {
        building_id: 'string',
        address: 'string | null',
        height: 'number | null',
        source: 'string | null',
      },
      loadedFields: [
        'building_id',
        'address',
        'height',
        'source',
        'building_type',
        'year_built',
        'source_year',
      ],
      queryableFields: ['building_id', 'address', 'height', 'source'],
      featureCount: 42630,
      isLoaded: true,
      description: 'Building footprints',
      source: 'fixture',
    },
    hydrology: {
      name: 'hydrology',
      geometryType: 'LineString',
      schemaFields: {
        name: 'string',
        type: 'string',
        length_km: 'number',
      },
      loadedFields: ['name', 'type', 'length_km'],
      queryableFields: ['name', 'type', 'length_km'],
      featureCount: 109,
      isLoaded: true,
      description: 'Hydrology',
      source: 'fixture',
    },
  },
};

describe('prepareQuery pipeline', () => {
  it('accepts retained parcel fields and applies a default limit', () => {
    const input: StructuredQuery = {
      selectLayer: 'parcels',
      attributeFilters: [{ field: 'assessed_value', op: 'gt', value: 500000 }],
    };

    const prepared = prepareQuery(input, registry);

    expect(prepared.executableQuery.attributeFilters).toEqual([
      { field: 'assessed_value', op: 'gt', value: 500000 },
    ]);
    expect(prepared.defaultLimitApplied).toBe(true);
    expect(prepared.sourceLayers).toEqual(['parcels']);
  });

  it('rejects removed parcel fields even if they still exist in loaded metadata', () => {
    const input: StructuredQuery = {
      selectLayer: 'parcels',
      attributeFilters: [{ field: 'zoning', op: 'eq', value: 'R-1' }],
    };

    expect(() => prepareQuery(input, registry)).toThrow(
      'Query validation failed against loaded data'
    );
  });

  it('accepts retained short-term rental permit fields and rejects listing-only fields', () => {
    const validInput: StructuredQuery = {
      selectLayer: 'short_term_rentals',
      attributeFilters: [{ field: 'permit_issued_date', op: 'like', value: '2025%' }],
    };

    const prepared = prepareQuery(validInput, registry);
    expect(prepared.executableQuery.attributeFilters?.[0]?.field).toBe(
      'permit_issued_date'
    );

    const invalidInput: StructuredQuery = {
      selectLayer: 'short_term_rentals',
      attributeFilters: [{ field: 'price_per_night', op: 'lt', value: 200 }],
    };

    expect(() => prepareQuery(invalidInput, registry)).toThrow(
      'Query validation failed against loaded data'
    );
  });

  it('accepts retained park and building footprint fields', () => {
    const parkQuery: StructuredQuery = {
      selectLayer: 'parks',
      attributeFilters: [{ field: 'acres', op: 'gt', value: 10 }],
    };
    const buildingQuery: StructuredQuery = {
      selectLayer: 'building_footprints',
      attributeFilters: [{ field: 'height', op: 'gt', value: 30 }],
    };

    expect(prepareQuery(parkQuery, registry).executableQuery.attributeFilters?.[0]?.field).toBe(
      'acres'
    );
    expect(
      prepareQuery(buildingQuery, registry).executableQuery.attributeFilters?.[0]?.field
    ).toBe('height');
  });

  it('rewrites zoning virtual fields and keeps the like operator for ILIKE generation', () => {
    const input: StructuredQuery = {
      selectLayer: 'zoning_districts',
      attributeFilters: [{ field: 'allows_residential', op: 'eq', value: true }],
    };

    const prepared = prepareQuery(input, registry);

    expect(prepared.executableQuery.attributeFilters).toEqual([
      { field: 'zone_code', op: 'like', value: 'R%' },
    ]);
    expect(prepared.normalizationNotes).toContain(
      'Mapped allows_residential=true to a case-insensitive zone_code match on R%'
    );
  });

  it('includes spatial target layers in the prepared source layer list', () => {
    const input: StructuredQuery = {
      selectLayer: 'parcels',
      spatialFilters: [
        {
          op: 'within_distance',
          targetLayer: 'transit_access',
          targetFilter: [{ field: 'stop_type', op: 'eq', value: 'bus' }],
          distance: 300,
        },
      ],
    };

    const prepared = prepareQuery(input, registry);

    expect(prepared.sourceLayers).toEqual(['parcels', 'transit_access']);
  });

  it('caps nearest-neighbor limits at the geometry hard cap', () => {
    const input: StructuredQuery = {
      selectLayer: 'parcels',
      spatialFilters: [{ op: 'nearest', targetLayer: 'transit_access', limit: 20000 }],
    };

    const prepared = prepareQuery(input, registry);

    expect(prepared.truncated).toBe(true);
    expect(prepared.executableQuery.spatialFilters?.[0]?.limit).toBe(prepared.hardCap);
  });

  it('keeps uppercase hydrology types queryable', () => {
    const input: StructuredQuery = {
      selectLayer: 'parcels',
      spatialFilters: [
        {
          op: 'within_distance',
          targetLayer: 'hydrology',
          targetFilter: [{ field: 'type', op: 'eq', value: 'ARROYO' }],
          distance: 200,
        },
      ],
    };

    const prepared = prepareQuery(input, registry);
    expect(
      prepared.executableQuery.spatialFilters?.[0]?.targetFilter?.[0]?.value
    ).toBe('ARROYO');
  });
});
