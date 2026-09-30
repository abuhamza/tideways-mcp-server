import { describe, expect, it } from 'vitest';

import { createLogger } from '../../src/logger.js';
import { TidewaysHttp } from '../../src/tideways/http.js';
import { ProjectResolver, splitProjectName } from '../../src/tideways/projects.js';
import { tokenInfo } from '../fixtures/tideways.js';
import { createFakeApi, type FakeRoute } from '../helpers/fake-api.js';

function resolver(
  defaults: { organization?: string; project?: string },
  tokenRoute: FakeRoute = { body: tokenInfo }
) {
  const api = createFakeApi({ '/_token': tokenRoute });
  const http = new TidewaysHttp({
    baseUrl: 'https://app.tideways.io/apps/api',
    token: 't',
    timeoutMs: 1000,
    userAgent: 'test',
    logger: createLogger('error', () => undefined),
    fetch: api.fetch,
    sleep: () => Promise.resolve(),
  });
  return {
    api,
    projects: new ProjectResolver(http, {
      organization: defaults.organization,
      project: defaults.project,
    }),
  };
}

describe('splitProjectName', () => {
  it('accepts exactly one slash with text on both sides', () => {
    expect(splitProjectName('acme/shop')).toEqual({ organization: 'acme', project: 'shop' });
    expect(splitProjectName('shop')).toBeUndefined();
    expect(splitProjectName('/shop')).toBeUndefined();
    expect(splitProjectName('acme/')).toBeUndefined();
    expect(splitProjectName('a/b/c')).toBeUndefined();
  });
});

describe('ProjectResolver', () => {
  it('uses a complete configured default without calling /_token', async () => {
    const { projects, api } = resolver({ organization: 'acme', project: 'shop' });
    await expect(projects.resolve()).resolves.toEqual({ organization: 'acme', project: 'shop' });
    const combined = resolver({ project: 'acme/shop' });
    await expect(combined.projects.resolve()).resolves.toEqual({
      organization: 'acme',
      project: 'shop',
    });
    expect(api.requests).toHaveLength(0);
    expect(combined.api.requests).toHaveLength(0);
  });

  it('derives the organization from the token when only the project is configured', async () => {
    const { projects } = resolver({ project: 'blog' });
    await expect(projects.resolve()).resolves.toEqual({ organization: 'acme', project: 'blog' });
  });

  it('validates an explicit project against the token and caches /_token', async () => {
    const { projects, api } = resolver({ organization: 'acme', project: 'shop' });
    await expect(projects.resolve('blog')).resolves.toEqual({
      organization: 'acme',
      project: 'blog',
    });
    await expect(projects.resolve('acme/shop')).resolves.toEqual({
      organization: 'acme',
      project: 'shop',
    });
    await expect(projects.resolve('nope')).rejects.toThrow(
      'Unknown project "nope". Projects available to this token: acme/shop, acme/blog.'
    );
    await expect(projects.resolve('../../_token')).rejects.toThrow(/Unknown project/);
    expect(api.requests).toHaveLength(1);
  });

  it('fetches /_token once for concurrent first callers', async () => {
    const { projects, api } = resolver({});
    await Promise.all([
      projects.resolve('shop'),
      projects.resolve('blog'),
      projects.getTokenInfo(),
    ]);
    expect(api.requests).toHaveLength(1);
  });

  it('resolves an explicit project when the default is configured as "org/project"', async () => {
    const { projects } = resolver({ project: 'acme/shop' });
    await expect(projects.resolve('blog')).resolves.toEqual({
      organization: 'acme',
      project: 'blog',
    });
  });

  it('picks the only project when nothing is configured', async () => {
    const { projects } = resolver({}, { body: { scopes: [], projects: [{ name: 'acme/only' }] } });
    await expect(projects.resolve()).resolves.toEqual({ organization: 'acme', project: 'only' });
    await expect(projects.defaultProjectName()).resolves.toBe('acme/only');
  });

  it('asks for a project when several are available', async () => {
    const { projects } = resolver({});
    await expect(projects.resolve()).rejects.toThrow(/No project selected.*acme\/shop, acme\/blog/);
    await expect(projects.defaultProjectName()).resolves.toBeNull();
  });

  it('reports ambiguous names across organizations', async () => {
    const { projects } = resolver(
      {},
      { body: { scopes: [], projects: [{ name: 'a/shop' }, { name: 'b/shop' }] } }
    );
    await expect(projects.resolve('shop')).rejects.toThrow(/ambiguous.*a\/shop, b\/shop/);
  });

  it('explains when the token has no projects', async () => {
    const { projects } = resolver({}, { body: { scopes: [], projects: [] } });
    await expect(projects.resolve('shop')).rejects.toThrow('This token cannot access any project.');
  });

  it('does not cache a failed /_token call', async () => {
    const { projects, api } = resolver({}, (_url, call) =>
      call === 1 ? { status: 401, body: { error: 'Invalid credentials.' } } : { body: tokenInfo }
    );
    await expect(projects.getTokenInfo()).rejects.toThrow(/HTTP 401/);
    await expect(projects.getTokenInfo()).resolves.toMatchObject({ scopes: tokenInfo.scopes });
    expect(api.requests).toHaveLength(2);
  });

  it('rejects an unexpected /_token shape', async () => {
    const { projects } = resolver({}, { body: { projects: 'nope' } });
    await expect(projects.getTokenInfo()).rejects.toThrow(/unexpected response shape for \/_token/);
  });
});
