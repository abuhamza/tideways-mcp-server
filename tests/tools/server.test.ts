import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it } from 'vitest';

import pkg from '../../package.json' with { type: 'json' };
import { loadConfig } from '../../src/config.js';
import { createToolContext } from '../../src/context.js';
import { createLogger } from '../../src/logger.js';
import { createServer, SERVER_INSTRUCTIONS } from '../../src/server.js';
import { createFakeApi } from '../helpers/fake-api.js';
import { callTool, startTestServer, textOf, type TestServer } from '../helpers/harness.js';

const TOOL_NAMES = [
  'tideways_list_projects',
  'tideways_list_services',
  'tideways_get_performance',
  'tideways_get_performance_summary',
  'tideways_list_issues',
  'tideways_search_traces',
  'tideways_get_history',
  'tideways_get_observations',
];

describe('MCP server surface (2025 protocol, in-memory)', () => {
  let server: TestServer | undefined;
  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it('identifies itself and gives usage instructions', async () => {
    server = await startTestServer({});
    expect(server.client.getServerVersion()).toEqual({
      name: 'tideways-mcp-server',
      title: 'Tideways',
      version: pkg.version,
    });
    const instructions = server.client.getInstructions();
    expect(instructions).toBe(SERVER_INSTRUCTIONS);
    expect(instructions).toBeTypeOf('string');
    for (const name of TOOL_NAMES) expect(instructions).toContain(name);
    expect(instructions).toContain('UTC');
    expect(server.client.getServerCapabilities()).toEqual({ tools: { listChanged: false } });
  });

  it('lists exactly the eight read-only tools with output schemas', async () => {
    server = await startTestServer({});
    const { tools } = await server.client.listTools();
    expect(tools.map(t => t.name)).toEqual(TOOL_NAMES);
    for (const tool of tools) {
      expect(tool.title).toBeTruthy();
      expect(tool.description?.length).toBeGreaterThan(40);
      expect(tool.annotations).toEqual({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      });
      expect(tool.outputSchema?.type).toBe('object');
    }
  });

  it('tells the model how to find services, N+1 examples and past windows', async () => {
    server = await startTestServer({});
    const instructions = server.client.getInstructions() ?? '';
    expect(instructions).toContain('default service');
    expect(instructions).toContain('cannot switch service');
    expect(instructions).toContain('tideways_list_issues: all services');
    expect(instructions).toContain('PHP warnings and notices');
    expect(instructions).toContain('production only');
    expect(instructions).toContain('an unknown environment or service fails with an error');
    expect(instructions).toContain('tideways_list_services with "search"');
    expect(instructions).toContain(
      'traces of one transaction -> its id from tideways_get_performance, then ' +
        'tideways_search_traces with "transactionIds"'
    );
    expect(instructions).toContain('cannot filter traces by bottleneck');
    expect(instructions).toContain('do not infer N+1 queries from slow-SQL issues');
    expect(instructions).not.toContain('several time windows');
    expect(instructions).toContain('yesterday 14:00-16:00');
    expect(instructions).not.toContain('When something is not found');
    expect(instructions).toContain(
      'The hourly API rate limit depends on the Tideways plan and is shared by all tokens and ' +
        'projects of the organization.'
    );
    expect(instructions).not.toContain('of the token');

    const { tools } = await server.client.listTools();
    const byName = new Map(tools.map(t => [t.name, t]));
    const describedProperty = (
      tool: string,
      schema: 'inputSchema' | 'outputSchema',
      key: string
    ) => {
      const properties = byName.get(tool)?.[schema]?.properties as
        Record<string, { description?: string }> | undefined;
      return properties?.[key]?.description ?? '';
    };

    for (const tool of tools.filter(t => 'service' in (t.inputSchema.properties ?? {}))) {
      expect(describedProperty(tool.name, 'inputSchema', 'service'), tool.name).toContain(
        'tideways_list_services'
      );
    }
    const search = describedProperty('tideways_search_traces', 'inputSchema', 'search');
    expect(search).toContain('One whole word');
    expect(search).toContain('widen');
    expect(describedProperty('tideways_search_traces', 'inputSchema', 'from')).toContain(
      'needs "to"'
    );
    const transactionIds = describedProperty(
      'tideways_search_traces',
      'inputSchema',
      'transactionIds'
    );
    expect(transactionIds).toContain('tideways_get_performance');
    expect(transactionIds).toContain('from/to window');
    expect(byName.get('tideways_search_traces')?.description).not.toContain('transaction,');
    const traceItem = (
      byName.get('tideways_search_traces')?.outputSchema?.properties as Record<
        string,
        { items?: { properties?: Record<string, { description?: string }> } }
      >
    ).traces?.items?.properties;
    expect(traceItem?.bottlenecks?.description).toContain('nplus1');
    expect(traceItem?.bottlenecks?.description).toContain('no filter');
    expect(traceItem?.bottlenecks?.description).not.toContain('several windows');
    const observations = byName.get('tideways_get_observations')?.description ?? '';
    expect(observations).toContain('cannot filter traces by bottleneck');
    expect(observations).toContain('lists recent affected traces');
    expect(observations).not.toContain('several time windows');
  });

  it('explains scope limits, partial periods and units in the tool metadata', async () => {
    server = await startTestServer({});
    const { tools } = await server.client.listTools();
    const byName = new Map(tools.map(t => [t.name, t]));
    type Props = Record<string, { description?: string }>;
    const prop = (tool: string, schema: 'inputSchema' | 'outputSchema', key: string): string =>
      (byName.get(tool)?.[schema]?.properties as Props | undefined)?.[key]?.description ?? '';
    const nested = (tool: string, path: string[]): string => {
      let node: unknown = byName.get(tool)?.outputSchema;
      for (const key of path) {
        const n = node as { properties?: Record<string, unknown>; items?: unknown };
        node = key === '[]' ? n.items : n.properties?.[key];
      }
      return (node as { description?: string }).description ?? '';
    };

    const history = byName.get('tideways_get_history')?.description ?? '';
    expect(history).toContain("production and the project's default service only");
    expect(history).toContain('tideways_get_performance with end and minutes=1440');
    expect(history).toContain('pendingBuckets > 0');
    expect(prop('tideways_get_history', 'outputSchema', 'pendingBuckets')).toContain(
      'report totals cover only part of the period'
    );
    expect(prop('tideways_get_history', 'outputSchema', 'transactionCount')).toContain('top 20');
    expect(prop('tideways_get_history', 'outputSchema', 'timeline')).toContain('can be partial');
    expect(nested('tideways_get_history', ['transactions', '[]', 'memoryMax'])).toContain('KB');

    const issues = byName.get('tideways_list_issues')?.description ?? '';
    expect(issues).toContain('Reads all services');
    expect(issues).toContain('There is no time filter');
    expect(nested('tideways_list_issues', ['issues', '[]', 'occurrences'])).toContain(
      'not limited to any period'
    );
    expect(nested('tideways_list_issues', ['issues', '[]', 'transactions'])).toContain(
      '"transactionIds"'
    );
    expect(prop('tideways_list_issues', 'inputSchema', 'transactionIds')).toContain(
      'tideways_get_performance'
    );
    expect(nested('tideways_get_performance', ['transactions', '[]', 'id'])).toContain(
      'transactionIds'
    );
    expect(nested('tideways_get_performance', ['transactions', '[]', 'id'])).toContain(
      'tideways_search_traces'
    );
    expect(prop('tideways_list_issues', 'inputSchema', 'status')).toContain('triaged');
    expect(prop('tideways_list_issues', 'inputSchema', 'status')).toContain(
      'all = open and ignored'
    );
    expect(prop('tideways_list_issues', 'inputSchema', 'status')).toContain(
      '"new" currently returns the same list as "open"'
    );

    expect(byName.get('tideways_get_performance')?.description).toContain('Older windows');
    expect(nested('tideways_get_performance', ['totals', 'downstreamAverageMs'])).toContain(
      'autoloading'
    );
    expect(nested('tideways_get_performance', ['transactions', '[]', 'memory'])).toContain('KB');
    expect(prop('tideways_list_projects', 'outputSchema', 'rateLimit')).toContain(
      'null until another tool'
    );
    expect(prop('tideways_list_projects', 'outputSchema', 'rateLimit')).toContain(
      'shared by all tokens and projects of the organization'
    );
    expect(byName.get('tideways_list_projects')?.description).toContain(
      "the organization's hourly rate limit"
    );
    expect(prop('tideways_get_performance', 'inputSchema', 'project')).toContain('defaultProject');
    expect(prop('tideways_get_performance', 'inputSchema', 'environment')).toContain(
      'criteria.environment'
    );
  });

  it('lets hosts accept large results only on tools with a detail parameter', async () => {
    server = await startTestServer({});
    const { tools } = await server.client.listTools();
    for (const tool of tools) {
      const hasDetail = 'detail' in (tool.inputSchema.properties ?? {});
      expect(tool._meta?.['anthropic/maxResultSizeChars'], tool.name).toBe(
        hasDetail ? 300_000 : undefined
      );
    }
  });

  it('rejects unknown tools with a protocol error', async () => {
    server = await startTestServer({});
    await expect(
      server.client.callTool({ name: 'get_traces', arguments: {} })
    ).rejects.toMatchObject({
      code: -32602,
    });
  });
});

