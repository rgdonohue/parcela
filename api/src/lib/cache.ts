/**
 * LRU Cache for Query Results
 *
 * Caches:
 * 1. LLM parse results (NL → StructuredQuery)
 * 2. Query execution results (SQL → GeoJSON)
 *
 * Reduces latency for repeated queries and lowers LLM API costs.
 */

import { createHash } from 'crypto';
import type { StructuredQuery } from '../../../shared/types/query';
import type { FeatureCollection } from 'geojson';
import type { ParseResult } from './orchestrator/parser';

/**
 * Cache entry with metadata
 */
interface CacheEntry<T> {
  value: T;
  createdAt: number;
  accessedAt: number;
  accessCount: number;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  maxSize: number;
  hitRate: number;
}

/**
 * LRU Cache implementation
 */
class LRUCache<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private maxSize: number;
  private ttlMs: number;
  private hits = 0;
  private misses = 0;

  constructor(maxSize = 100, ttlMs = 30 * 60 * 1000) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  /**
   * Generate cache key from input
   */
  private generateKey(input: string): string {
    return createHash('sha256').update(input).digest('hex').slice(0, 16);
  }

  /**
   * Get value from cache
   */
  get(input: string): T | undefined {
    const key = this.generateKey(input);
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return undefined;
    }

    // Check TTL
    if (Date.now() - entry.createdAt > this.ttlMs) {
      this.cache.delete(key);
      this.misses++;
      return undefined;
    }

    // Update access metadata (LRU tracking)
    entry.accessedAt = Date.now();
    entry.accessCount++;
    this.hits++;

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value;
  }

  /**
   * Set value in cache
   */
  set(input: string, value: T): void {
    const key = this.generateKey(input);

    // Evict if at capacity
    if (this.cache.size >= this.maxSize) {
      // Delete oldest (first) entry
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      value,
      createdAt: Date.now(),
      accessedAt: Date.now(),
      accessCount: 1,
    });
  }

  /**
   * Check if key exists and is valid
   */
  has(input: string): boolean {
    const key = this.generateKey(input);
    const entry = this.cache.get(key);

    if (!entry) {
      return false;
    }

    // Check TTL
    if (Date.now() - entry.createdAt > this.ttlMs) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Clear the cache
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }
}

/**
 * Parse result cache (NL query → StructuredQuery)
 * Larger TTL since NL→query mapping is stable
 */
export const parseCache = new LRUCache<ParseResult>(
  200, // Max 200 cached parses
  60 * 60 * 1000 // 1 hour TTL
);

/**
 * Query result cache (StructuredQuery → GeoJSON)
 * Shorter TTL since data may change
 */
export const queryCache = new LRUCache<{
  result: FeatureCollection;
  executionTimeMs: number;
}>(
  50, // Max 50 cached results (GeoJSON can be large)
  15 * 60 * 1000 // 15 minute TTL
);

function sortKeysDeep(val: unknown): unknown {
  if (Array.isArray(val)) return val.map(sortKeysDeep);
  if (val && typeof val === 'object') {
    const src = val as Record<string, unknown>;
    return Object.keys(src).sort().reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = sortKeysDeep(src[key]);
      return acc;
    }, {});
  }
  return val;
}

/**
 * Generate a canonical cache key for a structured query.
 * Recursively sorts object keys at every depth so semantically equivalent
 * queries produce identical keys, without stripping nested content (the
 * JSON.stringify replacer-array behavior was an allowlist at every depth,
 * which collapsed filter objects to {} and caused cache collisions).
 */
export function structuredQueryKey(query: StructuredQuery): string {
  return JSON.stringify(sortKeysDeep(query));
}

/**
 * Get combined cache statistics
 */
export function getCacheStats(): {
  parse: CacheStats;
  query: CacheStats;
} {
  return {
    parse: parseCache.getStats(),
    query: queryCache.getStats(),
  };
}

/**
 * Clear all caches
 */
export function clearAllCaches(): void {
  parseCache.clear();
  queryCache.clear();
}
