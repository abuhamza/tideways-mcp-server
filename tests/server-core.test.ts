import { formatDateForAPI, addDefaultDateRange } from '../src/utils/date-utils.js';

describe('Server Core Functionality', () => {
  describe('formatDateForAPI', () => {
    it('should format date in Y-m-d H:i format for Tideways API', () => {
      const date = new Date(2025, 7, 10, 14, 30); // Aug 10, 2025, 14:30 local
      const result = formatDateForAPI(date);

      expect(result).toBe('2025-08-10 14:30');
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    });

    it('should zero-pad single-digit months and hours', () => {
      const date = new Date(2025, 0, 5, 9, 5); // Jan 5, 2025, 09:05 local
      const result = formatDateForAPI(date);

      expect(result).toBe('2025-01-05 09:05');
    });
  });

  describe('addDefaultDateRange', () => {
    it('should add default date range when none provided', () => {
      const beforeCall = new Date();
      const result = addDefaultDateRange({});

      expect(result.min_date).toBeDefined();
      expect(result.max_date).toBeDefined();

      expect(result.min_date).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
      expect(result.max_date).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);

      // Parse Y-m-d H:i format back to Date for time diff check
      const parseApiDate = (s: string) => {
        const [datePart, timePart] = s.split(' ');
        const [y, m, d] = datePart.split('-').map(Number);
        const [h, min] = timePart.split(':').map(Number);
        return new Date(y, m - 1, d, h, min);
      };
      const minDate = parseApiDate(result.min_date!);
      const maxDate = parseApiDate(result.max_date!);

      // Y-m-d H:i truncates seconds, so allow up to 60s tolerance
      expect(maxDate.getTime()).toBeGreaterThanOrEqual(beforeCall.getTime() - 60000);

      const diffHours = (maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60);
      expect(diffHours).toBeCloseTo(24, 0);
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