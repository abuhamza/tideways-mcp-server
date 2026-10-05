import { afterEach, describe, expect, it } from 'vitest';

import type { GetTransactionOutput } from '../../src/tools/transaction.js';
import { tokenInfo, transaction } from '../fixtures/tideways.js';
import { callTool, startTestServer, textOf, type TestServer } from '../helpers/harness.js';

describe('tideways_get_transaction', () => {
  let server: TestServer | undefined;
  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it('returns the per-minute timeline, totals and response-time histogram', async () => {
    server = await startTestServer({ '/acme/shop/transaction/101': { body: transaction() } });
    const result = await callTool(server, 'tideways_get_transaction', { transactionId: 101 });
    expect(result.isError).toBeUndefined();
    expect(Object.fromEntries(server.api.requests[0]?.url.searchParams ?? [])).toEqual({ m: '60' });
    expect(result.structuredContent as GetTransactionOutput).toEqual({
      project: 'acme/shop',
      id: 101,
      name: 'App\\Controller\\CartController::show',
      criteria: {
        start: '2026-09-30 12:42',
        end: '2026-09-30 12:44',
        environment: 'production',
        service: 'web',
      },
      bucketMinutes: 1,
      totals: {
        requests: 220,
        errorRatePercent: 0.4545,
        p95Ms: 850,
        averageMs: 285,
        medianMs: 205,
        downstreamAverageMs: { sql: 115, http: 22, al: 3 },
        histogram: {
          requests: 220,
          buckets: [
            { fromMs: 0, toMs: 100, requests: 20 },
            { fromMs: 100, toMs: 500, requests: 150 },
            { fromMs: 500, toMs: 1000, requests: 50 },
          ],
          markers: [
            { name: '50%', label: '50%', value: 205 },
            { name: 'Average', label: 'Average', value: 285 },
            { name: '95%', label: '95%', value: 850 },
            { name: 'Max', label: 'Max', value: 1000 },
          ],
        },
      },
      timeline: [
        {
          time: '2026-09-30 12:42',
          requests: 100,
          errors: 0,
          responseTimeTargetExceeded: 2,
          p95Ms: 800,
          medianMs: 200,
          averageMs: 280,
          downstreamAverageMs: { sql: 110 },
        },
        {
          time: '2026-09-30 12:43',
          requests: 120,
          errors: 1,
          responseTimeTargetExceeded: 4,
          p95Ms: 900,
          medianMs: 210,
          averageMs: 290,
          downstreamAverageMs: { sql: 120.5, http: 40.25, al: 3 },
        },
      ],
    });
  });

  it('sends the window, environment and service and states the bucket size', async () => {
    server = await startTestServer({
      '/acme/shop/transaction/101': {
        body: transaction(101, 24, '2026-09-30 12:00'),
      },
    });
    const result = await callTool(server, 'tideways_get_transaction', {
      transactionId: 101,
      minutes: 1440,
      end: '2026-09-30 12:00',
      environment: 'production',
      service: 'web',
    });
    expect(Object.fromEntries(server.api.requests[0]?.url.searchParams ?? [])).toEqual({
      m: '1440',
      ts: '2026-09-30 12:00',
      env: 'production',
      s: 'web',
    });
    const data = result.structuredContent as GetTransactionOutput;
    expect(data.bucketMinutes).toBe(24);
    expect(data.timeline.map(point => point.time)).toEqual([
      '2026-09-30 11:12',
      '2026-09-30 11:36',
    ]);
  });

  it('sends the configured service when none is given', async () => {
    server = await startTestServer(
      { '/acme/shop/transaction/101': { body: transaction() } },
      { TIDEWAYS_SERVICE: 'web' }
    );
    await callTool(server, 'tideways_get_transaction', { transactionId: 101 });
    expect(Object.fromEntries(server.api.requests[0]?.url.searchParams ?? [])).toEqual({
      m: '60',
      s: 'web',
    });
  });

  it('points to tideways_get_performance when the transaction ID is unknown', async () => {
    server = await startTestServer({
      '/acme/shop/transaction/999': { status: 404, body: { status: 404, msg: '' } },
    });
    const result = await callTool(server, 'tideways_get_transaction', { transactionId: 999 });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      'Transaction 999 not found in acme/shop; take IDs from transactions[].id of ' +
        'tideways_get_performance.'
    );
  });

  it('throws when Tideways answers for another service or environment', async () => {
    server = await startTestServer({ '/acme/shop/transaction/101': { body: transaction() } });
    const service = await callTool(server, 'tideways_get_transaction', {
      transactionId: 101,
      service: 'voucher-api',
    });
    expect(service.isError).toBe(true);
    expect(textOf(service)).toMatch(
      /no service "voucher-api" in production .*default service "web"/
    );
    const environment = await callTool(server, 'tideways_get_transaction', {
      transactionId: 101,
      environment: 'qa',
    });
    expect(environment.isError).toBe(true);
    expect(textOf(environment)).toMatch(/no environment "qa" and answered for "production"/);
  });

  it('reads a transaction without traffic, name or histogram', async () => {
    server = await startTestServer({
      '/acme/shop/transaction/101': {
        body: { transaction: { id: 101, name: null, by_time: [], total: [], criteria: [] } },
      },
    });
    const result = await callTool(server, 'tideways_get_transaction', {
      transactionId: 101,
      minutes: 120,
    });
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent as GetTransactionOutput).toMatchObject({
      name: '(unnamed)',
      bucketMinutes: null,
      criteria: { start: null, end: null, environment: null, service: null },
      totals: { requests: 0, errorRatePercent: 0, downstreamAverageMs: {}, histogram: null },
      timeline: [],
    });
  });

  it('keeps the project hint when the project itself is not found', async () => {
    server = await startTestServer({
      '/acme/shop/transaction/101': { status: 404, body: { status: 404, msg: 'Not Found' } },
    });
    const result = await callTool(server, 'tideways_get_transaction', { transactionId: 101 });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('HTTP 404: Not Found');
    expect(textOf(result)).toContain('tideways_list_projects');
  });

  it('targets another project after validating it against the token', async () => {
    server = await startTestServer({
      '/_token': { body: tokenInfo },
      '/acme/blog/transaction/101': { body: transaction() },
    });
    const result = await callTool(server, 'tideways_get_transaction', {
      project: 'blog',
      transactionId: 101,
    });
    expect((result.structuredContent as GetTransactionOutput).project).toBe('acme/blog');
    expect(server.api.requests.map(r => r.url.pathname)).toEqual([
      '/apps/api/_token',
      '/apps/api/acme/blog/transaction/101',
    ]);
  });

  it('validates arguments before calling the API', async () => {
    server = await startTestServer({ '/acme/shop/transaction/101': { body: transaction() } });
    for (const args of [{}, { transactionId: 1.5 }, { transactionId: 101, minutes: 1441 }]) {
      expect((await callTool(server, 'tideways_get_transaction', args)).isError).toBe(true);
    }
    expect(server.api.requests).toHaveLength(0);
  });
});
