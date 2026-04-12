# Data Preparation Scripts

## prepare-data.ts

Prepares geospatial data for use in Parcela by:
- Validating SRID on ingest (fails fast on unknown/missing SRID)
- Transforming to dual geometries (WGS84 `geom_4326` + UTM 13N `geom_utm13`)
- Exporting to GeoParquet format
- Generating `api/data/manifest.json` with layer metadata

### Usage

```bash
tsx scripts/prepare-data.ts <layer-name> <input-path> [source-srid]
```

### Arguments

- `layer-name` - Name of the layer (must match a key in `LAYER_SCHEMAS`)
- `input-path` - Path to input file (supports GeoJSON, Shapefile, GeoPackage via GDAL)
- `source-srid` - Source SRID (default: 4326). Allowed values: 4326, 32613, 3857

### Examples

```bash
# Process parcels from a Shapefile
tsx scripts/prepare-data.ts parcels ./data/raw/parcels.shp 4326

# Process census tracts from GeoJSON
tsx scripts/prepare-data.ts census_tracts ./data/raw/tracts.geojson 4326

# Process hydrology from a GeoPackage
tsx scripts/prepare-data.ts hydrology ./data/raw/hydrology.gpkg 4326
```

### Output

The script generates:
- `api/data/<layer-name>.parquet` - GeoParquet file with dual geometries
- `api/data/manifest.json` - Updated with layer metadata including:
  - Feature count
  - Extent (bounding box)
  - Field schema
  - CRS information
  - Generation timestamp

### Supported Input Formats

Via DuckDB's spatial extension (GDAL):
- GeoJSON (.geojson)
- Shapefile (.shp)
- GeoPackage (.gpkg)
- KML/KMZ
- And other GDAL-supported formats

### SRID Validation

The script enforces strict SRID validation. Only these SRIDs are allowed:
- `4326` - WGS84 (geographic)
- `32613` - UTM Zone 13N (projected)
- `3857` - Web Mercator (projected)

If your data uses a different SRID, reproject it first using tools like:
- QGIS
- GDAL (`ogr2ogr`)
- PostGIS

### Notes

- The script uses DuckDB's spatial extension which requires GDAL
- Input files are read into a temporary table, transformed, then exported
- The output GeoParquet includes both `geom_4326` (WGS84) and `geom_utm13` (UTM 13N)
- The manifest.json is updated incrementally as layers are added