describe('MCP server surface (2026-07-28 protocol)', () => {
  it('serves the modern protocol era too', async () => {
    const api = createFakeApi({});
    const ctx = createToolContext(
      loadConfig({ TIDEWAYS_TOKEN: 't', TIDEWAYS_ORG: 'acme', TIDEWAYS_PROJECT: 'shop' }),
      createLogger('error', () => undefined),
      { fetch: api.fetch }
    );
    const handler = createMcpHandler(() => createServer(ctx));
    const transport = new StreamableHTTPClientTransport(new URL('http://test.local/mcp'), {
      fetch: (url, init) => handler.fetch(new Request(url, init)),
    });
    const client = new Client(
      { name: 'test', version: '0.0.0' },
      { versionNegotiation: { mode: { pin: '2026-07-28' } } }
    );
    await client.connect(transport);
    try {
      expect(client.getProtocolEra()).toBe('modern');
      const { tools } = await client.listTools();
      expect(tools.map(t => t.name)).toEqual(TOOL_NAMES);
    } finally {
      await client.close();
      await handler.close();
    }
  });
});

describe('strict inputs', () => {
  let server: TestServer | undefined;
  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it('advertises additionalProperties: false on every input schema', async () => {
    server = await startTestServer({});
    const { tools } = await server.client.listTools();
    for (const tool of tools) {
      expect(tool.inputSchema.additionalProperties, tool.name).toBe(false);
    }
  });

  it.each([
    ['tideways_list_projects', 'service'],
    ['tideways_list_issues', 'bogus'],
    ['tideways_list_services', 'service'],
    ['tideways_get_history', 'environment'],
    ['tideways_get_performance', 'bogus'],
    ['tideways_get_observations', 'bogus'],
    ['tideways_search_traces', 'bogus'],
  ])('%s rejects the unknown argument "%s" by name', async (tool, key) => {
    server = await startTestServer({});
    const args = tool === 'tideways_get_history' ? { date: '2026-09-29' } : {};
    const result = await callTool(server, tool, { ...args, [key]: 'x' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain(key);
    expect(server.api.requests).toHaveLength(0);
  });
});
