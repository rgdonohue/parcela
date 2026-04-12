#!/usr/bin/env node
/**
 * Data Preparation Script
 *
 * Prepares geospatial data for use in Parcela:
 * - Validates SRID on ingest
 * - Filters data to Santa Fe AOI (for statewide datasets like census tracts)
 * - Renames fields to match LAYER_SCHEMAS
 * - Joins external data (e.g., ACS demographics to census tracts)
 * - Transforms to dual geometries (WGS84 + UTM 13N)
 * - Exports to GeoParquet
 * - Generates manifest.json with layer metadata
 *
 * Usage:
 *   tsx scripts/prepare-data.ts <layer-name> <input-path> [source-srid]
 *   tsx scripts/prepare-data.ts --all   # Process all layers
 *
 * Example:
 *   tsx scripts/prepare-data.ts parcels ./data/raw/parcels.shp 4326
 */

import { Database, DuckDbError } from 'duckdb';
import { join } from 'path';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import type { LayerName } from '../../shared/types/geo';
import { LAYER_SCHEMAS } from '../../shared/types/geo';

// ============================================================================
// Field Mappings: source field -> schema field
// ============================================================================

/**
 * Fields stored as VARCHAR in the source data that should be cast to DOUBLE
 * during parquet generation using TRY_CAST. Malformed values become NULL.
 *
 * Keyed by layer name, values are the OUTPUT field names (post-mapping).
 * Mirrors the VARCHAR_NUMERIC_FIELDS map in builder.ts — once parquets have
 * been regenerated with these casts applied, the workaround in builder.ts
 * can be removed.
 */
const VARCHAR_NUMERIC_FIELDS: Record<string, Set<string>> = {
  parcels: new Set(['year_built']),
  short_term_rentals: new Set(['accommodates', 'price_per_night', 'availability_365']),
  transit_access: new Set(['avg_headway_minutes']),
  parks: new Set(['trail_miles']),
  bikeways: new Set(['length_miles']),
};

/**
 * Field mappings for each layer
 * Maps raw data field names to schema-compliant field names
 */
const FIELD_MAPPINGS: Record<string, Record<string, string>> = {
  zoning_districts: {
    ZDESC: 'zone_code',
    DESC_: 'zone_name',
    OBJECTID: 'id',
  },
  hydrology: {
    // Using arroyos.geojson which has better coverage
    STRNAME: 'name',
    STRTYP: 'type',
    LENGTH: 'length_km',
    ARROYO2_ID: 'arroyo_id',
    OBJECTID: 'id',
  },
  census_tracts: {
    GEOID: 'geoid',
    NAME: 'name',
    NAMELSAD: 'name_full',
    ALAND: 'land_area_m2',
    AWATER: 'water_area_m2',
    // ACS fields will be joined
  },
};

/**
 * Santa Fe County FIPS code for filtering census data
 */
const SANTA_FE_COUNTY_FIPS = '049';

/**
 * Santa Fe metro bounding box (approximate)
 * Used to clip layers that extend beyond the area of interest
 */
const SANTA_FE_BBOX = {
  minX: -106.2,
  minY: 35.5,
  maxX: -105.8,
  maxY: 35.8,
};

interface LayerManifest {
  name: string;
  source: string;
  sourceSrid: number;
  geometryType: 'Polygon' | 'LineString' | 'Point' | 'Polygon | Point';
  featureCount: number;
  extent: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  fields: Record<string, string>;
  crs: {
    geom_4326: 'EPSG:4326';
    geom_utm13: 'EPSG:32613';
  };
  generatedAt: string;
  version: string;
}

interface DataManifest {
  layers: Record<string, LayerManifest>;
  generatedAt: string;
  version: string;
}

/**
 * Allowed SRIDs for data ingestion
 */
const ALLOWED_SRIDS = [4326, 32613, 3857]; // WGS84, UTM 13N, Web Mercator

/**
 * Initialize DuckDB with spatial extension
 */
async function initDuckDB(): Promise<Database> {
  return new Promise((resolve, reject) => {
    // Use in-memory database for processing
    const db = new Database(':memory:', (err: DuckDbError | null) => {
      if (err) {
        reject(err);
        return;
      }

      const conn = db.connect();
      conn.exec('INSTALL spatial;', (err: DuckDbError | null) => {
        if (err) {
          reject(err);
          return;
        }

        conn.exec('LOAD spatial;', (err: DuckDbError | null) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(db);
        });
      });
    });
  });
}

