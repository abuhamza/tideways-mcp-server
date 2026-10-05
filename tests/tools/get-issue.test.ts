import { afterEach, describe, expect, it } from 'vitest';

import type { GetIssueOutput } from '../../src/tools/get-issue.js';
import { issueDetail, stackFrame, tokenInfo } from '../fixtures/tideways.js';
import { callTool, startTestServer, textOf, type TestServer } from '../helpers/harness.js';

const V2 = 'application/vnd.tideways.issues.v2+json';

describe('tideways_get_issue', () => {
  let server: TestServer | undefined;
  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it('returns the stack, histogram, transactions and request context of one issue', async () => {
    server = await startTestServer({ '/acme/shop/issues/issue-1': { body: issueDetail() } });
    const result = await callTool(server, 'tideways_get_issue', { issueId: 'issue-1' });
    const request = server.api.requests[0];
    expect(request?.headers.get('accept')).toBe(V2);
    expect(Object.fromEntries(request?.url.searchParams ?? [])).toEqual({ issueType: 'error' });
    expect(result.structuredContent as GetIssueOutput).toEqual({
      project: 'acme/shop',
      id: 'issue-1',
      type: 'error',
      title: 'PDOException',
      message: 'SQLSTATE[HY000]: example failure',
      source: 'src/Service/Cart.php:649',
      status: 'open',
      occurrences: 17000,
      occurrencesSinceLastRelease: 2147,
      firstOccurred: '2026-09-01 19:13',
      lastOccurred: '2026-09-30 12:43',
      lastReopened: '2026-09-20 08:15',
      environments: ['production'],
      services: ['web', 'worker'],
      durationMs: null,
      transactions: [
        { name: 'App\\Controller\\CartController::show', count: 1200 },
        { name: 'App\\Controller\\CheckoutController::pay', count: 35 },
      ],
      occurrenceHistogram: {
        retentionDays: 30,
        total: 17000,
        buckets: [
          { start: '2026-09-30 10:00', end: '2026-09-30 11:00', count: 4 },
          { start: '2026-09-30 11:00', end: '2026-09-30 12:00', count: 0 },
        ],
      },
      latestOccurrence: {
        time: '2026-09-30 12:43',
        message: 'SQLSTATE[HY000]: example failure',
        type: 'PDOException',
        code: 'HY000',
        service: 'web',
        environment: 'production',
        transaction: 'App\\Controller\\CartController::show',
        stack: [
          {
            file: 'src/Service/Cart1.php',
            line: 101,
            function: 'App\\Service\\Cart1::load',
            previousException: false,
          },
          {
            file: 'src/Service/Cart2.php',
            line: 102,
            function: 'App\\Service\\Cart2::load',
            previousException: false,
          },
        ],
        stackTruncated: false,
        annotations: {
          correlationId: 'c0ffee00-0000-4000-8000-000000000001',
          'http.host': 'shop.example.test',
          'http.method': 'GET',
          'http.status': '500',
          'http.url': 'https://shop.example.test/cart',
          'server.host': 'web-1.example.test',
        },
      },
    });
    expect(textOf(result)).not.toContain('session=secret');
  });

  it('keeps the first 15 stack frames and flags the cut', async () => {
    const detail = issueDetail();
    const withStack = (frames: number) => ({
      body: {
        issue: {
          ...detail.issue,
          latestOccurrence: {
            ...detail.issue.latestOccurrence,
            stackTrace: Array.from({ length: frames }, (_, i) => stackFrame(i + 1)),
          },
        },
      },
    });
    server = await startTestServer({
      '/acme/shop/issues/long': withStack(16),
      '/acme/shop/issues/exact': withStack(15),
    });
    const long = (await callTool(server, 'tideways_get_issue', { issueId: 'long' }))
      .structuredContent as GetIssueOutput;
    const exact = (await callTool(server, 'tideways_get_issue', { issueId: 'exact' }))
      .structuredContent as GetIssueOutput;
    expect(long.latestOccurrence?.stack).toHaveLength(15);
    expect(long.latestOccurrence?.stack.at(-1)?.file).toBe('src/Service/Cart15.php');
    expect(long.latestOccurrence?.stackTruncated).toBe(true);
    expect(exact.latestOccurrence?.stack).toHaveLength(15);
    expect(exact.latestOccurrence?.stackTruncated).toBe(false);
  });

  it('reads an issue without occurrence details', async () => {
    server = await startTestServer({
      '/acme/shop/issues/bare': {
        body: issueDetail({
          lastReopened: null,
          transactions: undefined,
          occurrenceDistribution: [],
          latestOccurrence: null,
        }),
      },
    });
    const data = (await callTool(server, 'tideways_get_issue', { issueId: 'bare' }))
      .structuredContent as GetIssueOutput;
    expect(data).toMatchObject({
      lastReopened: null,
      transactions: [],
      occurrenceHistogram: null,
      latestOccurrence: null,
    });
  });

  it('normalizes timestamps, codes and frames of other shapes', async () => {
    const detail = issueDetail();
    server = await startTestServer({
      '/acme/shop/issues/odd': {
        body: issueDetail({
          transactions: [{ name: null, count: 3 }],
          occurrenceDistribution: {
            retentionDays: 14,
            totalOccurrences: 3,
            buckets: [{ start: 1790762400, end: '2026-09-30T13:00:00+02:00', count: 3 }],
          },
          latestOccurrence: {
            ...detail.issue.latestOccurrence,
            time: '2026-09-30T12:43:50.123Z',
            code: 0,
            stackTrace: [
              { file: null, line: null, function: '{main}', previousException: 'LogicException' },
              { file: 'a.php', line: 1, function: 'f', previousException: { class: 'E' } },
              { file: 'b.php', line: 2, function: 'g' },
            ],
            annotations: [],
          },
        }),
      },
    });
    const data = (await callTool(server, 'tideways_get_issue', { issueId: 'odd' }))
      .structuredContent as GetIssueOutput;
    expect(data.transactions).toEqual([{ name: '(unnamed)', count: 3 }]);
    expect(data.occurrenceHistogram?.buckets).toEqual([
      { start: '2026-09-30 10:00', end: '2026-09-30 11:00', count: 3 },
    ]);
    expect(data.latestOccurrence).toMatchObject({
      time: '2026-09-30 12:43',
      code: '0',
      stack: [
        { file: null, line: null, function: '{main}', previousException: 'LogicException' },
        { file: 'a.php', line: 1, function: 'f', previousException: { class: 'E' } },
        { file: 'b.php', line: 2, function: 'g', previousException: null },
      ],
      annotations: {},
    });
  });

  it('includes the raw payload with detail=full', async () => {
    const body = issueDetail();
    server = await startTestServer({ '/acme/shop/issues/issue-1': { body } });
    const data = (
      await callTool(server, 'tideways_get_issue', { issueId: 'issue-1', detail: 'full' })
    ).structuredContent as GetIssueOutput;
    expect(data.raw).toEqual(body);
  });

  it('sends the type as the list does and encodes the ID as one path segment', async () => {
    server = await startTestServer(
      {
        '/_token': { body: tokenInfo },
        '/acme/blog/issues/a%2Fb': { body: issueDetail({ issueType: 'non-fatals' }) },
      },
      { TIDEWAYS_PROJECT: '' }
    );
    const result = await callTool(server, 'tideways_get_issue', {
      project: 'blog',
      issueId: 'a/b',
      type: 'warning',
    });
    expect(result.isError).toBeUndefined();
    const request = server.api.requests.at(-1);
    expect(Object.fromEntries(request?.url.searchParams ?? [])).toEqual({
      issueType: 'non-fatals',
      level: 'warning',
    });
    expect(result.structuredContent as GetIssueOutput).toMatchObject({
      project: 'acme/blog',
      type: 'warning',
    });
  });

  it('fails for a project the token cannot reach, before asking for the issue', async () => {
    server = await startTestServer({ '/_token': { body: tokenInfo } });
    const result = await callTool(server, 'tideways_get_issue', {
      project: 'acme/unknown',
      issueId: 'issue-1',
    });
    expect(result.isError).toBe(true);
    expect(server.api.requests.map(request => request.url.pathname)).toEqual(['/apps/api/_token']);
  });

  it('says where to take the ID and type from when Tideways finds no such issue', async () => {
    server = await startTestServer({
      '/acme/shop/issues/missing': { status: 404, body: { status: 404, msg: '' } },
      '/acme/shop/issues/other-type': { body: { issue: null } },
    });
    for (const issueId of ['missing', 'other-type']) {
      const result = await callTool(server, 'tideways_get_issue', { issueId, type: 'slowsql' });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain(`no slowsql issue "${issueId}" in acme/shop`);
      expect(textOf(result)).toContain('tideways_list_issues');
    }
  });
});
