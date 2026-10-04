import { afterEach, describe, expect, it } from 'vitest';

import type { PerformanceOutput } from '../../src/tools/performance.js';
import type { PerformanceSummaryOutput } from '../../src/tools/performance-summary.js';
import { performance, summary, tokenInfo } from '../fixtures/tideways.js';
import { callTool, startTestServer, textOf, type TestServer } from '../helpers/harness.js';

describe('tideways_get_performance', () => {
  let server: TestServer | undefined;
  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it('summarizes totals, transactions and a sorted timeline', async () => {
    server = await startTestServer({ '/acme/shop/performance': { body: performance } });
    const result = await callTool(server, 'tideways_get_performance');
    expect(result.isError).toBeUndefined();
    const data = result.structuredContent as PerformanceOutput;
    expect(data.project).toBe('acme/shop');
    expect(data.criteria).toEqual({
      start: '2026-09-30 11:44',
      end: '2026-09-30 12:44',
      environment: 'production',
      service: 'web',
    });
    expect(data.totals).toEqual({
      requests: 2900,
      errorRatePercent: 0.0427,
      p95Ms: 307,
      averageMs: 83,
      medianMs: 21,
      downstreamAverageMs: { sql: 27, http: 17, sleep: 0 },
    });
    expect(data.transactions).toEqual([
      {
        name: 'App\\Controller\\CartController::show',
        requests: 4700,
        averageMs: 289,
        p95Ms: 1170,
        maxMs: 10274,
        memory: 475998,
        impactPercent: 18.19,
      },
    ]);
    expect(data.timeline.map(p => p.time)).toEqual(['2026-09-30 12:42', '2026-09-30 12:43']);
    expect(data.raw).toBeUndefined();
  });

  it('treats PHP empty arrays for empty maps as zero traffic', async () => {
    server = await startTestServer({
      '/acme/shop/performance': {
        body: {
          application: {
            by_time: [],
            by_transactions: [],
            total: {
              error_rate: 0,
              requests: 0,
              response_time: 0,
              average: 0,
              median: 0,
              downstream: [],
            },
          },
        },
      },
    });
    const result = await callTool(server, 'tideways_get_performance');
    expect(result.isError).toBeUndefined();
    const data = result.structuredContent as PerformanceOutput;
    expect(data.totals).toMatchObject({
      requests: 0,
      errorRatePercent: 0,
      downstreamAverageMs: {},
    });
    expect(data.timeline).toEqual([]);
  });

  it('sends only the parameters that are set and uses configured defaults', async () => {
    server = await startTestServer(
      { '/acme/shop/performance': { body: performance } },
      { TIDEWAYS_SERVICE: 'worker' }
    );
    await callTool(server, 'tideways_get_performance');
    expect(Object.fromEntries(server.api.requests[0]?.url.searchParams ?? [])).toEqual({
      m: '60',
      s: 'worker',
    });

    await callTool(server, 'tideways_get_performance', {
      minutes: 1440,
      end: '2026-09-30 12:00',
      environment: 'staging',
      service: 'web',
    });
    expect(Object.fromEntries(server.api.requests[1]?.url.searchParams ?? [])).toEqual({
      m: '1440',
      ts: '2026-09-30 12:00',
      env: 'staging',
      s: 'web',
    });
  });

  it('includes the raw payload only with detail=full', async () => {
    server = await startTestServer({ '/acme/shop/performance': { body: performance } });
    const result = await callTool(server, 'tideways_get_performance', { detail: 'full' });
    expect((result.structuredContent as PerformanceOutput).raw).toEqual(performance);
  });

  it('validates arguments before calling the API', async () => {
    server = await startTestServer({ '/acme/shop/performance': { body: performance } });
    const tooLong = await callTool(server, 'tideways_get_performance', { minutes: 5000 });
    expect(tooLong.isError).toBe(true);
    const badEnd = await callTool(server, 'tideways_get_performance', {
      end: '2026-09-30T12:00:00Z',
    });
    expect(badEnd.isError).toBe(true);
    expect(textOf(badEnd)).toContain('YYYY-MM-DD HH:mm');
    expect(server.api.requests).toHaveLength(0);
  });

  it('targets another project after validating it against the token', async () => {
    server = await startTestServer({
      '/_token': { body: tokenInfo },
      '/acme/blog/performance': { body: performance },
    });
    const ok = await callTool(server, 'tideways_get_performance', { project: 'blog' });
    expect((ok.structuredContent as PerformanceOutput).project).toBe('acme/blog');
    const unknown = await callTool(server, 'tideways_get_performance', { project: 'acme/../../x' });
    expect(unknown.isError).toBe(true);
    expect(textOf(unknown)).toContain('Unknown project');
    expect(server.api.requests.map(r => r.url.pathname)).toEqual([
      '/apps/api/_token',
      '/apps/api/acme/blog/performance',
    ]);
  });

  it('explains a missing scope', async () => {
    server = await startTestServer({ '/acme/shop/performance': { status: 403, body: {} } });
    const result = await callTool(server, 'tideways_get_performance');
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('"metrics" scope');
  });

  it('explains that the hourly rate limit is shared by the whole organization', async () => {
    server = await startTestServer({
      '/acme/shop/performance': {
        status: 429,
        body: { error: 'Too many requests' },
        headers: { 'x-ratelimit-limit': '250', 'x-ratelimit-remaining': '0' },
      },
    });
    const result = await callTool(server, 'tideways_get_performance');
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain(
      '250 requests per hour, shared by all tokens and projects of the organization'
    );
  });

  it('reads transactions without a name and rounds percentages and memory', async () => {
    const [first] = performance.application.by_transactions;
    const body = {
      application: {
        ...performance.application,
        total: { ...performance.application.total, error_rate: 0.01859900693499037 },
        by_transactions: [{ ...first, name: null, memory: 475998.7, impact: 18.123456789 }],
      },
    };
    server = await startTestServer({ '/acme/shop/performance': { body } });
    const result = await callTool(server, 'tideways_get_performance');
    expect(result.isError).toBeUndefined();
    const data = result.structuredContent as PerformanceOutput;
    expect(data.totals.errorRatePercent).toBe(0.0186);
    expect(data.transactions[0]).toMatchObject({
      name: '(unnamed)',
      memory: 475999,
      impactPercent: 18.1235,
    });
  });

  it('reports an unexpected response shape instead of crashing', async () => {
    server = await startTestServer({ '/acme/shop/performance': { body: { application: 'nope' } } });
    const result = await callTool(server, 'tideways_get_performance');
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('unexpected response shape for performance');
    expect(textOf(result)).toContain(
      'This tool cannot read that response; try another date or tool, and report it at ' +
        'https://github.com/abuhamza/tideways-mcp-server/issues.'
    );
  });
});

