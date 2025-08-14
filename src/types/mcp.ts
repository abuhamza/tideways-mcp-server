export interface GetPerformanceMetricsParams {
  ts?: string;        // Y-m-d H:i format (e.g., "2025-08-12 18:30")
  m?: number;         // Minutes backward from ts
  env?: string;       // Environment name (e.g., "production", "staging")
  s?: string;         // Service name (e.g., "web", "api")
}

export interface GetPerformanceSummaryParams {
  s?: string;         // Service name (e.g., "web", "api") - only parameter supported by summary API
}

export interface GetIssuesParams {
  issue_type?: 'error' | 'slowsql' | 'deprecated' | 'all';
  status?: 'open' | 'new' | 'resolved' | 'not_error' | 'ignored' | 'all';
  page?: number;
}

export interface GetHistoricalDataParams {
  date: string; // YYYY-MM-DD format
  granularity?: 'day' | 'week' | 'month';
}

export interface GetTracesParams {
  env?: string; // Environment name (e.g., "production")
  s?: string; // Service name (e.g., "web")
  transaction_name?: string; // Filter by transaction name
  has_callgraph?: boolean; // Only traces with callgraph data
  search?: string; // Word-based search on transaction, host, URL
  min_date?: string; // Y-m-d H:i format, requires max_date
  max_date?: string; // Y-m-d H:i format, requires min_date
  min_response_time_ms?: number; // Minimum response time filter
  max_response_time_ms?: number; // Maximum response time filter
  sort_by?: 'response_time' | 'date' | 'memory'; // Sort field
  sort_order?: 'ASC' | 'DESC'; // Sort order
}

