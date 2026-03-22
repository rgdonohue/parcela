/**
 * Tests for the ResultsPanel component.
 *
 * Covers: rendering, export buttons, keyboard navigation,
 * feature selection, and accessibility attributes.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ResultsPanel } from '../src/components/ResultsPanel';
import type { Feature, Geometry } from 'geojson';

const mockFeatures: Feature<Geometry, Record<string, unknown>>[] = [
  {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[[-105.94, 35.69], [-105.93, 35.69], [-105.93, 35.68], [-105.94, 35.68], [-105.94, 35.69]]],
    },
    properties: { parcel_id: 'P001', zoning: 'R-1', assessed_value: 350000 },
  },
  {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[[-105.938, 35.688], [-105.937, 35.688], [-105.937, 35.687], [-105.938, 35.687], [-105.938, 35.688]]],
    },
    properties: { parcel_id: 'P002', zoning: 'R-1', assessed_value: 475000 },
  },
];

const defaultProps = {
  features: mockFeatures,
  selectedFeature: null,
  query: { selectLayer: 'parcels' as const },
  metadata: { count: 2, executionTimeMs: 42 },
  grounding: null,
  explanation: 'Found 2 parcels.',
  onFeatureSelect: vi.fn(),
  onClose: vi.fn(),
};

describe('ResultsPanel', () => {
  it('renders explanation and feature count', () => {
    render(<ResultsPanel {...defaultProps} />);

    expect(screen.getByText('Found 2 parcels.')).toBeInTheDocument();
    expect(screen.getByText('2 features')).toBeInTheDocument();
  });

  it('renders export buttons when features exist', () => {
    render(<ResultsPanel {...defaultProps} />);

    expect(screen.getByRole('button', { name: /download.*geojson/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download.*csv/i })).toBeInTheDocument();
  });

  it('does not render export buttons when no features', () => {
    render(<ResultsPanel {...defaultProps} features={[]} />);

    expect(screen.queryByRole('button', { name: /download.*geojson/i })).not.toBeInTheDocument();
  });

  it('renders table with feature properties', () => {
    render(<ResultsPanel {...defaultProps} />);

    expect(screen.getByRole('table', { name: 'Feature results' })).toBeInTheDocument();
    expect(screen.getByText('P001')).toBeInTheDocument();
    expect(screen.getByText('P002')).toBeInTheDocument();
  });

  it('calls onFeatureSelect when row is clicked', () => {
    const onFeatureSelect = vi.fn();
    render(<ResultsPanel {...defaultProps} onFeatureSelect={onFeatureSelect} />);

    const rows = screen.getAllByRole('row');
    // First row is header, click the first data row
    fireEvent.click(rows[1]!);

    expect(onFeatureSelect).toHaveBeenCalledWith(mockFeatures[0]);
  });

  it('supports keyboard selection with Enter', () => {
    const onFeatureSelect = vi.fn();
    render(<ResultsPanel {...defaultProps} onFeatureSelect={onFeatureSelect} />);

    const rows = screen.getAllByRole('row');
    fireEvent.keyDown(rows[1]!, { key: 'Enter' });

    expect(onFeatureSelect).toHaveBeenCalledWith(mockFeatures[0]);
  });

  it('supports keyboard selection with Space', () => {
    const onFeatureSelect = vi.fn();
    render(<ResultsPanel {...defaultProps} onFeatureSelect={onFeatureSelect} />);

    const rows = screen.getAllByRole('row');
    fireEvent.keyDown(rows[1]!, { key: ' ' });

    expect(onFeatureSelect).toHaveBeenCalledWith(mockFeatures[0]);
  });

  it('marks selected row with aria-selected', () => {
    render(
      <ResultsPanel {...defaultProps} selectedFeature={mockFeatures[0]!} />
    );

    const rows = screen.getAllByRole('row');
    expect(rows[1]).toHaveAttribute('aria-selected', 'true');
    expect(rows[2]).toHaveAttribute('aria-selected', 'false');
  });

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn();
    render(<ResultsPanel {...defaultProps} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('has proper ARIA region', () => {
    render(<ResultsPanel {...defaultProps} />);

    expect(screen.getByRole('region', { name: 'Query results' })).toBeInTheDocument();
  });

  it('returns null when no features and no query', () => {
    const { container } = render(
      <ResultsPanel {...defaultProps} features={[]} query={null} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('triggers GeoJSON download on export click', () => {
    // Mock URL.createObjectURL and revokeObjectURL
    const createObjectURL = vi.fn(() => 'blob:mock');
    const revokeObjectURL = vi.fn();
    globalThis.URL.createObjectURL = createObjectURL;
    globalThis.URL.revokeObjectURL = revokeObjectURL;

    render(<ResultsPanel {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: /download.*geojson/i }));

    expect(createObjectURL).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalled();
  });
});
