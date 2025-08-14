#!/usr/bin/env node

import { TidewaysMCPServer } from './server.js';
import { logger } from './lib/logger.js';

async function main() {
  try {
    const server = new TidewaysMCPServer();
    await server.start();
  } catch (error) {
    logger.error('Failed to start Tideways MCP Server', error as Error);
    process.exit(1);
  }
}

main().catch(error => {
  logger.error('Unhandled error in main', error);
  process.exit(1);
});
