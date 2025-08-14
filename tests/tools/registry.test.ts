import { executeTool } from '../../src/tools/registry.js';
import { TidewaysClient } from '../../src/lib/tideways-client.js';

const mockClient = {} as TidewaysClient;

jest.mock('../../src/tools/handlers/performance-handler.js', () => ({
  handleGetPerformanceMetrics: jest.fn().mockResolvedValue('Performance data'),
}));

jest.mock('../../src/tools/handlers/performance-summary-handler.js', () => ({
  handleGetPerformanceSummary: jest.fn().mockResolvedValue('Performance summary data'),
}));

jest.mock('../../src/tools/handlers/issues-handler.js', () => ({
  handleGetIssues: jest.fn().mockResolvedValue('Issues data'),
}));

jest.mock('../../src/tools/handlers/traces-handler.js', () => ({
  handleGetTraces: jest.fn().mockResolvedValue('Traces data'),
}));

jest.mock('../../src/tools/handlers/historical-handler.js', () => ({
  handleGetHistoricalData: jest.fn().mockResolvedValue('Historical data result'),
}));


describe('Tool Registry', () => {
  describe('executeTool', () => {
    it('should execute get_performance_metrics tool', async () => {
      const result = await executeTool('get_performance_metrics', {}, mockClient);
      expect(result).toBe('Performance data');
    });

    it('should execute get_performance_summary tool', async () => {
      const result = await executeTool('get_performance_summary', {}, mockClient);
      expect(result).toBe('Performance summary data');
    });

    it('should execute get_issues tool', async () => {
      const result = await executeTool('get_issues', {}, mockClient);
      expect(result).toBe('Issues data');
    });

    it('should execute get_traces tool', async () => {
      const result = await executeTool('get_traces', {}, mockClient);
      expect(result).toBe('Traces data');
    });

    it('should execute historical data tool', async () => {
      const historicalResult = await executeTool('get_historical_data', { date: '2025-08-10' }, mockClient);
      expect(historicalResult).toBe('Historical data result');
    });
    

    it('should throw error for unknown tools', async () => {
      await expect(executeTool('unknown_tool', {}, mockClient))
        .rejects.toThrow('Unknown tool: unknown_tool');
    });
  });
});