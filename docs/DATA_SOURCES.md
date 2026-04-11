# Santa Fe Spatial Chat — Data Sources

Document each dataset used in the project, its provenance, update cadence, known limitations, and licensing/attribution requirements.

## Primary Data Source

**City of Santa Fe Public Viewer MapServer**
```
https://gis.santafenm.gov/server/rest/services/Public_Viewer/MapServer
```
- 122 layers available
- Public domain (City GIS)
- Max 2000 records per request (pagination handled in fetch scripts)
- Coordinates in Web Mercator (3857), converted to WGS84/UTM13

---

## Loaded Layers (14)

### Core Infrastructure

| Layer | Source | Layer ID | Update Cadence | License | Notes |
|-------|--------|----------|----------------|---------|-------|
| parcels | City ArcGIS REST | 126 | As updated | Public domain | City limits only; 63,439 features |
| building_footprints | City ArcGIS REST | 3 | As updated | Public domain | Height, type, year built; 42,630 features |
| zoning_districts | City ArcGIS REST | 7 | As updated | Public domain | Zone codes and names; 851 features |
| census_tracts | US Census TIGER + ACS | — | Annual | Public domain (US Gov) | Demographics, income, housing; 57 features |
| hydrology | City/County GIS | 27 | As updated | Public domain | Arroyos, streams; 109 features |

### Boundaries & Districts

| Layer | Source | Layer ID | Update Cadence | License | Notes |
|-------|--------|----------|----------------|---------|-------|
| city_limits | City ArcGIS REST | 99 | As updated | Public domain | Municipal boundary; 1 feature |
| neighborhoods | City ArcGIS REST | 101 | As updated | Public domain | Neighborhood associations; 106 features |
| historic_districts | City ArcGIS REST | 118 | As updated | Public domain | Preservation districts; 5 features |
| flood_zones | City ArcGIS REST (FEMA) | 32 | 2012 data | Public domain | 100-yr flood plain; 227 features |

### Housing & Access

| Layer | Source | Layer ID | Update Cadence | License | Notes |
|-------|--------|----------|----------------|---------|-------|
| short_term_rentals | City ArcGIS REST | 127 | As updated | Public domain | STR permits; 897 features |
| transit_access | City ArcGIS REST | 67 | As updated | Public domain | Bus stops; 447 features |
| parks | City ArcGIS REST | 75 | As updated | Public domain | City parks; 77 features |
| bikeways | City ArcGIS REST | 72 | As updated | Public domain | Bike routes; 536 features |
| affordable_housing_units | HUD LIHTC | — | Annual (Apr) | Public domain (US Gov) | LIHTC projects in Santa Fe County; 35 features; automated fetch |

---

## Pending Layers (4)

| Layer | Potential Source | Status | Notes |
|-------|------------------|--------|-------|
| vacancy_status | Derived | 🟡 Needs processing | Combine assessor occupancy + USPS vacancy data |
| eviction_filings | NM Courts | 🟡 Privacy-sensitive | Requires geocoding; privacy considerations |
| school_zones | School District GIS | 🟡 Different source | City GIS Layer 22 has points only, not attendance zones |
| wildfire_risk | USFS/NM State Forestry | 🟢 Available | Need to identify and process for Santa Fe extent |

---

## Data Acquisition Notes

### Affordable Housing
**Status:** Loaded via HUD LIHTC (automated)

**Current source: HUD LIHTC Database**
- **URL:** https://www.huduser.gov/portal/datasets/lihtc/property.html
- **Fetch script:** `tsx scripts/fetch-affordable-housing-lihtc.ts`
- **Data:** LIHTCPUB.CSV (national), filtered to NM + Santa Fe County (FIPS 35049)
- **Geocoding:** HUD data is pre-geocoded; records missing lat/lon use U.S. Census Geocoder API (batch)
- **Vintage:** Projects placed in service through 2023; updated annually (April)
- **Known gaps:** LIHTC covers tax-credit projects only. Deed-restricted units from local programs (inclusionary zoning, MFA, etc.) are not included.

**Option 2: Local supplement (optional)**
- **Contact:** City of Santa Fe Housing Division or Santa Fe County Housing Authority
- **Phone:** (505) 955-6339 (City Housing)
- **Data needed:** Deed-restricted unit locations, AMI restrictions, expiration dates
- Use to merge with LIHTC for more complete coverage

