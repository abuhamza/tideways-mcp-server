import { describe, expect, it, vi } from 'vitest';

import { createLogger } from '../../src/logger.js';
import { TidewaysApiError } from '../../src/tideways/errors.js';
import { apiPath, TidewaysHttp } from '../../src/tideways/http.js';
import { createFakeApi, type FakeRoute } from '../helpers/fake-api.js';

const NOW = new Date('2026-09-30T12:44:00Z').getTime();

function client(routes: Record<string, FakeRoute>, maxRetries?: number) {
  const api = createFakeApi(routes);
  const sleep = vi.fn(() => Promise.resolve());
  const http = new TidewaysHttp({
    baseUrl: 'https://app.tideways.io/apps/api',
    token: 'test-token',
    timeoutMs: 1000,
    userAgent: 'tideways-mcp-server/test',
    logger: createLogger('error', () => undefined),
    fetch: api.fetch,
    now: () => NOW,
    sleep,
    maxRetries,
  });
  return { http, api, sleep };
}

async function failure(promise: Promise<unknown>): Promise<TidewaysApiError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof TidewaysApiError) return error;
    throw error;
  }
  throw new Error('expected the request to fail');
}

describe('apiPath', () => {
  it('encodes each segment', () => {
    expect(apiPath('acme', 'my shop', 'history', '2026-09-29')).toBe(
      '/acme/my%20shop/history/2026-09-29'
    );
    expect(apiPath('acme', '../x')).toBe('/acme/..%2Fx');
  });
});

