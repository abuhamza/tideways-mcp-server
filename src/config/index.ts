import { config } from 'dotenv';
import { TidewaysConfig } from '../types/index.js';

config();

export interface ServerConfig extends TidewaysConfig {
  port?: number;
}

const DEFAULT_CONFIG: Partial<ServerConfig> = {
  baseUrl: 'https://app.tideways.io/apps/api',
  maxRetries: 3,
  requestTimeout: 30000,
  port: 3000,
};

export function loadConfig(): ServerConfig {
  const config: ServerConfig = {
    token: process.env.TIDEWAYS_TOKEN || '',
    organization: process.env.TIDEWAYS_ORG || '',
    project: process.env.TIDEWAYS_PROJECT || '',
    ...DEFAULT_CONFIG,
  } as ServerConfig;

  if (process.env.TIDEWAYS_BASE_URL) {
    config.baseUrl = process.env.TIDEWAYS_BASE_URL;
  }
  if (process.env.TIDEWAYS_MAX_RETRIES) {
    config.maxRetries = parseInt(process.env.TIDEWAYS_MAX_RETRIES, 10);
  }
  if (process.env.TIDEWAYS_REQUEST_TIMEOUT) {
    config.requestTimeout = parseInt(process.env.TIDEWAYS_REQUEST_TIMEOUT, 10);
  }
  if (process.env.SERVER_PORT) {
    config.port = parseInt(process.env.SERVER_PORT, 10);
  }

  validateConfig(config);
  return config;
}

function validateConfig(config: ServerConfig): void {
  const errors: string[] = [];

  if (!config.token) {
    errors.push('TIDEWAYS_TOKEN environment variable is required');
  }
  if (!config.organization) {
    errors.push('TIDEWAYS_ORG environment variable is required');
  }
  if (!config.project) {
    errors.push('TIDEWAYS_PROJECT environment variable is required');
  }

  if (config.maxRetries && (config.maxRetries < 0 || config.maxRetries > 10)) {
    errors.push('maxRetries must be between 0 and 10');
  }
  if (config.requestTimeout && config.requestTimeout < 1000) {
    errors.push('requestTimeout must be at least 1000ms');
  }
  if (config.port && (config.port < 1 || config.port > 65535)) {
    errors.push('port must be between 1 and 65535');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
}