/**
 * Validate SRID
 */
function validateSrid(srid: number): void {
  if (!ALLOWED_SRIDS.includes(srid)) {
    throw new Error(
      `Invalid SRID: ${srid}. Allowed SRIDs: ${ALLOWED_SRIDS.join(', ')}`
    );
  }
}

/**
 * Get geometry type from layer schema
 */
function getGeometryType(layerName: LayerName): string {
  const schema = LAYER_SCHEMAS[layerName];
  if (!schema) {
    throw new Error(`Unknown layer: ${layerName}`);
  }
  return schema.geometryType;
}

/**
 * Build field selection SQL with renaming based on FIELD_MAPPINGS.
 * Fields listed in VARCHAR_NUMERIC_FIELDS are cast to DOUBLE via TRY_CAST
 * so the output parquet stores them as a numeric type; malformed values
 * become NULL rather than causing a type error.
 */
function buildFieldSelectSql(
  layerName: string,
  schemaRows: Array<{ column_name: string; column_type: string }>,
  geometryCol: string
): {
  selectFields: string[];
  outputFields: Record<string, string>;
  castFieldPairs: Array<{ sourceField: string; outputField: string }>;
} {
  const mappings = FIELD_MAPPINGS[layerName] ?? {};
  const numericFields = VARCHAR_NUMERIC_FIELDS[layerName] ?? new Set<string>();
  const selectFields: string[] = [];
  const outputFields: Record<string, string> = {};
  const castFieldPairs: Array<{ sourceField: string; outputField: string }> = [];

  for (const row of schemaRows) {
    const colName = row.column_name;
    // Skip geometry columns
    if (colName === geometryCol || colName.toLowerCase().includes('geom')) {
      continue;
    }

    // Determine output field name (apply mapping, or lowercase original)
    const outputName = mappings[colName] ?? colName.toLowerCase();

    // Cast VARCHAR fields that represent numbers to DOUBLE
    if (numericFields.has(outputName)) {
      selectFields.push(`TRY_CAST("${colName}" AS DOUBLE) AS "${outputName}"`);
      outputFields[outputName] = 'DOUBLE';
      castFieldPairs.push({ sourceField: colName, outputField: outputName });
    } else {
      selectFields.push(`"${colName}" AS "${outputName}"`);
      outputFields[outputName] = row.column_type;
    }
  }

  return { selectFields, outputFields, castFieldPairs };
}

/**
 * Load ACS data and create a lookup table
 */
interface ACSData {
  geoid: string;
  total_population: number;
  median_income: number | null;
  median_age: number | null;
  renter_occupied_units: number | null;
  total_housing_units: number | null;
  pct_renter: number | null;
  owner_occupied_units: number | null;
  vacant_units: number | null;
}

