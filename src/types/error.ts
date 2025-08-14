export type ErrorCategory = 'rate_limit' | 'auth' | 'network' | 'api' | 'validation' | 'unknown';

export interface TidewaysError extends Error {
  category: ErrorCategory;
  statusCode?: number;
  retryAfter?: number;
}