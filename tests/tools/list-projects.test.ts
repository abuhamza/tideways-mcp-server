import { afterEach, describe, expect, it } from 'vitest';

import type { ListProjectsOutput } from '../../src/tools/list-projects.js';
import { performance, tokenInfo } from '../fixtures/tideways.js';
import { callTool, startTestServer, textOf, type TestServer } from '../helpers/harness.js';

describe('tideways_list_projects', () => {
  let server: TestServer | undefined;
  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it('returns projects, scopes and the default project', async () => {
    server = await startTestServer({ '/_token': { body: tokenInfo } });
    const result = await callTool(server, 'tideways_list_projects');
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({
      organization: 'acme',
      defaultProject: 'acme/shop',
      projects: [
        { name: 'acme/shop', organization: 'acme', project: 'shop', license: 'enterprise' },
        { name: 'acme/blog', organization: 'acme', project: 'blog', license: 'profiler' },
      ],
      scopes: ['metrics', 'traces', 'errors'],
      tokenExpired: false,
      rateLimit: null,
    } satisfies ListProjectsOutput);
    expect(JSON.parse(textOf(result))).toEqual(result.structuredContent);
  });

  it('reports the last seen rate limit', async () => {
    server = await startTestServer({
      '/_token': { body: tokenInfo },
      '/acme/shop/performance': { body: performance },
    });
    await callTool(server, 'tideways_get_performance');
    const result = await callTool(server, 'tideways_list_projects');
    expect((result.structuredContent as ListProjectsOutput).rateLimit).toEqual({
      limit: 5000,
      remaining: 4999,
      resetAt: '2026-09-30T13:00:00.000Z',
    });
  });

  it('counts a request refused for a missing scope against the rate limit', async () => {
    server = await startTestServer({
      '/_token': { body: tokenInfo },
      '/acme/shop/performance': {
        status: 403,
        body: {},
        headers: { 'x-ratelimit-limit': '250', 'x-ratelimit-remaining': '41' },
      },
    });
    await callTool(server, 'tideways_get_performance');
    const result = await callTool(server, 'tideways_list_projects');
    expect((result.structuredContent as ListProjectsOutput).rateLimit).toMatchObject({
      limit: 250,
      remaining: 41,
    });
  });

  it('still lists projects after the hourly rate limit is used up', async () => {
    server = await startTestServer({
      '/_token': { body: tokenInfo },
      '/acme/shop/performance': {
        body: performance,
        headers: { 'x-ratelimit-remaining': '0' },
      },
    });
    await callTool(server, 'tideways_get_performance');
    const result = await callTool(server, 'tideways_list_projects');
    expect(result.isError).toBeUndefined();
    expect((result.structuredContent as ListProjectsOutput).projects).toHaveLength(2);
  });

  it('turns an invalid token into an actionable tool error', async () => {
    server = await startTestServer({
      '/_token': { status: 401, body: { error: 'Invalid credentials.' } },
    });
    const result = await callTool(server, 'tideways_list_projects');
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('TIDEWAYS_TOKEN');
  });
});
