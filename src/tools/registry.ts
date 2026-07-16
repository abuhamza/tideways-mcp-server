import { TidewaysClient } from '../lib/tideways-client.js';
import { handleGetPerformanceMetrics } from './handlers/performance-handler.js';
import { handleGetPerformanceSummary } from './handlers/performance-summary-handler.js';
import { handleGetIssues } from './handlers/issues-handler.js';
import { handleGetTraces } from './handlers/traces-handler.js';
import { handleGetHistoricalData } from './handlers/historical-handler.js';
import { handleGetTokenCapabilities } from './handlers/token-capabilities-handler.js';
import { handleGetObservations } from './handlers/observations-handler.js';
import {
  GetPerformanceMetricsParams,
  GetPerformanceSummaryParams,
  GetIssuesParams,
  GetTracesParams,
  GetHistoricalDataParams,
  GetObservationsParams,
} from '../types/index.js';

type ToolHandler = (client: TidewaysClient, params: any) => Promise<string>;
const TOOL_HANDLERS: Record<string, ToolHandler> = {
  get_token_capabilities: (client: TidewaysClient) =>
    handleGetTokenCapabilities(client),

  get_performance_metrics: (client: TidewaysClient, params: GetPerformanceMetricsParams) =>
    handleGetPerformanceMetrics(client, params),
  
  get_performance_summary: (client: TidewaysClient, params: GetPerformanceSummaryParams) =>
    handleGetPerformanceSummary(client, params),
  
  get_issues: (client: TidewaysClient, params: GetIssuesParams) =>
    handleGetIssues(client, params),

  get_observations: (client: TidewaysClient, params: GetObservationsParams) =>
    handleGetObservations(client, params),
  
  get_traces: (client: TidewaysClient, params: GetTracesParams) =>
    handleGetTraces(client, params),
  
  get_historical_data: (client: TidewaysClient, params: GetHistoricalDataParams) =>
    handleGetHistoricalData(client, params),
};

export async function executeTool(
  toolName: string,
  params: any,
  client: TidewaysClient
): Promise<string> {
  const handler = TOOL_HANDLERS[toolName];
  
  if (!handler) {
    throw new Error(`Unknown tool: ${toolName}`);
  }
  
  return handler(client, params);
}
