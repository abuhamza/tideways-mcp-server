import { formatDateForAPI, addDefaultDateRange } from '../src/utils/date-utils.js';

describe('Server Core Functionality', () => {
  describe('formatDateForAPI', () => {
    it('should format date correctly for API (ISO 8601)', () => {
      const date = new Date('2025-08-10T14:30:00Z');
      const result = formatDateForAPI(date);
      
      expect(result).toBe('2025-08-10T14:30:00.000Z');
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should handle different timezones correctly', () => {
      const date = new Date('2025-01-05T09:05:30.123Z');
      const result = formatDateForAPI(date);
      
      expect(result).toBe('2025-01-05T09:05:30.123Z');
    });
  });

  describe('addDefaultDateRange', () => {
    it('should add default date range when none provided', () => {
      const beforeCall = new Date();
      const result = addDefaultDateRange({});
      const afterCall = new Date();
      
      expect(result.min_date).toBeDefined();
      expect(result.max_date).toBeDefined();
      
      expect(result.min_date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(result.max_date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      
      const minDate = new Date(result.min_date!);
      const maxDate = new Date(result.max_date!);
      
      expect(maxDate.getTime()).toBeGreaterThanOrEqual(beforeCall.getTime() - 1000);
      expect(maxDate.getTime()).toBeLessThanOrEqual(afterCall.getTime() + 1000);
      
      const diffHours = (maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60);
      expect(diffHours).toBeCloseTo(24, 1);
    });

    it('should preserve existing parameters', () => {
      const params = {
        env: 'production',
        s: 'api',
        min_date: '2025-08-10 09:00',
        transaction_name: 'GET /api/users'
      };
      
      const result = addDefaultDateRange(params);
      
      expect(result.env).toBe('production');
      expect(result.s).toBe('api');
      expect(result.min_date).toBe('2025-08-10 09:00');
      expect(result.transaction_name).toBe('GET /api/users');
    });

    it('should not add defaults when dates are already provided', () => {
      const params = {
        min_date: '2025-08-01T10:00:00Z',
        max_date: '2025-08-01T12:00:00Z'
      };
      
      const result = addDefaultDateRange(params);
      
      expect(result.min_date).toBe('2025-08-01T10:00:00Z');
      expect(result.max_date).toBe('2025-08-01T12:00:00Z');
    });

    it('should preserve other trace parameters', () => {
      const params = {
        sort_by: 'response_time' as const,
        sort_order: 'DESC' as const,
        min_response_time_ms: 100,
        has_callgraph: true
      };
      
      const result = addDefaultDateRange(params);
      
      expect(result.sort_by).toBe('response_time');
      expect(result.sort_order).toBe('DESC');
      expect(result.min_response_time_ms).toBe(100);
      expect(result.has_callgraph).toBe(true);
    });
  });
});