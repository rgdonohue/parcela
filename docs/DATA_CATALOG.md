# Parcela Data Catalog

**Last updated:** May 6, 2026  
**Source of truth:** `api/data/manifest.json`  
**Status:** 14 loaded layers, 109,417 features

This catalog summarizes the current review dataset. For source licensing, update cadence, and acquisition notes, see [DATA_SOURCES.md](DATA_SOURCES.md).

## Loaded Layers

| Layer | Features | Geometry | Source path |
|-------|----------|----------|-------------|
| `parcels` | 63,439 | Polygon | `raw/parcels/parcels.geojson` |
| `building_footprints` | 42,630 | Polygon | `raw/buildings/buildings.geojson` |
| `zoning_districts` | 851 | Polygon | `raw/city_zoning/city_zoning.geojson` |
| `short_term_rentals` | 897 | Point | `raw/short_term_rentals/str_permits.geojson` |
| `bikeways` | 536 | LineString | `raw/bikeways/bikeways.geojson` |
| `transit_access` | 447 | Point | `raw/transit/transit_stops.geojson` |
| `flood_zones` | 227 | Polygon | `raw/flood_zones/flood_zones.geojson` |
| `hydrology` | 109 | LineString | `raw/arroyos/arroyos.geojson` |
| `neighborhoods` | 106 | Polygon | `raw/neighborhoods/neighborhoods.geojson` |
| `parks` | 77 | Polygon | `raw/parks/parks.geojson` |
| `census_tracts` | 57 | Polygon | `raw/census_tracts/tl_2023_35_tract.shp` |
| `affordable_housing_units` | 35 | Polygon / Point | `raw/affordable_housing/affordable_housing_units.geojson` |
| `historic_districts` | 5 | Polygon | `raw/historic_districts/historic_districts.geojson` |
| `city_limits` | 1 | Polygon | `raw/city_limits/city_limits.geojson` |

## Pending Or Deferred Layers

| Layer | Status | Notes |
|-------|--------|-------|
| `school_zones` | Pending | Needs attendance-boundary polygons from Santa Fe Public Schools or a documented approximation. |
| `wildfire_risk` | Pending | Likely requires raster processing/vectorization before loading. |
| `vacancy_status` | Deferred | Requires derived data from assessor records plus USPS or similar vacancy indicators. |
| `eviction_filings` | Deferred | Privacy-sensitive; likely requires a data-sharing agreement and geocoding workflow. |

## Data Quality Notes

- Runtime loading creates `geom_4326` for display/topological operations and `geom_utm13` for metric operations.
- The layer registry exposes only layers successfully loaded into DuckDB, not manifest-only entries.
- Manifest source paths are relative to `api/data`; local absolute source paths should not be committed.
- Some source fields are still normalized at query time with casting/alias logic. Future data refreshes should push more of that cleanup into data preparation.

## Related Files

- `api/data/manifest.json` — generated layer metadata
- `api/data/*.parquet` — local review dataset
- `scripts/` — source-data fetch scripts
- `api/scripts/prepare-data.ts` — API-local preparation script
- `shared/types/geo.ts` — TypeScript layer schema definitions
