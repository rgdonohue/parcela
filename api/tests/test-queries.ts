/**
 * Test Queries for Intent Parser
 * 
 * Collection of natural language queries to test parsing quality.
 * Run these manually to verify LLM parsing works correctly.
 */

export const TEST_QUERIES = [
  // Simple layer queries (no filters)
  'Show all census tracts',
  'Show census tracts by income',
  'Show residential zones',

  // Simple attribute queries
  'Show all parcels',
  'Census tracts with median income below 40000',
  'Parcels with assessed value over 500000',
  'Parks larger than 10 acres',
  
  // Spatial queries
  'Parcels within 500 meters of the Santa Fe River',
  'Parcels near arroyos',
  'Affordable housing units near schools',
  'Short-term rental permits issued in 2025',
  
  // Combined queries
  'Parcels near transit',
  'Parcels within flood zones',
  'Parcels within 500m of arroyos and inside flood zones',
  
  // Aggregate queries
  'Count short-term rental permits by business name',
  'Average assessed value by address',
  'Number of affordable housing units by neighborhood',
  
  // Housing equity focused
  'High-value parcels near transit stops',
  'Short-term rental permits near parks',
  'Eviction filings in low-income areas',
  'Affordable housing units near schools and transit',
  
  // Complex spatial
  'Parcels within 500m of arroyos and within 1km of transit',
  'Census tracts with high poverty and near flood zones',
] as const;

/**
 * Expected query structures for validation
 * (Used for manual testing and documentation)
 */
export const EXPECTED_QUERY_STRUCTURES = {
  'Parcels with assessed value over 500000': {
    selectLayer: 'parcels',
    attributeFilters: [
      { field: 'assessed_value', op: 'gt', value: 500000 },
    ],
  },
  'Parcels within 500 meters of the Santa Fe River': {
    selectLayer: 'parcels',
    spatialFilters: [
      {
        op: 'within_distance',
        targetLayer: 'hydrology',
        targetFilter: [{ field: 'name', op: 'like', value: '%Santa Fe River%' }],
        distance: 500,
      },
    ],
  },
  'Census tracts with median income below 40000': {
    selectLayer: 'census_tracts',
    attributeFilters: [
      { field: 'median_income', op: 'lt', value: 40000 },
    ],
  },
} as const;
