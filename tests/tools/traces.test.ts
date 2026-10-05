import { afterEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_TRACE_LIMIT,
  stripQuery,
  type SearchTracesOutput,
} from '../../src/tools/traces.js';
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
    expect(server.api.requests[0]?.url.search).toBe('?limit=30');
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

  it('accepts PHP empty arrays for http and _links on non-web traces', async () => {
    server = await startTestServer({
      '/acme/shop/traces': { body: { traces: [trace({ http: [], _links: [] })] } },
    });
    const result = await callTool(server, 'tideways_search_traces');
    expect(result.isError).toBeUndefined();
    const data = result.structuredContent as SearchTracesOutput;
    expect(data.count).toBe(1);
    expect(data.traces[0]).toMatchObject({
      id: 'AbCdEfGhIjKlMnOpQrSt',
      httpMethod: null,
      link: null,
    });
  });

  it('maps every filter to the API parameter names', async () => {
    server = await startTestServer({ '/acme/shop/traces': { body: { traces: [] } } });
    await callTool(server, 'tideways_search_traces', {
      environment: 'staging',
      service: 'worker',
      search: 'checkout',
      from: '2026-09-30 11:30',
      to: '2026-09-30 11:40',
      minResponseTimeMs: 500,
      maxResponseTimeMs: 5000,
      withCallgraph: true,
      sortBy: 'response_time',
      limit: 100,
      transactionIds: [101, 202],
    });
    const params = new URLSearchParams(server.api.requests[0]?.url.searchParams);
    expect(params.getAll('opId[]')).toEqual(['101', '202']);
    params.delete('opId[]');
    expect(Object.fromEntries(params)).toEqual({
      env: 'staging',
      s: 'worker',
      search: 'checkout',
      min_date: '2026-09-30 11:30',
      max_date: '2026-09-30 11:40',
      min_response_time_ms: '500',
      max_response_time_ms: '5000',
      has_callgraph: 'true',
      sort_by: 'response_time',
      limit: '100',
    });
  });

  it('flags limitReached when as many traces came back as were asked for', async () => {
    const traces = (n: number) =>
      Array.from({ length: n }, (_, i) => trace({ id: `t${i}`, transaction_name: `T${i}` }));
    server = await startTestServer({
      '/acme/shop/traces': url => ({
        body: { traces: traces(url.searchParams.get('limit') === '5' ? 5 : 30) },
      }),
    });
    const five = (await callTool(server, 'tideways_search_traces', { limit: 5 }))
      .structuredContent as SearchTracesOutput;
    expect(five).toMatchObject({ count: 5, limitReached: true });
    const thirtyOfHundred = (await callTool(server, 'tideways_search_traces', { limit: 100 }))
      .structuredContent as SearchTracesOutput;
    expect(thirtyOfHundred).toMatchObject({ count: 30, limitReached: false });
    expect(server.api.requests.map(r => r.url.searchParams.get('limit'))).toEqual(['5', '100']);
  });

  it('rejects a limit outside 1 to 100 and malformed transaction IDs', async () => {
    server = await startTestServer({ '/acme/shop/traces': { body: { traces: [] } } });
    for (const args of [
      { limit: 0 },
      { limit: 101 },
      { limit: 2.5 },
      { transactionIds: [] },
      { transactionIds: [1.5] },
      { transactionIds: [0] },
      { transactionIds: ['checkout'] },
      { transactionIds: Array.from({ length: 21 }, (_, i) => i + 1) },
    ]) {
      expect(
        (await callTool(server, 'tideways_search_traces', args)).isError,
        JSON.stringify(args)
      ).toBe(true);
    }
    expect(server.api.requests).toHaveLength(0);
  });

  it('never sends has_callgraph=false', async () => {
    server = await startTestServer({ '/acme/shop/traces': { body: { traces: [] } } });
    await callTool(server, 'tideways_search_traces', { withCallgraph: false });
    expect(server.api.requests[0]?.url.searchParams.has('has_callgraph')).toBe(false);
  });

  it('flags limitReached when the default 30 traces came back', async () => {
    const traces = Array.from({ length: DEFAULT_TRACE_LIMIT }, (_, i) =>
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

  it('requires both from and to; Tideways ignores a single bound', async () => {
    server = await startTestServer({ '/acme/shop/traces': { body: { traces: [] } } });
    for (const args of [{ from: '2026-09-30 11:00' }, { to: '2026-09-30 11:00' }]) {
      const result = await callTool(server, 'tideways_search_traces', args);
      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain(
        'Pass both "from" and "to"; Tideways ignores a single bound.'
      );
    }
    expect(server.api.requests).toHaveLength(0);
  });

  it('no longer takes transaction, sortOrder or sortBy date', async () => {
    server = await startTestServer({ '/acme/shop/traces': { body: { traces: [] } } });
    for (const args of [
      { transaction: 'App\\Command\\Import' },
      { sortOrder: 'asc' },
      { sortBy: 'date' },
    ]) {
      expect((await callTool(server, 'tideways_search_traces', args)).isError).toBe(true);
    }
    const { tools } = await server.client.listTools();
    const input = tools.find(t => t.name === 'tideways_search_traces')?.inputSchema;
    expect(Object.keys(input?.properties ?? {})).not.toContain('transaction');
    expect(Object.keys(input?.properties ?? {})).not.toContain('sortOrder');
    expect(JSON.stringify(input?.properties?.sortBy)).not.toContain('date');
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
