import { handleGetHistoricalData } from '../../../src/tools/handlers/historical-handler.js';
import { TidewaysClient } from '../../../src/lib/tideways-client.js';
import { ErrorHandler, TidewaysAPIError } from '../../../src/lib/errors.js';
import type { GetHistoricalDataParams, TidewaysHistoryResponse } from '../../../src/types/index.js';

jest.mock('../../../src/lib/tideways-client.js');


jest.mock('../../../src/lib/errors.js', () => ({
  ErrorHandler: {
    handleApiError: jest.fn((error) => {
      throw new TidewaysAPIError(error.message, 'api');
    })
  },
  TidewaysAPIError: jest.fn().mockImplementation((message, category, statusCode) => {
    const error = new Error(message);
    (error as any).category = category;
    (error as any).statusCode = statusCode;
    return error;
  })
}));

const MockedTidewaysClient = TidewaysClient as jest.MockedClass<typeof TidewaysClient>;
const mockedErrorHandler = ErrorHandler as jest.Mocked<typeof ErrorHandler>;

const mockHistoricalResponse: TidewaysHistoryResponse = {
  _links: {
    self: {
      href: "/apps/api/test-org/test-project/history?date=2025-08-09&granularity=day"
    },
    next: {
      href: "/apps/api/test-org/test-project/history?date=2025-08-10&granularity=day"
    },
    previous: {
      href: "/apps/api/test-org/test-project/history?date=2025-08-08&granularity=day"
    },
    chart: [
      {
        href: "/images/history/2025-08-09/day/1234/graph.svg",
        type: "image/svg+xml"
      },
      {
        href: "/images/history/2025-08-09/day/1234/graph.png",
        type: "image/png"
      }
    ]
  },
  date_range: {
    start: "2025-08-09 00:00:00",
    end: "2025-08-09 23:59:59",
    granularity: "day"
  },
  report: {
    response_time_p95: 303,
    total_requests: 147755634,
    error_rate_percent: 0
  },
  history: {
    by_time: {
      "2025-08-09 08:00": {
        requests: 8042911,
        errors: 49,
        percentile_95p: 303
      },
      "2025-08-09 09:00": {
        requests: 8369816,
        errors: 55,
        percentile_95p: 311
      }
    }
  },
  transaction_report: [
    {
      name: "proxy-base/proxy-portale/hotels/searches/get/search-results-filters",
      response_time_p95: 1878.3461848022093,
      response_time_worst: 1878.3461848022093,
      response_time_average: 433,
      total_requests: 5358713,
      memory_max: 691561,
      impact_percent: 19.60795477301893
    },
    {
      name: "proxy-base/proxy-portale/hotels/searches/get/search-results",
      response_time_p95: 476.1999224817869,
      response_time_worst: 476.1999224817869,
      response_time_average: 182,
      total_requests: 10831003,
      memory_max: 730529,
      impact_percent: 17.499472761533138
    }
  ]
};

