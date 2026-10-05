import { afterEach, describe, expect, it } from 'vitest';

import type { ListServicesOutput } from '../../src/tools/list-services.js';
import { issuesNaming, trace } from '../fixtures/tideways.js';
import type { FakeReply } from '../helpers/fake-api.js';
import { callTool, startTestServer, textOf, type TestServer } from '../helpers/harness.js';

type IssueType = 'error' | 'slowsql' | 'deprecated';
type IssuesPage = ReturnType<typeof issuesNaming>;

const V2 = 'application/vnd.tideways.issues.v2+json';

/**
 * /issues route. With `s=__all`, each issue type answers with its page of all services (types
 * not given have no issues). Without `s`, the default service "web" answers with `defaultPage`.
 */
const issuesByType =
  (pages: Partial<Record<IssueType, IssuesPage>>, defaultPage: IssuesPage = issuesNaming([])) =>
  (url: URL): FakeReply => {
    if (url.searchParams.get('s') !== '__all') return { body: defaultPage };
    const page = pages[url.searchParams.get('issueType') as IssueType] ?? issuesNaming([]);
    return { body: { ...page, criteria: { ...page.criteria, service: '__all' } } };
  };

/** /issues route echoing the requested environment and service in `criteria`. */
const issuesEchoingScope =
  (services: string[][]) =>
  (url: URL): FakeReply => ({
    body: issuesNaming(services, {
      environment: url.searchParams.get('env'),
      service: url.searchParams.get('s') ?? 'web',
    }),
  });

const traceQueries = (server: TestServer) =>
  server.api.requests
    .filter(request => request.url.pathname.endsWith('/traces'))
    .map(request => Object.fromEntries(request.url.searchParams));

/** A trace of `service` whose transaction and URL contain "voucher". */
const voucherTrace = (service: string, minute: number) =>
  trace({
    id: `${service}-${minute}`,
    service,
    transaction_name: `App\\Voucher\\${service}::redeem`,
    date: `2026-09-30 12:${String(minute).padStart(2, '0')}`,
    http: {
      status_code: 200,
      method: 'GET',
      url: 'https://shop.example.test/voucher/redeem?code=secret',
    },
  });

