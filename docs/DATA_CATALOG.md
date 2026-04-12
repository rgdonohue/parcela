# Parcela — Data Catalog

**Last Updated:** December 13, 2025
**Status:** 13 of 18 layers loaded (72%)

This catalog consolidates data provenance from `DATA_SOURCES.md` with live statistics from `api/data/manifest.json`. For detailed source information, licensing, and update cadences, see [DATA_SOURCES.md](./DATA_SOURCES.md).

---

## Loaded Layers (13)

| Layer | Features | Geometry | Status | Source | Layer ID |
|-------|----------|----------|--------|--------|----------|
| **parcels** | 63,439 | Polygon | ✅ | City ArcGIS REST | 126 |
| **building_footprints** | 42,630 | Polygon | ✅ | City ArcGIS REST | 3 |
| **short_term_rentals** | 897 | Point | ✅ | City ArcGIS REST | 127 |
| **transit_access** | 447 | Point | ✅ | City ArcGIS REST | 67 |
| **census_tracts** | 57 | Polygon | ✅ | US Census ACS | — |
| **zoning_districts** | 851 | Polygon | ✅ | City ArcGIS REST | 7 |
| **hydrology** | 109 | LineString | ✅ | City/County GIS | 27 |
| **flood_zones** | 227 | Polygon | ✅ | City ArcGIS REST (FEMA) | 32 |
| **historic_districts** | 5 | Polygon | ✅ | City ArcGIS REST | 118 |
| **neighborhoods** | 106 | Polygon | ✅ | City ArcGIS REST | 101 |
| **city_limits** | 1 | Polygon | ✅ | City ArcGIS REST | 99 |
| **parks** | 77 | Polygon | ✅ | City ArcGIS REST | 75 |
| **bikeways** | 536 | LineString | ✅ | City ArcGIS REST | 72 |

**Total:** 109,382 features

---

## Pending Layers (5)

| Layer | Schema Ready | Priority | Source Status | Notes |
|-------|-------------|----------|---------------|-------|
| **affordable_housing_units** | ✅ | 🔴 High | Manual acquisition | City/County Housing Dept |
| **vacancy_status** | ✅ | 🟡 Medium | Derived data | Assessor + USPS vacancy |
| **eviction_filings** | ✅ | 🟡 Medium | Privacy-sensitive | NM court records |
| **school_zones** | ✅ | 🟡 Medium | Not in City GIS | School district source needed |
| **wildfire_risk** | ✅ | 🟢 Low | USFS/State | May need processing |

---

## Layer Details

### ✅ parcels
- **Source:** City of Santa Fe GIS ArcGIS REST Service (Layer 126)
- **Fetch Script:** `scripts/fetch-parcels.ts`
- **Fields:** parcel_id, address, zoning, land_use, acres, year_built, assessed_value
- **Extent:** City limits only (County parcels require separate source)

### ✅ building_footprints
- **Source:** City of Santa Fe GIS ArcGIS REST Service (Layer 3)
- **Fetch Script:** `scripts/fetch-buildings.ts`
- **Fields:** building_id, address, building_type, height, year_built, source, source_year

### ✅ short_term_rentals
- **Source:** City of Santa Fe GIS ArcGIS REST Service (Layer 127)
- **Fetch Script:** `scripts/fetch-str-permits.ts`
- **Fields:** listing_id, address, business_name, property_type, permit_issued_date, permit_expiry_date
- **Notes:** STR permit data (not Airbnb/VRBO scraping)

### ✅ transit_access
- **Source:** City of Santa Fe GIS ArcGIS REST Service (Layer 67)
- **Fetch Script:** `scripts/fetch-transit.ts`
- **Fields:** stop_id, stop_name, route_ids, route_names, stop_type, wheelchair_accessible
- **Notes:** Bus stops from Santa Fe Trails transit system

### ✅ census_tracts
- **Source:** US Census Bureau TIGER/Line + ACS 5-year estimates
- **Fetch Script:** `scripts/fetch-public-data.ts`
- **Fields:** geoid, name, total_population, median_income, median_age, pct_renter, housing metrics
- **Extent:** Santa Fe County

### ✅ zoning_districts
- **Source:** City of Santa Fe GIS ArcGIS REST Service (Layer 7)
- **Fetch Script:** `scripts/fetch-public-data.ts`
- **Fields:** zone_code, zone_name, allows_residential, allows_commercial

### ✅ hydrology
- **Source:** City/County GIS (arroyos layer)
- **Fetch Script:** `scripts/fetch-public-data.ts`
- **Fields:** name, type, length_km
- **Notes:** Rivers, streams, arroyos, acequias

