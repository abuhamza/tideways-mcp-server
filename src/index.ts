#!/usr/bin/env node
import { serveStdio } from '@modelcontextprotocol/server/stdio';

import pkg from '../package.json' with { type: 'json' };
import { ConfigError, loadConfig } from './config.js';
import { createToolContext } from './context.js';
import { createLogger } from './logger.js';
import { createServer } from './server.js';

const HELP = `tideways-mcp-server ${pkg.version}
MCP server (stdio) for querying Tideways performance data.

Usage: tideways-mcp-server [--help | --version]

Environment:
  TIDEWAYS_TOKEN            Tideways API token (required)
  TIDEWAYS_PROJECT          Default project, "project" or "organization/project"
  TIDEWAYS_ORG              Organization (derived from the token if omitted)
  TIDEWAYS_ENV              Default environment (API default: production)
  TIDEWAYS_SERVICE          Default service (API default: the project's default service)
  TIDEWAYS_BASE_URL         API base URL (default https://app.tideways.io/apps/api)
  TIDEWAYS_REQUEST_TIMEOUT  Request timeout in ms (default 30000)
  LOG_LEVEL                 debug | info | warn | error (default info), logged to stderr

Docs: https://github.com/abuhamza/tideways-mcp-server
`;

function main(argv: string[]): void {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(HELP);
    return;
  }
  if (argv.includes('--version') || argv.includes('-v')) {
    process.stdout.write(`${pkg.version}\n`);
    return;
  }

  let config;
  try {
    config = loadConfig(process.env);
  } catch (error) {
    if (error instanceof ConfigError) {
      process.stderr.write(`tideways-mcp-server: ${error.message}\n`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }

  const logger = createLogger(config.logLevel);
  const ctx = createToolContext(config, logger);
  const handle = serveStdio(() => createServer(ctx), {
    onerror: error => {
      logger.error('transport error', { error: error.message });
    },
  });

  let shuttingDown = false;
  const shutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('shutting down', { signal });
    handle
      .close()
      .catch((error: unknown) => {
        logger.error('close failed', { error: String(error) });
      })
      .finally(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  logger.info('listening on stdio', { version: pkg.version });
}

main(process.argv.slice(2));
