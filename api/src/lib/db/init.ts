import { Database, Connection, DuckDbError } from 'duckdb';
import { join } from 'path';
import { existsSync, readdirSync } from 'fs';
import type { LayerName } from '../../../../shared/types/geo';
import { LAYER_SCHEMAS } from '../../../../shared/types/geo';
import { log } from '../logger';

const LAYER_VALIDATION_TABLE = '__layer_validation';
const NEW_MEXICO_BOUNDS = {
  minX: -109.05,
  maxX: -103.0,
  minY: 31.33,
  maxY: 37.0,
};

/**
 * Initialize DuckDB database with spatial extension and load layers
 *
 * @param dbPath - Path to DuckDB database file (use ':memory:' for in-memory)
 * @param dataDir - Directory containing GeoParquet files
 * @returns Initialized DuckDB database instance
 */
export async function initDatabase(
  dbPath: string = ':memory:',
  dataDir: string = join(process.cwd(), 'data')
): Promise<Database> {
  return new Promise((resolve, reject) => {
    const db = new Database(dbPath, (err: DuckDbError | null) => {
      if (err) {
        reject(err);
        return;
      }

      // Get connection (connect() doesn't take a callback)
      const conn = db.connect();

      ensureSpatialExtension(conn)
        .then(() => ensureLayerValidationTable(conn))
        .then(() =>
          loadAllLayers(conn, dataDir)
            .catch((loadErr) => {
              console.warn('Warning: Some layers failed to load:', loadErr);
              // Still resolve - partial data is better than none
            })
            .then(() => resolve(db))
        )
        .catch((loadErr) => {
          reject(loadErr);
        });
    });
  });
}

