import { ErrorHandler, TidewaysAPIError } from '../../src/lib/errors.js';

describe('TidewaysAPIError', () => {
  it('should create error with required properties', () => {
    const error = new TidewaysAPIError('Test error', 'api', 500, 1000);

    expect(error.message).toBe('Test error');
    expect(error.category).toBe('api');
    expect(error.statusCode).toBe(500);
    expect(error.retryAfter).toBe(1000);
    expect(error.name).toBe('TidewaysAPIError');
  });

  it('should maintain proper stack trace', () => {
    const error = new TidewaysAPIError('Test error', 'api');
    expect(error.stack).toBeDefined();
  });
});

describe('ErrorHandler', () => {
  describe('handleApiError', () => {
    it('should handle rate limit errors', () => {
      const mockError = {
        response: {
          status: 429,
          headers: {
            'x-ratelimit-reset': '1000',
          },
        },
        config: { url: '/test', method: 'get' },
      };

      const result = ErrorHandler.handleApiError(mockError);

      expect(result).toBeInstanceOf(TidewaysAPIError);
      expect(result.category).toBe('rate_limit');
      expect(result.statusCode).toBe(429);
      expect(result.retryAfter).toBe(1000000); // Converted to milliseconds
    });

    it('should handle authentication errors', () => {
      const mockError = {
        response: { status: 401 },
        config: { url: '/test', method: 'get' },
      };

      const result = ErrorHandler.handleApiError(mockError);

      expect(result).toBeInstanceOf(TidewaysAPIError);
      expect(result.category).toBe('auth');
      expect(result.statusCode).toBe(401);
    });

    it('should handle authorization errors', () => {
      const mockError = {
        response: { status: 403 },
        config: { url: '/test', method: 'get' },
      };

      const result = ErrorHandler.handleApiError(mockError);

      expect(result).toBeInstanceOf(TidewaysAPIError);
      expect(result.category).toBe('auth');
      expect(result.statusCode).toBe(403);
    });

    it('should handle not found errors', () => {
      const mockError = {
        response: { status: 404 },
        config: { url: '/test', method: 'get' },
      };

      const result = ErrorHandler.handleApiError(mockError);

      expect(result).toBeInstanceOf(TidewaysAPIError);
      expect(result.category).toBe('api');
      expect(result.statusCode).toBe(404);
    });

    it('should handle server errors', () => {
      const mockError = {
        response: { status: 500 },
        config: { url: '/test', method: 'get' },
      };

      const result = ErrorHandler.handleApiError(mockError);

      expect(result).toBeInstanceOf(TidewaysAPIError);
      expect(result.category).toBe('api');
      expect(result.statusCode).toBe(500);
    });

    it('should handle network errors', () => {
      const mockError = {
        code: 'ECONNREFUSED',
        config: { url: '/test', method: 'get' },
      };

      const result = ErrorHandler.handleApiError(mockError);

      expect(result).toBeInstanceOf(TidewaysAPIError);
      expect(result.category).toBe('network');
    });

    it('should handle timeout errors', () => {
      const mockError = {
        code: 'ECONNABORTED',
        config: { url: '/test', method: 'get' },
      };

      const result = ErrorHandler.handleApiError(mockError);

      expect(result).toBeInstanceOf(TidewaysAPIError);
      expect(result.category).toBe('network');
    });

    it('should handle unknown errors', () => {
      const mockError = {
        message: 'Unknown error occurred',
        config: { url: '/test', method: 'get' },
      };

      const result = ErrorHandler.handleApiError(mockError);

      expect(result).toBeInstanceOf(TidewaysAPIError);
      expect(result.category).toBe('unknown');
    });
  });

  describe('handleValidationError', () => {
    it('should create validation error', () => {
      const result = ErrorHandler.handleValidationError('Invalid parameter');

      expect(result).toBeInstanceOf(TidewaysAPIError);
      expect(result.category).toBe('validation');
      expect(result.message).toBe('Invalid parameter');
    });
  });

  describe('formatErrorForUser', () => {
    it('should format rate limit errors', () => {
      const error = new TidewaysAPIError('Rate limit exceeded', 'rate_limit', 429, 60000);
      const formatted = ErrorHandler.formatErrorForUser(error);

      expect(formatted).toContain('Rate limit exceeded');
      expect(formatted).toContain('Rate limit resets at:');
    });

    it('should format auth errors with suggestions', () => {
      const error = new TidewaysAPIError('Authentication failed', 'auth', 401);
      const formatted = ErrorHandler.formatErrorForUser(error);

      expect(formatted).toContain('Authentication failed');
      expect(formatted).toContain('Suggestions:');
      expect(formatted).toContain('TIDEWAYS_TOKEN');
    });

    it('should format network errors with suggestions', () => {
      const error = new TidewaysAPIError('Network error', 'network');
      const formatted = ErrorHandler.formatErrorForUser(error);

      expect(formatted).toContain('Network error');
      expect(formatted).toContain('internet connection');
    });

    it('should format validation errors', () => {
      const error = new TidewaysAPIError('Invalid input', 'validation');
      const formatted = ErrorHandler.formatErrorForUser(error);

      expect(formatted).toContain('Invalid input');
      expect(formatted).toContain('check your input parameters');
    });

    it('should format unknown errors', () => {
      const error = new TidewaysAPIError('Unknown error', 'unknown');
      const formatted = ErrorHandler.formatErrorForUser(error);

      expect(formatted).toContain('Unknown error');
      expect(formatted).toContain('server logs');
    });
  });

  describe('isRetryable', () => {
    it('should identify retryable errors', () => {
      const networkError = new TidewaysAPIError('Network error', 'network');
      const serverError = new TidewaysAPIError('Server error', 'api', 500);
      const rateLimitError = new TidewaysAPIError('Rate limit', 'rate_limit', 429);

      expect(ErrorHandler.isRetryable(networkError)).toBe(true);
      expect(ErrorHandler.isRetryable(serverError)).toBe(true);
      expect(ErrorHandler.isRetryable(rateLimitError)).toBe(true);
    });

    it('should identify non-retryable errors', () => {
      const authError = new TidewaysAPIError('Auth error', 'auth', 401);
      const validationError = new TidewaysAPIError('Validation error', 'validation');
      const clientError = new TidewaysAPIError('Client error', 'api', 400);

      expect(ErrorHandler.isRetryable(authError)).toBe(false);
      expect(ErrorHandler.isRetryable(validationError)).toBe(false);
      expect(ErrorHandler.isRetryable(clientError)).toBe(false);
    });
  });

  describe('getRetryDelay', () => {
    it('should use retryAfter when available', () => {
      const error = new TidewaysAPIError('Rate limit', 'rate_limit', 429, 5000);
      const delay = ErrorHandler.getRetryDelay(error, 1);

      expect(delay).toBe(5000);
    });

    it('should use exponential backoff when retryAfter not available', () => {
      const error = new TidewaysAPIError('Network error', 'network');

      expect(ErrorHandler.getRetryDelay(error, 0)).toBe(1000);
      expect(ErrorHandler.getRetryDelay(error, 1)).toBe(2000);
      expect(ErrorHandler.getRetryDelay(error, 2)).toBe(4000);
      expect(ErrorHandler.getRetryDelay(error, 3)).toBe(8000);
    });

    it('should cap retry delay at 30 seconds', () => {
      const error = new TidewaysAPIError('Network error', 'network');
      const delay = ErrorHandler.getRetryDelay(error, 10); // Large attempt number

      expect(delay).toBe(30000);
    });
  });

  describe('handlePartialFailure', () => {
    it('should handle partial data available', () => {
      const errors = [
        new TidewaysAPIError('Network error', 'network'),
        new TidewaysAPIError('Rate limit', 'rate_limit'),
      ];
      const partialData = { metrics: 'some data' };

      const result = ErrorHandler.handlePartialFailure(errors, partialData);

      expect(result).toContain('Partial data available');
      expect(result).toContain('network: Network error');
      expect(result).toContain('rate_limit: Rate limit');
    });

    it('should handle no data available', () => {
      const errors = [new TidewaysAPIError('Network error', 'network')];

      const result = ErrorHandler.handlePartialFailure(errors);

      expect(result).toContain('Unable to retrieve performance data');
      expect(result).toContain('network: Network error');
    });
  });
});