function loadACSData(acsPath: string): Map<string, ACSData> {
  const acsMap = new Map<string, ACSData>();

  if (!existsSync(acsPath)) {
    console.warn(`Warning: ACS data file not found: ${acsPath}`);
    return acsMap;
  }

  const rawData = JSON.parse(readFileSync(acsPath, 'utf-8')) as string[][];
  const headers = rawData[0];
  const dataRows = rawData.slice(1);

  // ACS field indices based on the header
  // NAME, B01003_001E (pop), B19013_001E (income), B01002_001E (age),
  // B25003_003E (renter occ), B25003_001E (total occ), B25001_001E (total units),
  // B25002_003E (vacant), state, county, tract
  const stateIdx = headers.indexOf('state');
  const countyIdx = headers.indexOf('county');
  const tractIdx = headers.indexOf('tract');
  const popIdx = headers.indexOf('B01003_001E');
  const incomeIdx = headers.indexOf('B19013_001E');
  const ageIdx = headers.indexOf('B01002_001E');
  const renterOccIdx = headers.indexOf('B25003_003E');
  const totalOccIdx = headers.indexOf('B25003_001E');
  const totalUnitsIdx = headers.indexOf('B25001_001E');
  const vacantIdx = headers.indexOf('B25002_003E');

  for (const row of dataRows) {
    const state = row[stateIdx];
    const county = row[countyIdx];
    const tract = row[tractIdx];
    const geoid = `${state}${county}${tract}`;

    const totalPop = parseInt(row[popIdx], 10) || 0;
    const income = row[incomeIdx] ? parseInt(row[incomeIdx], 10) : null;
    const age = row[ageIdx] ? parseFloat(row[ageIdx]) : null;
    const renterOcc = row[renterOccIdx] ? parseInt(row[renterOccIdx], 10) : null;
    const totalOcc = row[totalOccIdx] ? parseInt(row[totalOccIdx], 10) : null;
    const totalUnits = row[totalUnitsIdx] ? parseInt(row[totalUnitsIdx], 10) : null;
    const vacant = row[vacantIdx] ? parseInt(row[vacantIdx], 10) : null;

    // Calculate owner occupied (total occupied - renter occupied)
    const ownerOcc =
      totalOcc !== null && renterOcc !== null ? totalOcc - renterOcc : null;

    // Calculate pct_renter
    const pctRenter =
      totalOcc !== null && totalOcc > 0 && renterOcc !== null
        ? Math.round((renterOcc / totalOcc) * 1000) / 10
        : null;

    acsMap.set(geoid, {
      geoid,
      total_population: totalPop,
      median_income: income && income > 0 ? income : null,
      median_age: age,
      renter_occupied_units: renterOcc,
      total_housing_units: totalUnits,
      pct_renter: pctRenter,
      owner_occupied_units: ownerOcc,
      vacant_units: vacant,
    });
  }

  console.log(`  Loaded ${acsMap.size} ACS records`);
  return acsMap;
}

/**
 * Process census tracts with Santa Fe County filtering and ACS join
 */
