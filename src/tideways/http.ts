import type { Logger } from '../logger.js';
import {
  errorForStatus,
  errorForTransport,
  TidewaysApiError,
  type RequestContext,
  type TokenScope,
} from './errors.js';
import { parseRateLimit, rateLimitMessage, type RateLimitSnapshot } from './rate-limit.js';

/** An array repeats its key once per element, e.g. `ids[]=1&ids[]=2`. */
export type QueryValue = string | number | boolean | readonly (string | number)[] | undefined;

export interface RequestOptions {
  query?: Record<string, QueryValue>;
  scope?: TokenScope;
  /** Human-readable label for error messages, e.g. "performance data of acme/shop". */
  resource: string;
  /** The endpoint does not count against the hourly limit, so the local fail-fast check is skipped. */
  uncounted?: boolean;
  /** Media type to request instead of `application/json`; the response is still parsed as JSON. */
  accept?: string;
}

export interface TidewaysHttpOptions {
  baseUrl: string;
  token: string;
  timeoutMs: number;
  userAgent: string;
  logger: Logger;
  fetch?: typeof globalThis.fetch | undefined;
  now?: (() => number) | undefined;
  sleep?: ((ms: number) => Promise<void>) | undefined;
  maxRetries?: number | undefined;
}

/** Build a URL path from raw segments, encoding each one. */
export function apiPath(...segments: string[]): string {
  return `/${segments.map(segment => encodeURIComponent(segment)).join('/')}`;
}

function buildQuery(query: Record<string, QueryValue> | undefined): string {
  const pairs = Object.entries(query ?? {}).flatMap(([key, value]) =>
    (value === undefined ? [] : Array.isArray(value) ? value : [value]).map(
      (item: string | number | boolean) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`
    )
  );
  return pairs.length === 0 ? '' : `?${pairs.join('&')}`;
}

type Body = { json: true; value: unknown } | { json: false; value: string };

async function readBody(response: Response): Promise<Body> {
  const text = await response.text();
  try {
    return { json: true, value: JSON.parse(text) as unknown };
  } catch {
    return { json: false, value: text };
  }
}

/**
 * Minimal GET client for the Tideways REST API: bearer auth, timeout, retries on
 * network errors and 5xx, rate-limit tracking, actionable errors. 429 is never retried.
 */
export class TidewaysHttp {
  private rateLimit: RateLimitSnapshot | undefined;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxRetries: number;
  private readonly host: string;

  constructor(private readonly options: TidewaysHttpOptions) {
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.now = options.now ?? Date.now;
    this.sleep =
      options.sleep ??
      (ms =>
        new Promise(resolve => {
          setTimeout(resolve, ms);
        }));
    this.maxRetries = options.maxRetries ?? 2;
    this.host = new URL(options.baseUrl).host;
  }

  /** Last rate-limit headers seen, if any counted request was made. */
  lastRateLimit(): RateLimitSnapshot | undefined {
    return this.rateLimit;
  }

  async get(path: string, options: RequestOptions): Promise<unknown> {
    if (!options.uncounted) this.assertWithinRateLimit();
    const url = `${this.options.baseUrl}${path}${buildQuery(options.query)}`;

    for (let attempt = 1; ; attempt++) {
      const context: RequestContext = {
        scope: options.scope,
        resource: options.resource,
        host: this.host,
        timeoutMs: this.options.timeoutMs,
        attempts: attempt,
      };
      const started = this.now();
      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          headers: {
            Authorization: `Bearer ${this.options.token}`,
            Accept: options.accept ?? 'application/json',
            'User-Agent': this.options.userAgent,
          },
          signal: AbortSignal.timeout(this.options.timeoutMs),
        });
      } catch (cause) {
        if (attempt <= this.maxRetries) {
          await this.backoff(attempt, path, cause instanceof Error ? cause.name : 'network error');
          continue;
        }
        throw errorForTransport(cause, context);
      }

      const snapshot = parseRateLimit(response.headers);
      if (snapshot) this.rateLimit = snapshot;

      let body: Body;
      try {
        body = await readBody(response);
      } catch (cause) {
        // 429 is never retried, even if body read fails
        if (response.status === 429) {
          throw errorForStatus(429, undefined, context, this.rateLimit);
        }
        if (attempt <= this.maxRetries) {
          await this.backoff(attempt, path, cause instanceof Error ? cause.name : 'network error');
          continue;
        }
        throw errorForTransport(cause, context);
      }

      this.options.logger.debug('tideways request', {
        path,
        status: response.status,
        durationMs: this.now() - started,
        rateLimitRemaining: snapshot?.remaining,
      });

      if (response.ok) {
        if (!body.json) {
          throw new TidewaysApiError(
            'invalid_response',
            `Tideways returned a non-JSON response for ${options.resource}.`,
            response.status
          );
        }
        return body.value;
      }
      if (response.status >= 500 && attempt <= this.maxRetries) {
        await this.backoff(attempt, path, `HTTP ${response.status}`);
        continue;
      }
      throw errorForStatus(response.status, body.value, context, this.rateLimit);
    }
  }

  private assertWithinRateLimit(): void {
    const snapshot = this.rateLimit;
    if (snapshot && snapshot.remaining <= 0 && snapshot.resetAt.getTime() > this.now()) {
      throw new TidewaysApiError('rate_limited', rateLimitMessage(snapshot), 429, snapshot.resetAt);
    }
  }

  private async backoff(attempt: number, path: string, reason: string): Promise<void> {
    const delayMs = 250 * 2 ** (attempt - 1) + Math.floor(Math.random() * 100);
    this.options.logger.warn('retrying tideways request', { path, attempt, delayMs, reason });
    await this.sleep(delayMs);
  }
}
