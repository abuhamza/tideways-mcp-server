import { getToolDefinitions, TRACE_CONFIG } from '../../src/tools/definitions.js';

describe('Tool Definitions', () => {
  describe('TRACE_CONFIG', () => {
    it('should have correct configuration values', () => {
      expect(TRACE_CONFIG.MAX_DATE_RANGE_DAYS).toBe(90);
    });
  });

  describe('getToolDefinitions', () => {
    const tools = getToolDefinitions();

    it('should return all expected tools', () => {
      const toolNames = tools.map(tool => tool.name);
      
      expect(toolNames).toContain('get_performance_metrics');
      expect(toolNames).toContain('get_performance_summary');
      expect(toolNames).toContain('get_issues');
      expect(toolNames).toContain('get_traces');
      expect(toolNames).toContain('get_historical_data');
      expect(tools).toHaveLength(5);
    });

    it('should have valid schema for get_performance_metrics', () => {
      const tool = tools.find(t => t.name === 'get_performance_metrics');
      
      expect(tool).toBeDefined();
      expect(tool!.description).toContain('performance metrics');
      expect(tool!.inputSchema.properties).toHaveProperty('ts');
      expect(tool!.inputSchema.properties).toHaveProperty('m');
      expect(tool!.inputSchema.properties).toHaveProperty('env');
      expect(tool!.inputSchema.properties).toHaveProperty('s');
    });

    it('should have valid schema for get_performance_summary', () => {
      const tool = tools.find(t => t.name === 'get_performance_summary');
      
      expect(tool).toBeDefined();
      expect(tool!.description).toContain('time-series performance summary');
      expect(tool!.inputSchema.properties).toHaveProperty('s');
    });

    it('should have valid schema for get_traces', () => {
      const tool = tools.find(t => t.name === 'get_traces');
      
      expect(tool).toBeDefined();
      expect(tool!.description).toContain('trace samples');
      expect(tool!.inputSchema.properties).toHaveProperty('env');
      expect(tool!.inputSchema.properties).toHaveProperty('s');
      expect(tool!.inputSchema.properties).toHaveProperty('min_date');
      expect(tool!.inputSchema.properties).toHaveProperty('max_date');
      expect(tool!.inputSchema.properties).toHaveProperty('sort_by');
    });


    it('should have proper description for historical data tool', () => {
      const historicalTool = tools.find(t => t.name === 'get_historical_data');
      
      expect(historicalTool!.description).not.toContain('placeholder');
      expect(historicalTool!.description).toContain('Retrieve historical performance data');
    });
  });
});