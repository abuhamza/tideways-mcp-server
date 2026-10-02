import { afterEach, describe, expect, it } from 'vitest';

import { issues, observations, performance, summary, trace } from '../fixtures/tideways.js';
import { callTool, startTestServer, textOf, type TestServer } from '../helpers/harness.js';

const SERVICE_ERROR = /no service "voucher-api" in production .*default service "web"/;
const ENVIRONMENT_ERROR = /no environment "qa" and answered for "production"/;

const withCriteria = <T extends object>(body: T, key: string, criteria: object) => ({
  ...body,
  [key]: { ...(body as Record<string, object>)[key], criteria },
});

const asked = { environment: 'production', service: 'web' };

describe('scope checks: Tideways answering for another environment or service', () => {
  let server: TestServer | undefined;
  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it.each([
    ['tideways_get_performance', '/acme/shop/performance', performance, 'application'],
    [
      'tideways_get_performance_summary',
      '/acme/shop/summary',
      summary('2026-09-29 12:00', '2026-09-30 12:30'),
      'summary',
    ],
  ])('%s throws on an unknown service', async (tool, path, body, key) => {
    server = await startTestServer({ [path]: { body: withCriteria(body, key, asked) } });
    const result = await callTool(server, tool, { service: 'voucher-api' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(SERVICE_ERROR);
    expect(textOf(result)).toContain('tideways_list_issues');
  });

  it.each([
    ['tideways_get_performance', '/acme/shop/performance', performance, 'application'],
    [
      'tideways_get_performance_summary',
      '/acme/shop/summary',
      summary('2026-09-29 12:00', '2026-09-30 12:30'),
      'summary',
    ],
  ])('%s throws on an unknown environment', async (tool, path, body, key) => {
    server = await startTestServer({ [path]: { body: withCriteria(body, key, asked) } });
    const result = await callTool(server, tool, { environment: 'qa' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(ENVIRONMENT_ERROR);
    expect(textOf(result)).toContain('ask the user');
  });

  it('compares case-insensitively', async () => {
    server = await startTestServer({
      '/acme/shop/performance': { body: withCriteria(performance, 'application', asked) },
    });
    const result = await callTool(server, 'tideways_get_performance', {
      environment: 'Production',
      service: 'WEB',
    });
    expect(result.isError).toBeUndefined();
  });

  it('checks the configured defaults when no argument is given', async () => {
    server = await startTestServer(
      { '/acme/shop/performance': { body: withCriteria(performance, 'application', asked) } },
      { TIDEWAYS_SERVICE: 'voucher-api' }
    );
    const result = await callTool(server, 'tideways_get_performance');
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('no service "voucher-api" (the configured');
    expect(textOf(result)).toContain('(the configured default; pass "service" to override)');
  });

  it('says when the environment came from configuration', async () => {
    server = await startTestServer(
      { '/acme/shop/performance': { body: withCriteria(performance, 'application', asked) } },
      { TIDEWAYS_ENV: 'qa' }
    );
    const result = await callTool(server, 'tideways_get_performance');
    expect(textOf(result)).toContain('no environment "qa" (the configured default');
    expect(textOf(result)).toContain('(the configured default; pass "environment" to override)');

    const explicit = await callTool(server, 'tideways_get_performance', { environment: 'qa' });
    expect(textOf(explicit)).toMatch(ENVIRONMENT_ERROR);
    expect(textOf(explicit)).not.toContain('configured default');
  });

  it('skips a side nobody asked for', async () => {
    server = await startTestServer({
      '/acme/shop/performance': {
        body: withCriteria(performance, 'application', { environment: 'staging', service: 'api' }),
      },
    });
    const result = await callTool(server, 'tideways_get_performance');
    expect(result.isError).toBeUndefined();
  });

  it('tideways_get_observations throws on an unknown service', async () => {
    server = await startTestServer({ '/acme/shop/observations': { body: observations } });
    const result = await callTool(server, 'tideways_get_observations', {
      service: 'voucher-api',
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(SERVICE_ERROR);
  });

  it('tideways_list_issues checks the environment only', async () => {
    server = await startTestServer({ '/acme/shop/issues': { body: issues(1) } });
    const result = await callTool(server, 'tideways_list_issues', { environment: 'qa' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(ENVIRONMENT_ERROR);

    const ok = await callTool(server, 'tideways_list_issues', { environment: 'production' });
    expect(ok.isError).toBeUndefined();
  });

  it('tideways_list_issues ignores a configured default service', async () => {
    server = await startTestServer(
      { '/acme/shop/issues': { body: issues(1) } },
      { TIDEWAYS_SERVICE: 'worker' }
    );
    const result = await callTool(server, 'tideways_list_issues');
    expect(result.isError).toBeUndefined();
  });

  it('tideways_search_traces compares each trace with what was asked', async () => {
    server = await startTestServer({
      '/acme/shop/traces': {
        body: { traces: [trace({ service: 'voucher-api' }), trace()] },
      },
    });
    const result = await callTool(server, 'tideways_search_traces', { service: 'voucher-api' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/no service "voucher-api" in production .*"web"/);

    const environment = await callTool(server, 'tideways_search_traces', { environment: 'qa' });
    expect(textOf(environment)).toMatch(ENVIRONMENT_ERROR);
  });

  it('tideways_search_traces passes matching and empty results', async () => {
    server = await startTestServer({ '/acme/shop/traces': { body: { traces: [trace()] } } });
    const ok = await callTool(server, 'tideways_search_traces', {
      environment: 'production',
      service: 'web',
    });
    expect(ok.isError).toBeUndefined();
  });

  it('tideways_search_traces does not fail on empty results', async () => {
    server = await startTestServer({ '/acme/shop/traces': { body: { traces: [] } } });
    const result = await callTool(server, 'tideways_search_traces', { service: 'voucher-api' });
    expect(result.isError).toBeUndefined();
  });
});
