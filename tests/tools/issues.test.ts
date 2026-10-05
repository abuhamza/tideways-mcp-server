import { afterEach, describe, expect, it } from 'vitest';

import type { ListIssuesOutput } from '../../src/tools/issues.js';
import { issue, issues } from '../fixtures/tideways.js';
import { callTool, startTestServer, textOf, type TestServer } from '../helpers/harness.js';

const V2 = 'application/vnd.tideways.issues.v2+json';

const queryOf = (server: TestServer, index = 0) =>
  Object.fromEntries(server.api.requests[index]?.url.searchParams ?? []);

describe('tideways_list_issues', () => {
  let server: TestServer | undefined;
  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it('defaults to open errors of all services and returns a concise list', async () => {
    server = await startTestServer({
      '/acme/shop/issues': { body: issues(1, { service: '__all' }) },
    });
    const result = await callTool(server, 'tideways_list_issues');
    expect(server.api.requests[0]?.headers.get('accept')).toBe(V2);
    expect(queryOf(server)).toEqual({
      issueType: 'error',
      status: 'open',
      page: '1',
      s: '__all',
    });
    const data = result.structuredContent as ListIssuesOutput;
    expect(data.criteria).toEqual({
      environment: 'production',
      service: null,
      type: 'error',
      status: 'open',
      page: 1,
    });
    expect(data.issues).toEqual([
      {
        id: 'issue-1',
        type: 'error',
        title: 'PDOException',
        message: 'SQLSTATE[HY000]: example failure',
        source: 'src/Service/Cart.php:649',
        originatingFunction: null,
        status: 'open',
        occurrences: 17000,
        occurrencesSinceLastRelease: 2147,
        firstOccurred: '2026-09-01 19:13:19',
        lastOccurred: '2026-09-30 12:43:50',
        environments: ['production'],
        services: ['web', 'worker'],
        durationMs: null,
        transactionCount: null,
        transactions: null,
        topFrame: null,
      },
    ]);
    expect(data).toMatchObject({ hasMore: false, totalItems: 1, totalPages: 1 });
    expect(textOf(result)).not.toContain('session=secret');
  });

  it('reads the service from the argument, else the configured service', async () => {
    const echo = (url: URL) => ({
      body: issues(1, { service: url.searchParams.get('s') }),
    });
    server = await startTestServer({ '/acme/shop/issues': echo }, { TIDEWAYS_SERVICE: 'api' });
    const configured = await callTool(server, 'tideways_list_issues');
    const passed = await callTool(server, 'tideways_list_issues', { service: 'worker' });
    expect(queryOf(server, 0).s).toBe('api');
    expect(queryOf(server, 1).s).toBe('worker');
    expect((configured.structuredContent as ListIssuesOutput).criteria.service).toBe('api');
    expect((passed.structuredContent as ListIssuesOutput).criteria.service).toBe('worker');
  });

  it('fails when Tideways answers for another service than the one asked', async () => {
    server = await startTestServer({ '/acme/shop/issues': { body: issues(1) } });
    const result = await callTool(server, 'tideways_list_issues', { service: 'voucher-api' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('no service "voucher-api"');
    expect(textOf(result)).toContain('tideways_list_services');
  });

  it('sends warnings and notices as levels of non-fatal issues', async () => {
    server = await startTestServer({
      '/acme/shop/issues': {
        body: { ...issues(0, { service: '__all' }), issues: [issue({ issueType: 'non-fatals' })] },
      },
    });
    for (const type of ['warning', 'notice', 'deprecated', 'slowsql']) {
      const data = (await callTool(server, 'tideways_list_issues', { type }))
        .structuredContent as ListIssuesOutput;
      expect(data.criteria.type).toBe(type);
      expect(data.issues[0]?.type).toBe(type);
    }
    const sent = server.api.requests.map(request => ({
      issueType: request.url.searchParams.get('issueType'),
      level: request.url.searchParams.get('level'),
    }));
    expect(sent).toEqual([
      { issueType: 'non-fatals', level: 'warning' },
      { issueType: 'non-fatals', level: 'notice' },
      { issueType: 'deprecated', level: null },
      { issueType: 'slowsql', level: null },
    ]);
  });

  it('passes status "all", page and environment', async () => {
    server = await startTestServer({
      '/acme/shop/issues': {
        body: issues(10, { environment: 'staging', status: 'all' }, { page: 2, totalPages: 2 }),
      },
    });
    const result = await callTool(server, 'tideways_list_issues', {
      status: 'all',
      page: 2,
      environment: 'staging',
    });
    expect(queryOf(server)).toMatchObject({ status: 'all', page: '2', env: 'staging' });
    const data = result.structuredContent as ListIssuesOutput;
    expect(data.criteria).toMatchObject({ environment: 'staging', status: 'all', page: 2 });
  });

  it('filters by transaction IDs with one parameter per ID', async () => {
    server = await startTestServer({
      '/acme/shop/issues': { body: issues(2, { service: '__all', transactionName: 'checkout' }) },
    });
    const result = await callTool(server, 'tideways_list_issues', { transactionIds: [101, 202] });
    expect(result.isError).toBeUndefined();
    expect(server.api.requests[0]?.url.searchParams.getAll('transactionIds[]')).toEqual([
      '101',
      '202',
    ]);
  });

  it('reports totals and whether later pages exist', async () => {
    const page = (current: number) =>
      issues(10, { service: '__all' }, { page: current, totalPages: 3, totalItems: 27 });
    server = await startTestServer({
      '/acme/shop/issues': url => ({ body: page(Number(url.searchParams.get('page'))) }),
    });
    const second = (await callTool(server, 'tideways_list_issues', { page: 2 }))
      .structuredContent as ListIssuesOutput;
    const last = (await callTool(server, 'tideways_list_issues', { page: 3 }))
      .structuredContent as ListIssuesOutput;
    expect(second).toMatchObject({ hasMore: true, totalItems: 27, totalPages: 3 });
    expect(last).toMatchObject({ hasMore: false, totalItems: 27, totalPages: 3 });
  });

  it('fails on a response without the v2 pagination', async () => {
    const body: Partial<ReturnType<typeof issues>> = issues(10, { service: '__all' });
    delete body.pagination;
    server = await startTestServer({ '/acme/shop/issues': { body } });
    const result = await callTool(server, 'tideways_list_issues');
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('unexpected response shape for issues (pagination');
  });

  it('gives slow SQL queries their duration and truncates long SQL', async () => {
    const sql = `SELECT ${'x, '.repeat(400)}y FROM orders`;
    server = await startTestServer({
      '/acme/shop/issues': {
        body: {
          ...issues(0, { service: '__all' }),
          issues: [
            issue({
              id: 42,
              issueType: 'slowsql',
              type: null,
              exceptionType: 'SELECT orders',
              message: sql,
              occurrencesSinceLastRelease: undefined,
              annotations: { duration: '18401234' },
            }),
            issue({ id: 43, issueType: 'slowsql', annotations: [] }),
            issue({ id: 44, issueType: 'slowsql', annotations: { duration: 'n/a' } }),
          ],
        },
      },
    });
    const data = (await callTool(server, 'tideways_list_issues', { type: 'slowsql' }))
      .structuredContent as ListIssuesOutput;
    const [first, second, third] = data.issues;
    expect(first).toMatchObject({
      id: '42',
      type: 'slowsql',
      title: 'SELECT orders',
      durationMs: 18.4,
      occurrencesSinceLastRelease: null,
    });
    expect(first?.message).toHaveLength(501);
    expect(second?.durationMs).toBeNull();
    expect(third?.durationMs).toBeNull();
  });

  it('rejects values the API does not support', async () => {
    server = await startTestServer({ '/acme/shop/issues': { body: issues(0) } });
    for (const args of [
      { type: 'all' },
      { status: 'everything' },
      { page: 0 },
      { transactionIds: [] },
      { transactionIds: [1.5] },
      { transactionIds: ['checkout'] },
    ]) {
      expect((await callTool(server, 'tideways_list_issues', args)).isError).toBe(true);
    }
    expect(server.api.requests).toHaveLength(0);
  });

  it('includes the raw payload with detail=full', async () => {
    const body = issues(1, { service: '__all' });
    server = await startTestServer({ '/acme/shop/issues': { body } });
    const data = (await callTool(server, 'tideways_list_issues', { detail: 'full' }))
      .structuredContent as ListIssuesOutput;
    expect(data.raw).toEqual(body);
  });

  it('surfaces the API validation message', async () => {
    server = await startTestServer({
      '/acme/shop/issues': { status: 400, body: 'Validation Error, unknown parameter issueType=x' },
    });
    const result = await callTool(server, 'tideways_list_issues');
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('unknown parameter issueType=x');
  });
});