**Option 3: National Housing Preservation Database (NHPD)**
- **URL:** https://preservationdatabase.org/
- **Access:** Registration required for data download
- **Content:** Federally assisted rental housing inventory

### School Zones
**Status:** Requires school district data

- **Issue:** City GIS Layer 22 contains school points only (no attendance zones)
- **Contact:** Santa Fe Public Schools - (505) 467-2000
- **Alternative:** Derive Voronoi/Thiessen polygons from school points
- **Note:** Charter schools may not have defined attendance zones

### Wildfire Risk
**Status:** Raster data available; vectorization needed

**Sources Investigated:**
- **USFS Wildfire Risk to Communities:** https://wildfirerisk.org/download/
  - State-level GIS data via Forest Service Research Data Archive
  - Format: 270m raster (requires vectorization for parcel analysis)
- **NM Wildfire Risk Portal (NMWRAP):** https://nmwrap.org/
  - Contact: nmwrap@edac.unm.edu
- **City WIRE Hub:** https://santafe-wire.hub.arcgis.com/
  - 2006 Community Wildfire Hazard Ratings
  - Contact: pnchavarria@santafenm.gov

**Challenge:** Wildfire risk is typically raster data at 270m resolution. Converting to parcel-level polygons requires:
1. Download state raster from USFS
2. Clip to Santa Fe extent
3. Vectorize or sample to parcel centroids

### Vacancy Status
**Status:** Derived layer (no direct source)

- **Method:** Combine multiple indicators:
  1. Assessor "owner-occupied" flags (from parcel data)
  2. USPS vacancy indicator data (if available via FOIA)
  3. Utility connection status (requires utility company data)
- **Challenge:** Distinguishing seasonal vacancy from long-term vacancy
- **Alternative:** Use building permit activity + ownership transfer records

---

## Fetch Scripts

| Script | Layers | Source |
|--------|--------|--------|
| `scripts/fetch-parcels.ts` | parcels | Layer 126 |
| `scripts/fetch-buildings.ts` | building_footprints | Layer 3 |
| `scripts/fetch-str-permits.ts` | short_term_rentals | Layer 127 |
| `scripts/fetch-transit.ts` | transit_access | Layer 67 |
| `scripts/fetch-flood-zones-city.ts` | flood_zones | Layer 32 |
| `scripts/fetch-historic-districts.ts` | historic_districts | Layer 118 |
| `scripts/fetch-neighborhoods.ts` | neighborhoods | Layer 101 |
| `scripts/fetch-city-limits.ts` | city_limits | Layer 99 |
| `scripts/fetch-parks.ts` | parks | Layer 75 |
| `scripts/fetch-bikeways.ts` | bikeways | Layer 72 |
| `scripts/fetch-public-data.ts` | census, zoning, hydrology | Various |

---

## Methodology

### CRS Convention
- **geom_4326** (WGS84): Display and topological operations (intersects, contains, within)
- **geom_utm13** (EPSG:32613): Metric operations (distance, buffer, area)

### Data Processing
1. Fetch from ArcGIS REST with pagination (2000 records/request)
2. Convert Web Mercator (3857) → WGS84 (4326)
3. Map source fields to schema-compliant field names
4. Export to GeoParquet with dual geometries
5. Update manifest.json with metadata

### Quality Checks
- Invalid geometry detection and logging
- Null value handling for key fields
- Deduplication where applicable
- Extent validation against expected bounds

---

## Attribution Requirements

| Source | Attribution |
|--------|-------------|
| City of Santa Fe GIS | "Data provided by City of Santa Fe GIS" |
| US Census Bureau | "Source: U.S. Census Bureau, American Community Survey" |
| FEMA NFHL | "Flood data from FEMA National Flood Hazard Layer" |

---

## Update Log

| Date | Change |
|------|--------|
| 2025-12-13 | Added flood_zones, historic_districts, neighborhoods, city_limits, parks, bikeways |
| 2025-12-11 | Added transit_access, short_term_rentals, building_footprints, parcels |
| 2025-12-07 | Initial layers: census_tracts, zoning_districts, hydrology |
