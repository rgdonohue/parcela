import { useCallback } from 'react';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type {
  GroundingInfo,
  QueryMetadata,
  StructuredQuery,
} from '../../types/api';
import './ResultsPanel.css';

interface ResultsPanelProps {
  features: Feature<Geometry, Record<string, unknown>>[];
  selectedFeature: Feature<Geometry, Record<string, unknown>> | null;
  query: StructuredQuery | null;
  metadata: QueryMetadata | null;
  grounding: GroundingInfo | null;
  explanation: string | null;
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
  onFeatureSelect,
  onClose,
}: ResultsPanelProps) {
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
    <div className="results-panel" role="region" aria-label="Query results">
      <div className="results-header">
        <div className="results-title">
          <h3>Results</h3>
          <span className="results-count">{features.length} features</span>
        </div>
        <div className="results-actions">
          {features.length > 0 && (
            <>
              <button
                type="button"
                className="export-btn"
                onClick={handleExportGeoJSON}
                aria-label="Download results as GeoJSON"
                title="Download GeoJSON"
              >
                GeoJSON
              </button>
              <button
                type="button"
                className="export-btn"
                onClick={handleExportCSV}
                aria-label="Download results as CSV"
                title="Download CSV"
              >
                CSV
              </button>
            </>
          )}
          <button
            type="button"
            className="results-close-btn"
            onClick={onClose}
            aria-label="Close results"
          >
            &times;
          </button>
        </div>
      </div>

      {explanation && (
        <div className="results-explanation">
          <p>{explanation}</p>
        </div>
      )}

      {(metadata || grounding) && (
        <div className="results-provenance">
          {grounding && (
            <div className="provenance-row">
              <span className={`grounding-badge grounding-${grounding.status}`}>
                Grounding: {grounding.status.replace('_', ' ')}
              </span>
              {grounding.missingLayers.length > 0 && (
                <span className="provenance-text">
                  Missing: {grounding.missingLayers.join(', ')}
                </span>
              )}
            </div>
          )}
          {metadata?.sourceLayers && metadata.sourceLayers.length > 0 && (
            <div className="provenance-row">
              <span className="provenance-label">Sources</span>
              <span className="provenance-text">
                {metadata.sourceLayers.join(', ')}
              </span>
            </div>
          )}
          {metadata?.queryHash && (
            <div className="provenance-row">
              <span className="provenance-label">Query hash</span>
              <span className="provenance-text">{metadata.queryHash}</span>
            </div>
          )}
          {metadata?.truncated && (
            <div className="provenance-row">
              <span className="provenance-warning">
                Results truncated at {metadata.maxFeaturesApplied ?? metadata.count} features
              </span>
            </div>
          )}
        </div>
      )}

      {query && (
        <details className="query-details">
          <summary>View Query</summary>
          <pre className="query-json">{JSON.stringify(query, null, 2)}</pre>
        </details>
      )}

      {selectedFeature && (
        <div className="selected-feature-details">
          <div className="selected-header">
            <h4>Selected Feature</h4>
            <button
              type="button"
              className="deselect-btn"
              onClick={() => onFeatureSelect(null)}
            >
              Clear
            </button>
          </div>
          <div className="feature-properties">
            {Object.entries(selectedFeature.properties ?? {})
              .filter(([key]) => !key.startsWith('_'))
              .map(([key, value]) => (
                <div key={key} className="property-row">
                  <span className="property-key">{formatKey(key)}</span>
                  <span className="property-value">{formatValue(value)}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {features.length > 0 && (
        <div className="results-table-container">
          <table className="results-table" aria-label="Feature results">
            <thead>
              <tr>
                {displayKeys.map((key) => (
                  <th key={key} scope="col">{formatKey(key)}</th>
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
                        {formatValue(feature.properties?.[key])}
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
              Showing first 100 of {features.length} features
            </div>
          )}
        </div>
      )}
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

/**
 * Format property key for display
 */
function formatKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (l) => l.toUpperCase());
}

/**
 * Format property value for display
 */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '—';
  }

  if (typeof value === 'number') {
    // Format numbers with commas
    if (Number.isInteger(value)) {
      return value.toLocaleString();
    }
    return value.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  if (Array.isArray(value)) {
    return value.join(', ');
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}
