/**
 * Ollama LLM Client
 * 
 * Implementation of LLMClient for local Ollama instances.
 * Default: http://localhost:11434 with qwen2.5:7b model
 */

import type { LLMClient, CompletionOptions } from './types';

/** Default request timeout in milliseconds (60 seconds — first query loads the model into memory) */
const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Ollama API client
 *
 * Connects to a local Ollama instance running on localhost:11434.
 * Includes configurable request timeout via OLLAMA_TIMEOUT_MS env var.
 */
export class OllamaClient implements LLMClient {
  private timeoutMs: number;

  constructor(
    private baseUrl: string = process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    private model: string = process.env.OLLAMA_MODEL || 'qwen2.5:7b'
  ) {
    this.timeoutMs = Number(process.env.OLLAMA_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
  }

  /**
   * Complete a prompt using Ollama
   */
  async complete(prompt: string, options?: CompletionOptions): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt,
          stream: false,
          options: {
            temperature: options?.temperature ?? 0.1, // Low temperature for structured output
            num_predict: options?.maxTokens ?? 2000, // Enough for JSON responses
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Ollama API error (${response.status}): ${errorText}`
        );
      }

      const data = (await response.json()) as { response: string; done: boolean };

      if (!data.done) {
        throw new Error('Ollama response incomplete');
      }

      return data.response;
    } catch (error) {
      if (error instanceof Error) {
        // Check for timeout (AbortError)
        if (error.name === 'AbortError') {
          throw new Error(
            `Ollama request timed out after ${this.timeoutMs}ms. The model may be loading or the query is too complex.`
          );
        }
        // Check if it's a connection error
        if (error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED')) {
          throw new Error(
            `Cannot connect to Ollama at ${this.baseUrl}. Is Ollama running?`
          );
        }
        throw error;
      }
      throw new Error('Unknown error calling Ollama');
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Check if Ollama is available
   */
  async healthCheck(): Promise<boolean> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5_000);
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: controller.signal,
      });
      return response.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

