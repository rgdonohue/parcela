# Data Acquisition Guide

This guide documents how to acquire the geospatial datasets needed for Parcela.

## Quick Start

```bash
# Install dependencies
cd scripts && npm install

# List available data sources
tsx scripts/fetch-public-data.ts --list

# Download all automated sources
tsx scripts/fetch-public-data.ts --all

# Download specific layer
tsx scripts/fetch-public-data.ts --layer census_tracts

# View manual acquisition instructions
tsx scripts/fetch-public-data.ts --manual
```

## Data Sources Overview

### Automated Downloads (P0 Priority)

| Layer | Source | Format | Status |
|-------|--------|--------|--------|
| `census_tracts` | US Census TIGER/Line | Shapefile | ✅ Automated |
| `census_acs_data` | Census ACS API | JSON | ✅ Automated |
| `flood_zones` | FEMA NFHL | Shapefile | ✅ Automated |
| `transit_gtfs` | Santa Fe Trails | GTFS | ✅ Automated |
| `city_zoning` | City of Santa Fe ArcGIS | GeoJSON | ✅ Automated |
| `city_hydrology` | City of Santa Fe ArcGIS | GeoJSON | ✅ Automated |
| `arroyos` | City of Santa Fe ArcGIS | GeoJSON | ✅ Automated |
| `santa_fe_river` | City of Santa Fe ArcGIS | GeoJSON | ✅ Automated |

### Manual Acquisition Required (P0 Priority)

| Layer | Source | Format | Effort |
|-------|--------|--------|--------|
| `parcels` | Santa Fe County Assessor | Shapefile | Medium - Contact GIS dept |
| `short_term_rentals` | City STR Registry/AirDNA | CSV | High - May require FOIA |
| `affordable_housing` | City Housing Dept/HUD | CSV | Medium - Multiple sources |
| `eviction_filings` | NM Courts | CSV | High - Sensitive data |

---

## Automated Data Sources

### 1. Census Tracts (TIGER/Line)

**Source:** US Census Bureau TIGER/Line Shapefiles
**URL:** https://www.census.gov/cgi-bin/geo/shapefiles/index.php?year=2023&layergroup=Census+Tracts
**Format:** Shapefile (zipped)
**License:** Public domain (US Government work)
**Update Cadence:** Annual

The script downloads the full New Mexico census tract shapefile. After download:

```bash
# Unzip
unzip data/raw/census_tracts/census_tracts.zip -d data/raw/census_tracts/

# Process with prepare-data script
tsx scripts/prepare-data.ts census_tracts data/raw/census_tracts/tl_2023_35_tract.shp 4326
```

### 2. Census ACS Demographics

**Source:** Census Bureau American Community Survey API
**URL:** https://api.census.gov/data/2022/acs/acs5
**Format:** JSON
**License:** Public domain
**Update Cadence:** Annual (5-year estimates)

Variables collected:
- `B01003_001E` - Total population
- `B19013_001E` - Median household income
- `B01002_001E` - Median age
- `B25003_003E` / `B25003_001E` - Renter percentage
- `B25001_001E` - Total housing units
- `B25002_003E` - Vacant units

The JSON output needs to be joined with census tract geometries by GEOID.

### 3. FEMA Flood Zones (NFHL)

**Source:** FEMA National Flood Hazard Layer
**URL:** https://msc.fema.gov/portal/advanceSearch
**Format:** Shapefile (zipped)
**License:** Public domain (US Government)
**Update Cadence:** As published

If automated download fails:
1. Visit https://msc.fema.gov/portal/advanceSearch
2. Search for "Santa Fe County, NM"
3. Download NFHL database
4. Extract S_FLD_HAZ_AR (flood hazard areas) shapefile

### 4. Santa Fe Trails Transit (GTFS)

**Source:** City of Santa Fe Transit Division
**URL:** https://santafenm.gov/public-works/transit
**Format:** GTFS (zipped CSV files)
**License:** City of Santa Fe terms
**Update Cadence:** As published

GTFS contains:
- `stops.txt` - Transit stop locations (lat/lon)
- `routes.txt` - Route information
- `stop_times.txt` - Schedule data

Process stops.txt to create transit_access layer:
```bash
# Convert stops.txt to GeoJSON
node scripts/gtfs-to-geojson.ts data/raw/transit_gtfs/stops.txt
```