describe('TidewaysHttp.get', () => {
  it('sends bearer auth, accept and user agent headers and parses JSON', async () => {
    const { http, api } = client({ '/acme/shop/summary': { body: { ok: true } } });
    await expect(http.get('/acme/shop/summary', { resource: 'x' })).resolves.toEqual({ ok: true });
    const [request] = api.requests;
    expect(request?.headers.get('authorization')).toBe('Bearer test-token');
    expect(request?.headers.get('accept')).toBe('application/json');
    expect(request?.headers.get('user-agent')).toBe('tideways-mcp-server/test');
  });

  it('encodes query values with %20 and skips undefined ones', async () => {
    const { http, api } = client({ '/acme/shop/traces': { body: {} } });
    await http.get('/acme/shop/traces', {
      resource: 'x',
      query: { min_date: '2026-09-30 11:30', env: undefined, has_callgraph: true, m: 5 },
    });
    expect(api.requests[0]?.url.search).toBe(
      '?min_date=2026-09-30%2011%3A30&has_callgraph=true&m=5'
    );
  });

  it('records rate-limit headers', async () => {
    const { http } = client({ '/acme/shop/summary': { body: {} } });
    expect(http.lastRateLimit()).toBeUndefined();
    await http.get('/acme/shop/summary', { resource: 'x' });
    expect(http.lastRateLimit()).toEqual({
      limit: 5000,
      remaining: 4999,
      resetAt: new Date('2026-09-30T13:00:00Z'),
    });
  });

  it('retries 5xx with backoff, then succeeds', async () => {
    const { http, sleep } = client({
      '/acme/shop/summary': (_url, call) =>
        call < 3 ? { status: 503, body: { status: 503, msg: 'Unavailable' } } : { body: { ok: 1 } },
    });
    await expect(http.get('/acme/shop/summary', { resource: 'x' })).resolves.toEqual({ ok: 1 });
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('gives up on 5xx after the retries and reports attempts', async () => {
    const { http, api } = client({
      '/acme/shop/summary': { status: 500, body: { status: 500, msg: 'Server Error occured' } },
    });
    const error = await failure(http.get('/acme/shop/summary', { resource: 'the summary' }));
    expect(error.kind).toBe('server');
    expect(error.message).toContain('after 3 attempt(s)');
    expect(api.requests).toHaveLength(3);
  });

  it('retries network errors and timeouts, then maps them', async () => {
    const timeout = client({ '/a': { throws: new DOMException('aborted', 'TimeoutError') } }, 1);
    expect((await failure(timeout.http.get('/a', { resource: 'x' }))).kind).toBe('timeout');
    expect(timeout.api.requests).toHaveLength(2);

    const network = client({ '/a': { throws: new TypeError('fetch failed') } }, 0);
    expect((await failure(network.http.get('/a', { resource: 'x' }))).kind).toBe('network');
  });

  it('never retries 4xx', async () => {
    const { http, api } = client({
      '/acme/shop/issues': { status: 400, body: 'Validation Error' },
    });
    expect((await failure(http.get('/acme/shop/issues', { resource: 'x' }))).kind).toBe(
      'bad_request'
    );
    expect(api.requests).toHaveLength(1);
  });

  it('never retries 429 and reports the reset time', async () => {
    const { http, api } = client({
      '/acme/shop/summary': {
        status: 429,
        headers: { 'x-ratelimit-remaining': '0' },
        body: { status: 429, msg: 'Too Many Requests' },
      },
    });
    const error = await failure(http.get('/acme/shop/summary', { resource: 'x' }));
    expect(error).toMatchObject({
      kind: 'rate_limited',
      resetAt: new Date('2026-09-30T13:00:00Z'),
    });
    expect(api.requests).toHaveLength(1);
  });

  it('fails fast without calling the API once the budget is exhausted', async () => {
    const { http, api } = client({
      '/a': { body: {}, headers: { 'x-ratelimit-remaining': '0' } },
    });
    await http.get('/a', { resource: 'x' });
    const error = await failure(http.get('/a', { resource: 'x' }));
    expect(error.kind).toBe('rate_limited');
    expect(api.requests).toHaveLength(1);
  });

  it('lets an uncounted request through once the budget is exhausted', async () => {
    const { http, api } = client({
      '/a': { body: {}, headers: { 'x-ratelimit-remaining': '0' } },
      '/_token': { body: { ok: 1 } },
    });
    await http.get('/a', { resource: 'x' });
    await expect(http.get('/_token', { resource: 'x', uncounted: true })).resolves.toEqual({
      ok: 1,
    });
    expect((await failure(http.get('/a', { resource: 'x' }))).kind).toBe('rate_limited');
    expect(api.requests).toHaveLength(2);
  });

  it('allows requests again once the reset time has passed', async () => {
    // Reset 2026-09-30T12:00:00Z is before NOW (12:44), so a new hour has started.
    const { http, api } = client({
      '/a': {
        body: {},
        headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1790769600' },
      },
    });
    await http.get('/a', { resource: 'x' });
    await http.get('/a', { resource: 'x' });
    expect(api.requests).toHaveLength(2);
  });

  it('percent-encodes non-ASCII query values', async () => {
    const { http, api } = client({ '/a': { body: {} } });
    await http.get('/a', { resource: 'x', query: { search: 'Überweisung & co' } });
    expect(api.requests[0]?.url.search).toBe('?search=%C3%9Cberweisung%20%26%20co');
  });

  it('rejects a successful but non-JSON response', async () => {
    const { http } = client({ '/a': { rawBody: '<html>maintenance</html>' } });
    expect((await failure(http.get('/a', { resource: 'x' }))).kind).toBe('invalid_response');
  });

  it('maps 401 without retrying and without leaking the token', async () => {
    const { http, api } = client({
      '/_token': { status: 401, body: { error: 'Invalid credentials.' } },
    });
    const error = await failure(http.get('/_token', { resource: 'x' }));
    expect(error.kind).toBe('auth');
    expect(error.message).not.toContain('test-token');
    expect(api.requests).toHaveLength(1);
  });

  it('retries when the response body fails to read, then throws as transport error', async () => {
    const { http, api } = client({
      '/a': { bodyThrows: new DOMException('aborted', 'TimeoutError') },
    });
    const error = await failure(http.get('/a', { resource: 'x' }));
    expect(error.kind).toBe('timeout');
    expect(api.requests).toHaveLength(3); // initial + 2 retries
  });

  it('succeeds after a body read error when retry succeeds', async () => {
    const { http, api } = client({
      '/a': (_url, call) =>
        call === 1
          ? { bodyThrows: new DOMException('aborted', 'TimeoutError') }
          : { body: { ok: true } },
    });
    await expect(http.get('/a', { resource: 'x' })).resolves.toEqual({ ok: true });
    expect(api.requests).toHaveLength(2); // initial failed, retry succeeded
  });

  it('never retries a 429 even if the body read fails', async () => {
    const { http, api } = client({
      '/a': {
        status: 429,
        headers: { 'x-ratelimit-remaining': '0' },
        bodyThrows: new TypeError('body stream error'),
      },
    });
    const error = await failure(http.get('/a', { resource: 'x' }));
    expect(error.kind).toBe('rate_limited');
    expect(error.resetAt).toEqual(new Date('2026-09-30T13:00:00Z'));
    expect(api.requests).toHaveLength(1); // exactly 1 request, no retry
  });

  it('records rate-limit headers even when body read fails', async () => {
    const { http } = client({
      '/a': {
        status: 200,
        headers: { 'x-ratelimit-remaining': '10' },
        bodyThrows: new DOMException('aborted', 'TimeoutError'),
      },
    });
    expect(http.lastRateLimit()).toBeUndefined();
    expect((await failure(http.get('/a', { resource: 'x' }))).kind).toBe('timeout');
    expect(http.lastRateLimit()).toEqual({
      limit: 5000,
      remaining: 10,
      resetAt: new Date('2026-09-30T13:00:00Z'),
    });
  });
});
