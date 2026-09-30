import { afterEach, describe, expect, it } from 'vitest';

import { stripQuery, TRACE_LIMIT, type SearchTracesOutput } from '../../src/tools/traces.js';
import { trace } from '../fixtures/tideways.js';
import { callTool, startTestServer, textOf, type TestServer } from '../helpers/harness.js';

describe('stripQuery', () => {
  it('removes query strings and fragments', () => {
    expect(stripQuery('https://shop.example.test/a?token=1#x')).toBe('https://shop.example.test/a');
    expect(stripQuery('/relative?x=1')).toBe('/relative');
  });
});

describe('tideways_search_traces', () => {
  let server: TestServer | undefined;
  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it('returns concise traces with the slowest layers and no query strings', async () => {
    server = await startTestServer({ '/acme/shop/traces': { body: { traces: [trace()] } } });
    const result = await callTool(server, 'tideways_search_traces');
    expect(server.api.requests[0]?.url.search).toBe('');
    const data = result.structuredContent as SearchTracesOutput;
    expect(data).toMatchObject({ project: 'acme/shop', count: 1, limitReached: false });
    expect(data.traces[0]).toEqual({
      id: 'AbCdEfGhIjKlMnOpQrSt',
      transaction: 'App\\Controller\\CartController::show',
      title: 'GET /cart/items/42',
      date: '2026-09-30 12:44',
      responseTimeMs: 60,
      memoryKb: 11284,
      server: 'web-1.example.test',
      environment: 'production',
      service: 'web',
      httpMethod: 'GET',
      httpStatus: 200,
      url: 'https://shop.example.test/cart/items/42',
      bottlenecks: ['sql'],
      topLayers: [
        { name: 'SQL', percent: 42.97, totalMs: 26, count: 4 },
        { name: 'HTTP', percent: 20.5, totalMs: 12, count: 1 },
        { name: 'Cache', percent: 3.1, totalMs: 2, count: 10 },
      ],
      hasCallgraph: false,
      link: 'https://app.tideways.io/o/acme/shop/trace/AbCdEfGhIjKlMnOpQrSt/quick',
    });
    expect(textOf(result)).not.toContain('token=abc');
  });

  it('maps every filter to the API parameter names', async () => {
    server = await startTestServer({ '/acme/shop/traces': { body: { traces: [] } } });
    await callTool(server, 'tideways_search_traces', {
      environment: 'staging',
      service: 'worker',
      transaction: 'App\\Command\\Import',
      search: 'checkout',
      from: '2026-09-30 11:30',
      to: '2026-09-30 11:40',
      minResponseTimeMs: 500,
      maxResponseTimeMs: 5000,
      withCallgraph: true,
      sortBy: 'response_time',
      sortOrder: 'desc',
    });
    expect(Object.fromEntries(server.api.requests[0]?.url.searchParams ?? [])).toEqual({
      env: 'staging',
      s: 'worker',
      transaction_name: 'App\\Command\\Import',
      search: 'checkout',
      min_date: '2026-09-30 11:30',
      max_date: '2026-09-30 11:40',
      min_response_time_ms: '500',
      max_response_time_ms: '5000',
      has_callgraph: 'true',
      sort_by: 'response_time',
      sort_order: 'DESC',
    });
  });

  it('never sends has_callgraph=false', async () => {
    server = await startTestServer({ '/acme/shop/traces': { body: { traces: [] } } });
    await callTool(server, 'tideways_search_traces', { withCallgraph: false });
    expect(server.api.requests[0]?.url.searchParams.has('has_callgraph')).toBe(false);
  });

  it('flags when the API limit of 30 traces was hit', async () => {
    const traces = Array.from({ length: TRACE_LIMIT }, (_, i) =>
      trace({ id: `t${i}`, http: null, _links: null, layers: [] })
    );
    server = await startTestServer({ '/acme/shop/traces': { body: { traces } } });
    const data = (await callTool(server, 'tideways_search_traces'))
      .structuredContent as SearchTracesOutput;
    expect(data).toMatchObject({ count: 30, limitReached: true });
    expect(data.traces[0]).toMatchObject({
      url: null,
      httpMethod: null,
      httpStatus: null,
      link: null,
      topLayers: [],
    });
  });

  it('rejects inverted ranges and malformed dates without calling the API', async () => {
    server = await startTestServer({ '/acme/shop/traces': { body: { traces: [] } } });
    const inverted = await callTool(server, 'tideways_search_traces', {
      from: '2026-09-30 12:00',
      to: '2026-09-30 11:00',
    });
    expect(inverted.isError).toBe(true);
    expect(textOf(inverted)).toContain('"from" must be earlier than "to"');
    const slow = await callTool(server, 'tideways_search_traces', {
      minResponseTimeMs: 10,
      maxResponseTimeMs: 5,
    });
    expect(textOf(slow)).toContain('minResponseTimeMs');
    const malformed = await callTool(server, 'tideways_search_traces', { from: 'yesterday' });
    expect(malformed.isError).toBe(true);
    expect(server.api.requests).toHaveLength(0);
  });

  it('includes the raw payload with detail=full', async () => {
    const body = { traces: [trace()] };
    server = await startTestServer({ '/acme/shop/traces': { body } });
    const data = (await callTool(server, 'tideways_search_traces', { detail: 'full' }))
      .structuredContent as SearchTracesOutput;
    expect(data.raw).toEqual(body);
  });
});
