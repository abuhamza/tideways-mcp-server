export interface RateLimitSnapshot {
  limit: number;
  remaining: number;
  resetAt: Date;
}

const HEADERS = ['x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset'] as const;

/**
 * Tideways sends X-RateLimit-Limit/Remaining/Reset on counted requests. Reset is a Unix
 * epoch in seconds (the next top of the hour), not a duration.
 */
export function parseRateLimit(headers: Headers): RateLimitSnapshot | undefined {
  if (!HEADERS.every(name => headers.has(name))) return undefined;
  const [limit, remaining, reset] = HEADERS.map(name => Number(headers.get(name)));
  if (
    limit === undefined ||
    remaining === undefined ||
    reset === undefined ||
    ![limit, remaining, reset].every(Number.isFinite)
  ) {
    return undefined;
  }
  return { limit, remaining, resetAt: new Date(reset * 1000) };
}

export function rateLimitMessage(snapshot: RateLimitSnapshot | undefined): string {
  if (!snapshot) {
    return 'Tideways API rate limit reached. Retry at the start of the next hour.';
  }
  return (
    `Tideways API rate limit reached (${snapshot.limit} requests per hour, shared by all tokens ` +
    `and projects of the organization). It resets at ${snapshot.resetAt.toISOString()}; retry ` +
    'after that.'
  );
}