async function processCensusTracts(
  db: Database,
  inputPath: string,
  acsPath: string,
  sourceSrid: number,
  outputDir: string
): Promise<LayerManifest> {
  return new Promise((resolve, reject) => {
    validateSrid(sourceSrid);

    if (!existsSync(inputPath)) {
      reject(new Error(`Input file not found: ${inputPath}`));
      return;
    }

    // Load ACS data
    console.log('  Loading ACS demographic data...');
    const acsData = loadACSData(acsPath);

    const conn = db.connect();
    const outputPath = join(outputDir, 'census_tracts.parquet');
    const tempTable = 'temp_census_tracts';

    // Read shapefile
    const readSql = `
      CREATE TABLE ${tempTable} AS
      SELECT * FROM ST_Read('${inputPath}');
    `;

    conn.exec(readSql, (err: DuckDbError | null) => {
      if (err) {
        reject(new Error(`Failed to read input file: ${err.message}`));
        return;
      }

      // Get initial count before filtering
      conn.all(`SELECT COUNT(*) as cnt FROM ${tempTable}`, (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        const totalCount = (rows[0] as { cnt: number }).cnt;
        console.log(`  Read ${totalCount} total census tracts from NM`);

        // Filter to Santa Fe County and get GEOID values
        conn.all(
          `SELECT GEOID FROM ${tempTable} WHERE COUNTYFP = '${SANTA_FE_COUNTY_FIPS}'`,
          (err: DuckDbError | null, geoidRows: unknown[]) => {
            if (err) {
              reject(new Error(`Failed to filter census tracts: ${err.message}`));
              return;
            }

            const geoids = (geoidRows as Array<{ GEOID: string }>).map((r) => r.GEOID);
            console.log(`  Filtered to ${geoids.length} Santa Fe County tracts`);

            // Build the output table with renamed fields and ACS data
            // We'll create a VALUES clause to insert ACS data
            const acsValues = geoids
              .map((geoid) => {
                const acs = acsData.get(geoid);
                if (!acs) {
                  console.warn(`  Warning: No ACS data for tract ${geoid}`);
                  return `('${geoid}', 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL)`;
                }
                return `('${geoid}', ${acs.total_population}, ${acs.median_income ?? 'NULL'}, ${acs.median_age ?? 'NULL'}, ${acs.pct_renter ?? 'NULL'}, ${acs.total_housing_units ?? 'NULL'}, ${acs.owner_occupied_units ?? 'NULL'}, ${acs.renter_occupied_units ?? 'NULL'}, ${acs.vacant_units ?? 'NULL'})`;
              })
              .join(',\n');

            // Create ACS temp table
            const createAcsSql = `
              CREATE TABLE temp_acs (
                geoid VARCHAR,
                total_population INTEGER,
                median_income INTEGER,
                median_age DOUBLE,
                pct_renter DOUBLE,
                total_housing_units INTEGER,
                owner_occupied_units INTEGER,
                renter_occupied_units INTEGER,
                vacant_units INTEGER
              );
              INSERT INTO temp_acs VALUES ${acsValues};
            `;

            conn.exec(createAcsSql, (err: DuckDbError | null) => {
              if (err) {
                reject(new Error(`Failed to create ACS table: ${err.message}`));
                return;
              }

              // Find geometry column
              conn.all(`DESCRIBE ${tempTable}`, (err: DuckDbError | null, descRows: unknown[]) => {
                if (err) {
                  reject(new Error(`Failed to describe table: ${err.message}`));
                  return;
                }

                const geometryCol =
                  (descRows as Array<{ column_name: string; column_type: string }>).find(
                    (row) =>
                      row.column_type.includes('GEOMETRY') ||
                      row.column_name.toLowerCase().includes('geom')
                  )?.column_name || 'geometry';

                // Create final table with join
                const createFinalSql = `
                  CREATE TABLE census_tracts AS
                  SELECT
                    t.GEOID AS geoid,
                    t.NAME AS name,
                    t.NAMELSAD AS name_full,
                    t.ALAND AS land_area_m2,
                    t.AWATER AS water_area_m2,
                    a.total_population,
                    a.median_income,
                    a.median_age,
                    a.pct_renter,
                    a.total_housing_units,
                    a.owner_occupied_units,
                    a.renter_occupied_units,
                    a.vacant_units,
                    ST_Transform(t.${geometryCol}, 'EPSG:${sourceSrid}', 'EPSG:4326') AS geom_4326
                  FROM ${tempTable} t
                  JOIN temp_acs a ON t.GEOID = a.geoid
                  WHERE t.COUNTYFP = '${SANTA_FE_COUNTY_FIPS}';
                `;

                conn.exec(createFinalSql, (err: DuckDbError | null) => {
                  if (err) {
                    reject(new Error(`Failed to create final table: ${err.message}`));
                    return;
                  }

                  // Get stats
                  conn.all(
                    `
                    SELECT
                      COUNT(*) as count,
                      MIN(ST_XMin(geom_4326)) as minX,
                      MIN(ST_YMin(geom_4326)) as minY,
                      MAX(ST_XMax(geom_4326)) as maxX,
                      MAX(ST_YMax(geom_4326)) as maxY
                    FROM census_tracts
                    `,
                    (err: DuckDbError | null, rows: unknown[]) => {
                      if (err) {
                        reject(new Error(`Failed to get stats: ${err.message}`));
                        return;
                      }

                      const stats = rows[0] as {
                        count: number;
                        minX: number;
                        minY: number;
                        maxX: number;
                        maxY: number;
                      };

                      // Export to parquet
                      const exportSql = `
                        COPY (
                          SELECT
                            * EXCLUDE (geom_4326),
                            ST_AsWKB(geom_4326) as geometry
                          FROM census_tracts
                        ) TO '${outputPath}' (FORMAT PARQUET);
                      `;

                      conn.exec(exportSql, (err: DuckDbError | null) => {
                        if (err) {
                          reject(new Error(`Failed to export: ${err.message}`));
                          return;
                        }

                        // Clean up
                        conn.exec(
                          `DROP TABLE ${tempTable}; DROP TABLE temp_acs; DROP TABLE census_tracts;`,
                          () => {
                            const manifest: LayerManifest = {
                              name: 'census_tracts',
                              source: inputPath,
                              sourceSrid,
                              geometryType: 'Polygon',
                              featureCount: Number(stats.count),
                              extent: {
                                minX: Number(stats.minX),
                                minY: Number(stats.minY),
                                maxX: Number(stats.maxX),
                                maxY: Number(stats.maxY),
                              },
                              fields: {
                                geoid: 'VARCHAR',
                                name: 'VARCHAR',
                                name_full: 'VARCHAR',
                                land_area_m2: 'BIGINT',
                                water_area_m2: 'BIGINT',
                                total_population: 'INTEGER',
                                median_income: 'INTEGER',
                                median_age: 'DOUBLE',
                                pct_renter: 'DOUBLE',
                                total_housing_units: 'INTEGER',
                                owner_occupied_units: 'INTEGER',
                                renter_occupied_units: 'INTEGER',
                                vacant_units: 'INTEGER',
                              },
                              crs: {
                                geom_4326: 'EPSG:4326',
                                geom_utm13: 'EPSG:32613',
                              },
                              generatedAt: new Date().toISOString(),
                              version: '1.0.0',
                            };

                            resolve(manifest);
                          }
                        );
                      });
                    }
                  );
                });
              });
            });
          }
        );
      });
    });
  });
}

