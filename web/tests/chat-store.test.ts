/**
 * Tests for the Zustand chat store.
 *
 * Verifies state management: message handling, feature selection,
 * conversation context tracking, and reset behavior.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useChatStore } from '../src/store/chat-store';
import type { ChatResponse } from '../src/types/api';

// Mock the API client
vi.mock('../src/lib/api', () => ({
  sendChatMessage: vi.fn(),
  ApiClientError: class ApiClientError extends Error {
    statusCode: number;
    details?: string;
    suggestions?: string[];
    constructor(message: string, statusCode: number, details?: string, suggestions?: string[]) {
      super(message);
      this.name = 'ApiClientError';
      this.statusCode = statusCode;
      this.details = details;
      this.suggestions = suggestions;
    }
  },
}));

const mockResponse: ChatResponse = {
  query: { selectLayer: 'parcels', attributeFilters: [{ field: 'zoning', op: 'eq', value: 'R-1' }] },
  result: {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [[[-105.94, 35.69], [-105.93, 35.69], [-105.93, 35.68], [-105.94, 35.68], [-105.94, 35.69]]] },
        properties: { parcel_id: 'P001', zoning: 'R-1' },
      },
    ],
  },
  explanation: 'Found 1 parcel where zoning equal to R-1.',
  confidence: 0.8,
  grounding: {
    status: 'exact_match',
    requestedConcepts: ['parcels'],
    matchedLayers: ['parcels'],
    missingConcepts: [],
    missingLayers: [],
    suggestions: [],
  },
  metadata: {
    count: 1,
    executionTimeMs: 42,
  },
};

function getState() {
  return useChatStore.getState();
}

describe('Chat store', () => {
  beforeEach(() => {
    // Reset store between tests
    getState().clearConversation();
  });

  it('starts with empty state', () => {
    const state = getState();
    expect(state.messages).toHaveLength(0);
    expect(state.isLoading).toBe(false);
    expect(state.features).toHaveLength(0);
    expect(state.currentQuery).toBeNull();
    expect(state.conversationContext).toBeNull();
    expect(state.showResults).toBe(false);
  });

  it('adds user message and sets loading on sendMessage', async () => {
    const { sendChatMessage } = await import('../src/lib/api');
    const mock = vi.mocked(sendChatMessage);
    // Make the API call hang so we can check intermediate state
    mock.mockImplementation(() => new Promise(() => {}));

    // Don't await — we want to check the intermediate state
    getState().sendMessage('Show parcels');

    // Wait for the microtask to set state
    await vi.waitFor(() => {
      expect(getState().messages).toHaveLength(1);
    });

    expect(getState().messages[0]!.role).toBe('user');
    expect(getState().messages[0]!.content).toBe('Show parcels');
    expect(getState().isLoading).toBe(true);
  });

  it('handles successful API response', async () => {
    const { sendChatMessage } = await import('../src/lib/api');
    vi.mocked(sendChatMessage).mockResolvedValue(mockResponse);

    await getState().sendMessage('Show R-1 parcels');

    const state = getState();
    expect(state.messages).toHaveLength(2);
    expect(state.messages[0]!.role).toBe('user');
    expect(state.messages[1]!.role).toBe('assistant');
    expect(state.messages[1]!.content).toBe('Found 1 parcel where zoning equal to R-1.');
    expect(state.features).toHaveLength(1);
    expect(state.currentQuery?.selectLayer).toBe('parcels');
    expect(state.showResults).toBe(true);
    expect(state.isLoading).toBe(false);
  });

  it('tracks conversation context after successful query', async () => {
    const { sendChatMessage } = await import('../src/lib/api');
    vi.mocked(sendChatMessage).mockResolvedValue(mockResponse);

    await getState().sendMessage('Show R-1 parcels');

    const ctx = getState().conversationContext;
    expect(ctx).not.toBeNull();
    expect(ctx!.previousLayer).toBe('parcels');
    expect(ctx!.previousResultCount).toBe(1);
    expect(ctx!.previousQuery.selectLayer).toBe('parcels');
  });

  it('handles API errors gracefully', async () => {
    const { sendChatMessage, ApiClientError } = await import('../src/lib/api');
    vi.mocked(sendChatMessage).mockRejectedValue(
      new ApiClientError('Unsupported request', 400, 'Missing layer', ['Try parcels instead'])
    );

    await getState().sendMessage('Show affordable housing');

    const state = getState();
    expect(state.messages).toHaveLength(2);
    expect(state.messages[1]!.role).toBe('assistant');
    expect(state.messages[1]!.content).toContain('suggestions');
    expect(state.isLoading).toBe(false);
    // Should not update features or context on error
    expect(state.features).toHaveLength(0);
    expect(state.conversationContext).toBeNull();
  });

  it('selectFeature updates selectedFeature', () => {
    const feature = {
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [-105.94, 35.69] },
      properties: { id: '1' },
    };

    getState().selectFeature(feature);
    expect(getState().selectedFeature).toBe(feature);

    getState().selectFeature(null);
    expect(getState().selectedFeature).toBeNull();
  });

  it('clickFeature sets selectedFeature and shows results', () => {
    const feature = {
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [-105.94, 35.69] },
      properties: { id: '1' },
    };

    getState().clickFeature(feature);
    expect(getState().selectedFeature).toBe(feature);
    expect(getState().showResults).toBe(true);
  });

  it('closeResults hides panel and clears selection', () => {
    const feature = {
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [-105.94, 35.69] },
      properties: { id: '1' },
    };

    getState().clickFeature(feature);
    getState().closeResults();

    expect(getState().showResults).toBe(false);
    expect(getState().selectedFeature).toBeNull();
  });

  it('clearConversation resets all state', async () => {
    const { sendChatMessage } = await import('../src/lib/api');
    vi.mocked(sendChatMessage).mockResolvedValue(mockResponse);

    await getState().sendMessage('Show parcels');
    expect(getState().messages.length).toBeGreaterThan(0);

    getState().clearConversation();

    const state = getState();
    expect(state.messages).toHaveLength(0);
    expect(state.features).toHaveLength(0);
    expect(state.currentQuery).toBeNull();
    expect(state.conversationContext).toBeNull();
    expect(state.showResults).toBe(false);
  });
});