function exec(conn: Connection, sql: string): Promise<void> {
  return new Promise((resolve, reject) => {
    conn.exec(sql, (err: DuckDbError | null) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

async function ensureSpatialExtension(conn: Connection): Promise<void> {
  try {
    await exec(conn, 'LOAD spatial;');
  } catch {
    await exec(conn, 'INSTALL spatial;');
    await exec(conn, 'LOAD spatial;');
  }
}

function ensureLayerValidationTable(conn: Connection): Promise<void> {
  return exec(
    conn,
    `
      CREATE TABLE IF NOT EXISTS "${LAYER_VALIDATION_TABLE}" (
        layer_name VARCHAR PRIMARY KEY,
        is_validated BOOLEAN,
        reason VARCHAR
      );
    `
  );
}

async function recordLayerValidation(
  conn: Connection,
  layerName: string,
  isValidated: boolean,
  reason: string
): Promise<void> {
  const escapedReason = reason.replace(/'/g, "''");
  await exec(
    conn,
    `
      DELETE FROM "${LAYER_VALIDATION_TABLE}" WHERE layer_name = '${layerName.replace(/'/g, "''")}';
      INSERT INTO "${LAYER_VALIDATION_TABLE}" VALUES ('${layerName.replace(/'/g, "''")}', ${isValidated ? 'TRUE' : 'FALSE'}, '${escapedReason}');
    `
  );
}

async function validateLayerBounds(conn: Connection, layerName: string): Promise<boolean> {
  try {
    const rows = await query<{
      min_x: number | null;
      min_y: number | null;
      max_x: number | null;
      max_y: number | null;
    }>(
      conn,
      `
        SELECT
          ST_XMin(ST_Extent_Agg(geom_4326)) AS min_x,
          ST_YMin(ST_Extent_Agg(geom_4326)) AS min_y,
          ST_XMax(ST_Extent_Agg(geom_4326)) AS max_x,
          ST_YMax(ST_Extent_Agg(geom_4326)) AS max_y
        FROM "${layerName}"
      `
    );
    const bounds = rows[0];
    const isValidated = Boolean(
      bounds &&
        bounds.min_x !== null &&
        bounds.max_x !== null &&
        bounds.min_y !== null &&
        bounds.max_y !== null &&
        bounds.min_x >= NEW_MEXICO_BOUNDS.minX &&
        bounds.max_x <= NEW_MEXICO_BOUNDS.maxX &&
        bounds.min_y >= NEW_MEXICO_BOUNDS.minY &&
        bounds.max_y <= NEW_MEXICO_BOUNDS.maxY
    );

    if (!isValidated) {
      log({
        level: 'warn',
        event: 'layer.crs_bounds_failed',
        layer: layerName,
        bounds,
        expectedBounds: NEW_MEXICO_BOUNDS,
      });
    }

    await recordLayerValidation(
      conn,
      layerName,
      isValidated,
      isValidated ? 'bounds within New Mexico' : 'bounds outside New Mexico or unavailable'
    );
    return isValidated;
  } catch (error) {
    log({
      level: 'warn',
      event: 'layer.crs_bounds_failed',
      layer: layerName,
      error: error instanceof Error ? error.message : 'unknown',
      expectedBounds: NEW_MEXICO_BOUNDS,
    });
    await recordLayerValidation(conn, layerName, false, 'bounds validation query failed');
    return false;
  }
}

/**
 * Auto-load all parquet files from data directory
 */
async function loadAllLayers(
  conn: Connection,
  dataDir: string
): Promise<void> {
  if (!existsSync(dataDir)) {
    console.log('Data directory does not exist:', dataDir);
    return;
  }

  // Find all .parquet files
  const files = readdirSync(dataDir).filter((f) => f.endsWith('.parquet'));

  if (files.length === 0) {
    console.log('No parquet files found in:', dataDir);
    return;
  }

  console.log(`Found ${files.length} parquet files to load`);

  for (const file of files) {
    const layerName = file.replace('.parquet', '');
    const filePath = join(dataDir, file);

    // Check if this is a known layer
    if (!(layerName in LAYER_SCHEMAS)) {
      console.warn(`  Skipping unknown layer: ${layerName}`);
      continue;
    }

    try {
      await loadParquetLayer(conn, layerName as LayerName, filePath);
      console.log(`  ✓ Loaded: ${layerName}`);
    } catch (err) {
      console.error(`  ✗ Failed to load ${layerName}:`, err);
    }
  }
}

/**
 * Load a parquet file and create dual geometry columns
 * The parquet files have geometry stored as WKB blob (via ST_AsWKB export in prepare-data).
 * DuckDB may auto-detect as GEOMETRY type or as BLOB depending on how it was written.
 */
async function loadParquetLayer(
  conn: Connection,
  layerName: LayerName,
  parquetPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    // First, check the geometry column type in the parquet file
    conn.all(
      `DESCRIBE SELECT * FROM read_parquet('${parquetPath}') LIMIT 1`,
      (descErr: DuckDbError | null, descRows: unknown[]) => {
        if (descErr) {
          reject(new Error(`Failed to describe ${layerName}: ${descErr.message}`));
          return;
        }

        // Find geometry column type
        const geomRow = (descRows as Array<{ column_name: string; column_type: string }>).find(
          (r) => r.column_name === 'geometry'
        );
        const geomType = geomRow?.column_type || 'UNKNOWN';

        // Build appropriate SQL based on geometry type
        let geomExpr: string;
        if (geomType.includes('GEOMETRY')) {
          // Already a geometry type, use directly
          geomExpr = 'geometry';
        } else {
          // Assume BLOB/WKB, convert
          geomExpr = 'ST_GeomFromWKB(geometry)';
        }

        // IMPORTANT: the 4th arg (always_xy=true) forces lon/lat axis order.
        // Without it, PROJ's default axis handling for EPSG:4326 may swap
        // axes and ST_Transform silently emits Infinity coordinates, making
        // every spatial filter return 0 matches.
        const sql = `
          CREATE TABLE "${layerName}" AS
          SELECT
            * EXCLUDE (geometry),
            ${geomExpr} AS geom_4326,
            ST_Transform(${geomExpr}, 'EPSG:4326', 'EPSG:32613', true) AS geom_utm13
          FROM read_parquet('${parquetPath}');
        `;

        conn.exec(sql, (err: DuckDbError | null) => {
          if (err) {
            reject(new Error(`Failed to load ${layerName}: ${err.message}`));
            return;
          }

          // Get row count, then create spatial indexes
          conn.all(
            `SELECT COUNT(*) as count FROM "${layerName}"`,
            (countErr: DuckDbError | null, rows: unknown[]) => {
              if (countErr) {
                resolve(); // Still consider it loaded
                return;
              }
              const count = (rows[0] as { count: number }).count;
              console.log(`    ${count} features`);

              // Create spatial indexes for faster spatial queries
              validateLayerBounds(conn, layerName)
                .then(() => createSpatialIndexes(conn, layerName))
                .then(() => resolve())
                .catch((indexErr) => {
                  console.warn(`    Warning: spatial index creation failed for ${layerName}:`, indexErr);
                  resolve(); // Still consider layer loaded even if indexes fail
                });
            }
          );
        });
      }
    );
  });
}

/**
 * Create R-tree spatial indexes on both geometry columns for a layer.
 * Indexes significantly improve spatial join performance on large tables.
 */
async function createSpatialIndexes(
  conn: Connection,
  layerName: string
): Promise<void> {
  const indexes = [
    { col: 'geom_4326', suffix: 'geo' },
    { col: 'geom_utm13', suffix: 'utm' },
  ];

  for (const { col, suffix } of indexes) {
    await new Promise<void>((resolve, reject) => {
      const indexName = `idx_${layerName}_${suffix}`;
      conn.exec(
        `CREATE INDEX "${indexName}" ON "${layerName}" USING RTREE ("${col}")`,
        (err: DuckDbError | null) => {
          if (err) {
            // Some geometry types may not support RTREE; log and continue
            console.warn(`    Index ${indexName} skipped: ${err.message}`);
            resolve();
          } else {
            resolve();
          }
        }
      );
    });
  }
}

/**
 * Load a layer from GeoParquet file into DuckDB with dual geometry columns
 * 
 * @param conn - DuckDB connection
 * @param layerName - Name of the layer (must match a table name)
 * @param parquetPath - Path to GeoParquet file
 * @param sourceSrid - Source SRID of the geometry (will be validated)
 */
export async function loadLayer(
  conn: Connection,
  layerName: LayerName,
  parquetPath: string,
  sourceSrid: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Validate SRID - only allow known CRSs
    const allowedSrids = [4326, 32613, 3857]; // WGS84, UTM 13N, Web Mercator
    if (!allowedSrids.includes(sourceSrid)) {
      reject(
        new Error(
          `Invalid SRID: ${sourceSrid}. Allowed SRIDs: ${allowedSrids.join(', ')}`
        )
      );
      return;
    }

    // Create table with dual geometries
    // Note: DuckDB spatial extension uses ST_Read to read GeoParquet
    // The geometry column will be named 'geometry' or 'geom' depending on the file
    const sql = `
      CREATE TABLE ${layerName} AS 
      SELECT
        *,
        ST_Transform(geometry, 4326) AS geom_4326,
        ST_Transform(geometry, 32613) AS geom_utm13
      FROM ST_Read('${parquetPath}');
    `;

    conn.exec(sql, (err: DuckDbError | null) => {
      if (err) {
        reject(
          new Error(`Failed to load layer ${layerName}: ${err.message}`)
        );
        return;
      }

      // Verify the table was created
      conn.all(`DESCRIBE ${layerName}`, (err: DuckDbError | null, rows: unknown[]) => {
        if (err) {
          reject(err);
          return;
        }

        console.log(`Loaded layer: ${layerName}`);
        console.log(`Schema:`, rows);
        resolve();
      });
    });
  });
}

/**
 * Get database connection (helper for query execution)
 */
export function getConnection(db: Database): Connection {
  return db.connect();
}

/**
 * Execute a query and return results
 */
export function query<T = unknown>(
  conn: Connection,
  sql: string,
  ...params: unknown[]
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    conn.all(
      sql,
      ...params,
      (err: DuckDbError | null, rows: unknown[]) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rows as T[]);
      }
    );
  });
}
