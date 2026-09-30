import * as z from 'zod/v4';

import { LOG_LEVELS, type LogLevel } from './logger.js';

export const DEFAULT_BASE_URL = 'https://app.tideways.io/apps/api';

export interface Config {
  token: string;
  baseUrl: string;
  organization: string | undefined;
  project: string | undefined;
  environment: string | undefined;
  service: string | undefined;
  requestTimeoutMs: number;
  logLevel: LogLevel;
}

export class ConfigError extends Error {
  override readonly name = 'ConfigError';
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

const optionalName = z.string().max(200, 'must be at most 200 characters').optional();

const envSchema = z.object({
  TIDEWAYS_TOKEN: z.string({ error: 'is required' }),
  TIDEWAYS_BASE_URL: z
    .string()
    .refine(isHttpsUrl, 'must be an https:// URL')
    .default(DEFAULT_BASE_URL),
  TIDEWAYS_ORG: optionalName,
  TIDEWAYS_PROJECT: optionalName,
  TIDEWAYS_ENV: optionalName,
  TIDEWAYS_SERVICE: optionalName,
  TIDEWAYS_REQUEST_TIMEOUT: z.coerce
    .number({ error: 'must be a number of milliseconds' })
    .int('must be an integer')
    .positive('must be positive')
    .default(30_000),
  LOG_LEVEL: z
    .enum(LOG_LEVELS, { error: `must be one of ${LOG_LEVELS.join(', ')}` })
    .default('info'),
});

/**
 * Read configuration from environment variables. Empty values count as unset,
 * because MCP client configs often contain `"TIDEWAYS_PROJECT": ""`.
 */
export function loadConfig(env: Record<string, string | undefined>): Config {
  const cleaned = Object.fromEntries(
    Object.entries(env)
      .map(([key, value]) => [key, value?.trim()] as const)
      .filter(([, value]) => value !== undefined && value !== '')
  );
  const parsed = envSchema.safeParse(cleaned);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map(issue => `  - ${issue.path.join('.')} ${issue.message}`)
      .join('\n');
    throw new ConfigError(
      `Invalid configuration:\n${details}\nSee https://github.com/abuhamza/tideways-mcp-server#configuration`
    );
  }
  const values = parsed.data;
  return {
    token: values.TIDEWAYS_TOKEN,
    baseUrl: values.TIDEWAYS_BASE_URL.replace(/\/+$/, ''),
    organization: values.TIDEWAYS_ORG,
    project: values.TIDEWAYS_PROJECT,
    environment: values.TIDEWAYS_ENV,
    service: values.TIDEWAYS_SERVICE,
    requestTimeoutMs: values.TIDEWAYS_REQUEST_TIMEOUT,
    logLevel: values.LOG_LEVEL,
  };
}
