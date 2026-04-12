/**
 * Zustand store for chat state and conversation context.
 *
 * Manages: messages, query results, map state, loading,
 * and multi-turn conversation context.
 */

import { create } from 'zustand';
import type { Feature, Geometry } from 'geojson';
import { sendChatMessage, ApiClientError } from '../lib/api';
import type {
  ChatMessage,
  ChatResponse,
  GroundingInfo,
  QueryMetadata,
  StructuredQuery,
} from '../types/api';

/**
 * Conversation context sent to the API for multi-turn refinement.
 * Summarizes the previous query so the LLM can resolve
 * references like "those", "filter further", "just the Southside".
 */
export interface ConversationContext {
  previousQuery: StructuredQuery;
  previousLayer: string;
  previousResultCount: number;
  previousExplanation: string;
}

interface ChatState {
  // ── Chat ──
  messages: ChatMessage[];
  isLoading: boolean;

  // ── Query results ──
  features: Feature<Geometry, Record<string, unknown>>[];
  currentQuery: StructuredQuery | null;
  queryMetadata: QueryMetadata | null;
  grounding: GroundingInfo | null;
  explanation: string | null;
  equityNarrative: string | null;

  // ── UI ──
  selectedFeature: Feature<Geometry, Record<string, unknown>> | null;
  showResults: boolean;

  // ── Multi-turn context ──
  conversationContext: ConversationContext | null;

  // ── Actions ──
  sendMessage: (content: string) => Promise<void>;
  selectFeature: (feature: Feature<Geometry, Record<string, unknown>> | null) => void;
  clickFeature: (feature: Feature<Geometry, Record<string, unknown>>) => void;
  closeResults: () => void;
  clearConversation: () => void;
}

function formatErrorDetails(details: unknown): string | undefined {
  if (typeof details === 'string') {
    return details;
  }

  if (Array.isArray(details)) {
    const values = details
      .map((value) => formatErrorDetails(value))
      .filter((value): value is string => Boolean(value));
    return values.length > 0 ? values.join('; ') : undefined;
  }

  if (details && typeof details === 'object') {
    if ('message' in details && typeof details.message === 'string') {
      return details.message;
    }
    if ('error' in details && typeof details.error === 'string') {
      return details.error;
    }
  }

  return undefined;
}

export const useChatStore = create<ChatState>((set, get) => ({
  // ── Initial state ──
  messages: [],
  isLoading: false,
  features: [],
  currentQuery: null,
  queryMetadata: null,
  grounding: null,
  explanation: null,
  equityNarrative: null,
  selectedFeature: null,
  showResults: false,
  conversationContext: null,

  // ── Actions ──

  sendMessage: async (content: string) => {
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: new Date(),
    };

    set((state) => ({
      messages: [...state.messages, userMessage],
      isLoading: true,
    }));

    const { conversationContext } = get();

    try {
      const response: ChatResponse = await sendChatMessage(
        content,
        conversationContext ?? undefined
      );

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: response.explanation,
        timestamp: new Date(),
        query: response.query,
        result: response.result,
        metadata: response.metadata,
        grounding: response.grounding,
        equityNarrative: response.equityNarrative ?? null,
      };

      set({
        messages: [...get().messages, assistantMessage],
        features: response.result.features,
        currentQuery: response.query,
        queryMetadata: response.metadata,
        grounding: response.grounding,
        explanation: response.explanation,
        equityNarrative: response.equityNarrative ?? null,
        showResults: true,
        selectedFeature: null,
        isLoading: false,
        // Update conversation context for next turn
        conversationContext: {
          previousQuery: response.query,
          previousLayer: response.query.selectLayer,
          previousResultCount: response.result.features.length,
          previousExplanation: response.explanation,
        },
      });
    } catch (error) {
      let errorMessage = 'An unexpected error occurred';
      let content = 'Sorry, I encountered an error processing your request.';
      let grounding: GroundingInfo | undefined;

      if (error instanceof ApiClientError) {
        errorMessage = error.message;
        grounding = error.grounding;
        const formattedDetails = formatErrorDetails(error.details);
        if (formattedDetails) {
          errorMessage += `: ${formattedDetails}`;
        }
        if (error.suggestions && error.suggestions.length > 0) {
          content = `I couldn't complete that request. ${formattedDetails || error.message}\n\nHere are some suggestions:\n• ${error.suggestions.join('\n• ')}`;
          errorMessage = '';
        }
      }

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content,
        timestamp: new Date(),
        grounding,
        error: errorMessage || undefined,
      };

      set({
        messages: [...get().messages, assistantMessage],
        isLoading: false,
      });
    }
  },

  selectFeature: (feature) => {
    set({ selectedFeature: feature });
  },

  clickFeature: (feature) => {
    set({ selectedFeature: feature, showResults: true });
  },

  closeResults: () => {
    set({ showResults: false, selectedFeature: null });
  },

  clearConversation: () => {
    set({
      messages: [],
      features: [],
      currentQuery: null,
      queryMetadata: null,
      grounding: null,
      explanation: null,
      equityNarrative: null,
      selectedFeature: null,
      showResults: false,
      conversationContext: null,
    });
  },
}));