/**
 * Process a generic layer from input file to GeoParquet with field renaming
 */
async function processLayer(
  db: Database,
  layerName: LayerName,
  inputPath: string,
  sourceSrid: number,
  outputDir: string
): Promise<LayerManifest> {
  return new Promise((resolve, reject) => {
    validateSrid(sourceSrid);

    if (!existsSync(inputPath)) {
      reject(new Error(`Input file not found: ${inputPath}`));
      return;
    }

    const conn = db.connect();
    const outputPath = join(outputDir, `${layerName}.parquet`);
    const tempTable = `temp_${layerName}`;

    // Read input file using ST_Read (supports GeoJSON, Shapefile, GeoPackage, etc.)
    const readSql = `
      CREATE TABLE ${tempTable} AS
      SELECT * FROM ST_Read('${inputPath}');
    `;

    conn.exec(readSql, (err: DuckDbError | null) => {
      if (err) {
        reject(new Error(`Failed to read input file: ${err.message}`));
        return;
      }

      // Detect the geometry column name
      conn.all(`DESCRIBE ${tempTable}`, (err: DuckDbError | null, descRows: unknown[]) => {
        if (err) {
          reject(new Error(`Failed to describe table: ${err.message}`));
          return;
        }

        const schemaRows = descRows as Array<{ column_name: string; column_type: string }>;

        // Find geometry column
        const geometryCol =
          schemaRows.find(
            (row) =>
              row.column_type.includes('GEOMETRY') ||
              row.column_name.toLowerCase().includes('geom')
          )?.column_name || 'geometry';

        // Build field selection with renaming (and optional TRY_CAST for numeric VARCHAR fields)
        const { selectFields, outputFields, castFieldPairs } = buildFieldSelectSql(
          layerName,
          schemaRows,
          geometryCol
        );

        // Get feature count and extent
        conn.all(
          `
          SELECT
            COUNT(*) as count,
            MIN(ST_XMin(${geometryCol})) as minX,
            MIN(ST_YMin(${geometryCol})) as minY,
            MAX(ST_XMax(${geometryCol})) as maxX,
            MAX(ST_YMax(${geometryCol})) as maxY
          FROM ${tempTable}
          `,
          (err: DuckDbError | null, rows: unknown[]) => {
            if (err) {
              reject(new Error(`Failed to get extent: ${err.message}`));
              return;
            }

            const stats = rows[0] as {
              count: number;
              minX: number;
              minY: number;
              maxX: number;
              maxY: number;
            };

            // Create table with renamed fields and transformed geometry
            const fieldsList = selectFields.join(',\n                ');
            const createTableSql = `
              CREATE TABLE ${layerName} AS
              SELECT
                ${fieldsList},
                ST_Transform(${geometryCol}, 'EPSG:${sourceSrid}', 'EPSG:4326') AS geom_4326
              FROM ${tempTable};
            `;

            conn.exec(createTableSql, (err: DuckDbError | null) => {
              if (err) {
                reject(new Error(`Failed to create table: ${err.message}`));
                return;
              }

              // Report cast failures for VARCHAR → DOUBLE conversions.
              // Queries the temp table (still available) using TRY_CAST inline
              // so we can count how many non-null source values failed to cast.
              function checkCastFailuresThenExport(): void {
                if (castFieldPairs.length === 0) {
                  doExport();
                  return;
                }

                const clauses = castFieldPairs.flatMap(({ sourceField }) => [
                  `COUNT(*) FILTER (WHERE "${sourceField}" IS NOT NULL) AS "${sourceField}__non_null"`,
                  `COUNT(*) FILTER (WHERE "${sourceField}" IS NOT NULL AND TRY_CAST("${sourceField}" AS DOUBLE) IS NULL) AS "${sourceField}__failures"`,
                ]);
                const castCheckSql = `SELECT ${clauses.join(', ')} FROM ${tempTable}`;

                conn.all(castCheckSql, (err: DuckDbError | null, checkRows: unknown[]) => {
                  if (err) {
                    console.warn(`  Warning: Could not check cast failures: ${err.message}`);
                  } else if (checkRows[0]) {
                    const row = checkRows[0] as Record<string, number>;
                    for (const { sourceField } of castFieldPairs) {
                      const nonNull = Number(row[`${sourceField}__non_null`] ?? 0);
                      const failures = Number(row[`${sourceField}__failures`] ?? 0);
                      if (failures > 0) {
                        console.warn(
                          `  Warning: ${layerName}.${sourceField}: ${failures}/${nonNull} non-null values failed TRY_CAST to DOUBLE (stored as NULL)`
                        );
                      } else {
                        console.log(
                          `  ✓ ${layerName}.${sourceField}: ${nonNull} non-null values cast to DOUBLE successfully`
                        );
                      }
                    }
                  }
                  doExport();
                });
              }

              // Export to GeoParquet
              // Note: DuckDB stores arrays as JSON strings in Parquet
              // Arrays will be parsed back to arrays in rowToFeature() functions
              function doExport(): void {
                const exportSql = `
                  COPY (
                    SELECT
                      * EXCLUDE (geom_4326),
                      ST_AsWKB(geom_4326) as geometry
                    FROM ${layerName}
                  ) TO '${outputPath}' (FORMAT PARQUET);
                `;

                conn.exec(exportSql, (err: DuckDbError | null) => {
                  if (err) {
                    reject(new Error(`Failed to export to GeoParquet: ${err.message}`));
                    return;
                  }

                  // Clean up
                  conn.exec(`DROP TABLE ${tempTable}; DROP TABLE ${layerName};`, () => {
                    const schema = LAYER_SCHEMAS[layerName];
                    const manifest: LayerManifest = {
                      name: layerName,
                      source: inputPath,
                      sourceSrid,
                      geometryType: schema.geometryType,
                      featureCount: Number(stats.count),
                      extent: {
                        minX: Number(stats.minX),
                        minY: Number(stats.minY),
                        maxX: Number(stats.maxX),
                        maxY: Number(stats.maxY),
                      },
                      fields: outputFields,
                      crs: {
                        geom_4326: 'EPSG:4326',
                        geom_utm13: 'EPSG:32613',
                      },
                      generatedAt: new Date().toISOString(),
                      version: '1.0.0',
                    };

                    resolve(manifest);
                  });
                });
              }

              checkCastFailuresThenExport();
            });
          }
        );
      });
    });
  });
}

