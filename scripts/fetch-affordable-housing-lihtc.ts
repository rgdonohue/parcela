#!/usr/bin/env tsx
/**
 * Fetch Affordable Housing Units from HUD LIHTC Database
 *
 * Source: https://www.huduser.gov/portal/datasets/lihtc/property.html
 * Downloads LIHTCPUB.CSV, filters to Santa Fe County (NM, FIPS 35049),
 * maps to affordable_housing_units schema, geocodes rows missing lat/lon,
 * and emits GeoJSON for prepare-data.
 *
 * Usage:
 *   tsx scripts/fetch-affordable-housing-lihtc.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const LIHTCPUB_URL = 'https://www.huduser.gov/lihtc/lihtcpub.zip';
const OUTPUT_DIR = join(process.cwd(), 'data', 'raw', 'affordable_housing');
const OUTPUT_FILE = join(OUTPUT_DIR, 'affordable_housing_units.geojson');
const ZIP_PATH = join(OUTPUT_DIR, 'lihtcpub.zip');

const SANTA_FE_COUNTY_FIPS = '35049';
const NEW_MEXICO_STATE = 'NM';

// LIHTC type codes: 1=Elderly, 2=Family, 3=Other
const LIHTC_TYPE_TO_PROPERTY: Record<string, string> = {
  '1': 'apartment',
  '2': 'apartment',
  '3': 'other',
};

interface LIHTCRow {
  hud_id: string;
  project: string;
  proj_add: string;
  proj_cty: string;
  proj_st: string;
  proj_zip: string;
  latitude: string;
  longitude: string;
  n_units: string;
  li_units: string;
  inc_ceil: string;
  low_ceil: string;
  aff_yrs: string;
  yr_pis: string;
  type: string;
  fips2010: string;
}

interface AffordableHousingFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: {
    unit_id: string;
    property_name: string | null;
    address: string;
    total_units: number;
    affordable_units: number;
    income_restriction_pct_ami: number | null;
    deed_restricted: boolean;
    restriction_expires: string | null;
    property_type: string;
  };
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += c;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSVHeader(header: string): Map<string, number> {
  const cols = parseCSVLine(header);
  const map = new Map<string, number>();
  cols.forEach((c, i) => map.set(c, i));
  return map;
}

function rowToObject(cols: string[], headerMap: Map<string, number>): LIHTCRow {
  const get = (name: string) => cols[headerMap.get(name) ?? -1] ?? '';
  return {
    hud_id: get('hud_id'),
    project: get('project'),
    proj_add: get('proj_add'),
    proj_cty: get('proj_cty'),
    proj_st: get('proj_st'),
    proj_zip: get('proj_zip'),
    latitude: get('latitude'),
    longitude: get('longitude'),
    n_units: get('n_units'),
    li_units: get('li_units'),
    inc_ceil: get('inc_ceil'),
    low_ceil: get('low_ceil'),
    aff_yrs: get('aff_yrs'),
    yr_pis: get('yr_pis'),
    type: get('type'),
    fips2010: get('fips2010'),
  };
}

function isSantaFeArea(row: LIHTCRow): boolean {
  if (row.proj_st !== NEW_MEXICO_STATE) return false;
  if (row.proj_cty?.toUpperCase() === 'SANTA FE') return true;
  if (row.fips2010?.startsWith(SANTA_FE_COUNTY_FIPS)) return true;
  return false;
}

function parseNum(s: string): number | null {
  if (!s || s === '8888' || s === '.' || s === '') return null;
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? null : n;
}

function mapToFeature(row: LIHTCRow, lat: number, lon: number): AffordableHousingFeature {
  const totalUnits = parseNum(row.n_units) ?? parseNum(row.li_units) ?? 0;
  const affordableUnits = parseNum(row.li_units) ?? totalUnits;

  // LIHTC 20/50/60 AMI set-asides; inc_ceil/low_ceil may be 20, 50, 60
  const amiPct = parseNum(row.inc_ceil) ?? parseNum(row.low_ceil) ?? null;

  const affYrs = parseNum(row.aff_yrs);
  const yrPis = parseNum(row.yr_pis);
  const restrictionExpires =
    yrPis !== null && affYrs !== null ? String(yrPis + affYrs) : null;

  const propType =
    LIHTC_TYPE_TO_PROPERTY[row.type?.trim() ?? ''] ?? 'apartment';

  const address = [row.proj_add, row.proj_cty, row.proj_st, row.proj_zip]
    .filter(Boolean)
    .join(', ');

  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lon, lat] },
    properties: {
      unit_id: row.hud_id || `lihtc-${lat}-${lon}`,
      property_name: row.project?.trim() || null,
      address: address || 'Unknown',
      total_units: totalUnits,
      affordable_units: affordableUnits,
      income_restriction_pct_ami: amiPct,
      deed_restricted: true,
      restriction_expires: restrictionExpires,
      property_type: propType,
    },
  };
}

async function geocodeAddress(
  street: string,
  city: string,
  state: string
): Promise<{ lat: number; lon: number } | null> {
  const params = new URLSearchParams({
    street,
    city,
    state,
    benchmark: 'Public_AR_Current',
    vintage: 'Current_Current',
    format: 'json',
  });
  const url = `https://geocoding.geo.census.gov/geocoder/geographies/address?${params}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      result?: {
        addressMatches?: Array<{
          coordinates?: { x: number; y: number };
        }>;
      };
    };
    const match = data.result?.addressMatches?.[0];
    const coords = match?.coordinates;
    if (coords && typeof coords.x === 'number' && typeof coords.y === 'number') {
      return { lat: coords.y, lon: coords.x };
    }
  } catch {
    // ignore
  }
  return null;
}

async function ensureCSV(): Promise<void> {
  const csvPath = join(OUTPUT_DIR, 'LIHTCPUB.CSV');
  if (existsSync(csvPath)) {
    console.log('LIHTCPUB.CSV already exists, skipping download');
    return;
  }

  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  if (!existsSync(ZIP_PATH)) {
    console.log('Downloading LIHTC database...');
    const res = await fetch(LIHTCPUB_URL);
    if (!res.ok) {
      throw new Error(`Download failed: HTTP ${res.status}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(ZIP_PATH, buf);
  }

  console.log('Extracting...');
  const AdmZip = await import('adm-zip');
  const zip = new AdmZip(ZIP_PATH);
  zip.extractAllTo(OUTPUT_DIR, true);
}

async function processCSV(): Promise<AffordableHousingFeature[]> {
  const csvPath = join(OUTPUT_DIR, 'LIHTCPUB.CSV');
  if (!existsSync(csvPath)) {
    throw new Error(`Expected ${csvPath} after extraction`);
  }

  const content = readFileSync(csvPath, 'utf-8');
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    throw new Error('CSV appears empty');
  }

  const headerMap = parseCSVHeader(lines[0] ?? '');
  const features: AffordableHousingFeature[] = [];
  const needsGeocode: LIHTCRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i] ?? '');
    const row = rowToObject(cols, headerMap);
    if (!isSantaFeArea(row)) continue;

    const latRaw = row.latitude?.trim();
    const lonRaw = row.longitude?.trim();
    const lat = latRaw ? parseFloat(latRaw) : NaN;
    const lon = lonRaw ? parseFloat(lonRaw) : NaN;

    if (!Number.isNaN(lat) && !Number.isNaN(lon) && lat !== 0 && lon !== 0) {
      features.push(mapToFeature(row, lat, lon));
    } else {
      needsGeocode.push(row);
    }
  }

  if (needsGeocode.length > 0) {
    console.log(`Geocoding ${needsGeocode.length} records missing coordinates...`);
    for (const row of needsGeocode) {
      const addr = row.proj_add?.trim() || '';
      const city = row.proj_cty?.trim() || 'Santa Fe';
      const state = row.proj_st?.trim() || 'NM';
      if (!addr) {
        console.warn(`  Skipping ${row.hud_id}: no address`);
        continue;
      }
      const coords = await geocodeAddress(addr, city, state);
      if (coords) {
        features.push(mapToFeature(row, coords.lat, coords.lon));
      } else {
        console.warn(`  Geocoding failed: ${addr}, ${city}, ${state}`);
      }
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  return features;
}

async function main(): Promise<void> {
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  await ensureCSV();
  const features = await processCSV();

  const fc: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features,
  };

  writeFileSync(OUTPUT_FILE, JSON.stringify(fc, null, 2));
  console.log(`\nWrote ${features.length} affordable housing features to ${OUTPUT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
