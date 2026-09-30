import pkg from '../package.json' with { type: 'json' };
import type { Config } from './config.js';
import type { Logger } from './logger.js';
import { TidewaysHttp } from './tideways/http.js';
import { ProjectResolver } from './tideways/projects.js';

/** Everything a tool handler needs. Shared by all server instances of one process. */
export interface ToolContext {
  http: TidewaysHttp;
  projects: ProjectResolver;
  defaults: { environment: string | undefined; service: string | undefined };
  now: () => Date;
}

/** Test seams; production code passes none. */
export interface ContextOverrides {
  fetch?: typeof globalThis.fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
}

export function createToolContext(
  config: Config,
  logger: Logger,
  overrides: ContextOverrides = {}
): ToolContext {
  const now = overrides.now ?? (() => new Date());
  const http = new TidewaysHttp({
    baseUrl: config.baseUrl,
    token: config.token,
    timeoutMs: config.requestTimeoutMs,
    userAgent: `tideways-mcp-server/${pkg.version}`,
    logger,
    fetch: overrides.fetch,
    sleep: overrides.sleep,
    now: () => now().getTime(),
  });
  return {
    http,
    projects: new ProjectResolver(http, {
      organization: config.organization,
      project: config.project,
    }),
    defaults: { environment: config.environment, service: config.service },
    now,
  };
}
