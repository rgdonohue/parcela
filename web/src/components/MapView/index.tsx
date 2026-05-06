import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import maplibregl from 'maplibre-gl';
import type { Feature, Geometry } from 'geojson';
import type { ChoroplethConfig } from '../../lib/choropleth';
import { buildFillColorExpression } from '../../lib/choropleth';
import 'maplibre-gl/dist/maplibre-gl.css';
import './MapView.css';

interface MapViewProps {
  features: Feature<Geometry, Record<string, unknown>>[];
  selectedFeature: Feature<Geometry, Record<string, unknown>> | null;
  onFeatureClick: (feature: Feature<Geometry, Record<string, unknown>>) => void;
  choroplethConfig?: ChoroplethConfig | null;
  queryLayerName?: string | null;
}

const RESULTS_SOURCE = 'query-results';
const RESULTS_FILL_LAYER = 'query-results-fill';
const RESULTS_LINE_LAYER = 'query-results-line';
const RESULTS_LINESTRING_LAYER = 'query-results-linestring';
const RESULTS_POINT_LAYER = 'query-results-point';
const SELECTED_SOURCE = 'selected-feature';
const SELECTED_POLYGON_FILL_LAYER = 'selected-feature-polygon-fill';
const SELECTED_POLYGON_LINE_LAYER = 'selected-feature-polygon-line';
const SELECTED_LINE_LAYER = 'selected-feature-line';
const SELECTED_POINT_LAYER = 'selected-feature-point';

// Terracotta color for all features
const FILL_COLOR = '#C2694A';
const STROKE_COLOR = '#A0523C';

/**
 * Escape HTML entities to prevent XSS attacks
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function humanize(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

/**
 * Pick the most meaningful display string from a feature's properties.
 * Tries a prioritized list of common label fields across all layers,
 * then falls back to the first non-private string value.
 */
