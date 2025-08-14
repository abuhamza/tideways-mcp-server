import { Tool } from '@modelcontextprotocol/sdk/types.js';
export const TRACE_CONFIG = {
  MAX_DATE_RANGE_DAYS: 90,
} as const;

export function getToolDefinitions(): Tool[] {
  return [
    {
      name: 'get_performance_metrics',
      description:
        'Retrieve aggregate performance metrics and system-wide statistics in JSON format. Use for monitoring overall application health, trends, and high-level performance overview (use get_traces for detailed individual request analysis).',
      inputSchema: {
        type: 'object',
        properties: {
          ts: {
            type: 'string',
            description: 'End timestamp in Y-m-d H:i format (e.g., "2025-08-12 18:30"). Specifies the end time of the last minute to include in the query.',
          },
          m: {
            type: 'number',
            description: 'Number of minutes backward from timestamp to retrieve data (e.g., 60 for 1 hour, 1440 for 24 hours).',
            minimum: 1,
          },
          env: {
            type: 'string',
            description: 'Filter by specific environment (production, staging, etc.)',
          },
          s: {
            type: 'string',
            description: 'Filter by specific service name',
          },
        },
        required: [],
      },
    },
    {
      name: 'get_performance_summary',
      description:
        'Retrieve time-series performance summary data in 15-minute intervals in JSON format for trend analysis and historical comparison. Returns data aggregated in 15-minute time buckets showing requests, errors, and 95th percentile response times.',
      inputSchema: {
        type: 'object',
        properties: {
          s: {
            type: 'string',
            description: 'Service name to filter by (e.g., "web", "api", "worker"). Default: "web"',
          },
        },
        required: [],
      },
    },
    {
      name: 'get_issues',
      description: 'Retrieve and analyze recent errors, exceptions, and performance issues in JSON format for actionable insights',
      inputSchema: {
        type: 'object',
        properties: {
          issue_type: {
            type: 'string',
            enum: ['error', 'slowsql', 'deprecated', 'all'],
            default: 'all',
            description: 'Type of issues to retrieve (fixed enum values to match API)',
          },
          status: {
            type: 'string',
            enum: ['open', 'new', 'resolved', 'not_error', 'ignored', 'all'],
            default: 'open',
            description: 'Issue status filter (updated to match API statuses)',
          },
          page: {
            type: 'number',
            minimum: 1,
            default: 1,
            description: 'Page number for pagination (replaces limit)',
          },
        },
        required: [],
      },
    },
    {
      name: 'get_historical_data',
      description: 'Retrieve historical performance data in JSON format for a specific date with configurable granularity. Analyze daily, weekly, or monthly performance trends, transaction reports, and time-series metrics.',
      inputSchema: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            pattern: '^\\d{4}-\\d{2}-\\d{2}$',
            description: 'Date in YYYY-MM-DD format for the historical data',
          },
          granularity: {
            type: 'string',
            enum: ['day', 'week', 'month'],
            default: 'day',
            description: 'Granularity for data aggregation. Day shows hourly breakdown, week/month show daily breakdown.',
          },
        },
        required: ['date'],
      },
    },
    {
      name: 'get_traces',
      description:
        'Analyze individual trace samples in JSON format for detailed bottleneck identification and performance debugging. Use for investigating specific slow requests, not system-wide statistics (use get_performance_metrics for aggregate data).',
      inputSchema: {
        type: 'object',
        properties: {
          env: {
            type: 'string',
            description: 'Environment name (e.g., "production", "staging")',
          },
          s: {
            type: 'string',
            description: 'Service name (e.g., "web", "api", "worker")',
          },
          transaction_name: {
            type: 'string',
            description: 'Filter by specific transaction/endpoint name',
          },
          has_callgraph: {
            type: 'boolean',
            description: 'Only return traces with detailed callgraph data',
          },
          search: {
            type: 'string',
            description: 'Word-based search on transaction_name, host, and URL text tokens. This is no fulltext search.',
          },
          min_date: {
            type: 'string',
            description:
              'Minimal date for traces in YYYY-MM-DD HH:MM format (e.g., "2024-01-15 14:30"). Convert natural language like "1 hour ago" to this format. Requires max_date.',
          },
          max_date: {
            type: 'string',
            description:
              'Maximal date for traces in YYYY-MM-DD HH:MM format (e.g., "2024-01-15 16:30"). Convert natural language like "now" to this format. Requires min_date.',
          },
          min_response_time_ms: {
            type: 'number',
            minimum: 0,
            description: 'Minimum response time in milliseconds for filtering slow traces',
          },
          max_response_time_ms: {
            type: 'number',
            minimum: 0,
            description: 'Maximum response time in milliseconds for filtering traces',
          },
          sort_by: {
            type: 'string',
            enum: ['response_time', 'date', 'memory'],
            default: 'response_time',
            description: 'Field to sort traces by',
          },
          sort_order: {
            type: 'string',
            enum: ['ASC', 'DESC'],
            default: 'DESC',
            description: 'Sort order (DESC = slowest/newest first)',
          },
        },
        required: [],
      },
    },
  ];
}