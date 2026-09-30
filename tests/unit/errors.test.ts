import { describe, expect, it } from 'vitest';

import {
  errorForStatus,
  errorForTransport,
  extractApiMessage,
  type RequestContext,
} from '../../src/tideways/errors.js';
import { parseRateLimit, rateLimitMessage } from '../../src/tideways/rate-limit.js';

const context: RequestContext = {
  scope: 'metrics',
  resource: 'performance data of acme/shop',
  host: 'app.tideways.io',
  timeoutMs: 30_000,
  attempts: 3,
};

describe('extractApiMessage', () => {
  it('handles the three Tideways error body shapes', () => {
    expect(extractApiMessage({ error: 'Invalid credentials.' })).toBe('Invalid credentials.');
    expect(extractApiMessage({ status: 404, msg: 'Not Found' })).toBe('Not Found');
    expect(extractApiMessage('Validation Error, unknown parameter issueType=bogus')).toBe(
      'Validation Error, unknown parameter issueType=bogus'
    );
  });

  it('returns undefined for empty or unknown bodies and truncates long ones', () => {
    expect(extractApiMessage('')).toBeUndefined();
    expect(extractApiMessage({ other: 1 })).toBeUndefined();
    expect(extractApiMessage(null)).toBeUndefined();
    expect(extractApiMessage('x'.repeat(400))).toHaveLength(301);
  });
});

describe('errorForStatus', () => {
  it('401 points at TIDEWAYS_TOKEN', () => {
    const error = errorForStatus(401, { error: 'Invalid credentials.' }, context, undefined);
    expect(error).toMatchObject({ kind: 'auth', status: 401 });
    expect(error.message).toContain('HTTP 401: Invalid credentials.');
    expect(error.message).toContain('TIDEWAYS_TOKEN');
  });

  it('403 names the required scope', () => {
    const error = errorForStatus(403, {}, context, undefined);
    expect(error.kind).toBe('forbidden');
    expect(error.message).toContain('needs the "metrics" scope');
    expect(error.message).toContain('tideways_list_projects');
    expect(
      errorForStatus(403, {}, { ...context, scope: undefined }, undefined).message
    ).not.toContain('scope.');
  });

  it('404 suggests checking the project', () => {
    const error = errorForStatus(404, { status: 404, msg: 'Not Found' }, context, undefined);
    expect(error.kind).toBe('not_found');
    expect(error.message).toContain('performance data of acme/shop');
  });

  it('429 reports the reset time', () => {
    const snapshot = { limit: 5000, remaining: 0, resetAt: new Date('2026-09-30T13:00:00Z') };
    const error = errorForStatus(429, {}, context, snapshot);
    expect(error).toMatchObject({ kind: 'rate_limited', status: 429, resetAt: snapshot.resetAt });
    expect(error.message).toContain('2026-09-30T13:00:00.000Z');
    expect(errorForStatus(429, {}, context, undefined).message).toContain('next hour');
  });

  it('other 4xx is a bad request carrying the API message', () => {
    const error = errorForStatus(
      400,
      'Validation Error, unknown parameter issueType=bogus',
      context,
      undefined
    );
    expect(error.kind).toBe('bad_request');
    expect(error.message).toContain('issueType=bogus');
  });

  it('5xx mentions attempts', () => {
    const error = errorForStatus(
      500,
      { status: 500, msg: 'Server Error occured' },
      context,
      undefined
    );
    expect(error.kind).toBe('server');
    expect(error.message).toContain('after 3 attempt(s)');
  });
});

describe('errorForTransport', () => {
  it('recognizes timeouts', () => {
    const error = errorForTransport(new DOMException('aborted', 'TimeoutError'), context);
    expect(error.kind).toBe('timeout');
    expect(error.message).toContain('30000 ms');
  });

  it('uses the network error code when present', () => {
    const cause = Object.assign(new Error('getaddrinfo'), { code: 'ENOTFOUND' });
    const error = errorForTransport(new TypeError('fetch failed', { cause }), context);
    expect(error.kind).toBe('network');
    expect(error.message).toContain('app.tideways.io (ENOTFOUND)');
    expect(errorForTransport('boom', context).message).toContain('(boom)');
  });
});

describe('parseRateLimit', () => {
  it('parses the reset header as a Unix epoch in seconds', () => {
    const headers = new Headers({
      'x-ratelimit-limit': '5000',
      'x-ratelimit-remaining': '4973',
      'x-ratelimit-reset': '1790773200',
    });
    expect(parseRateLimit(headers)).toEqual({
      limit: 5000,
      remaining: 4973,
      resetAt: new Date('2026-09-30T13:00:00Z'),
    });
  });

  it('ignores missing or malformed headers', () => {
    expect(parseRateLimit(new Headers())).toBeUndefined();
    expect(
      parseRateLimit(
        new Headers({
          'x-ratelimit-limit': 'x',
          'x-ratelimit-remaining': '1',
          'x-ratelimit-reset': '1',
        })
      )
    ).toBeUndefined();
  });

  it('formats a message with and without a snapshot', () => {
    expect(rateLimitMessage(undefined)).toContain('next hour');
    expect(
      rateLimitMessage({ limit: 100, remaining: 0, resetAt: new Date('2026-09-30T13:00:00Z') })
    ).toContain('100 requests per hour');
  });
});