### ✅ flood_zones
- **Source:** City of Santa Fe GIS ArcGIS REST Service (Layer 32) — FEMA NFHL 2012
- **Fetch Script:** `scripts/fetch-flood-zones-city.ts`
- **Fields:** zone_id, zone_code, zone_name, flood_risk_level, base_flood_elevation, source
- **Notes:** 100-year flood plain boundaries

### ✅ historic_districts
- **Source:** City of Santa Fe GIS ArcGIS REST Service (Layer 118)
- **Fetch Script:** `scripts/fetch-historic-districts.ts`
- **Fields:** district_id, district_name, designation_type, designation_date, restrictions

### ✅ neighborhoods
- **Source:** City of Santa Fe GIS ArcGIS REST Service (Layer 101)
- **Fetch Script:** `scripts/fetch-neighborhoods.ts`
- **Fields:** neighborhood_id, name, type, established_date, notes
- **Notes:** Neighborhood associations for community-level analysis

### ✅ city_limits
- **Source:** City of Santa Fe GIS ArcGIS REST Service (Layer 99)
- **Fetch Script:** `scripts/fetch-city-limits.ts`
- **Fields:** boundary_id, name, area_sq_mi, area_acres
- **Notes:** Municipal boundary for spatial clipping

### ✅ parks
- **Source:** City of Santa Fe GIS ArcGIS REST Service (Layer 75)
- **Fetch Script:** `scripts/fetch-parks.ts`
- **Fields:** park_id, name, park_type, owner, acres, trail_miles, status, council_district

### ✅ bikeways
- **Source:** City of Santa Fe GIS ArcGIS REST Service (Layer 72)
- **Fetch Script:** `scripts/fetch-bikeways.ts`
- **Fields:** bikeway_id, name, bikeway_type, surface, length_miles

---

## Data Quality

All loaded layers include:
- ✅ Dual CRS: `geom_4326` (WGS84) for display, `geom_utm13` (UTM Zone 13N) for metric operations
- ✅ Type-safe schemas defined in `shared/types/geo.ts`
- ✅ Field mappings validated during processing
- ✅ Auto-loaded into DuckDB on API startup
- ✅ Manifest metadata in `api/data/manifest.json`

---

## Fetch Scripts

| Script | Layer(s) | Source |
|--------|----------|--------|
| `scripts/fetch-parcels.ts` | parcels | City GIS Layer 126 |
| `scripts/fetch-buildings.ts` | building_footprints | City GIS Layer 3 |
| `scripts/fetch-str-permits.ts` | short_term_rentals | City GIS Layer 127 |
| `scripts/fetch-transit.ts` | transit_access | City GIS Layer 67 |
| `scripts/fetch-flood-zones-city.ts` | flood_zones | City GIS Layer 32 |
| `scripts/fetch-historic-districts.ts` | historic_districts | City GIS Layer 118 |
| `scripts/fetch-neighborhoods.ts` | neighborhoods | City GIS Layer 101 |
| `scripts/fetch-city-limits.ts` | city_limits | City GIS Layer 99 |
| `scripts/fetch-parks.ts` | parks | City GIS Layer 75 |
| `scripts/fetch-bikeways.ts` | bikeways | City GIS Layer 72 |
| `scripts/fetch-public-data.ts` | census_tracts, zoning, hydrology | Various |

---

## ArcGIS REST Source

All City layers come from the Public_Viewer MapServer:
```
https://gis.santafenm.gov/server/rest/services/Public_Viewer/MapServer
```

122 layers available. Key layer IDs:
- 0: City Limits (line) | 99: City Limits (polygon)
- 3: Building Footprint | 7: Zoning
- 22: Schools | 27: Arroyos | 31-32: FEMA Flood Plain
- 67: Bus Stop | 68: Bus Routes | 72: Bikeways
- 75: City Parks | 101: Neighborhood Associations
- 118: Historic Districts | 126: Parcels | 127: STR Permits

---

## Next Steps

1. **Affordable Housing** (High Priority)
   - Contact City/County Housing Dept
   - Request deed-restricted unit locations
   - May require manual compilation

2. **School Zones** (Medium Priority)
   - Schools layer (Layer 22) is points, not attendance zones
   - Need separate source from school district

3. **Wildfire Risk** (Low Priority)
   - USFS or State Forestry source
   - May need processing for Santa Fe extent

---

## Related Documentation

- **Provenance & Licensing:** [DATA_SOURCES.md](./DATA_SOURCES.md)
- **Live Metadata:** `api/data/manifest.json` (auto-generated)
- **TypeScript Schemas:** `shared/types/geo.ts`
- **Data Processing:** `api/scripts/prepare-data.ts`

---

## Quick Reference

**Total Features:** 109,382
**Layers Loaded:** 13 of 18 planned (72%)
**Data Format:** GeoParquet
**Database:** DuckDB with spatial extension
**Auto-load:** Yes (all `.parquet` files in `api/data/`)
