import { existsSync, readFileSync } from 'fs';
import type { Database } from 'duckdb';
import type { FieldType } from '../../../../shared/types/geo';
import { LAYER_SCHEMAS } from '../../../../shared/types/geo';
import { getConnection, query } from '../db/init';
import { log } from '../logger';

interface ManifestLayerEntry {
  featureCount?: number;
  fields?: Record<string, string>;
  source?: string;
}

interface ManifestShape {
  layers?: Record<string, ManifestLayerEntry>;
  generatedAt?: string;
}

const INTERNAL_FIELDS = new Set(['geom_4326', 'geom_utm13', 'geometry']);
const LAYER_VALIDATION_TABLE = '__layer_validation';

const VIRTUAL_FIELDS: Record<string, string[]> = {
  zoning_districts: ['allows_residential', 'allows_commercial'],
};

export interface RuntimeLayerInfo {
  name: string;
  geometryType: string;
  description?: string;
  schemaFields: Record<string, FieldType>;
  loadedFields: string[];
  queryableFields: string[];
  featureCount: number | null;
  isLoaded: boolean;
  isValidated?: boolean;
  source?: string;
}

export interface LayerSummary {
  name: string;
  geometryType: string;
  schemaFields: string[];
  isLoaded: boolean;
  isValidated?: boolean;
  loadedFields: string[];
  featureCount: number | null;
  description?: string;
}

export interface LayerRegistry {
  layers: Record<string, RuntimeLayerInfo>;
  loadedLayerNames: string[];
  generatedAt: string;
}

function readManifest(manifestPath: string): ManifestShape {
  if (!existsSync(manifestPath)) {
    return {};
  }

  try {
    return JSON.parse(readFileSync(manifestPath, 'utf-8')) as ManifestShape;
  } catch (error) {
    console.warn('Could not parse manifest.json for layer registry:', error);
    return {};
  }
}

async function describeLoadedFields(
  db: Database,
  tableName: string
): Promise<string[]> {
  const conn = getConnection(db);
  try {
    const rows = await query<{ column_name: string }>(
      conn,
      `DESCRIBE "${tableName}"`
    );

    return rows
      .map((row) => row.column_name)
      .filter((name) => !INTERNAL_FIELDS.has(name));
  } catch {
    return [];
  } finally {
    const closable = conn as unknown as { close?: () => void };
    closable.close?.();
  }
}

async function listDuckDbTables(db: Database): Promise<Set<string>> {
  const conn = getConnection(db);
  try {
    const rows = await query<{ table_name: string }>(
      conn,
      `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'main'
          AND table_type = 'BASE TABLE'
      `
    );
    return new Set(rows.map((row) => row.table_name));
  } finally {
    const closable = conn as unknown as { close?: () => void };
    closable.close?.();
  }
}

async function getLayerValidationStatuses(db: Database): Promise<Map<string, boolean>> {
  const conn = getConnection(db);
  try {
    const rows = await query<{ layer_name: string; is_validated: boolean }>(
      conn,
      `SELECT layer_name, is_validated FROM "${LAYER_VALIDATION_TABLE}"`
    );
    return new Map(rows.map((row) => [row.layer_name, Boolean(row.is_validated)]));
  } catch {
    return new Map();
  } finally {
    const closable = conn as unknown as { close?: () => void };
    closable.close?.();
  }
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

function getQueryableFields(
  schemaFields: Record<string, FieldType>,
  loadedFields: string[],
  virtualFields: string[]
): string[] {
  const schemaFieldNames = new Set(Object.keys(schemaFields));
  const concreteFields = loadedFields.filter((field) => schemaFieldNames.has(field));
  return unique([...concreteFields, ...virtualFields]);
}

export async function buildLayerRegistry(
  db: Database,
  manifestPath: string
): Promise<LayerRegistry> {
  const manifest = readManifest(manifestPath);
  const manifestLayers = manifest.layers ?? {};
  const layers: Record<string, RuntimeLayerInfo> = {};
  const layerNames = Object.keys(LAYER_SCHEMAS);
  const actualTables = await listDuckDbTables(db);
  actualTables.delete(LAYER_VALIDATION_TABLE);
  const validationStatuses = await getLayerValidationStatuses(db);
  const manifestLayerNames = new Set(Object.keys(manifestLayers));

  for (const manifestLayerName of manifestLayerNames) {
    if (!actualTables.has(manifestLayerName)) {
      log({
        level: 'warn',
        event: 'layer_registry.manifest_without_table',
        layer: manifestLayerName,
        manifestPath,
      });
    }
  }

  for (const tableName of actualTables) {
    if (!manifestLayerNames.has(tableName)) {
      log({
        level: 'warn',
        event: 'layer_registry.table_without_manifest',
        layer: tableName,
        manifestPath,
      });
    }
  }

  for (const layerName of layerNames) {
    const schema = LAYER_SCHEMAS[layerName];
    if (!schema) {
      continue;
    }
    const manifestEntry = manifestLayers[layerName];
    const isLoaded = actualTables.has(layerName);
    const describedFields = isLoaded
      ? await describeLoadedFields(db, layerName)
      : [];
    const manifestFields = Object.keys(manifestEntry?.fields ?? {}).filter(
      (name) => !INTERNAL_FIELDS.has(name)
    );
    const loadedFields = unique([...manifestFields, ...describedFields]);
    const virtualFields = VIRTUAL_FIELDS[layerName] ?? [];
    const queryableFields = getQueryableFields(
      schema.fields,
      loadedFields,
      virtualFields
    );

    layers[layerName] = {
      name: layerName,
      geometryType: schema.geometryType,
      description: schema.description,
      schemaFields: schema.fields,
      loadedFields,
      queryableFields,
      featureCount:
        typeof manifestEntry?.featureCount === 'number'
          ? manifestEntry.featureCount
          : null,
      isLoaded,
      isValidated: validationStatuses.get(layerName) ?? false,
      source: manifestEntry?.source,
    };
  }

  const loadedLayerNames = Object.values(layers)
    .filter((layer) => layer.isLoaded)
    .map((layer) => layer.name)
    .sort();

  return {
    layers,
    loadedLayerNames,
    generatedAt: manifest.generatedAt ?? new Date().toISOString(),
  };
}

export function getLayerSummaries(registry: LayerRegistry): LayerSummary[] {
  return Object.values(registry.layers)
    .filter((layer) => layer.isLoaded)
    .map((layer) => ({
      name: layer.name,
      geometryType: layer.geometryType,
      schemaFields: Object.keys(layer.schemaFields),
      isLoaded: layer.isLoaded,
      isValidated: layer.isValidated,
      loadedFields: layer.loadedFields,
      featureCount: layer.featureCount,
      description: layer.description,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
