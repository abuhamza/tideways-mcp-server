import { Client, InMemoryTransport } from '@modelcontextprotocol/client';

import { loadConfig } from '../../src/config.js';
import { createToolContext, type ToolContext } from '../../src/context.js';
import { createLogger } from '../../src/logger.js';
import { createServer } from '../../src/server.js';
import { createFakeApi, type FakeApi, type FakeRoute } from './fake-api.js';

/** Fixed clock for tests: 2026-09-30 12:44 UTC. */
export const TEST_NOW = new Date('2026-09-30T12:44:00Z');

export interface TestServer {
  client: Client;
  api: FakeApi;
  ctx: ToolContext;
  close: () => Promise<void>;
}

/**
 * Real MCP client <-> server over an in-memory transport, backed by a fake Tideways API.
 * Defaults to TIDEWAYS_ORG=acme and TIDEWAYS_PROJECT=shop, so no /_token call is needed.
 */
export async function startTestServer(
  routes: Record<string, FakeRoute>,
  env: Record<string, string> = {}
): Promise<TestServer> {
  const api = createFakeApi(routes);
  const config = loadConfig({
    TIDEWAYS_TOKEN: 'test-token',
    TIDEWAYS_ORG: 'acme',
    TIDEWAYS_PROJECT: 'shop',
    ...env,
  });
  const ctx = createToolContext(
    config,
    createLogger('error', () => undefined),
    { fetch: api.fetch, sleep: () => Promise.resolve(), now: () => TEST_NOW }
  );
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createServer(ctx);
  const client = new Client({ name: 'test', version: '0.0.0' });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  // Real hosts list tools first; that also turns on client-side outputSchema validation.
  await client.listTools();
  return {
    client,
    api,
    ctx,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

export interface ToolCallResult {
  isError?: boolean;
  structuredContent?: unknown;
  content: { type: string; text?: string }[];
}

export async function callTool(
  server: TestServer,
  name: string,
  args: Record<string, unknown> = {}
): Promise<ToolCallResult> {
  return await server.client.callTool({ name, arguments: args });
}

/** Text of the first content block, for asserting on error messages. */
export function textOf(result: ToolCallResult): string {
  return result.content[0]?.text ?? '';
}
