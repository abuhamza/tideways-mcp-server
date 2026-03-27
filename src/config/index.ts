import { config } from 'dotenv';
import { TidewaysConfig } from '../types/index.js';
import { logger } from '../lib/logger.js';

config();

export interface ServerConfig extends TidewaysConfig {
  port?: number;
}

const DEFAULT_CONFIG: Partial<ServerConfig> = {
  baseUrl: 'https://app.tideways.io/apps/api',
  maxRetries: 3,
  requestTimeout: 30000,
  port: 3000,
  rateLimit: 2500,
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
    const v = parseInt(process.env.TIDEWAYS_MAX_RETRIES, 10);
    if (!Number.isNaN(v)) config.maxRetries = v;
    else logger.warn('TIDEWAYS_MAX_RETRIES is not a valid integer, using default');
  }
  if (process.env.TIDEWAYS_REQUEST_TIMEOUT) {
    const v = parseInt(process.env.TIDEWAYS_REQUEST_TIMEOUT, 10);
    if (!Number.isNaN(v)) config.requestTimeout = v;
    else logger.warn('TIDEWAYS_REQUEST_TIMEOUT is not a valid integer, using default');
  }
  if (process.env.SERVER_PORT) {
    const v = parseInt(process.env.SERVER_PORT, 10);
    if (!Number.isNaN(v)) config.port = v;
    else logger.warn('SERVER_PORT is not a valid integer, using default');
  }
  if (process.env.TIDEWAYS_RATE_LIMIT) {
    const v = parseInt(process.env.TIDEWAYS_RATE_LIMIT, 10);
    if (!Number.isNaN(v)) config.rateLimit = v;
    else logger.warn('TIDEWAYS_RATE_LIMIT is not a valid integer, using default');
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
  if (config.rateLimit !== undefined && config.rateLimit < 1) {
    errors.push('rateLimit must be at least 1');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
}

