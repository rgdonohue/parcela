#!/usr/bin/env tsx
/**
 * Automated Data Acquisition Script
 *
 * Downloads publicly available datasets for Santa Fe Spatial Chat:
 * - US Census TIGER/Line shapefiles (census tracts)
 * - US Census ACS demographic data
 * - FEMA National Flood Hazard Layer
 * - City of Santa Fe open data (via ArcGIS Hub)
 * - Santa Fe Trails GTFS transit data
 *
 * Usage:
 *   tsx scripts/fetch-public-data.ts [--all | --layer <name>]
 *
 * Examples:
 *   tsx scripts/fetch-public-data.ts --all
 *   tsx scripts/fetch-public-data.ts --layer census_tracts
 */

import { existsSync, mkdirSync, writeFileSync, createWriteStream } from 'fs';
import { join } from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

// Santa Fe County FIPS code
const SANTA_FE_COUNTY_FIPS = '049';
const NEW_MEXICO_FIPS = '35';

// Output directories
const RAW_DATA_DIR = join(process.cwd(), 'data', 'raw');
const PROCESSED_DATA_DIR = join(process.cwd(), 'api', 'data');

interface DataSource {
  name: string;
  description: string;
  url: string | (() => Promise<string>);
  format: 'shapefile' | 'geojson' | 'csv' | 'gtfs' | 'api';
  automated: boolean;
  instructions?: string;
}

/**
 * Data sources configuration
 */
