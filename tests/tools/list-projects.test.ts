import { afterEach, describe, expect, it } from 'vitest';

import type { ListProjectsOutput } from '../../src/tools/list-projects.js';
import { tokenInfo } from '../fixtures/tideways.js';
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

  it('turns an invalid token into an actionable tool error', async () => {
    server = await startTestServer({
      '/_token': { status: 401, body: { error: 'Invalid credentials.' } },
    });
    const result = await callTool(server, 'tideways_list_projects');
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('TIDEWAYS_TOKEN');
  });
});