function pickTooltipName(props: Record<string, unknown>): string {
  const labelFields = [
    'name', 'property_name', 'project_name', 'park_name', 'stop_name',
    'tract_name', 'district_name', 'zone_name', 'route_name',
    'business_name', 'permit_number', 'address', 'parcel_id',
    'unit_id', 'zone_code', 'geoid',
  ];
  for (const field of labelFields) {
    const v = props[field];
    if (typeof v === 'string' && v.trim()) return v;
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  // Last resort: first usable string property
  for (const [key, value] of Object.entries(props)) {
    if (key.startsWith('_') || key === 'geometry') continue;
    if (typeof value === 'string' && value.trim()) return value;
  }
  return '';
}

function pickTooltipDescription(props: Record<string, unknown>, usedAsName: string): string {
  const descFields = ['zone_name', 'type', 'property_type', 'address', 'facility_type', 'name_full'];
  for (const field of descFields) {
    const v = props[field];
    if (typeof v === 'string' && v.trim() && v !== usedAsName) return v;
  }
  return '';
}

/**
 * Convert a MapLibre feature to a plain GeoJSON feature
 * MapLibre features have non-serializable geometry objects
 */
function toPlainFeature(
  feature: maplibregl.MapGeoJSONFeature
): Feature<Geometry, Record<string, unknown>> {
  return {
    type: 'Feature',
    geometry: feature.geometry as Geometry,
    properties: { ...feature.properties },
    id: feature.id,
  };
}

export function MapView({
  features,
  selectedFeature,
  onFeatureClick,
  choroplethConfig,
  queryLayerName,
}: MapViewProps) {
  const { t } = useTranslation();
  const tRef = useRef(t);
  useEffect(() => { tRef.current = t; }, [t]);
  const queryLayerNameRef = useRef(queryLayerName);
  useEffect(() => { queryLayerNameRef.current = queryLayerName; }, [queryLayerName]);

  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const popup = useRef<maplibregl.Popup | null>(null);
  const mountedRef = useRef(true);
  const choroplethTimeouts = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      for (const timeoutId of choroplethTimeouts.current) {
        clearTimeout(timeoutId);
      }
      choroplethTimeouts.current = [];
    };
  }, []);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
      center: [-105.94, 35.69], // Santa Fe
      zoom: 12,
    });

    map.current.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.current.on('load', () => {
      const m = map.current;
      if (!m) return;

      // Add results source (empty initially)
      m.addSource(RESULTS_SOURCE, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      // Add selected feature source
      m.addSource(SELECTED_SOURCE, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      // Fill layer for polygons - terracotta
      m.addLayer({
        id: RESULTS_FILL_LAYER,
        type: 'fill',
        source: RESULTS_SOURCE,
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: {
          'fill-color': FILL_COLOR,
          'fill-opacity': 0.35,
        },
      });

      // Line layer for polygon outlines - darker stroke
      m.addLayer({
        id: RESULTS_LINE_LAYER,
        type: 'line',
        source: RESULTS_SOURCE,
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: {
          'line-color': STROKE_COLOR,
          'line-width': 1,
        },
      });

      // Line layer for LineString features (hydrology, etc.) - terracotta
      m.addLayer({
        id: RESULTS_LINESTRING_LAYER,
        type: 'line',
        source: RESULTS_SOURCE,
        filter: ['==', ['geometry-type'], 'LineString'],
        paint: {
          'line-color': FILL_COLOR,
          'line-width': 2,
        },
      });

      // Point layer
      m.addLayer({
        id: RESULTS_POINT_LAYER,
        type: 'circle',
        source: RESULTS_SOURCE,
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': 6,
          'circle-color': FILL_COLOR,
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 2,
        },
      });

      // Selected feature highlight layers by geometry type — ochre/gold
      m.addLayer({
        id: SELECTED_POLYGON_FILL_LAYER,
        type: 'fill',
        source: SELECTED_SOURCE,
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: {
          'fill-color': '#D4A853',
          'fill-opacity': 0.25,
        },
      });

      m.addLayer({
        id: SELECTED_POLYGON_LINE_LAYER,
        type: 'line',
        source: SELECTED_SOURCE,
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: {
          'line-color': '#B8912E',
          'line-width': 4,
        },
      });

      m.addLayer({
        id: SELECTED_LINE_LAYER,
        type: 'line',
        source: SELECTED_SOURCE,
        filter: ['==', ['geometry-type'], 'LineString'],
        paint: {
          'line-color': '#B8912E',
          'line-width': 4,
        },
      });

      m.addLayer({
        id: SELECTED_POINT_LAYER,
        type: 'circle',
        source: SELECTED_SOURCE,
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': 10,
          'circle-color': '#D4A853',
          'circle-opacity': 0.3,
          'circle-stroke-color': '#B8912E',
          'circle-stroke-width': 3,
        },
      });
    });

    // Click handler for features
    const handleClick = (e: maplibregl.MapMouseEvent) => {
      const m = map.current;
      if (!m) return;

      const clickedFeatures = m.queryRenderedFeatures(e.point, {
        layers: [
          RESULTS_FILL_LAYER,
          RESULTS_LINE_LAYER,
          RESULTS_LINESTRING_LAYER,
          RESULTS_POINT_LAYER,
        ],
      });

      if (clickedFeatures.length > 0) {
        const feature = clickedFeatures[0];
        if (feature) {
          // Convert to plain GeoJSON to avoid serialization issues
          onFeatureClick(toPlainFeature(feature));
        }
      }
    };

    map.current.on('click', handleClick);

    // Create popup for hover tooltips
    popup.current = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      className: 'map-tooltip',
    });

    // Hover handlers with tooltip
    const handleMouseMove = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
      const m = map.current;
      if (!m || !e.features || e.features.length === 0) return;

      m.getCanvas().style.cursor = 'pointer';

      const feature = e.features[0];
      if (!feature) return;

      const props = feature.properties;
      if (!props) return;

      const rawName = pickTooltipName(props);
      const rawDesc = pickTooltipDescription(props, rawName);

      let html = '<div class="tooltip-content">';
      if (rawName) {
        html += `<div class="tooltip-row"><strong>${tRef.current('map.tooltipName')}:</strong> ${escapeHtml(rawName)}</div>`;
      }
      if (rawDesc) {
        html += `<div class="tooltip-row tooltip-desc">${escapeHtml(rawDesc)}</div>`;
      }
      // If we still have nothing, show the humanized layer name as a last resort
      if (!rawName && !rawDesc) {
        html += `<div class="tooltip-row tooltip-desc">${escapeHtml(humanize(queryLayerNameRef.current ?? 'feature'))}</div>`;
      }
      html += '</div>';

      popup.current?.setLngLat(e.lngLat).setHTML(html).addTo(m);
    };

    const handleMouseLeave = () => {
      if (map.current) {
        map.current.getCanvas().style.cursor = '';
      }
      popup.current?.remove();
    };

    map.current.on('mousemove', RESULTS_FILL_LAYER, handleMouseMove);
    map.current.on('mousemove', RESULTS_LINE_LAYER, handleMouseMove);
    map.current.on('mousemove', RESULTS_LINESTRING_LAYER, handleMouseMove);
    map.current.on('mousemove', RESULTS_POINT_LAYER, handleMouseMove);
    map.current.on('mouseleave', RESULTS_FILL_LAYER, handleMouseLeave);
    map.current.on('mouseleave', RESULTS_LINE_LAYER, handleMouseLeave);
    map.current.on('mouseleave', RESULTS_LINESTRING_LAYER, handleMouseLeave);
    map.current.on('mouseleave', RESULTS_POINT_LAYER, handleMouseLeave);

    return () => {
      // Remove all event listeners before cleanup
      const m = map.current;
      if (m) {
        m.off('click', handleClick);
        m.off('mousemove', RESULTS_FILL_LAYER, handleMouseMove);
        m.off('mousemove', RESULTS_LINE_LAYER, handleMouseMove);
        m.off('mousemove', RESULTS_LINESTRING_LAYER, handleMouseMove);
        m.off('mousemove', RESULTS_POINT_LAYER, handleMouseMove);
        m.off('mouseleave', RESULTS_FILL_LAYER, handleMouseLeave);
        m.off('mouseleave', RESULTS_LINE_LAYER, handleMouseLeave);
        m.off('mouseleave', RESULTS_LINESTRING_LAYER, handleMouseLeave);
        m.off('mouseleave', RESULTS_POINT_LAYER, handleMouseLeave);
      }
      popup.current?.remove();
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [onFeatureClick]);

  // Update results layer when features change
  useEffect(() => {
    const m = map.current;
    if (!m) return;

    const updateSource = () => {
      const source = m.getSource(RESULTS_SOURCE) as maplibregl.GeoJSONSource | undefined;
      if (!source) return;

      const featureCollection = {
        type: 'FeatureCollection' as const,
        features,
      };

      source.setData(featureCollection);

      // Fit bounds to features if we have any
      if (features.length > 0) {
        const bounds = getBounds(features);
        if (bounds) {
          m.fitBounds(bounds, {
            padding: 50,
            maxZoom: 15,
          });
        }
      }
    };

    if (m.isStyleLoaded()) {
      updateSource();
    } else {
      m.once('load', updateSource);
    }
  }, [features]);

  // Update selected feature highlight
  useEffect(() => {
    const m = map.current;
    if (!m) return;

    const updateSelected = () => {
      const source = m.getSource(SELECTED_SOURCE) as maplibregl.GeoJSONSource | undefined;
      if (!source) return;

      source.setData({
        type: 'FeatureCollection',
        features: selectedFeature ? [selectedFeature] : [],
      });
    };

    if (m.isStyleLoaded()) {
      updateSelected();
    } else {
      m.once('load', updateSelected);
    }
  }, [selectedFeature]);

  // Update choropleth styling when config or features change
  useEffect(() => {
    const m = map.current;
    if (!m) return;

    const updateChoropleth = () => {
      if (!mountedRef.current) return;
      const layer = m.getLayer(RESULTS_FILL_LAYER);
      if (!layer) return;

      if (choroplethConfig) {
        // Apply data-driven color based on attribute values
        const colorExpr = buildFillColorExpression(choroplethConfig);
        if (!mountedRef.current || !m.getLayer(RESULTS_FILL_LAYER)) return;
        m.setPaintProperty(RESULTS_FILL_LAYER, 'fill-color', colorExpr as maplibregl.ExpressionSpecification);
        m.setPaintProperty(RESULTS_FILL_LAYER, 'fill-opacity', 0.7);
      } else {
        // Reset to default terracotta
        if (!mountedRef.current || !m.getLayer(RESULTS_FILL_LAYER)) return;
        m.setPaintProperty(RESULTS_FILL_LAYER, 'fill-color', FILL_COLOR);
        m.setPaintProperty(RESULTS_FILL_LAYER, 'fill-opacity', 0.35);
      }
    };

    const scheduleUpdate = () => {
      const timeoutId = setTimeout(() => {
        choroplethTimeouts.current = choroplethTimeouts.current.filter(
          (id) => id !== timeoutId
        );
        updateChoropleth();
      }, 100);
      choroplethTimeouts.current.push(timeoutId);
    };

    const onLoad = () => scheduleUpdate();

    // Small delay to ensure features are loaded first
    if (m.isStyleLoaded()) {
      scheduleUpdate();
    } else {
      m.once('load', onLoad);
    }

    return () => {
      m.off('load', onLoad);
      for (const timeoutId of choroplethTimeouts.current) {
        clearTimeout(timeoutId);
      }
      choroplethTimeouts.current = [];
    };
  }, [choroplethConfig, features]);

  return (
    <div className="map-view">
      <div ref={mapContainer} className="map-container" />
      {choroplethConfig && (
        <div className="map-legend">
          <div className="legend-title">
            {choroplethConfig.label}
            {choroplethConfig.unit ? ` (${choroplethConfig.unit})` : ''}
          </div>
          <div className="legend-scale">
            {choroplethConfig.colorRamp.map((color, i) => {
              const label = choroplethConfig.classLabels[i] || '';
              return (
                <div key={i} className="legend-item">
                  <span className="legend-color" style={{ backgroundColor: color }} />
                  <span className="legend-label">{label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {!choroplethConfig && features.length > 0 && (
        <div className="map-legend">
          <div className="legend-title">{t('map.legendTitle')}</div>
          <div className="legend-scale">
            <div className="legend-item">
              <span className="legend-color" style={{ backgroundColor: FILL_COLOR }} />
              <span className="legend-label">
                {queryLayerName
                  ? t(`layers.${queryLayerName}`, { defaultValue: humanize(queryLayerName) })
                  : t('map.legendTitle')}{' '}
                ({getDominantGeometry(features)})
              </span>
            </div>
            <div className="legend-item">
              <span className="legend-label">
                {t('results.featureCount', { count: features.length })}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Calculate bounding box for a set of features
 * Returns bounds in MapLibre format: [[swLng, swLat], [neLng, neLat]]
 */
function getBounds(
  features: Feature<Geometry, Record<string, unknown>>[]
): [[number, number], [number, number]] | null {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  function processCoord(coord: number[]) {
    const lng = coord[0];
    const lat = coord[1];
    if (lng !== undefined && lat !== undefined) {
      minLng = Math.min(minLng, lng);
      minLat = Math.min(minLat, lat);
      maxLng = Math.max(maxLng, lng);
      maxLat = Math.max(maxLat, lat);
    }
  }

  function processCoords(coords: unknown) {
    if (!Array.isArray(coords)) return;

    if (typeof coords[0] === 'number') {
      processCoord(coords as number[]);
    } else {
      for (const c of coords) {
        processCoords(c);
      }
    }
  }

  for (const feature of features) {
    const geom = feature.geometry;
    if ('coordinates' in geom) {
      processCoords(geom.coordinates);
    }
  }

  if (minLng === Infinity) return null;

  // Return in MapLibre format: [[southwest], [northeast]]
  return [[minLng, minLat], [maxLng, maxLat]];
}

function getDominantGeometry(
  features: Feature<Geometry, Record<string, unknown>>[]
): string {
  if (features.length === 0) {
    return 'Unknown';
  }

  const counts = new Map<string, number>();
  for (const feature of features) {
    const geometryType = feature.geometry.type;
    counts.set(geometryType, (counts.get(geometryType) ?? 0) + 1);
  }

  let dominant = 'Unknown';
  let maxCount = -1;
  for (const [geometryType, count] of counts.entries()) {
    if (count > maxCount) {
      maxCount = count;
      dominant = geometryType;
    }
  }

  return dominant;
}