### 5. City of Santa Fe GIS Layers

**Source:** City of Santa Fe ArcGIS REST Services
**Base URL:** https://gis.santafenm.gov/server/rest/services/Public_Viewer/MapServer
**Format:** GeoJSON (via REST API)
**License:** City of Santa Fe

Available layers:
| Layer ID | Name | Our Layer |
|----------|------|-----------|
| 7 | Zoning | `zoning_districts` |
| 26 | Santa Fe River | `hydrology` |
| 27 | Arroyos | `hydrology` |
| 30 | Surface Hydrology | `hydrology` |

Query format:
```
https://gis.santafenm.gov/server/rest/services/Public_Viewer/MapServer/{LAYER_ID}/query?where=1%3D1&outFields=*&f=geojson
```

---

## Manual Data Acquisition

### 1. County Parcels (CRITICAL - P0)

**Why it matters:** Parcels are the foundation for housing analysis. Without parcel data, we can't analyze vacancy, assessed values, or zoning compliance.

**Primary source:** Santa Fe County GIS Division

**Contact:**
- Website: https://www.santafecountynm.gov/growth-management/gis
- Email: gis@santafecountynm.gov
- Phone: (505) 986-6215

**Request template:**
```
Subject: GIS Data Request - Parcel Boundaries for Research Project

Hello,

I am working on an open-source housing equity research project focused on
Santa Fe. I am requesting parcel boundary data for Santa Fe County in
shapefile or GeoJSON format.

Specifically, I need:
- Parcel boundaries (polygon geometry)
- Parcel ID
- Site address
- Zoning classification
- Land use code
- Lot size (acres)
- Year built
- Assessed value (land + improvements)

The data will be used for non-commercial research purposes analyzing
housing patterns and equity in Santa Fe.

Please let me know the process for obtaining this data and any associated
costs or licensing requirements.

Thank you,
[Your name]
```

**Alternative (paid):**
- Regrid: https://app.regrid.com/store/us/nm/santa-fe ($200-500)
- LightBox: https://www.lightboxre.com/

**After acquisition:**
```bash
# Place file in data/raw/parcels/
tsx scripts/prepare-data.ts parcels data/raw/parcels/parcels.shp 4326
```

### 2. Short-Term Rentals

**Why it matters:** STR concentration affects housing availability and neighborhood character. Key for displacement analysis.

**Challenge:** Inside Airbnb does not cover Santa Fe. City registration data may be most reliable.

**Option A: City of Santa Fe STR Registry**
- Contact Planning & Land Use: https://santafenm.gov/planning-and-land-use
- Santa Fe requires STR registration (Ordinance 2019-27)
- Submit IPRA (public records) request for registered STRs

**IPRA Request Template:**
```
Subject: IPRA Request - Short-Term Rental Registrations

To: City Clerk, City of Santa Fe
(Submit via https://santafenm.gov/city-clerk)

Pursuant to the Inspection of Public Records Act (IPRA), I request:

1. List of all registered short-term rental properties including:
   - Property address
   - Registration/permit number
   - Property type (entire home, private room, etc.)
   - Date of registration
   - Owner type (individual, LLC, etc.) - if public record

2. Any available data on STR density by neighborhood or district

Please provide in electronic format (CSV, Excel, or database export preferred).

This request is for non-commercial research purposes.

[Your name and contact info]
```

**Option B: Commercial Data**
- AirDNA: https://www.airdna.co/ (subscription required)
- AllTheRooms: https://www.alltherooms.com/

**Data format needed:**
```csv
listing_id,address,lat,lon,property_type,room_type,accommodates,price_per_night
```

### 3. Affordable Housing Inventory

**Why it matters:** Understanding where affordable units exist and when deed restrictions expire is critical for preservation efforts.

**Primary sources:**

1. **City of Santa Fe Housing Division**
   - https://santafenm.gov/affordable-housing
   - Request current affordable housing inventory

2. **New Mexico Mortgage Finance Authority (MFA)**
   - https://housingnm.org/
   - Administers LIHTC and other programs
   - Has statewide database

3. **HUD Subsidized Housing**
   - https://www.hud.gov/program_offices/housing/mfh/exp/mfhdiscl
   - Filter for Santa Fe, NM
   - Includes Section 8, public housing, LIHTC

4. **National Housing Preservation Database**
   - https://preservationdatabase.org/
   - Search by location

