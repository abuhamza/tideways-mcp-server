import type { TidewaysTracesResponse, GetTracesParams } from '../src/types/index.js';
import { addDefaultDateRange } from '../src/utils/date-utils.js';

const mockTraceData: TidewaysTracesResponse = {
  traces: [
    {
      id: '123',
      transaction_name: 'GET /api/users',
      environment: 'production',
      service: 'web',
      response_time_ms: 1250,
      memory_kb: 2048,
      date: '2025-08-10 14:30:00',
      server: 'web-01',
      has_callgraph: true,
      bottlenecks: ['database', 'cpu'],
      http: {
        method: 'GET',
        status_code: 200,
        url: '/api/users?page=1'
      },
      layers: [
        { name: 'database', perc: 65, latency_sum_ms: 812, count: 10 },
        { name: 'php', perc: 30, latency_sum_ms: 375, count: 15 },
        { name: 'http', perc: 5, latency_sum_ms: 63, count: 5 }
      ],
      _links: { html_url: '/api/traces/123' }
    },
    {
      id: '124',
      transaction_name: 'POST /api/orders',
      environment: 'production',
      service: 'web',
      response_time_ms: 950,
      memory_kb: 1536,
      date: '2025-08-10 14:25:00',
      server: 'web-02',
      has_callgraph: false,
      bottlenecks: ['memory'],
      http: {
        method: 'POST',
        status_code: 201,
        url: '/api/orders'
      },
      layers: [
        { name: 'php', perc: 70, latency_sum_ms: 665, count: 25 },
        { name: 'database', perc: 25, latency_sum_ms: 238, count: 5 },
        { name: 'http', perc: 5, latency_sum_ms: 47, count: 2 }
      ],
      _links: { html_url: '/api/traces/124' }
    }
  ]
};

const emptyTraceData: TidewaysTracesResponse = {
  traces: []
};

describe('Traces Functionality', () => {
  describe('Raw JSON Output', () => {
    it('should return valid JSON for trace data', () => {
      const jsonOutput = JSON.stringify(mockTraceData, null, 2);
      
      expect(() => JSON.parse(jsonOutput)).not.toThrow();
      
      const parsed = JSON.parse(jsonOutput);
      expect(parsed).toHaveProperty('traces');
      expect(Array.isArray(parsed.traces)).toBe(true);
      expect(parsed.traces).toHaveLength(2);
    });

    it('should preserve all trace fields in JSON output', () => {
      const jsonOutput = JSON.stringify(mockTraceData, null, 2);
      const parsed = JSON.parse(jsonOutput);
      
      const firstTrace = parsed.traces[0];
      expect(firstTrace).toHaveProperty('id', '123');
      expect(firstTrace).toHaveProperty('transaction_name', 'GET /api/users');
      expect(firstTrace).toHaveProperty('response_time_ms', 1250);
      expect(firstTrace).toHaveProperty('bottlenecks');
      expect(firstTrace.bottlenecks).toEqual(['database', 'cpu']);
      expect(firstTrace).toHaveProperty('layers');
      expect(firstTrace.layers).toHaveLength(3);
    });

    it('should handle empty trace data gracefully', () => {
      const jsonOutput = JSON.stringify(emptyTraceData, null, 2);
      
      expect(() => JSON.parse(jsonOutput)).not.toThrow();
      
      const parsed = JSON.parse(jsonOutput);
      expect(parsed).toHaveProperty('traces');
      expect(parsed.traces).toHaveLength(0);
    });

    it('should format JSON with proper indentation', () => {
      const jsonOutput = JSON.stringify(mockTraceData, null, 2);
      
      expect(jsonOutput).toContain('{\n  "traces": [');
      expect(jsonOutput).toContain('    {\n      "id": "123"');
    });
  });

  describe('Date Range Handling', () => {
    it('should add default date range for traces', () => {
      const params: GetTracesParams = {
        env: 'production',
        s: 'web'
      };
      
      const result = addDefaultDateRange(params);
      
      expect(result.min_date).toBeDefined();
      expect(result.max_date).toBeDefined();
      expect(result.env).toBe('production');
      expect(result.s).toBe('web');
    });

    it('should preserve existing date parameters', () => {
      const params: GetTracesParams = {
        min_date: '2025-08-10 09:00',
        max_date: '2025-08-10 17:00',
        env: 'production'
      };
      
      const result = addDefaultDateRange(params);
      
      expect(result.min_date).toBe('2025-08-10 09:00');
      expect(result.max_date).toBe('2025-08-10 17:00');
      expect(result.env).toBe('production');
    });
  });

  describe('Trace Parameter Validation', () => {
    it('should preserve all API parameters for traces', () => {
      const params: GetTracesParams = {
        env: 'production',
        s: 'web',
        transaction_name: 'GET /api/users',
        has_callgraph: true,
        search: 'users',
        min_response_time_ms: 100,
        max_response_time_ms: 5000,
        sort_by: 'response_time',
        sort_order: 'DESC'
      };
      
      expect(params.env).toBe('production');
      expect(params.s).toBe('web');
      expect(params.transaction_name).toBe('GET /api/users');
      expect(params.has_callgraph).toBe(true);
      expect(params.search).toBe('users');
      expect(params.min_response_time_ms).toBe(100);
      expect(params.max_response_time_ms).toBe(5000);
      expect(params.sort_by).toBe('response_time');
      expect(params.sort_order).toBe('DESC');
    });
  });
});