import { afterEach, describe, expect, it } from 'vitest';

import type { ListIssuesOutput } from '../../src/tools/issues.js';
import { issue, issues } from '../fixtures/tideways.js';
import { callTool, startTestServer, textOf, type TestServer } from '../helpers/harness.js';

describe('tideways_list_issues', () => {
  let server: TestServer | undefined;
  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it('defaults to open errors and returns a concise list', async () => {
    server = await startTestServer({ '/acme/shop/issues': { body: issues(1) } });
    const result = await callTool(server, 'tideways_list_issues');
    expect(Object.fromEntries(server.api.requests[0]?.url.searchParams ?? [])).toEqual({
      issueType: 'error',
      status: 'open',
      page: '1',
    });
    const data = result.structuredContent as ListIssuesOutput;
    expect(data.criteria).toEqual({
      environment: 'production',
      service: 'web',
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
        transactionCount: 7,
        transactions: ['T1', 'T2', 'T3', 'T4', 'T5'],
        topFrame: 'App\\Service\\Cart::load (src/Service/Cart.php:649)',
      },
    ]);
    expect(data.hasMore).toBe(false);
    expect(textOf(result)).not.toContain('session=secret');
  });

  it('passes type, status, page and environment (GitHub issue #3)', async () => {
    server = await startTestServer({
      '/acme/shop/issues': {
        body: issues(10, { environment: 'staging', status: 'resolved', page: 2 }),
      },
    });
    const result = await callTool(server, 'tideways_list_issues', {
      type: 'slowsql',
      status: 'resolved',
      page: 2,
      environment: 'staging',
    });
    expect(Object.fromEntries(server.api.requests[0]?.url.searchParams ?? [])).toEqual({
      issueType: 'slowsql',
      status: 'resolved',
      page: '2',
      env: 'staging',
    });
    const data = result.structuredContent as ListIssuesOutput;
    expect(data.criteria).toMatchObject({ environment: 'staging', status: 'resolved', page: 2 });
    expect(data.hasMore).toBe(true);
  });

  it('rejects values the API does not support', async () => {
    server = await startTestServer({ '/acme/shop/issues': { body: issues(0) } });
    expect((await callTool(server, 'tideways_list_issues', { type: 'all' })).isError).toBe(true);
    expect((await callTool(server, 'tideways_list_issues', { status: 'all' })).isError).toBe(true);
    expect((await callTool(server, 'tideways_list_issues', { page: 0 })).isError).toBe(true);
    expect(server.api.requests).toHaveLength(0);
  });

  it('truncates long messages and tolerates sparse slow-SQL items', async () => {
    const sql = `SELECT ${'x, '.repeat(400)}y FROM orders`;
    server = await startTestServer({
      '/acme/shop/issues': {
        body: {
          issues: [
            issue({
              id: 42,
              issueType: 'slowsql',
              type: null,
              exceptionType: 'SELECT orders',
              lastMessage: sql,
              originatingFunction: 'App\\Repository\\OrderRepository::find',
              lastStackTrace: [],
              occurrencesSinceLastRelease: undefined,
            }),
          ],
        },
      },
    });
    const data = (await callTool(server, 'tideways_list_issues', { type: 'slowsql' }))
      .structuredContent as ListIssuesOutput;
    const [item] = data.issues;
    expect(item).toMatchObject({
      id: '42',
      type: 'slowsql',
      title: 'SELECT orders',
      originatingFunction: 'App\\Repository\\OrderRepository::find',
      topFrame: null,
      occurrencesSinceLastRelease: null,
    });
    expect(item?.message).toHaveLength(501);
    expect(data.criteria).toMatchObject({ environment: null, status: 'open', page: 1 });
  });

  it('includes the raw payload with detail=full', async () => {
    const body = issues(1);
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
