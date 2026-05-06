import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type {
  GroundingInfo,
  QueryMetadata,
  StructuredQuery,
} from '../../types/api';
import fieldLabels from '../../../../shared/locales/field-labels.json';
import './ResultsPanel.css';

interface ResultsPanelProps {
  features: Feature<Geometry, Record<string, unknown>>[];
  selectedFeature: Feature<Geometry, Record<string, unknown>> | null;
  query: StructuredQuery | null;
  metadata: QueryMetadata | null;
  grounding: GroundingInfo | null;
  explanation: string | null;
  equityNarrative?: string | null;
  onFeatureSelect: (feature: Feature<Geometry, Record<string, unknown>> | null) => void;
  onClose: () => void;
}

function downloadBlob(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function featuresToGeoJSON(
  features: Feature<Geometry, Record<string, unknown>>[],
  query: StructuredQuery | null,
  metadata: QueryMetadata | null
): string {
  const fc: FeatureCollection & { metadata?: Record<string, unknown> } = {
    type: 'FeatureCollection',
    features,
    metadata: {
      exportedAt: new Date().toISOString(),
      query: query ?? undefined,
      queryHash: metadata?.queryHash,
      sourceLayers: metadata?.sourceLayers,
      featureCount: features.length,
    },
  };
  return JSON.stringify(fc, null, 2);
}

function featuresToCSV(
  features: Feature<Geometry, Record<string, unknown>>[]
): string {
  if (features.length === 0) return '';

  const allKeys = new Set<string>();
  for (const f of features) {
    for (const key of Object.keys(f.properties ?? {})) {
      allKeys.add(key);
    }
  }
  const headers = Array.from(allKeys).sort();

  const escapeCSV = (val: unknown): string => {
    if (val === null || val === undefined) return '';
    const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = features.map((f) =>
    headers.map((h) => escapeCSV(f.properties?.[h])).join(',')
  );

  return [headers.join(','), ...rows].join('\n');
}

export function ResultsPanel({
  features,
  selectedFeature,
  query,
  metadata,
  grounding,
  explanation,
  equityNarrative,
  onFeatureSelect,
  onClose,
}: ResultsPanelProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('es') ? 'es' : 'en';
  const layerName = query?.selectLayer ?? 'results';

  const handleExportGeoJSON = useCallback(() => {
    const content = featuresToGeoJSON(features, query, metadata);
    downloadBlob(content, `${layerName}.geojson`, 'application/geo+json');
  }, [features, query, metadata, layerName]);

  const handleExportCSV = useCallback(() => {
    const content = featuresToCSV(features);
    downloadBlob(content, `${layerName}.csv`, 'text/csv');
  }, [features, layerName]);

  if (features.length === 0 && !query) {
    return null;
  }

  // Get property keys from first feature (for table headers)
  const propertyKeys = features.length > 0
    ? Object.keys(features[0]?.properties ?? {}).filter(
        (key) => !key.startsWith('_') && key !== 'geometry'
      )
    : [];

  // Limit displayed columns to avoid horizontal overflow
  const displayKeys = propertyKeys.slice(0, 5);
  const hasMoreColumns = propertyKeys.length > 5;

  return (
    <div className="results-panel" role="region" aria-label={t('results.regionLabel')}>
      <div className="results-header">
        <div className="results-title">
          <h3>{t('results.heading')}</h3>
          <span className="results-count">
            {t('results.featureCount', { count: features.length })}
          </span>
        </div>
        <div className="results-actions">
          {features.length > 0 && (
            <>
              <button
                type="button"
                className="export-btn"
                onClick={handleExportGeoJSON}
                aria-label={t('results.downloadGeoJsonLabel')}
                title={t('results.downloadGeoJsonTitle')}
              >
                GeoJSON
              </button>
              <button
                type="button"
                className="export-btn"
                onClick={handleExportCSV}
                aria-label={t('results.downloadCsvLabel')}
                title={t('results.downloadCsvTitle')}
              >
                CSV
              </button>
            </>
          )}
          <button
            type="button"
            className="results-close-btn"
            onClick={onClose}
            aria-label={t('results.close')}
          >
            &times;
          </button>
        </div>
      </div>

      <div className="results-body">

      {explanation && (
        <div className="results-explanation">
          {equityNarrative && (
            <span className="equity-label">{t('results.equityLabel')}</span>
          )}
          <p>{explanation}</p>
        </div>
      )}

      {(metadata || grounding) && (
        <div className="results-provenance">
          {grounding && (
            <div className="provenance-row">
              <span className={`grounding-badge grounding-${grounding.status}`}>
                {t('results.grounding')}: {grounding.status.replace('_', ' ')}
              </span>
              {grounding.missingLayers.length > 0 && (
                <span className="provenance-text">
                  {t('results.missing')}: {grounding.missingLayers.join(', ')}
                </span>
              )}
            </div>
          )}
          {metadata?.sourceLayers && metadata.sourceLayers.length > 0 && (
            <div className="provenance-row">
              <span className="provenance-label">{t('results.sources')}</span>
              <span className="provenance-text">
                {metadata.sourceLayers.join(', ')}
              </span>
            </div>
          )}
          {metadata?.queryHash && (
            <div className="provenance-row">
              <span className="provenance-label">{t('results.queryHash')}</span>
              <span className="provenance-text">{metadata.queryHash}</span>
            </div>
          )}
          {metadata?.truncated && (
            <div className="provenance-row">
              <span className="provenance-warning">
                {t('results.truncatedAt', { count: metadata.maxFeaturesApplied ?? metadata.count })}
              </span>
            </div>
          )}
        </div>
      )}

      {query && (
        <details className="query-details">
          <summary>{t('results.viewQuery')}</summary>
          <pre className="query-json">{JSON.stringify(query, null, 2)}</pre>
        </details>
      )}

      {selectedFeature && (
        <div className="selected-feature-details">
          <div className="selected-header">
            <h4>{t('results.selectedFeature')}</h4>
            <button
              type="button"
              className="deselect-btn"
              onClick={() => onFeatureSelect(null)}
            >
              {t('results.clearSelection')}
            </button>
          </div>
          <div className="feature-properties">
            {Object.entries(selectedFeature.properties ?? {})
              .filter(([key]) => !key.startsWith('_'))
              .map(([key, value]) => (
                <div key={key} className="property-row">
                  <span className="property-key">{localizeKey(layerName, key, lang)}</span>
                  <span className="property-value">{formatValue(value, lang)}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {features.length > 0 && (
        <div className="results-table-container">
          <table className="results-table" aria-label={t('results.featureResults')}>
            <thead>
              <tr>
                {displayKeys.map((key) => (
                  <th key={key} scope="col">{localizeKey(layerName, key, lang)}</th>
                ))}
                {hasMoreColumns && <th scope="col">...</th>}
              </tr>
            </thead>
            <tbody>
              {features.slice(0, 100).map((feature, index) => {
                const isSelected = featuresEqual(selectedFeature, feature);
                return (
                  <tr
                    key={index}
                    className={isSelected ? 'selected' : ''}
                    onClick={() => onFeatureSelect(feature)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onFeatureSelect(feature);
                      }
                    }}
                    tabIndex={0}
                    role="row"
                    aria-selected={isSelected}
                  >
                    {displayKeys.map((key) => (
                      <td key={key}>
                        {formatValue(feature.properties?.[key], lang)}
                      </td>
                    ))}
                    {hasMoreColumns && <td>...</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {features.length > 100 && (
            <div className="results-truncated">
              {t('results.truncatedAt', { count: features.length })}
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
}

/**
 * Compare two features for equality by ID or properties
 * Used to match selected features from map clicks with table rows
 */
function featuresEqual(
  a: Feature<Geometry, Record<string, unknown>> | null,
  b: Feature<Geometry, Record<string, unknown>> | null
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;

  // Compare by ID if both have IDs
  if (a.id !== undefined && b.id !== undefined) {
    return a.id === b.id;
  }

  // Fallback: compare by unique identifier properties
  // This handles cases where features don't have top-level IDs
  const aProps = a.properties ?? {};
  const bProps = b.properties ?? {};
  
  // Try to find a unique identifier in properties
  // Common ID field names across different layer types
  const idKeys = ['id', 'OBJECTID', 'parcel_id', 'geoid', 'zone_id', 'listing_id', 'filing_id'];
  for (const key of idKeys) {
    if (aProps[key] !== undefined && bProps[key] !== undefined) {
      return aProps[key] === bProps[key];
    }
  }

  // If no ID found, features are considered different
  // This prevents false matches but means map-clicked features without IDs won't highlight
  return false;
}

type FieldLabelMap = Record<string, Record<string, { en: string; es: string }>>;
const fieldLabelsByLayer = fieldLabels as unknown as FieldLabelMap;

function localizeKey(layer: string, key: string, lang: 'en' | 'es'): string {
  const layerMap = fieldLabelsByLayer[layer];
  const label = layerMap?.[key];
  if (label) return label[lang];
  return key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

function formatValue(value: unknown, lang: 'en' | 'es'): string {
  if (value === null || value === undefined) {
    return '—';
  }

  if (typeof value === 'number') {
    const locale = lang === 'es' ? 'es-MX' : 'en-US';
    if (Number.isInteger(value)) {
      return value.toLocaleString(locale);
    }
    return value.toLocaleString(locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  }

  if (typeof value === 'boolean') {
    return value ? (lang === 'es' ? 'Sí' : 'Yes') : (lang === 'es' ? 'No' : 'No');
  }

  if (Array.isArray(value)) {
    return value.join(', ');
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}
