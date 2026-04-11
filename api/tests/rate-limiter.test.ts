import { describe, it, expect, vi, afterEach } from 'vitest';
import { RateLimiter } from '../src/lib/middleware/rate-limiter';

afterEach(() => {
  vi.useRealTimers();
});

describe('RateLimiter', () => {
  it('allows requests within the limit', () => {
    const limiter = new RateLimiter(3, 60_000);

    expect(limiter.check('ip1').allowed).toBe(true);
    expect(limiter.check('ip1').allowed).toBe(true);
    expect(limiter.check('ip1').allowed).toBe(true);
  });

  it('blocks the next request once the limit is reached', () => {
    const limiter = new RateLimiter(2, 60_000);

    limiter.check('ip1');
    limiter.check('ip1');
    const result = limiter.check('ip1');

    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
    expect(result.retryAfterMs).toBeLessThanOrEqual(60_000);
  });

  it('returns retryAfterMs=0 when allowed', () => {
    const limiter = new RateLimiter(5, 60_000);
    const result = limiter.check('ip1');
    expect(result.retryAfterMs).toBe(0);
  });

  it('tracks different IPs independently', () => {
    const limiter = new RateLimiter(1, 60_000);

    limiter.check('ip1'); // exhausts ip1's quota
    const r1 = limiter.check('ip1');
    const r2 = limiter.check('ip2'); // ip2 still has quota

    expect(r1.allowed).toBe(false);
    expect(r2.allowed).toBe(true);
  });

  it('resets the counter after the window expires', () => {
    vi.useFakeTimers();
    const limiter = new RateLimiter(1, 60_000);

    limiter.check('ip1'); // exhausts quota
    expect(limiter.check('ip1').allowed).toBe(false);

    // Advance past the window
    vi.advanceTimersByTime(60_001);

    expect(limiter.check('ip1').allowed).toBe(true);
  });

  it('retryAfterMs reflects the remaining window time', () => {
    vi.useFakeTimers();
    const limiter = new RateLimiter(1, 60_000);

    limiter.check('ip1'); // opens window at t=0
    vi.advanceTimersByTime(20_000); // t=20s

    const result = limiter.check('ip1');
    expect(result.allowed).toBe(false);
    // Remaining time should be approximately 40 seconds
    expect(result.retryAfterMs).toBeGreaterThan(39_000);
    expect(result.retryAfterMs).toBeLessThanOrEqual(40_000);
  });

  it('pruneExpired removes only expired keys', () => {
    vi.useFakeTimers();
    const limiter = new RateLimiter(5, 60_000);

    limiter.check('ip1');
    limiter.check('ip2');
    expect(limiter.size).toBe(2);

    vi.advanceTimersByTime(30_000); // ip1 and ip2 still within window
    limiter.pruneExpired();
    expect(limiter.size).toBe(2);

    vi.advanceTimersByTime(30_001); // window has now expired
    limiter.pruneExpired();
    expect(limiter.size).toBe(0);
  });

  it('allows a new key immediately after pruning its expired entry', () => {
    vi.useFakeTimers();
    const limiter = new RateLimiter(1, 60_000);

    limiter.check('ip1'); // exhausts quota
    vi.advanceTimersByTime(60_001);
    limiter.pruneExpired(); // removes the expired entry

    // After pruning, a fresh window opens
    expect(limiter.check('ip1').allowed).toBe(true);
  });
});
