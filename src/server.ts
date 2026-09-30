import { McpServer } from '@modelcontextprotocol/server';

import pkg from '../package.json' with { type: 'json' };
import type { ToolContext } from './context.js';
import { registerListProjectsTool } from './tools/list-projects.js';
import { registerPerformanceSummaryTool } from './tools/performance-summary.js';
import { registerPerformanceTool } from './tools/performance.js';

/** Build one MCP server instance. The stdio entry calls this once per connection. */
export function createServer(ctx: ToolContext): McpServer {
  const server = new McpServer(
    { name: 'tideways-mcp-server', title: 'Tideways', version: pkg.version },
    { capabilities: { tools: { listChanged: false } } }
  );
  registerListProjectsTool(server, ctx);
  registerPerformanceTool(server, ctx);
  registerPerformanceSummaryTool(server, ctx);
  return server;
}
