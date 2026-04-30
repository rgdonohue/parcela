/**
 * In-memory sliding-window rate limiter.
 *
 * Each key (typically client IP) has its own window. When the window expires the
 * counter resets. The RateLimiter class contains the pure logic so it can be unit-
 * tested independently of Hono. createRateLimitMiddleware() wraps it as a Hono
 * middleware.
 */

import type { Context, Next } from 'hono';

interface WindowState {
  count: number;
  windowStart: number;
}

// ── Core limiter ───────────────────────────────────────────────────────────────

export class RateLimiter {
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly store: Map<string, WindowState>;

  constructor(limit: number, windowMs: number) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.store = new Map();
  }

  /**
   * Check whether the given key is within its rate limit.
   * Always mutates internal state to record the request.
   *
   * @returns allowed=true when the request may proceed.
   *          retryAfterMs is how long to wait before retrying (0 when allowed).
   */
  check(key: string): { allowed: boolean; retryAfterMs: number } {
    const now = Date.now();
    const existing = this.store.get(key);

    if (!existing || now - existing.windowStart >= this.windowMs) {
      // First request or the window has expired — open a fresh window.
      this.store.set(key, { count: 1, windowStart: now });
      return { allowed: true, retryAfterMs: 0 };
    }

    if (existing.count >= this.limit) {
      const retryAfterMs = this.windowMs - (now - existing.windowStart);
      return { allowed: false, retryAfterMs };
    }

    // Within the limit — increment the counter for the current window.
    this.store.set(key, { count: existing.count + 1, windowStart: existing.windowStart });
    return { allowed: true, retryAfterMs: 0 };
  }

  /** Remove expired entries to prevent unbounded memory growth. */
  pruneExpired(): void {
    const now = Date.now();
    for (const [key, state] of this.store.entries()) {
      if (now - state.windowStart >= this.windowMs) {
        this.store.delete(key);
      }
    }
  }

  /** Total number of tracked keys (for observability). */
  get size(): number {
    return this.store.size;
  }
}

// ── Hono middleware factory ────────────────────────────────────────────────────

/**
 * Create a Hono middleware that enforces the given RateLimiter.
 *
 * Reads the client IP from forwarding headers only when TRUSTED_PROXY_COUNT is
 * configured. With no trusted proxy configured, all clients share the direct
 * bucket because Hono's Request does not expose the peer socket address.
 * Returns 429 with a Retry-After header (in seconds) when the limit is exceeded.
 */

export function getTrustedProxyCount(): number {
  const raw = process.env.TRUSTED_PROXY_COUNT ?? '0';
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
}

export function getClientIp(headers: Headers, trustedProxyCount = getTrustedProxyCount()): string {
  if (trustedProxyCount <= 0) {
    return 'direct';
  }

  const forwarded = headers
    .get('x-forwarded-for')
    ?.split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (forwarded && forwarded.length > trustedProxyCount) {
    return forwarded[forwarded.length - trustedProxyCount - 1] ?? 'unknown';
  }

  const realIp = headers.get('x-real-ip')?.trim();
  return realIp && realIp.length > 0 ? realIp : 'unknown';
}

export function createRateLimitMiddleware(
  limiter: RateLimiter
): (c: Context, next: Next) => Promise<Response | void> {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const ip = getClientIp(c.req.raw.headers);

    const { allowed, retryAfterMs } = limiter.check(ip);
    if (!allowed) {
      const retryAfterSec = Math.ceil(retryAfterMs / 1000);
      c.header('Retry-After', String(retryAfterSec));
      return c.json({ error: 'Too many requests', retryAfter: retryAfterSec }, 429);
    }

    await next();
  };
}