describe('tideways_list_services', () => {
  let server: TestServer | undefined;
  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it('lists the services named by issues of all services, default first', async () => {
    server = await startTestServer({
      '/acme/shop/issues': issuesByType({
        error: issuesNaming([['worker', 'voucher_api'], ['voucher_api']], {}, 'error'),
        slowsql: issuesNaming([['web', 'voucher_api', 'voucher_api'], ['import:cli']], {}, 'sql'),
        deprecated: issuesNaming([['import:cli', 'worker']], {}, 'deprecated'),
      }),
    });
    const result = await callTool(server, 'tideways_list_services');
    expect(
      server.api.requests.map(request => Object.fromEntries(request.url.searchParams))
    ).toEqual([
      { issueType: 'error', status: 'all' },
      { issueType: 'error', status: 'all', s: '__all' },
      { issueType: 'slowsql', status: 'all', s: '__all' },
      { issueType: 'deprecated', status: 'all', s: '__all' },
    ]);
    expect(server.api.requests.map(request => request.headers.get('accept'))).toEqual([
      V2,
      V2,
      V2,
      V2,
    ]);
    expect(result.structuredContent).toEqual({
      project: 'acme/shop',
      environment: 'production',
      defaultService: 'web',
      services: [
        { name: 'web', issues: 1 },
        { name: 'voucher_api', issues: 3 },
        { name: 'import:cli', issues: 2 },
        { name: 'worker', issues: 2 },
      ],
    });
  });

  it('counts issues of the default service too, each issue once', async () => {
    server = await startTestServer({
      '/acme/shop/issues': issuesByType(
        { error: issuesNaming([['worker', 'web']], {}, 'error') },
        issuesNaming(
          [
            ['worker', 'web'],
            ['web', 'cron:cli'],
          ],
          {},
          'error'
        )
      ),
    });
    const data = (await callTool(server, 'tideways_list_services'))
      .structuredContent as ListServicesOutput;
    expect(data.services).toEqual([
      { name: 'web', issues: 2 },
      { name: 'cron:cli', issues: 1 },
      { name: 'worker', issues: 1 },
    ]);
  });

  it('lists the default service even when no issue names it', async () => {
    server = await startTestServer({ '/acme/shop/issues': issuesByType({}) });
    const data = (await callTool(server, 'tideways_list_services'))
      .structuredContent as ListServicesOutput;
    expect(data.defaultService).toBe('web');
    expect(data.services).toEqual([{ name: 'web', issues: 0 }]);
  });

  it('reads the issues of the given environment', async () => {
    server = await startTestServer({
      '/acme/shop/issues': issuesEchoingScope([['web']]),
    });
    const data = (await callTool(server, 'tideways_list_services', { environment: 'staging' }))
      .structuredContent as ListServicesOutput;
    expect(server.api.requests.map(request => request.url.searchParams.get('env'))).toEqual([
      'staging',
      'staging',
      'staging',
      'staging',
    ]);
    expect(data.environment).toBe('staging');
  });

  it('searches the traces of the given environment', async () => {
    server = await startTestServer({
      '/acme/shop/issues': issuesEchoingScope([['worker']]),
      '/acme/shop/traces': { body: { traces: [] } },
    });
    await callTool(server, 'tideways_list_services', { environment: 'staging', search: 'cart' });
    expect(traceQueries(server)).toEqual([
      { env: 'staging', s: 'web', search: 'cart' },
      { env: 'staging', s: 'worker', search: 'cart' },
    ]);
  });

  it('uses the configured environment for issues and searches', async () => {
    server = await startTestServer(
      {
        '/acme/shop/issues': issuesEchoingScope([]),
        '/acme/shop/traces': { body: { traces: [] } },
      },
      { TIDEWAYS_ENV: 'staging' }
    );
    await callTool(server, 'tideways_list_services', { search: 'cart' });
    expect(server.api.requests.map(request => request.url.searchParams.get('env'))).toEqual([
      'staging',
      'staging',
      'staging',
      'staging',
      'staging',
    ]);
  });

  it('fails when Tideways answers for another environment', async () => {
    server = await startTestServer({ '/acme/shop/issues': issuesByType({}) });
    const result = await callTool(server, 'tideways_list_services', { environment: 'qa' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/no environment "qa" and answered for "production"/);
  });

  it('searches every service for a word and sorts by matching traces', async () => {
    const matches: Record<string, number> = { web: 2, voucher_api: 30, 'import:cli': 0, worker: 1 };
    server = await startTestServer({
      '/acme/shop/issues': issuesByType({
        error: issuesNaming([['worker'], ['voucher_api', 'import:cli']]),
      }),
      '/acme/shop/traces': url => {
        const service = url.searchParams.get('s') ?? '';
        const count = matches[service] ?? 0;
        return {
          body: { traces: Array.from({ length: count }, (_, i) => voucherTrace(service, 40 - i)) },
        };
      },
    });
    const result = await callTool(server, 'tideways_list_services', { search: 'voucher' });

    const queries = traceQueries(server);
    expect(queries).toHaveLength(4);
    expect(queries).toEqual(
      expect.arrayContaining(
        ['web', 'voucher_api', 'import:cli', 'worker'].map(s => ({ s, search: 'voucher' }))
      )
    );
    const data = result.structuredContent as ListServicesOutput;
    expect(data.search).toEqual({ word: 'voucher', searched: 4, notSearched: 0 });
    const example = (service: string) => ({
      transaction: `App\\Voucher\\${service}::redeem`,
      url: 'https://shop.example.test/voucher/redeem',
      date: '2026-09-30 12:40',
    });
    expect(data.services).toEqual([
      {
        name: 'voucher_api',
        issues: 1,
        matchingTraces: 30,
        example: example('voucher_api'),
        searchError: null,
      },
      { name: 'web', issues: 0, matchingTraces: 2, example: example('web'), searchError: null },
      {
        name: 'worker',
        issues: 1,
        matchingTraces: 1,
        example: example('worker'),
        searchError: null,
      },
      { name: 'import:cli', issues: 1, matchingTraces: 0, example: null, searchError: null },
    ]);
    expect(textOf(result)).not.toContain('code=secret');
  });

  it('reports a failed service search last and keeps the other results', async () => {
    server = await startTestServer({
      '/acme/shop/issues': issuesByType({ error: issuesNaming([['flaky'], ['flaky', 'quiet']]) }),
      '/acme/shop/traces': url => {
        const service = url.searchParams.get('s');
        if (service === 'flaky') return { status: 502, body: { error: 'Bad gateway' } };
        return { body: { traces: service === 'web' ? [trace()] : [] } };
      },
    });
    const data = (await callTool(server, 'tideways_list_services', { search: 'cart' }))
      .structuredContent as ListServicesOutput;
    expect(data.services).toEqual([
      {
        name: 'web',
        issues: 0,
        matchingTraces: 1,
        example: {
          transaction: 'App\\Controller\\CartController::show',
          url: 'https://shop.example.test/cart/items/42',
          date: '2026-09-30 12:44',
        },
        searchError: null,
      },
      { name: 'quiet', issues: 1, matchingTraces: 0, example: null, searchError: null },
      {
        name: 'flaky',
        issues: 2,
        matchingTraces: null,
        example: null,
        searchError: expect.stringContaining('HTTP 502') as string,
      },
    ]);
  });

  it('does not count traces Tideways returns for another service', async () => {
    server = await startTestServer({
      '/acme/shop/issues': issuesByType({ error: issuesNaming([['retired']]) }),
      '/acme/shop/traces': { body: { traces: [trace()] } },
    });
    const data = (await callTool(server, 'tideways_list_services', { search: 'cart' }))
      .structuredContent as ListServicesOutput;
    expect(data.services[1]).toMatchObject({
      name: 'retired',
      matchingTraces: null,
      example: null,
    });
    expect(data.services[1]?.searchError).toMatch(
      /does not know service "retired" in production and answered for "web"/
    );
    expect(data.services[1]?.searchError).not.toContain('tideways_list_services');
  });

  it('fails the whole call when a service search answers for another environment', async () => {
    server = await startTestServer({
      '/acme/shop/issues': issuesEchoingScope([['worker']]),
      '/acme/shop/traces': { body: { traces: [trace()] } },
    });
    const result = await callTool(server, 'tideways_list_services', {
      environment: 'staging',
      search: 'cart',
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/no environment "staging" and answered for "production"/);
  });

  it('keeps the default service first among services with equal matches', async () => {
    server = await startTestServer({
      '/acme/shop/issues': issuesByType({ error: issuesNaming([['api'], ['api']]) }),
      '/acme/shop/traces': url => ({
        body: {
          traces: Array.from({ length: 30 }, (_, i) =>
            voucherTrace(url.searchParams.get('s') ?? '', 59 - i)
          ),
        },
      }),
    });
    const data = (await callTool(server, 'tideways_list_services', { search: 'voucher' }))
      .structuredContent as ListServicesOutput;
    expect(data.services.map(s => [s.name, s.matchingTraces])).toEqual([
      ['web', 30],
      ['api', 30],
    ]);
  });

  it.each([
    [401, /rejected the API token/],
    [403, /needs the "traces" scope/],
    [429, /rate limit reached/],
  ])('fails the whole call on HTTP %i from a service search', async (status, message) => {
    server = await startTestServer({
      '/acme/shop/issues': issuesByType({ error: issuesNaming([['worker']]) }),
      '/acme/shop/traces': url =>
        url.searchParams.get('s') === 'worker'
          ? { status, body: { error: 'denied' } }
          : { body: { traces: [] } },
    });
    const result = await callTool(server, 'tideways_list_services', { search: 'voucher' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(message);
  });

  it('starts no new service searches after a fatal error', async () => {
    server = await startTestServer({
      '/acme/shop/issues': issuesByType({
        error: issuesNaming([['a'], ['b'], ['c'], ['d'], ['e'], ['f'], ['g'], ['h'], ['i']]),
      }),
      '/acme/shop/traces': async url => {
        if (url.searchParams.get('s') === 'web')
          return { status: 429, body: { error: 'Slow down' } };
        await new Promise(resolve => setTimeout(resolve, 5));
        return { body: { traces: [] } };
      },
    });
    const result = await callTool(server, 'tideways_list_services', { search: 'voucher' });
    expect(result.isError).toBe(true);
    expect(traceQueries(server)).toHaveLength(4);
  });

  it('searches fewer services when the hourly rate limit is nearly used up', async () => {
    const pages = issuesByType({ error: issuesNaming([['a'], ['b'], ['c'], ['d']]) });
    server = await startTestServer({
      '/acme/shop/issues': url => ({ ...pages(url), headers: { 'x-ratelimit-remaining': '13' } }),
      '/acme/shop/traces': { body: { traces: [] } },
    });
    const data = (await callTool(server, 'tideways_list_services', { search: 'voucher' }))
      .structuredContent as ListServicesOutput;
    expect(traceQueries(server).map(query => query.s)).toEqual(['web', 'a', 'b']);
    expect(data.search).toEqual({ word: 'voucher', searched: 3, notSearched: 2 });
  });

  it('searches at most a tenth of the hourly rate limit less the reserve', async () => {
    const names = Array.from({ length: 11 }, (_, i) => [`svc-${String(i + 1).padStart(2, '0')}`]);
    const pages = issuesByType({ error: issuesNaming(names) });
    server = await startTestServer({
      '/acme/shop/issues': url => ({
        ...pages(url),
        headers: { 'x-ratelimit-limit': '209', 'x-ratelimit-remaining': '199' },
      }),
      '/acme/shop/traces': { body: { traces: [] } },
    });
    const data = (await callTool(server, 'tideways_list_services', { search: 'voucher' }))
      .structuredContent as ListServicesOutput;
    expect(traceQueries(server)).toHaveLength(10);
    expect(data.search).toEqual({ word: 'voucher', searched: 10, notSearched: 2 });
  });

  it('searches 15 services on a 250-request hourly rate limit', async () => {
    const names = Array.from({ length: 30 }, (_, i) => [`svc-${String(i + 1).padStart(2, '0')}`]);
    const pages = issuesByType({ error: issuesNaming(names) });
    server = await startTestServer({
      '/acme/shop/issues': url => ({
        ...pages(url),
        headers: { 'x-ratelimit-limit': '250', 'x-ratelimit-remaining': '247' },
      }),
      '/acme/shop/traces': { body: { traces: [] } },
    });
    const data = (await callTool(server, 'tideways_list_services', { search: 'voucher' }))
      .structuredContent as ListServicesOutput;
    expect(traceQueries(server)).toHaveLength(15);
    expect(data.search).toEqual({ word: 'voucher', searched: 15, notSearched: 16 });
  });

  it('searches no service when 10 or fewer requests of the hourly rate limit remain', async () => {
    const pages = issuesByType({ error: issuesNaming([['a'], ['b'], ['c'], ['d']]) });
    server = await startTestServer({
      '/acme/shop/issues': url => ({ ...pages(url), headers: { 'x-ratelimit-remaining': '8' } }),
      '/acme/shop/traces': { body: { traces: [] } },
    });
    const data = (await callTool(server, 'tideways_list_services', { search: 'voucher' }))
      .structuredContent as ListServicesOutput;
    expect(traceQueries(server)).toHaveLength(0);
    expect(data.search).toEqual({ word: 'voucher', searched: 0, notSearched: 5 });
  });

  it('searches up to 30 services when Tideways sends no rate-limit headers', async () => {
    const names = Array.from({ length: 31 }, (_, i) => [`svc-${String(i + 1).padStart(2, '0')}`]);
    const pages = issuesByType({ error: issuesNaming(names) });
    server = await startTestServer({
      '/acme/shop/issues': url => ({ ...pages(url), headers: { 'x-ratelimit-reset': 'n/a' } }),
      '/acme/shop/traces': { body: { traces: [] } },
    });
    const data = (await callTool(server, 'tideways_list_services', { search: 'voucher' }))
      .structuredContent as ListServicesOutput;
    expect(traceQueries(server)).toHaveLength(30);
    expect(data.search).toEqual({ word: 'voucher', searched: 30, notSearched: 2 });
  });

  it('searches at most 30 services, the default and the most mentioned first', async () => {
    const names = Array.from({ length: 31 }, (_, i) => `svc-${String(i + 1).padStart(2, '0')}`);
    server = await startTestServer({
      '/acme/shop/issues': issuesByType({
        error: issuesNaming([...names.map(name => [name]), ['svc-31']]),
      }),
      '/acme/shop/traces': { body: { traces: [] } },
    });
    const data = (await callTool(server, 'tideways_list_services', { search: 'voucher' }))
      .structuredContent as ListServicesOutput;

    const searched = traceQueries(server).map(query => query.s);
    expect(searched).toHaveLength(30);
    expect(searched).toEqual(expect.arrayContaining(['web', 'svc-31', 'svc-28']));
    expect(searched).not.toContain('svc-29');
    expect(searched).not.toContain('svc-30');
    expect(data.search).toEqual({ word: 'voucher', searched: 30, notSearched: 2 });
    expect(data.services.filter(s => s.matchingTraces === null).map(s => s.name)).toEqual([
      'svc-29',
      'svc-30',
    ]);
  });

  it('runs several service searches at once, but at most four', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    server = await startTestServer({
      '/acme/shop/issues': issuesByType({
        error: issuesNaming([['a'], ['b'], ['c'], ['d'], ['e'], ['f'], ['g'], ['h'], ['i']]),
      }),
      '/acme/shop/traces': async () => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise(resolve => setTimeout(resolve, 5));
        inFlight--;
        return { body: { traces: [] } };
      },
    });
    await callTool(server, 'tideways_list_services', { search: 'voucher' });
    expect(traceQueries(server)).toHaveLength(10);
    expect(maxInFlight).toBeGreaterThan(1);
    expect(maxInFlight).toBeLessThanOrEqual(4);
  });
});