**Data format needed:**
```csv
property_id,name,address,lat,lon,total_units,affordable_units,ami_restriction,deed_restricted,restriction_expires,property_type
```

### 4. Eviction Filings (Sensitive)

**Why it matters:** Eviction patterns reveal displacement pressure and can identify at-risk neighborhoods.

**Privacy considerations:**
- Do NOT include tenant names
- Aggregate by census tract when possible
- Follow HIPAA-like principles for housing data

**Sources:**

1. **New Mexico Courts Case Lookup**
   - https://caselookup.nmcourts.gov/
   - Search Santa Fe County Magistrate Court
   - Case type: "Forcible Entry and Detainer" (eviction)
   - Manual lookup only; bulk requires agreement

2. **Eviction Lab (Princeton)**
   - https://evictionlab.org/
   - May have Santa Fe data
   - Provides aggregated, anonymized data

3. **Legal Aid Organizations**
   - New Mexico Legal Aid: https://www.newmexicolegalaid.org/
   - May share anonymized eviction trends

**Data format needed:**
```csv
filing_id,filing_date,address,eviction_type,outcome
```
(Do NOT include: tenant name, case number with PII)

---

## Data Processing Pipeline

After acquiring data, process it using the prepare-data script:

```bash
# 1. Place raw data in appropriate directory
mkdir -p data/raw/{layer_name}

# 2. Run prepare-data script
tsx scripts/prepare-data.ts {layer_name} data/raw/{layer_name}/{file} {srid}

# Examples:
tsx scripts/prepare-data.ts parcels data/raw/parcels/parcels.shp 4326
tsx scripts/prepare-data.ts census_tracts data/raw/census_tracts/tl_2023_35_tract.shp 4326
tsx scripts/prepare-data.ts flood_zones data/raw/flood_zones/S_FLD_HAZ_AR.shp 4326
```

The script will:
1. Validate SRID
2. Create dual geometries (WGS84 + UTM 13N)
3. Export to GeoParquet
4. Update manifest.json

---

## Verification Checklist

After data acquisition, verify:

- [ ] Census tracts loaded with demographic data joined
- [ ] Parcel boundaries cover Santa Fe County
- [ ] Parcel data includes zoning and assessed values
- [ ] Flood zones cover study area
- [ ] Transit stops include lat/lon coordinates
- [ ] Zoning districts have zone codes
- [ ] Hydrology includes arroyos and Santa Fe River
- [ ] All layers have valid geometries (run `ST_IsValid`)
- [ ] CRS is correctly set (WGS84 for display, UTM 13N for metrics)

---

## Data Quality Issues to Watch

1. **Missing geometries** - Some parcels may have NULL geometry
2. **Invalid geometries** - Self-intersecting polygons
3. **Coordinate system mismatches** - Verify SRID before loading
4. **Field name inconsistencies** - Map source fields to our schema
5. **Null values in key fields** - Handle missing assessed values, etc.
6. **Duplicate records** - Deduplicate by ID

---

## Timeline Estimate

| Task | Effort | Dependency |
|------|--------|------------|
| Automated downloads | 1 hour | None |
| Parcel data request | 1-2 weeks | County GIS response time |
| IPRA for STR data | 2-4 weeks | City response time |
| Affordable housing compile | 1 week | Multiple source queries |
| Data processing | 2-3 days | Raw data acquired |

**Critical path:** Parcel data is the blocker. Submit request immediately.

---

## Contacts

| Organization | Contact | Purpose |
|--------------|---------|---------|
| Santa Fe County GIS | gis@santafecountynm.gov | Parcel data |
| City of Santa Fe IT/GIS | (505) 955-6597 | City layers |
| City Planning | planning@santafenm.gov | STR registry |
| City Housing | housing@santafenm.gov | Affordable housing |
| NM MFA | (505) 843-6880 | State affordable housing |

---

## References

- [US Census TIGER/Line](https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.html)
- [Census ACS API](https://www.census.gov/data/developers/data-sets/acs-5year.html)
- [FEMA NFHL](https://www.fema.gov/flood-maps/national-flood-hazard-layer)
- [City of Santa Fe GIS](https://santafenm.gov/information-technology-telecommunications/gis)
- [Santa Fe County GIS](https://www.santafecountynm.gov/growth-management/gis)
- [GTFS Specification](https://gtfs.org/schedule/reference/)
