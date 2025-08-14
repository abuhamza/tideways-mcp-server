import { TidewaysClient } from '../../src/lib/tideways-client.js';
import { TidewaysAPIError } from '../../src/lib/errors.js';
import type { TidewaysConfig } from '../../src/types/index.js';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const mockConfig: TidewaysConfig = {
  token: 'test-token',
  organization: 'test-org',
  project: 'test-project',
  baseUrl: 'https://app.tideways.io/apps/api',
  maxRetries: 3,
  requestTimeout: 30000,
};

describe('TidewaysClient', () => {
  let client: TidewaysClient;
  let mockAxiosInstance: jest.Mocked<any>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockAxiosInstance = {
      get: jest.fn(),
      interceptors: {
        request: {
          use: jest.fn(),
        },
        response: {
          use: jest.fn(),
        },
      },
    };

    mockedAxios.create.mockReturnValue(mockAxiosInstance);

    client = new TidewaysClient(mockConfig);
  });

  describe('constructor', () => {
    it('should create axios instance with correct configuration', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith({
        baseURL: mockConfig.baseUrl,
        timeout: mockConfig.requestTimeout,
        headers: {
          Authorization: `Bearer ${mockConfig.token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'Tideways-MCP-Server/0.1.0',
        },
      });
    });

    it('should set up request and response interceptors', () => {
      expect(mockAxiosInstance.interceptors.request.use).toHaveBeenCalled();
      expect(mockAxiosInstance.interceptors.response.use).toHaveBeenCalled();
    });
  });

  describe('getPerformanceMetrics', () => {
    const mockResponse = {
      summary: {
        total_requests: 1000,
        response_time_average: 150,
        response_time_p95: 300,
        error_rate_percent: 2.5,
      },
      transactions: [
        { name: 'GET /api/users', response_time_average: 120, requests: 500 },
        { name: 'POST /api/orders', response_time_average: 200, requests: 300 },
      ],
    };

    it('should fetch performance metrics with proper parameter mapping', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: mockResponse });

      const result = await client.getPerformanceMetrics({ 
        ts: '2025-08-12 18:30',
        m: 1440,
        env: 'staging',
        s: 'api'
      });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/test-org/test-project/performance', {
        params: {
          ts: '2025-08-12 18:30',
          m: 1440,
          env: 'staging',
          s: 'api'
        },
      });
      expect(result).toEqual(mockResponse);
    });

    it('should use default values for optional parameters', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: mockResponse });

      const result = await client.getPerformanceMetrics();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/test-org/test-project/performance', {
        params: {
          env: 'production', // Default environment
          s: 'web' // Default service
        },
      });
      expect(result).toEqual(mockResponse);
    });



    it('should handle API errors', async () => {
      const apiError = new Error('API Error');
      mockAxiosInstance.get.mockRejectedValue(apiError);

      await expect(client.getPerformanceMetrics({ ts: '2025-08-12 18:30', m: 1440 })).rejects.toThrow();
    });
  });

  describe('getPerformanceSummary', () => {
    const mockResponse = {
      summary: {
        by_time: {
          '2025-08-10 18:15': {
            requests: 3232092,
            errors: 43,
            percentile_95p: 389
          },
          '2025-08-10 18:30': {
            requests: 3280940,
            errors: 17,
            percentile_95p: 381
          }
        },
        criteria: {
          service: 'web',
          environment: 'production',
          start: '2025-08-10 18:00',
          end: '2025-08-10 19:00'
        }
      }
    };

    it('should fetch performance summary with proper parameter mapping', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: mockResponse });

      const result = await client.getPerformanceSummary({ 
        s: 'api'
      });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/test-org/test-project/summary', {
        params: {
          s: 'api'
        },
      });
      expect(result).toEqual(mockResponse);
    });

    it('should use default values for optional parameters', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: mockResponse });

      const result = await client.getPerformanceSummary();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/test-org/test-project/summary', {
        params: {
          s: 'web' // Default service - summary API only supports 's' parameter
        },
      });
      expect(result).toEqual(mockResponse);
    });


    it('should handle API errors', async () => {
      const apiError = new Error('API Error');
      mockAxiosInstance.get.mockRejectedValue(apiError);

      await expect(client.getPerformanceSummary({ s: 'web' })).rejects.toThrow();
    });
  });

  describe('getIssues', () => {
    const mockResponse = {
      summary: {
        total_issues: 10,
        new_issues: 3,
        critical_issues: 1,
      },
      issues: [
        {
          type: 'error',
          message: 'Database connection failed',
          occurrences: 5,
          last_occurred: '2025-08-10T10:00:00Z',
        },
      ],
    };

    it('should fetch issues successfully', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: mockResponse });

      const result = await client.getIssues({ page: 1 });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/test-org/test-project/issues', {
        params: { status: 'open', page: 1 },
      });
      expect(result).toEqual(mockResponse);
    });
  });

  describe('getTraces', () => {
    const mockResponse = {
      traces: [
        {
          id: 'trace-1',
          transaction_name: 'api/users/get',
          response_time_ms: 1500,
          memory_kb: 10240,
          bottlenecks: ['sql'],
          layers: [
            {
              name: 'SQL',
              perc: 45.5,
              latency_sum_ms: 682,
              count: 15,
            },
          ],
          service: 'api',
          environment: 'production',
        },
      ],
    };

    it('should fetch traces successfully', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: mockResponse });

      const result = await client.getTraces({
        env: 'production',
        min_date: '2025-08-10 09:00',
        max_date: '2025-08-10 11:00',
      });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/test-org/test-project/traces', {
        params: {
          env: 'production',
          min_date: '2025-08-10 09:00',
          max_date: '2025-08-10 11:00',
        },
      });
      expect(result).toEqual(mockResponse);
    });
  });

  describe('getHistoricalData', () => {
    it('should fetch historical data successfully', async () => {
      const mockResponse = { data: 'historical-data' };
      mockAxiosInstance.get.mockResolvedValue({ data: mockResponse });

      const result = await client.getHistoricalData('2025-08-10', 'day');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/test-org/test-project/history/2025-08-10', {
        params: {},
      });
      expect(result).toEqual(mockResponse);
    });

    it('should fetch historical data with custom granularity', async () => {
      const mockResponse = { data: 'historical-data' };
      mockAxiosInstance.get.mockResolvedValue({ data: mockResponse });

      const result = await client.getHistoricalData('2025-08-10', 'week');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/test-org/test-project/history/2025-08-10/week', {
        params: {},
      });
      expect(result).toEqual(mockResponse);
    });
  });

  describe('healthCheck', () => {
    it('should return healthy status on successful token verification', async () => {
      const mockResponse = {
        scopes: ['metrics', 'traces'],
        projects: [{ name: 'test-project' }],
      };
      mockAxiosInstance.get.mockResolvedValue({ data: mockResponse });

      const result = await client.healthCheck();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/_token');
      expect(result.status).toBe('healthy');
      expect(result.message).toContain('Successfully connected');
    });

    it('should return unhealthy status on API error', async () => {
      const apiError = new TidewaysAPIError('Authentication failed', 'auth', 401);
      mockAxiosInstance.get.mockRejectedValue(apiError);

      const result = await client.healthCheck();

      expect(result.status).toBe('unhealthy');
      expect(result.details).toMatchObject({
        category: 'auth',
        statusCode: 401,
      });
    });
  });

  describe('retry logic', () => {
    it('should retry on retryable errors', async () => {
      const networkError = new TidewaysAPIError('Network error', 'network');
      mockAxiosInstance.get
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValue({ data: { success: true } });

      const result = await client.getPerformanceMetrics({ ts: '2025-08-12 18:30', m: 1440 });

      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(3);
      expect(result).toEqual({ success: true });
    });

    it('should not retry on non-retryable errors', async () => {
      const authError = new TidewaysAPIError('Authentication failed', 'auth', 401);
      mockAxiosInstance.get.mockRejectedValue(authError);

      await expect(client.getPerformanceMetrics({ ts: '2025-08-12 18:30', m: 1440 })).rejects.toThrow(authError);

      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(1);
    });

    it('should stop retrying after max attempts', async () => {
      const networkError = new TidewaysAPIError('Network error', 'network');
      mockAxiosInstance.get.mockRejectedValue(networkError);

      await expect(client.getPerformanceMetrics({ ts: '2025-08-12 18:30', m: 1440 })).rejects.toThrow(networkError);

      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(4); // Initial + 3 retries
    }, 15000); // 15 second timeout
  });

  describe('parameter handling', () => {
    it('should pass ts and m parameters directly to API', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: {} });

      const testCases = [
        { ts: '2025-08-12 18:30', m: 60 },
        { ts: '2025-08-12 12:00', m: 360 },
        { ts: '2025-08-12 23:59', m: 1440 }
      ];

      for (const params of testCases) {
        mockAxiosInstance.get.mockClear();
        await client.getPerformanceMetrics(params);
        
        expect(mockAxiosInstance.get).toHaveBeenCalledWith('/test-org/test-project/performance', {
          params: {
            ts: params.ts,
            m: params.m,
            env: 'production',
            s: 'web'
          },
        });
      }
    });

    it('should omit ts and m parameters when not provided', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: {} });

      await client.getPerformanceMetrics({ env: 'staging' });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/test-org/test-project/performance', {
        params: {
          env: 'staging',
          s: 'web'
        },
      });
    });

    it('should handle ts parameter only when m is not provided', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: {} });

      await client.getPerformanceMetrics({ ts: '2025-08-12 18:30' });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/test-org/test-project/performance', {
        params: {
          ts: '2025-08-12 18:30',
          env: 'production',
          s: 'web'
        },
      });
    });
  });
});