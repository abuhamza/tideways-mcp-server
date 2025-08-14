import axios, { AxiosInstance, AxiosResponse } from 'axios';
import {
  TidewaysConfig,
  TidewaysPerformanceData,
  TidewaysPerformanceSummaryData,
  TidewaysIssuesResponse,
  TidewaysTracesResponse,
  TidewaysHistoryResponse,
  GetPerformanceMetricsParams,
  GetPerformanceSummaryParams,
} from '../types/index.js';
import { ErrorHandler, TidewaysAPIError } from './errors.js';
import { logger } from './logger.js';

class RateLimiter {
  private requests: number[] = [];
  private maxRequests: number;
  private windowMs: number;

  constructor(maxRequests = 900, windowMs = 3600000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  async acquire(): Promise<void> {
    const now = Date.now();

    this.requests = this.requests.filter(timestamp => now - timestamp < this.windowMs);

    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = Math.min(...this.requests);
      const waitTime = this.windowMs - (now - oldestRequest);

      logger.warn('Rate limit reached, waiting', { waitTimeMs: waitTime });
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return this.acquire(); // Try again after waiting
    }

    this.requests.push(now);
  }

  updateLimits(remaining: number, resetTime: number): void {
    if (remaining === 0) {
      const waitTime = resetTime * 1000 - Date.now();
      logger.warn('API rate limit exhausted', { resetTime, waitTimeMs: waitTime });
    }
  }
}

export class TidewaysClient {
  private client: AxiosInstance;
  private config: TidewaysConfig;
  private rateLimiter: RateLimiter;

  constructor(config: TidewaysConfig) {
    this.config = config;
    this.rateLimiter = new RateLimiter();

    this.client = axios.create({
      baseURL: config.baseUrl,
      timeout: config.requestTimeout,
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Tideways-MCP-Server/0.1.0',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    this.client.interceptors.request.use(async config => {
      await this.rateLimiter.acquire();

      const safeHeaders = { ...config.headers };

      if (safeHeaders.Authorization) {
        safeHeaders.Authorization = 'Bearer [REDACTED]';
      }

      const sensitiveHeaders = ['X-API-Key', 'X-Auth-Token', 'Cookie', 'Set-Cookie'];
      sensitiveHeaders.forEach(header => {
        if (safeHeaders[header]) {
          safeHeaders[header] = '[REDACTED]';
        }
      });

      logger.debug('API request', {
        method: config.method?.toUpperCase(),
        url: config.url,
        params: config.params,
        headers: safeHeaders,
      });

      return config;
    });

    this.client.interceptors.response.use(
      response => {
        const remaining = response.headers['x-ratelimit-remaining'];
        const resetTime = response.headers['x-ratelimit-reset'];

        if (remaining && resetTime) {
          this.rateLimiter.updateLimits(parseInt(remaining, 10), parseInt(resetTime, 10));
        }

        logger.debug('API response', {
          status: response.status,
          url: response.config.url,
          rateLimitRemaining: remaining,
        });

        return response;
      },
      error => {
        return Promise.reject(ErrorHandler.handleApiError(error));
      }
    );
  }

  async fetch<T>(
    endpoint: string,
    params?: Record<string, any>
  ): Promise<T> {
    let lastError: TidewaysAPIError | null = null;
    const maxRetries = this.config.maxRetries || 3;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response: AxiosResponse<T> = await this.client.get(endpoint, { params });
        return response.data;
      } catch (error) {
        lastError = error as TidewaysAPIError;

        if (!ErrorHandler.isRetryable(lastError) || attempt >= maxRetries) {
          break;
        }

        const delay = ErrorHandler.getRetryDelay(lastError, attempt);
        logger.warn('Retrying API request', {
          endpoint,
          attempt: attempt + 1,
          maxRetries,
          delayMs: delay,
          error: lastError.message,
        });

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError || new TidewaysAPIError('Unknown error occurred', 'unknown');
  }

  async getPerformanceMetrics(params?: GetPerformanceMetricsParams): Promise<TidewaysPerformanceData> {
    const apiParams: Record<string, any> = {
      env: params?.env || 'production',
      s: params?.s || 'web',
    };
    
    if (params?.ts) {
      apiParams.ts = params.ts;
    }
    if (params?.m) {
      apiParams.m = params.m;
    }
    
    logger.debug('Performance metrics parameters', {
      input_params: params,
      api_params: apiParams,
    });
    
    const endpoint = `/${this.config.organization}/${this.config.project}/performance`;
    return this.fetch<TidewaysPerformanceData>(endpoint, apiParams);
  }

  async getPerformanceSummary(params?: GetPerformanceSummaryParams): Promise<TidewaysPerformanceSummaryData> {
    const apiParams: Record<string, any> = {
      s: params?.s || 'web',
    };
    
    logger.debug('Performance summary parameters', {
      input_params: params,
      api_params: apiParams,
    });
    
    const endpoint = `/${this.config.organization}/${this.config.project}/summary`;
    return this.fetch<TidewaysPerformanceSummaryData>(endpoint, apiParams);
  }

  async getIssues(params?: {
    issue_type?: string;
    status?: string;
    page?: number;
  }): Promise<TidewaysIssuesResponse> {
    const apiParams: Record<string, any> = {
      status: params?.status || 'open',
      page: params?.page || 1,
    };

    if (params?.issue_type && params.issue_type !== 'all') {
      apiParams.issueType = params.issue_type;
    }

    const endpoint = `/${this.config.organization}/${this.config.project}/issues`;
    return this.fetch<TidewaysIssuesResponse>(endpoint, apiParams);
  }

  async getTraces(params?: {
    env?: string;
    s?: string;
    transaction_name?: string;
    has_callgraph?: boolean;
    search?: string;
    min_date?: string;
    max_date?: string;
    min_response_time_ms?: number;
    max_response_time_ms?: number;
    sort_by?: string;
    sort_order?: string;
  }): Promise<TidewaysTracesResponse> {
    const endpoint = `/${this.config.organization}/${this.config.project}/traces`;
    return this.fetch<TidewaysTracesResponse>(endpoint, params);
  }

  async getHistoricalData(date: string, granularity: string = 'day'): Promise<TidewaysHistoryResponse> {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      throw ErrorHandler.handleValidationError(`Invalid date format. Expected YYYY-MM-DD, got: ${date}`);
    }

    const validGranularities = ['day', 'week', 'month'];
    if (!validGranularities.includes(granularity)) {
      throw ErrorHandler.handleValidationError(`Invalid granularity. Expected one of: ${validGranularities.join(', ')}, got: ${granularity}`);
    }

    let endpoint = `/${this.config.organization}/${this.config.project}/history/${date}`;
    if (granularity !== 'day') {
      endpoint += `/${granularity}`;
    }

    logger.debug('Fetching historical data', { date, granularity, endpoint });

    return this.fetch(endpoint, {});
  }

  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    message: string;
    details?: any;
  }> {
    try {
      const response = await this.client.get('/_token');

      if (response.data && response.data.scopes) {
        logger.info('Tideways API token verified', {
          scopes: response.data.scopes,
          projects: response.data.projects?.length || 0,
        });

        return {
          status: 'healthy',
          message: 'Successfully connected to Tideways API',
        };
      }

      return {
        status: 'healthy',
        message: 'Connected to Tideways API',
      };
    } catch (error) {
      const tidewaysError = error as TidewaysAPIError;

      return {
        status: 'unhealthy',
        message: ErrorHandler.formatErrorForUser(tidewaysError),
        details: {
          category: tidewaysError.category,
          statusCode: tidewaysError.statusCode,
        },
      };
    }
  }
}
