import { addDefaultDateRange } from '../../src/utils/date-utils.js';

describe('Date Utils', () => {
  describe('addDefaultDateRange', () => {
    it('should add default 24h range when no dates provided', () => {
      const params = { env: 'production' };
      const result = addDefaultDateRange(params);
      
      expect(result.env).toBe('production');
      expect(result.min_date).toBeDefined();
      expect(result.max_date).toBeDefined();
      expect(result.min_date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(result.max_date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      
      const minTime = new Date(result.min_date!).getTime();
      const maxTime = new Date(result.max_date!).getTime();
      const diffHours = (maxTime - minTime) / (1000 * 60 * 60);
      
      expect(diffHours).toBeCloseTo(24, 0);
    });

    it('should preserve existing min_date', () => {
      const params = { 
        env: 'staging',
        min_date: '2025-08-10 09:00'
      };
      const result = addDefaultDateRange(params);
      
      expect(result.env).toBe('staging');
      expect(result.min_date).toBe('2025-08-10 09:00');
      expect(result.max_date).toBeUndefined();
    });

    it('should preserve existing max_date', () => {
      const params = { 
        s: 'api',
        max_date: '2025-08-10 17:00'
      };
      const result = addDefaultDateRange(params);
      
      expect(result.s).toBe('api');
      expect(result.max_date).toBe('2025-08-10 17:00');
      expect(result.min_date).toBeUndefined();
    });

    it('should preserve both dates when provided', () => {
      const params = { 
        transaction_name: 'GET /api/test',
        min_date: '2025-08-10 09:00',
        max_date: '2025-08-10 17:00'
      };
      const result = addDefaultDateRange(params);
      
      expect(result.transaction_name).toBe('GET /api/test');
      expect(result.min_date).toBe('2025-08-10 09:00');
      expect(result.max_date).toBe('2025-08-10 17:00');
    });

    it('should preserve all other parameters', () => {
      const params = { 
        env: 'production',
        s: 'web',
        transaction_name: 'POST /api/orders',
        has_callgraph: true,
        search: 'order',
        min_response_time_ms: 1000,
        max_response_time_ms: 5000,
        sort_by: 'response_time' as const,
        sort_order: 'DESC' as const,
      };
      const result = addDefaultDateRange(params);
      
      expect(result.env).toBe('production');
      expect(result.s).toBe('web');
      expect(result.transaction_name).toBe('POST /api/orders');
      expect(result.has_callgraph).toBe(true);
      expect(result.search).toBe('order');
      expect(result.min_response_time_ms).toBe(1000);
      expect(result.max_response_time_ms).toBe(5000);
      expect(result.sort_by).toBe('response_time');
      expect(result.sort_order).toBe('DESC');
      expect(result.min_date).toBeDefined();
      expect(result.max_date).toBeDefined();
    });
  });
});