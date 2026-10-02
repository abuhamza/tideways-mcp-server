import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it } from 'vitest';

import pkg from '../../package.json' with { type: 'json' };
import { loadConfig } from '../../src/config.js';
import { createToolContext } from '../../src/context.js';
import { createLogger } from '../../src/logger.js';
import { createServer, SERVER_INSTRUCTIONS } from '../../src/server.js';
import { createFakeApi } from '../helpers/fake-api.js';
import { startTestServer, type TestServer } from '../helpers/harness.js';

const TOOL_NAMES = [
  'tideways_list_projects',
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

  it('lists exactly the seven read-only tools with output schemas', async () => {
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

  it('tells the model how to find services, N+1 traces and transaction names', async () => {
    server = await startTestServer({});
    const instructions = server.client.getInstructions() ?? '';
    expect(instructions).toContain('default service');
    expect(instructions).toContain('N+1');

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
        'tideways_list_issues'
      );
    }
    expect(describedProperty('tideways_search_traces', 'inputSchema', 'transaction')).toContain(
      'search'
    );
    const traceItem = (
      byName.get('tideways_search_traces')?.outputSchema?.properties as Record<
        string,
        { items?: { properties?: Record<string, { description?: string }> } }
      >
    ).traces?.items?.properties;
    expect(traceItem?.bottlenecks?.description).toContain('nplus1');
    expect(byName.get('tideways_get_observations')?.description).toContain(
      'tideways_search_traces'
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
