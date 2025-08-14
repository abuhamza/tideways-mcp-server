import { ErrorCategory, TidewaysError } from '../types/index.js';
import { logger } from './logger.js';
export class TidewaysAPIError extends Error implements TidewaysError {
  public category: ErrorCategory;
  public statusCode?: number;
  public retryAfter?: number;

  constructor(message: string, category: ErrorCategory, statusCode?: number, retryAfter?: number) {
    super(message);
    this.name = 'TidewaysAPIError';
    this.category = category;
    this.statusCode = statusCode;
    this.retryAfter = retryAfter;

    Error.captureStackTrace(this, TidewaysAPIError);
  }
}

export class ErrorHandler {
  static handleApiError(error: any): TidewaysAPIError {
    logger.error('API error occurred', error, {
      url: error.config?.url,
      method: error.config?.method,
      status: error.response?.status,
    });

    if (error.response?.status === 429) {
      const resetTime = error.response.headers['x-ratelimit-reset'];
      const retryAfter = resetTime ? parseInt(resetTime, 10) * 1000 : undefined;

      return new TidewaysAPIError(
        'Rate limit exceeded. Please try again later.',
        'rate_limit',
        429,
        retryAfter
      );
    }

    if (error.response?.status === 401) {
      return new TidewaysAPIError(
        'Authentication failed. Please check your API token.',
        'auth',
        401
      );
    }

    if (error.response?.status === 403) {
      return new TidewaysAPIError(
        'Access denied. Your token may not have the required scopes for this operation.',
        'auth',
        403
      );
    }

    if (error.response?.status === 404) {
      return new TidewaysAPIError(
        'Resource not found. Please check your organization and project settings.',
        'api',
        404
      );
    }

    if (error.response?.status >= 500) {
      return new TidewaysAPIError(
        'Tideways API server error. Please try again later.',
        'api',
        error.response.status
      );
    }

    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return new TidewaysAPIError(
        'Network error: Unable to connect to Tideways API. Please check your internet connection.',
        'network'
      );
    }

    if (error.code === 'ECONNABORTED') {
      return new TidewaysAPIError(
        'Request timeout: Tideways API took too long to respond.',
        'network'
      );
    }

    return new TidewaysAPIError(`Unexpected error: ${error.message}`, 'unknown');
  }

  static handleValidationError(message: string): TidewaysAPIError {
    logger.warn('Validation error', { message });
    return new TidewaysAPIError(message, 'validation');
  }

  static formatErrorForUser(error: TidewaysAPIError): string {
    const baseMessage = error.message;

    switch (error.category) {
      case 'rate_limit':
        if (error.retryAfter) {
          const retryDate = new Date(Date.now() + error.retryAfter);
          return `${baseMessage} Rate limit resets at: ${retryDate.toISOString()}`;
        }
        return `${baseMessage} Please wait a few minutes before trying again.`;

      case 'auth':
        return `${baseMessage}\n\nSuggestions:\n• Verify your TIDEWAYS_TOKEN environment variable\n• Check that your token has the required scopes (metrics, issues, traces)\n• Ensure your token hasn't expired`;

      case 'network':
        return `${baseMessage}\n\nSuggestions:\n• Check your internet connection\n• Verify Tideways API is accessible from your network\n• Try again in a few minutes`;

      case 'api':
        return `${baseMessage}\n\nSuggestions:\n• Verify your TIDEWAYS_ORG and TIDEWAYS_PROJECT settings\n• Check if the resource exists in your Tideways dashboard\n• Try again in a few minutes if this is a temporary server issue`;

      case 'validation':
        return `${baseMessage}\n\nPlease check your input parameters and try again.`;

      default:
        return `${baseMessage}\n\nIf this error persists, please check the server logs for more details.`;
    }
  }

  static handlePartialFailure(errors: TidewaysAPIError[], partialData?: any): string {
    const errorSummary = errors.map(err => `• ${err.category}: ${err.message}`).join('\n');

    if (partialData && Object.keys(partialData).length > 0) {
      return `⚠️ Partial data available (some sources failed):\n\nIssues encountered:\n${errorSummary}\n\nNote: Analysis may be incomplete. Try again in a few minutes.`;
    }

    return `❌ Unable to retrieve performance data:\n\n${errorSummary}\n\nSuggestions:\n• Check your internet connection\n• Verify API token permissions\n• Try again in a few minutes (may be temporary API issue)`;
  }

  static isRetryable(error: TidewaysAPIError): boolean {
    return (
      error.category === 'network' ||
      (error.category === 'api' && error.statusCode && error.statusCode >= 500) ||
      error.category === 'rate_limit'
    );
  }

  static getRetryDelay(error: TidewaysAPIError, attempt: number): number {
    if (error.retryAfter) {
      return error.retryAfter;
    }

    return Math.min(1000 * Math.pow(2, attempt), 30000);
  }
}
