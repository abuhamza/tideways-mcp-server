import { afterEach, describe, expect, it } from 'vitest';

import type { GetHistoryOutput } from '../../src/tools/history.js';
import type { GetObservationsOutput } from '../../src/tools/observations.js';
import { history, observations } from '../fixtures/tideways.js';
import { callTool, startTestServer, textOf, type TestServer } from '../helpers/harness.js';

describe('tideways_get_history', () => {
  let server: TestServer | undefined;
  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it('returns the day report with minute date range, hourly timeline and top 20 transactions', async () => {
    server = await startTestServer({ '/acme/shop/history/2026-09-29': { body: history('day') } });
    const result = await callTool(server, 'tideways_get_history', { date: '2026-09-29' });
    const data = result.structuredContent as GetHistoryOutput;
    expect(data.dateRange).toEqual({
      start: '2026-09-29 00:00',
      end: '2026-09-29 23:59',
      granularity: 'day',
    });
    expect(data.report).toEqual({ totalRequests: 8600, errorRatePercent: 0.16, p95Ms: 341 });
    expect(data.transactionCount).toBe(25);
    expect(data.transactions).toHaveLength(20);
    expect(data.transactions[0]).toEqual({
      name: 'App\\Controller\\Page24::index',
      totalRequests: 2500,
      p95Ms: 976,
      averageMs: 300,
      memoryMax: 982632,
      impactPercent: 24,
    });
    expect(data.timeline.map(p => p.time)).toEqual([
      '2026-09-28 22:00',
      '2026-09-28 23:00',
      '2026-09-29 00:00',
    ]);
    expect(data.pendingBuckets).toBe(2);
    expect(data.raw).toBeUndefined();
  });

  it('aggregates week and month timelines per UTC day', async () => {
    server = await startTestServer({
      '/acme/shop/history/2026-09-29/week': { body: history('week') },
    });
    const data = (
      await callTool(server, 'tideways_get_history', { date: '2026-09-29', granularity: 'week' })
    ).structuredContent as GetHistoryOutput;
    expect(data.timeline).toEqual([
      { time: '2026-09-28', requests: 6600, errors: 12, p95Ms: 330 },
      { time: '2026-09-29', requests: 2000, errors: 2, p95Ms: 350 },
    ]);
  });

  it('rejects impossible dates without calling the API', async () => {
    server = await startTestServer({});
    const result = await callTool(server, 'tideways_get_history', { date: '2026-02-30' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('YYYY-MM-DD');
    expect(server.api.requests).toHaveLength(0);
  });

  it('treats a PHP empty array for by_time as an empty timeline', async () => {
    server = await startTestServer({
      '/acme/shop/history/2026-09-29': { body: { history: { by_time: [] } } },
    });
    const result = await callTool(server, 'tideways_get_history', { date: '2026-09-29' });
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent as GetHistoryOutput).toMatchObject({ timeline: [] });
  });

  it('tolerates a sparse response and includes raw with detail=full', async () => {
    server = await startTestServer({ '/acme/shop/history/2026-09-01/month': { body: {} } });
    const data = (
      await callTool(server, 'tideways_get_history', {
        date: '2026-09-01',
        granularity: 'month',
        detail: 'full',
      })
    ).structuredContent as GetHistoryOutput;
    expect(data).toMatchObject({
      dateRange: { start: null, end: null, granularity: 'month' },
      report: { totalRequests: 0, errorRatePercent: 0, p95Ms: 0 },
      transactionCount: 0,
      timeline: [],
      raw: {},
    });
  });
});

describe('tideways_get_history with unusual numbers and names', () => {
  let server: TestServer | undefined;
  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it('reads transactions without a name and rounds percentages and memory', async () => {
    const day = history('day');
    const body = {
      ...day,
      report: { ...day.report, error_rate_percent: 0.0526163944305853 },
      transaction_report: [
        {
          ...day.transaction_report[0],
          name: null,
          memory_max: 981846.3059982909,
          impact_percent: 12.345678901,
        },
      ],
    };
    server = await startTestServer({ '/acme/shop/history/2026-09-29': { body } });
    const result = await callTool(server, 'tideways_get_history', { date: '2026-09-29' });
    expect(result.isError).toBeUndefined();
    const data = result.structuredContent as GetHistoryOutput;
    expect(data.report.errorRatePercent).toBe(0.0526);
    expect(data.transactions[0]).toMatchObject({
      name: '(unnamed)',
      memoryMax: 981846,
      impactPercent: 12.3457,
    });
  });
});

describe('tideways_get_observations', () => {
  let server: TestServer | undefined;
  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it('lists configuration and trace findings', async () => {
    server = await startTestServer(
      { '/acme/shop/observations': { body: observations } },
      { TIDEWAYS_ENV: 'production' }
    );
    const data = (await callTool(server, 'tideways_get_observations'))
      .structuredContent as GetObservationsOutput;
    expect(server.api.requests[0]?.url.search).toBe('?env=production');
    expect(data.criteria).toEqual({ environment: 'production', service: 'web', status: 'open' });
    expect(data.observations).toEqual([
      {
        type: 'opcache_low_interned_strings',
        source: 'configuration',
        label: 'OPcache interned strings buffer is almost full',
        status: 'error',
        link: 'https://app.tideways.io/o/acme/shop/issues/observation?error=opcache_low_interned_strings',
        docLink: null,
        origins: ['web-1.example.test', 'web-2.example.test'],
      },
      {
        type: 'bottleneck-nplus1',
        source: 'traces',
        label: 'N+1 queries',
        status: 'warning',
        link: 'https://app.tideways.io/o/acme/shop/issues/observation?error=bottleneck-nplus1',
        docLink: null,
        origins: [],
      },
    ]);
  });

  it('explains a missing errors scope', async () => {
    server = await startTestServer({ '/acme/shop/observations': { status: 403, body: {} } });
    const result = await callTool(server, 'tideways_get_observations');
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('"errors" scope');
  });

  it('handles a response without observations', async () => {
    server = await startTestServer({ '/acme/shop/observations': { body: {} } });
    const data = (await callTool(server, 'tideways_get_observations'))
      .structuredContent as GetObservationsOutput;
    expect(data).toEqual({
      project: 'acme/shop',
      criteria: { environment: null, service: null, status: null },
      observations: [],
    });
  });
});