const DATA_SOURCES: Record<string, DataSource> = {
  // ============================================================================
  // AUTOMATED DOWNLOADS - These can be fetched programmatically
  // ============================================================================

  census_tracts: {
    name: 'Census Tracts (TIGER/Line)',
    description: 'Census tract boundaries for New Mexico from US Census Bureau',
    url: `https://www2.census.gov/geo/tiger/TIGER2023/TRACT/tl_2023_${NEW_MEXICO_FIPS}_tract.zip`,
    format: 'shapefile',
    automated: true,
  },

  census_acs_data: {
    name: 'Census ACS Demographics',
    description: 'American Community Survey 5-year estimates for demographics and housing',
    url: async () => {
      // Census API for ACS 5-year estimates
      // Variables: B01003_001E (total pop), B19013_001E (median income), B25001_001E (housing units)
      const variables = [
        'B01003_001E', // Total population
        'B19013_001E', // Median household income
        'B01002_001E', // Median age
        'B25003_003E', // Renter occupied units
        'B25003_001E', // Total occupied units
        'B25001_001E', // Total housing units
        'B25002_003E', // Vacant units
      ].join(',');
      return `https://api.census.gov/data/2022/acs/acs5?get=NAME,${variables}&for=tract:*&in=state:${NEW_MEXICO_FIPS}&in=county:${SANTA_FE_COUNTY_FIPS}`;
    },
    format: 'api',
    automated: true,
  },

  flood_zones: {
    name: 'FEMA Flood Zones (NFHL)',
    description: 'National Flood Hazard Layer for Santa Fe County',
    url: `https://hazards.fema.gov/nfhlv2/output/County/${NEW_MEXICO_FIPS}_${SANTA_FE_COUNTY_FIPS}_20231231.zip`,
    format: 'shapefile',
    automated: true,
    instructions: 'If automated download fails, visit https://msc.fema.gov/portal/advanceSearch and search for Santa Fe County, NM',
  },

  transit_gtfs: {
    name: 'Santa Fe Trails GTFS',
    description: 'Transit stops and routes from Santa Fe Trails',
    url: 'https://santafenm.gov/DocumentCenter/View/88507/Santa-Fe-Trails-GTFS', // May need to verify this URL
    format: 'gtfs',
    automated: true,
    instructions: 'If URL fails, download from https://santafenm.gov/public-works/transit and look for GTFS download link',
  },

  // ============================================================================
  // SEMI-AUTOMATED - Require visiting ArcGIS REST endpoints
  // ============================================================================

  city_zoning: {
    name: 'City of Santa Fe Zoning',
    description: 'Zoning districts from City of Santa Fe GIS',
    url: 'https://gis.santafenm.gov/server/rest/services/Public_Viewer/MapServer/7/query?where=1%3D1&outFields=*&f=geojson',
    format: 'geojson',
    automated: true,
  },

  city_hydrology: {
    name: 'Surface Hydrology',
    description: 'Rivers, arroyos, and waterways from City of Santa Fe GIS',
    url: 'https://gis.santafenm.gov/server/rest/services/Public_Viewer/MapServer/30/query?where=1%3D1&outFields=*&f=geojson',
    format: 'geojson',
    automated: true,
  },

  santa_fe_river: {
    name: 'Santa Fe River',
    description: 'Santa Fe River from City GIS',
    url: 'https://gis.santafenm.gov/server/rest/services/Public_Viewer/MapServer/26/query?where=1%3D1&outFields=*&f=geojson',
    format: 'geojson',
    automated: true,
  },

  arroyos: {
    name: 'Arroyos',
    description: 'Arroyos from City of Santa Fe GIS',
    url: 'https://gis.santafenm.gov/server/rest/services/Public_Viewer/MapServer/27/query?where=1%3D1&outFields=*&f=geojson',
    format: 'geojson',
    automated: true,
  },

  buildings: {
    name: 'Building Footprints',
    description: 'Building footprints from City of Santa Fe GIS',
    url: 'https://gis.santafenm.gov/server/rest/services/Public_Viewer/MapServer/3/query?where=1%3D1&outFields=*&f=geojson',
    format: 'geojson',
    automated: true,
  },

  // ============================================================================
  // MANUAL DOWNLOADS - Require account or request
  // ============================================================================

  parcels: {
    name: 'County Parcels',
    description: 'Property parcels from City of Santa Fe GIS (ArcGIS REST Service)',
    url: 'https://gis.santafenm.gov/server/rest/services/Public_Viewer/MapServer/126/query?where=1%3D1&outFields=*&f=geojson',
    format: 'geojson',
    automated: true,
    instructions: `
AUTOMATED VIA ARCGIS REST SERVICE:

The parcels layer is available from the City of Santa Fe Public Viewer:
- ArcGIS REST Endpoint: https://gis.santafenm.gov/server/rest/services/Public_Viewer/MapServer/126
- Max records per request: 2000 (pagination handled automatically)
- Spatial Reference: Web Mercator (3857), transformed to WGS84 (4326)

To fetch:
  tsx scripts/fetch-parcels.ts

Fields mapped:
- parcel_id: parcelid or lowparceli
- address: siteaddres
- zoning: usecd or usedscrp
- land_use: usedscrp
- acres: statedarea (parsed) or calculated from Shape_STAr
- year_built: resyrblt
- assessed_value: cntassdval

Note: This is City of Santa Fe data. For County parcels outside city limits,
contact Santa Fe County GIS: gis@santafecountynm.gov
`,
  },

  short_term_rentals: {
    name: 'Short-Term Rental Permits',
    description: 'STR permits from City of Santa Fe GIS (ArcGIS REST Service)',
    url: 'https://gis.santafenm.gov/server/rest/services/Public_Viewer/MapServer/127/query?where=1%3D1&outFields=*&f=geojson',
    format: 'geojson',
    automated: true,
    instructions: `
AUTOMATED VIA ARCGIS REST SERVICE:

The STR permits layer is available from the City of Santa Fe Public Viewer:
- ArcGIS REST Endpoint: https://gis.santafenm.gov/server/rest/services/Public_Viewer/MapServer/127
- Max records per request: 2000 (pagination handled automatically)
- Spatial Reference: Web Mercator (3857), transformed to WGS84 (4326)

To fetch:
  tsx scripts/fetch-str-permits.ts

Fields mapped:
- listing_id: OBJECTID
- address: Match_addr or Address
- business_name: DBA or Business_N
- property_type: Short_Term_ field
- permit_issued_date: Business_5 (date field)
- permit_expiry_date: Business_6 (date field)
- source: 'other' (permit data, not Airbnb/VRBO scraping)
`,
  },

  affordable_housing: {
    name: 'Affordable Housing Units',
    description: 'LIHTC projects in Santa Fe County (HUD database)',
    url: 'https://www.huduser.gov/lihtc/lihtcpub.zip',
    format: 'geojson',
    automated: true,
    instructions: `
To fetch:
  tsx scripts/fetch-affordable-housing-lihtc.ts

Output: data/raw/affordable_housing/affordable_housing_units.geojson

Then process (run from project root so prepare-data finds input; then copy output to api/data):
  npx tsx api/scripts/prepare-data.ts affordable_housing_units data/raw/affordable_housing/affordable_housing_units.geojson 4326
  cp data/affordable_housing_units.parquet api/data/
  # Add layer entry from data/manifest.json to api/data/manifest.json
`,
  },

  eviction_filings: {
    name: 'Eviction Filings',
    description: 'Court eviction records (privacy-sensitive)',
    url: 'N/A',
    format: 'csv',
    automated: false,
    instructions: `
MANUAL ACQUISITION REQUIRED (SENSITIVE DATA):

1. New Mexico Courts Case Lookup:
   - https://caselookup.nmcourts.gov/
   - Search for eviction cases in Santa Fe County
   - Note: Individual lookups only; bulk data requires agreement

2. Eviction Lab (Princeton):
   - https://evictionlab.org/
   - May have aggregated Santa Fe data

3. Legal Aid Organizations:
   - Contact local legal aid for anonymized eviction data
   - New Mexico Legal Aid: https://www.newmexicolegalaid.org/

PRIVACY NOTE: Geocode addresses but do NOT include tenant names.
Place data in: data/raw/eviction_filings.csv (address, date, type, outcome only)
`,
  },
};

