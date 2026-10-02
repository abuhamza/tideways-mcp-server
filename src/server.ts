import { McpServer } from '@modelcontextprotocol/server';

import pkg from '../package.json' with { type: 'json' };
import type { ToolContext } from './context.js';
import { registerGetHistoryTool } from './tools/history.js';
import { registerListIssuesTool } from './tools/issues.js';
import { registerListProjectsTool } from './tools/list-projects.js';
import { registerGetObservationsTool } from './tools/observations.js';
import { registerPerformanceSummaryTool } from './tools/performance-summary.js';
import { registerPerformanceTool } from './tools/performance.js';
import { registerSearchTracesTool } from './tools/traces.js';

export const SERVER_INSTRUCTIONS = [
  'Read-only access to Tideways, a performance monitoring service for PHP applications.',
  'All times are UTC in "YYYY-MM-DD HH:mm". Every tool except tideways_list_projects accepts an optional',
  '"project"; call tideways_list_projects when unsure which projects exist or after a scope/project error.',
  'Pick the tool by question: current health and top transactions -> tideways_get_performance;',
  '15-minute trends over up to 30 days -> tideways_get_performance_summary; a past window up to',
  '24 h (e.g. yesterday 14:00-16:00) -> tideways_get_performance with "end"; past day/week/month',
  'reports -> tideways_get_history; errors, slow SQL, deprecations -> tideways_list_issues;',
  'individual slow requests -> tideways_search_traces; configuration and code findings ->',
  'tideways_get_observations. N+1 queries, sleeps and waits are observations without affected',
  'requests; to find examples, search traces with one word of a suspected transaction or URL (no',
  'sortBy, several time windows) and check their bottlenecks for "nplus1".',
  'Without "service", tools read the project\'s default service; a project often has more (APIs,',
  'workers, CLI), and the "services" of tideways_list_issues results name them. tideways_list_issues',
  'and tideways_get_history cannot switch service, and tideways_get_history covers production only.',
  'An unknown environment or service fails with an error naming the default; ask the user when no',
  'name fits.',
  'The hourly API rate limit is shared by all projects of the token.',
].join(' ');

/** Build one MCP server instance. The stdio entry calls this once per connection. */
export function createServer(ctx: ToolContext): McpServer {
  const server = new McpServer(
    { name: 'tideways-mcp-server', title: 'Tideways', version: pkg.version },
    { capabilities: { tools: { listChanged: false } }, instructions: SERVER_INSTRUCTIONS }
  );
  registerListProjectsTool(server, ctx);
  registerPerformanceTool(server, ctx);
  registerPerformanceSummaryTool(server, ctx);
  registerListIssuesTool(server, ctx);
  registerSearchTracesTool(server, ctx);
  registerGetHistoryTool(server, ctx);
  registerGetObservationsTool(server, ctx);
  return server;
}