describe('handleGetHistoricalData', () => {
  let mockClient: jest.Mocked<TidewaysClient>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = new MockedTidewaysClient({} as any) as jest.Mocked<TidewaysClient>;
  });

  describe('successful requests', () => {
    beforeEach(() => {
      mockClient.getHistoricalData.mockResolvedValue(mockHistoricalResponse);
    });

    it('should handle basic historical data request with default granularity', async () => {
      const params: GetHistoricalDataParams = {
        date: '2025-08-09',
      };

      const result = await handleGetHistoricalData(mockClient, params);

      expect(mockClient.getHistoricalData).toHaveBeenCalledWith('2025-08-09', 'day');
      expect(result).toBe(JSON.stringify(mockHistoricalResponse, null, 2));
    });

    it('should handle historical data request with custom granularity', async () => {
      const params: GetHistoricalDataParams = {
        date: '2025-08-09',
        granularity: 'week',
      };

      const result = await handleGetHistoricalData(mockClient, params);

      expect(mockClient.getHistoricalData).toHaveBeenCalledWith('2025-08-09', 'week');
      expect(result).toBe(JSON.stringify(mockHistoricalResponse, null, 2));
    });

    it('should handle historical data request with month granularity', async () => {
      const params: GetHistoricalDataParams = {
        date: '2025-08-01',
        granularity: 'month',
      };

      const result = await handleGetHistoricalData(mockClient, params);

      expect(mockClient.getHistoricalData).toHaveBeenCalledWith('2025-08-01', 'month');
      expect(result).toBe(JSON.stringify(mockHistoricalResponse, null, 2));
    });

  });

  describe('error handling', () => {
    it('should handle API errors gracefully', async () => {
      const apiError = new Error('API Error');
      mockClient.getHistoricalData.mockRejectedValue(apiError);

      const params: GetHistoricalDataParams = {
        date: '2025-08-09'
      };

      await expect(handleGetHistoricalData(mockClient, params)).rejects.toThrow();
      expect(mockedErrorHandler.handleApiError).toHaveBeenCalledWith(apiError);
    });

    it('should handle network errors', async () => {
      const networkError = new Error('Network timeout');
      mockClient.getHistoricalData.mockRejectedValue(networkError);

      const params: GetHistoricalDataParams = {
        date: '2025-08-09'
      };

      await expect(handleGetHistoricalData(mockClient, params)).rejects.toThrow();
      expect(mockedErrorHandler.handleApiError).toHaveBeenCalledWith(networkError);
    });

    it('should call ErrorHandler.handleApiError on client errors', async () => {
      const clientError = new Error('Client error');
      mockClient.getHistoricalData.mockRejectedValue(clientError);

      const params: GetHistoricalDataParams = {
        date: '2025-08-09'
      };

      try {
        await handleGetHistoricalData(mockClient, params);
      } catch (error) {
        // Error is expected
      }
      
      expect(mockedErrorHandler.handleApiError).toHaveBeenCalledWith(clientError);
    });
  });

  describe('parameter validation', () => {
    it('should use default granularity when not provided', async () => {
      mockClient.getHistoricalData.mockResolvedValue(mockHistoricalResponse);

      const params: GetHistoricalDataParams = {
        date: '2025-08-09'
      };

      await handleGetHistoricalData(mockClient, params);

      expect(mockClient.getHistoricalData).toHaveBeenCalledWith('2025-08-09', 'day');
    });

    it('should preserve provided granularity', async () => {
      mockClient.getHistoricalData.mockResolvedValue(mockHistoricalResponse);

      const params: GetHistoricalDataParams = {
        date: '2025-08-09',
        granularity: 'week'
      };

      await handleGetHistoricalData(mockClient, params);

      expect(mockClient.getHistoricalData).toHaveBeenCalledWith('2025-08-09', 'week');
    });
  });

  describe('integration with actual response structure', () => {
    it('should handle response with comprehensive transaction data', async () => {
      const largeResponse: TidewaysHistoryResponse = {
        ...mockHistoricalResponse,
        transaction_report: [
          ...mockHistoricalResponse.transaction_report,
          {
            name: "proxy-base/proxy-portale/hotels/searches/search-results-clustered",
            response_time_p95: 1911.6742610878262,
            response_time_worst: 1911.6742610878262,
            response_time_average: 453,
            total_requests: 2564953,
            memory_max: 734688,
            impact_percent: 9.800741214451152
          }
        ]
      };

      mockClient.getHistoricalData.mockResolvedValue(largeResponse);

      const params: GetHistoricalDataParams = {
        date: '2025-08-09',
      };

      const result = await handleGetHistoricalData(mockClient, params);

      expect(mockClient.getHistoricalData).toHaveBeenCalledWith('2025-08-09', 'day');
      expect(result).toBe(JSON.stringify(largeResponse, null, 2));
    });

    it('should handle response with extensive time series data', async () => {
      const timeSeriesResponse: TidewaysHistoryResponse = {
        ...mockHistoricalResponse,
        history: {
          by_time: {
            "2025-08-09 00:00": { requests: 1384426, errors: 29, percentile_95p: 275 },
            "2025-08-09 01:00": { requests: 984627, errors: 6, percentile_95p: 269 },
            "2025-08-09 02:00": { requests: 874815, errors: 2, percentile_95p: 253 },
            "2025-08-09 08:00": { requests: 8042911, errors: 49, percentile_95p: 303 },
            "2025-08-09 09:00": { requests: 8369816, errors: 55, percentile_95p: 311 },
            "2025-08-09 23:00": { requests: 2365957, errors: 24, percentile_95p: 291 }
          }
        }
      };

      mockClient.getHistoricalData.mockResolvedValue(timeSeriesResponse);

      const params: GetHistoricalDataParams = {
        date: '2025-08-09',
        granularity: 'day',
      };

      const result = await handleGetHistoricalData(mockClient, params);

      expect(result).toBe(JSON.stringify(timeSeriesResponse, null, 2));
    });
  });
});