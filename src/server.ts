import { McpServer } from '@modelcontextprotocol/server';

import pkg from '../package.json' with { type: 'json' };
import type { ToolContext } from './context.js';
import { registerGetHistoryTool } from './tools/history.js';
import { registerListIssuesTool } from './tools/issues.js';
import { registerListProjectsTool } from './tools/list-projects.js';
import { registerListServicesTool } from './tools/list-services.js';
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
  'reports -> tideways_get_history; errors, slow SQL, deprecations, PHP warnings and notices ->',
  'tideways_list_issues; individual slow requests -> tideways_search_traces; configuration and',
  'code findings -> tideways_get_observations; an app, API or worker that is not a project, or a',
  'transaction that tideways_search_traces does not find in the default service ->',
  'tideways_list_services with "search" set to one word of it.',
  'Without "service", tools read the project\'s default service (tideways_list_issues: all services);',
  'a project often has more (APIs, workers, CLI), which tideways_list_services lists.',
  'tideways_get_history cannot switch service and covers production only.',
  'When results come back, an unknown environment or service fails with an error naming the default;',
  'ask the user when no name fits.',
  'Bottleneck observations (N+1 queries, sleeps, waits) do not name the affected requests, and the',
  'API cannot filter traces by bottleneck: give the observation link, whose page in the Tideways UI',
  'lists recent affected traces. A trace whose bottlenecks include "nplus1" is a real N+1 example;',
  'do not infer N+1 queries from slow-SQL issues.',
  'The hourly API rate limit is shared by all projects of the token.',
].join(' ');

/** Build one MCP server instance. The stdio entry calls this once per connection. */
export function createServer(ctx: ToolContext): McpServer {
  const server = new McpServer(
    { name: 'tideways-mcp-server', title: 'Tideways', version: pkg.version },
    { capabilities: { tools: { listChanged: false } }, instructions: SERVER_INSTRUCTIONS }
  );
  registerListProjectsTool(server, ctx);
  registerListServicesTool(server, ctx);
  registerPerformanceTool(server, ctx);
  registerPerformanceSummaryTool(server, ctx);
  registerListIssuesTool(server, ctx);
  registerSearchTracesTool(server, ctx);
  registerGetHistoryTool(server, ctx);
  registerGetObservationsTool(server, ctx);
  return server;
}