/**
 * Ensure directory exists
 */
function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Download file from URL
 */
async function downloadFile(url: string, outputPath: string): Promise<void> {
  console.log(`  Downloading: ${url}`);

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'SantaFeSpatialChat/1.0 (Educational Research Project)',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const fileStream = createWriteStream(outputPath);

  if (response.body) {
    await pipeline(Readable.fromWeb(response.body as never), fileStream);
  } else {
    throw new Error('No response body');
  }

  console.log(`  Saved: ${outputPath}`);
}

/**
 * Fetch JSON from API
 */
async function fetchJson(url: string): Promise<unknown> {
  console.log(`  Fetching: ${url}`);

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'SantaFeSpatialChat/1.0 (Educational Research Project)',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetch a single data source
 */
async function fetchDataSource(key: string, source: DataSource): Promise<boolean> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Layer: ${source.name}`);
  console.log(`Description: ${source.description}`);
  console.log(`Automated: ${source.automated ? 'Yes' : 'No'}`);
  console.log('-'.repeat(60));

  if (!source.automated) {
    console.log('\n⚠️  MANUAL ACQUISITION REQUIRED');
    console.log(source.instructions);
    return false;
  }

  const outputDir = join(RAW_DATA_DIR, key);
  ensureDir(outputDir);

  try {
    const url = typeof source.url === 'function' ? await source.url() : source.url;

    switch (source.format) {
      case 'shapefile':
      case 'gtfs': {
        const outputPath = join(outputDir, `${key}.zip`);
        await downloadFile(url, outputPath);
        console.log(`\n✓ Downloaded ${key}`);
        console.log(`  Unzip with: unzip ${outputPath} -d ${outputDir}`);
        break;
      }

      case 'geojson': {
        const data = await fetchJson(url);
        const outputPath = join(outputDir, `${key}.geojson`);
        writeFileSync(outputPath, JSON.stringify(data, null, 2));
        console.log(`\n✓ Downloaded ${key}`);
        break;
      }

      case 'api': {
        const data = await fetchJson(url);
        const outputPath = join(outputDir, `${key}.json`);
        writeFileSync(outputPath, JSON.stringify(data, null, 2));
        console.log(`\n✓ Downloaded ${key}`);
        break;
      }

      case 'csv': {
        const outputPath = join(outputDir, `${key}.csv`);
        await downloadFile(url, outputPath);
        console.log(`\n✓ Downloaded ${key}`);
        break;
      }
    }

    return true;
  } catch (error) {
    console.error(`\n✗ Failed to download ${key}`);
    console.error(`  Error: ${error instanceof Error ? error.message : String(error)}`);
    if (source.instructions) {
      console.log('\n  Fallback instructions:');
      console.log(source.instructions);
    }
    return false;
  }
}

/**
 * Generate status report
 */
function generateReport(results: Record<string, boolean>): void {
  console.log('\n');
  console.log('='.repeat(60));
  console.log('DATA ACQUISITION REPORT');
  console.log('='.repeat(60));

  const automated = Object.entries(DATA_SOURCES).filter(([, s]) => s.automated);
  const manual = Object.entries(DATA_SOURCES).filter(([, s]) => !s.automated);

  console.log('\nAutomated Downloads:');
  for (const [key, source] of automated) {
    const status = results[key] ? '✓' : '✗';
    console.log(`  ${status} ${source.name}`);
  }

  console.log('\nManual Acquisition Required:');
  for (const [key, source] of manual) {
    console.log(`  ⚠️  ${source.name}`);
  }

  const successCount = Object.values(results).filter(Boolean).length;
  const totalAutomated = automated.length;

  console.log('\n' + '-'.repeat(60));
  console.log(`Automated: ${successCount}/${totalAutomated} successful`);
  console.log(`Manual: ${manual.length} datasets require manual acquisition`);
  console.log('-'.repeat(60));
}

/**
 * Main function
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  console.log('Santa Fe Spatial Chat - Data Acquisition');
  console.log('========================================\n');

  ensureDir(RAW_DATA_DIR);
  ensureDir(PROCESSED_DATA_DIR);

  const results: Record<string, boolean> = {};

  if (args.includes('--all')) {
    // Fetch all automated sources
    for (const [key, source] of Object.entries(DATA_SOURCES)) {
      results[key] = await fetchDataSource(key, source);
    }
  } else if (args.includes('--layer') && args[args.indexOf('--layer') + 1]) {
    // Fetch specific layer
    const layerName = args[args.indexOf('--layer') + 1];

    if (layerName && layerName in DATA_SOURCES) {
      results[layerName] = await fetchDataSource(layerName, DATA_SOURCES[layerName]!);
    } else {
      console.error(`Unknown layer: ${layerName}`);
      console.error(`Available layers: ${Object.keys(DATA_SOURCES).join(', ')}`);
      process.exit(1);
    }
  } else if (args.includes('--list')) {
    // List all sources
    console.log('Available data sources:\n');
    for (const [key, source] of Object.entries(DATA_SOURCES)) {
      const autoTag = source.automated ? '[AUTO]' : '[MANUAL]';
      console.log(`  ${autoTag} ${key}: ${source.name}`);
    }
    console.log('\nUsage:');
    console.log('  tsx scripts/fetch-public-data.ts --all');
    console.log('  tsx scripts/fetch-public-data.ts --layer <name>');
    console.log('  tsx scripts/fetch-public-data.ts --list');
    console.log('  tsx scripts/fetch-public-data.ts --manual');
    return;
  } else if (args.includes('--manual')) {
    // Show manual acquisition instructions
    console.log('MANUAL DATA ACQUISITION INSTRUCTIONS');
    console.log('====================================\n');

    for (const [key, source] of Object.entries(DATA_SOURCES)) {
      if (!source.automated && source.instructions) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`${source.name} (${key})`);
        console.log('='.repeat(60));
        console.log(source.instructions);
      }
    }
    return;
  } else {
    // Default: show help
    console.log('Usage:');
    console.log('  tsx scripts/fetch-public-data.ts --all        # Fetch all automated sources');
    console.log('  tsx scripts/fetch-public-data.ts --layer <n>  # Fetch specific layer');
    console.log('  tsx scripts/fetch-public-data.ts --list       # List all sources');
    console.log('  tsx scripts/fetch-public-data.ts --manual     # Show manual instructions');
    return;
  }

  generateReport(results);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