describe('tideways_get_performance_summary', () => {
  let server: TestServer | undefined;
  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it('keeps the requested window and drops trailing zero-filled buckets', async () => {
    // Buckets from 2026-09-29 00:00 to 12:30 on 09-30; 12:15 and 12:30 are pending.
    server = await startTestServer({
      '/acme/shop/summary': { body: summary('2026-09-29 00:00', '2026-09-30 12:30') },
    });
    const result = await callTool(server, 'tideways_get_performance_summary', { hours: 2 });
    const data = result.structuredContent as PerformanceSummaryOutput;
    // now = 12:44, cutoff = 10:44 -> first full bucket 10:45; last complete bucket 12:00.
    expect(data.window).toEqual({ hours: 2, from: '2026-09-30 10:45', to: '2026-09-30 12:00' });
    expect(data.buckets).toHaveLength(6);
    expect(data.pendingBuckets).toBe(2);
    expect(data.totals).toEqual({
      requests: 6000,
      errors: 6,
      errorRatePercent: 0.1,
      maxP95Ms: 300,
    });
    expect(data.raw).toBeUndefined();
  });

  it('defaults to 24 hours and passes environment and service', async () => {
    server = await startTestServer({
      '/acme/shop/summary': {
        body: summary('2026-09-01 00:00', '2026-09-30 12:30', 2, 'staging'),
      },
    });
    const result = await callTool(server, 'tideways_get_performance_summary', {
      environment: 'staging',
    });
    const data = result.structuredContent as PerformanceSummaryOutput;
    // 24h before 12:44 -> first bucket 09-29 12:45; last complete bucket 09-30 12:00.
    expect(data.window).toEqual({ hours: 24, from: '2026-09-29 12:45', to: '2026-09-30 12:00' });
    expect(data.buckets).toHaveLength(94);
    expect(server.api.requests[0]?.url.search).toBe('?env=staging');
  });

  it('treats a PHP empty array for by_time as an empty summary', async () => {
    server = await startTestServer({
      '/acme/shop/summary': { body: { summary: { by_time: [] } } },
    });
    const result = await callTool(server, 'tideways_get_performance_summary');
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent as PerformanceSummaryOutput).toMatchObject({
      totals: { requests: 0 },
      buckets: [],
    });
  });

  it('handles an empty summary', async () => {
    server = await startTestServer({
      '/acme/shop/summary': { body: { summary: { by_time: {} } } },
    });
    const data = (await callTool(server, 'tideways_get_performance_summary'))
      .structuredContent as PerformanceSummaryOutput;
    expect(data).toMatchObject({
      window: { from: null, to: null },
      totals: { requests: 0, errorRatePercent: 0, maxP95Ms: 0 },
      buckets: [],
      pendingBuckets: 0,
      criteria: { start: null, environment: null },
    });
  });
});
