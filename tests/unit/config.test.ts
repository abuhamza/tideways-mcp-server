import { describe, expect, it } from 'vitest';

import { ConfigError, DEFAULT_BASE_URL, loadConfig } from '../../src/config.js';

describe('loadConfig', () => {
  it('needs only TIDEWAYS_TOKEN and applies defaults', () => {
    expect(loadConfig({ TIDEWAYS_TOKEN: 'secret' })).toEqual({
      token: 'secret',
      baseUrl: DEFAULT_BASE_URL,
      organization: undefined,
      project: undefined,
      environment: undefined,
      service: undefined,
      requestTimeoutMs: 30_000,
      logLevel: 'info',
    });
  });

  it('reads every optional variable', () => {
    const config = loadConfig({
      TIDEWAYS_TOKEN: 'secret',
      TIDEWAYS_BASE_URL: 'https://tideways.example.test/apps/api/',
      TIDEWAYS_ORG: 'acme',
      TIDEWAYS_PROJECT: 'shop',
      TIDEWAYS_ENV: 'staging',
      TIDEWAYS_SERVICE: 'worker',
      TIDEWAYS_REQUEST_TIMEOUT: '5000',
      LOG_LEVEL: 'debug',
    });
    expect(config).toMatchObject({
      baseUrl: 'https://tideways.example.test/apps/api',
      organization: 'acme',
      project: 'shop',
      environment: 'staging',
      service: 'worker',
      requestTimeoutMs: 5000,
      logLevel: 'debug',
    });
  });

  it('treats empty and whitespace-only values as unset', () => {
    const config = loadConfig({
      TIDEWAYS_TOKEN: ' secret ',
      TIDEWAYS_PROJECT: '',
      TIDEWAYS_ENV: '   ',
    });
    expect(config.token).toBe('secret');
    expect(config.project).toBeUndefined();
    expect(config.environment).toBeUndefined();
  });

  it('reports a missing token', () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
    expect(() => loadConfig({ TIDEWAYS_TOKEN: '' })).toThrow(/TIDEWAYS_TOKEN is required/);
  });

  it('rejects a non-https base URL', () => {
    expect(() =>
      loadConfig({ TIDEWAYS_TOKEN: 'x', TIDEWAYS_BASE_URL: 'http://app.tideways.io/apps/api' })
    ).toThrow(/TIDEWAYS_BASE_URL must be an https:\/\/ URL/);
    expect(() => loadConfig({ TIDEWAYS_TOKEN: 'x', TIDEWAYS_BASE_URL: 'not a url' })).toThrow(
      /TIDEWAYS_BASE_URL/
    );
  });

  it('rejects invalid timeout and log level, listing every problem', () => {
    try {
      loadConfig({ TIDEWAYS_TOKEN: 'x', TIDEWAYS_REQUEST_TIMEOUT: 'soon', LOG_LEVEL: 'loud' });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      const message = (error as Error).message;
      expect(message).toContain('TIDEWAYS_REQUEST_TIMEOUT');
      expect(message).toContain('LOG_LEVEL must be one of debug, info, warn, error');
    }
    expect(() => loadConfig({ TIDEWAYS_TOKEN: 'x', TIDEWAYS_REQUEST_TIMEOUT: '-1' })).toThrow(
      /TIDEWAYS_REQUEST_TIMEOUT must be positive/
    );
  });

  it('never includes the token in error messages', () => {
    expect(() => loadConfig({ TIDEWAYS_TOKEN: 'super-secret', LOG_LEVEL: 'loud' })).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining('super-secret') as string })
    );
  });
});