/**
 * Load or create data manifest
 */
function loadManifest(manifestPath: string): DataManifest {
  if (existsSync(manifestPath)) {
    const content = require(manifestPath);
    return content as DataManifest;
  }

  return {
    layers: {},
    generatedAt: new Date().toISOString(),
    version: '1.0.0',
  };
}

/**
 * Save data manifest
 */
function saveManifest(manifest: DataManifest, manifestPath: string): void {
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
}

/**
 * Layer configuration for --all mode
 */
interface LayerConfig {
  name: LayerName;
  inputPath: string;
  sourceSrid: number;
  acsPath?: string; // Only for census_tracts
}

/**
 * Get all layer configurations for batch processing
 */
function getAllLayerConfigs(): LayerConfig[] {
  const dataDir = join(process.cwd(), 'data', 'raw');

  return [
    {
      name: 'zoning_districts' as LayerName,
      inputPath: join(dataDir, 'city_zoning', 'city_zoning.geojson'),
      sourceSrid: 4326,
    },
    {
      name: 'hydrology' as LayerName,
      inputPath: join(dataDir, 'arroyos', 'arroyos.geojson'),  // Better coverage than city_hydrology
      sourceSrid: 4326,
    },
    {
      name: 'census_tracts' as LayerName,
      inputPath: join(dataDir, 'census_tracts', 'tl_2023_35_tract.shp'),
      sourceSrid: 4326,
      acsPath: join(dataDir, 'census_acs_data', 'census_acs_data.json'),
    },
  ];
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);

  // Setup paths
  const outputDir = join(process.cwd(), 'data');
  const manifestPath = join(outputDir, 'manifest.json');

  // Ensure output directory exists
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // Handle --all mode
  if (args[0] === '--all') {
    console.log('Processing all layers...\n');

    const db = await initDuckDB();
    console.log('✓ DuckDB initialized with spatial extension\n');

    const configs = getAllLayerConfigs();
    const manifest = loadManifest(manifestPath);

    for (const config of configs) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Processing: ${config.name}`);
      console.log(`Input: ${config.inputPath}`);
      console.log(`${'='.repeat(60)}`);

      try {
        let layerManifest: LayerManifest;

        if (config.name === 'census_tracts' && config.acsPath) {
          layerManifest = await processCensusTracts(
            db,
            config.inputPath,
            config.acsPath,
            config.sourceSrid,
            outputDir
          );
        } else {
          layerManifest = await processLayer(
            db,
            config.name,
            config.inputPath,
            config.sourceSrid,
            outputDir
          );
        }

        manifest.layers[config.name] = layerManifest;
        console.log(`✓ Processed ${layerManifest.featureCount} features`);
        console.log(
          `✓ Extent: [${layerManifest.extent.minX.toFixed(4)}, ${layerManifest.extent.minY.toFixed(4)}] to [${layerManifest.extent.maxX.toFixed(4)}, ${layerManifest.extent.maxY.toFixed(4)}]`
        );
      } catch (error) {
        console.error(`✗ Failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    manifest.generatedAt = new Date().toISOString();
    saveManifest(manifest, manifestPath);

    console.log(`\n${'='.repeat(60)}`);
    console.log('✓ All layers processed!');
    console.log(`✓ Manifest updated: ${manifestPath}`);

    db.close();
    return;
  }

  // Single layer mode
  if (args.length < 2) {
    console.error('Usage:');
    console.error('  tsx scripts/prepare-data.ts --all');
    console.error('  tsx scripts/prepare-data.ts <layer-name> <input-path> [source-srid]');
    console.error('');
    console.error('Options:');
    console.error('  --all        Process all configured layers');
    console.error('');
    console.error('Arguments:');
    console.error('  layer-name   - Name of the layer (must match LAYER_SCHEMAS)');
    console.error('  input-path   - Path to input file (GeoJSON, Shapefile, etc.)');
    console.error('  source-srid  - Source SRID (default: 4326)');
    console.error('');
    console.error('Example:');
    console.error('  tsx scripts/prepare-data.ts parcels ./data/raw/parcels.shp 4326');
    process.exit(1);
  }

  const [layerName, inputPath, sourceSridStr] = args;
  const sourceSrid = sourceSridStr ? parseInt(sourceSridStr, 10) : 4326;

  // Validate layer name
  if (!(layerName in LAYER_SCHEMAS)) {
    console.error(`Error: Unknown layer "${layerName}"`);
    console.error(`Available layers: ${Object.keys(LAYER_SCHEMAS).join(', ')}`);
    process.exit(1);
  }

  try {
    console.log(`Processing layer: ${layerName}`);
    console.log(`Input: ${inputPath}`);
    console.log(`Source SRID: ${sourceSrid}`);
    console.log(`Output: ${outputDir}`);

    // Initialize DuckDB
    const db = await initDuckDB();
    console.log('✓ DuckDB initialized with spatial extension');

    // Process layer
    const layerManifest = await processLayer(
      db,
      layerName as LayerName,
      inputPath,
      sourceSrid,
      outputDir
    );

    console.log(`✓ Processed ${layerManifest.featureCount} features`);
    console.log(
      `✓ Extent: [${layerManifest.extent.minX}, ${layerManifest.extent.minY}] to [${layerManifest.extent.maxX}, ${layerManifest.extent.maxY}]`
    );

    // Update manifest
    const manifest = loadManifest(manifestPath);
    manifest.layers[layerName] = layerManifest;
    manifest.generatedAt = new Date().toISOString();
    saveManifest(manifest, manifestPath);

    console.log(`✓ Manifest updated: ${manifestPath}`);
    console.log('\n✓ Data preparation complete!');

    db.close();
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { processLayer, initDuckDB, validateSrid };

