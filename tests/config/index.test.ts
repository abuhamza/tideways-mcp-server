import { loadConfig } from '../../src/config/index.js';

describe('Configuration Management', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('loadConfig', () => {
    it('should load configuration with required environment variables', () => {
      process.env.TIDEWAYS_TOKEN = 'validToken123456789';
      process.env.TIDEWAYS_ORG = 'test-org';
      process.env.TIDEWAYS_PROJECT = 'test-project';

      const config = loadConfig();

      expect(config.token).toBe('validToken123456789');
      expect(config.organization).toBe('test-org');
      expect(config.project).toBe('test-project');
      expect(config.baseUrl).toBe('https://app.tideways.io/apps/api');
      expect(config.maxRetries).toBe(3);
      expect(config.requestTimeout).toBe(30000);
      expect(config.port).toBe(3000);
    });

    it('should override defaults with environment variables', () => {
      process.env.TIDEWAYS_TOKEN = 'validToken123456789';
      process.env.TIDEWAYS_ORG = 'test-org';
      process.env.TIDEWAYS_PROJECT = 'test-project';
      process.env.TIDEWAYS_BASE_URL = 'https://custom.tideways.io/api';
      process.env.TIDEWAYS_MAX_RETRIES = '5';
      process.env.TIDEWAYS_REQUEST_TIMEOUT = '60000';
      process.env.SERVER_PORT = '8080';

      const config = loadConfig();

      expect(config.baseUrl).toBe('https://custom.tideways.io/api');
      expect(config.maxRetries).toBe(5);
      expect(config.requestTimeout).toBe(60000);
      expect(config.port).toBe(8080);
    });

    it('should throw error for missing token', () => {
      delete process.env.TIDEWAYS_TOKEN;
      process.env.TIDEWAYS_ORG = 'test-org';
      process.env.TIDEWAYS_PROJECT = 'test-project';

      expect(() => loadConfig()).toThrow('TIDEWAYS_TOKEN environment variable is required');
    });

    it('should throw error for missing organization', () => {
      process.env.TIDEWAYS_TOKEN = 'validToken123456789';
      delete process.env.TIDEWAYS_ORG;
      process.env.TIDEWAYS_PROJECT = 'test-project';

      expect(() => loadConfig()).toThrow('TIDEWAYS_ORG environment variable is required');
    });

    it('should throw error for missing project', () => {
      process.env.TIDEWAYS_TOKEN = 'validToken123456789';
      process.env.TIDEWAYS_ORG = 'test-org';
      delete process.env.TIDEWAYS_PROJECT;

      expect(() => loadConfig()).toThrow('TIDEWAYS_PROJECT environment variable is required');
    });

    it('should validate numeric values', () => {
      process.env.TIDEWAYS_TOKEN = 'validToken123456789';
      process.env.TIDEWAYS_ORG = 'test-org';
      process.env.TIDEWAYS_PROJECT = 'test-project';
      process.env.TIDEWAYS_MAX_RETRIES = '15'; // Invalid: > 10

      expect(() => loadConfig()).toThrow('maxRetries must be between 0 and 10');
    });

    it('should validate timeout value', () => {
      process.env.TIDEWAYS_TOKEN = 'validToken123456789';
      process.env.TIDEWAYS_ORG = 'test-org';
      process.env.TIDEWAYS_PROJECT = 'test-project';
      process.env.TIDEWAYS_REQUEST_TIMEOUT = '500'; // Invalid: < 1000

      expect(() => loadConfig()).toThrow('requestTimeout must be at least 1000ms');
    });

    it('should validate port value', () => {
      process.env.TIDEWAYS_TOKEN = 'validToken123456789';
      process.env.TIDEWAYS_ORG = 'test-org';
      process.env.TIDEWAYS_PROJECT = 'test-project';
      process.env.SERVER_PORT = '70000'; // Invalid: > 65535

      expect(() => loadConfig()).toThrow('port must be between 1 and 65535');
    });

    it('should include cache settings', () => {
      process.env.TIDEWAYS_TOKEN = 'validToken123456789';
      process.env.TIDEWAYS_ORG = 'test-org';
      process.env.TIDEWAYS_PROJECT = 'test-project';

      const config = loadConfig();

      expect(config.port).toBe(3000);
      expect(config.maxRetries).toBe(3);
    });

    it('should accept any non-empty token', () => {
      process.env.TIDEWAYS_TOKEN = 'any-token-format-works!@#$%';
      process.env.TIDEWAYS_ORG = 'test-org';
      process.env.TIDEWAYS_PROJECT = 'test-project';

      const config = loadConfig();
      expect(config.token).toBe('any-token-format-works!@#$%');
    });
  });

});
