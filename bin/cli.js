#!/usr/bin/env node

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { TidewaysMCPServer } from '../dist/server.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(
  readFileSync(join(__dirname, '..', 'package.json'), 'utf8')
);

function showHelp() {
  console.log(`
${packageJson.name} v${packageJson.version}

${packageJson.description}

Usage:
  npx ${packageJson.name} [options]

Options:
  --help, -h       Show this help message
  --version, -v    Show version information

Environment Variables:
  TIDEWAYS_TOKEN     Your Tideways API token
  TIDEWAYS_ORG       Your Tideways organization name (required for project-scoped tools)
  TIDEWAYS_PROJECT   Your Tideways project name (required for project-scoped tools)

Examples:
  # Start MCP server
  npx ${packageJson.name}
  
  # Show version
  npx ${packageJson.name} --version

For more information, visit: ${packageJson.homepage}
`);
}

function showVersion() {
  console.log(`${packageJson.name} v${packageJson.version}`);
}

async function main() {
  const args = process.argv.slice(2);
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--help':
      case '-h':
        showHelp();
        process.exit(0);
        break;
        
      case '--version':
      case '-v':
        showVersion();
        process.exit(0);
        break;
        
        
      default:
        console.error(`Error: Unknown option '${arg}'`);
        console.error('Use --help for usage information');
        process.exit(1);
    }
  }
  
  const requiredEnvVars = ['TIDEWAYS_TOKEN'];
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.error('Error: Missing required environment variables:');
    missingVars.forEach(varName => {
      console.error(`  ${varName}`);
    });
    console.error('\nPlease set these environment variables and try again.');
    console.error('Use --help for more information.');
    process.exit(1);
  }

  if (!process.env.TIDEWAYS_ORG || !process.env.TIDEWAYS_PROJECT) {
    console.error('Warning: TIDEWAYS_ORG and TIDEWAYS_PROJECT are not set.');
    console.error('Token capability discovery will work, but project-scoped tools require both variables.');
  }
  
  try {
    const server = new TidewaysMCPServer();
    await server.start();
  } catch (error) {
    console.error('Error starting server:', error.message);
    process.exit(1);
  }
}

process.on('SIGINT', () => {
  console.log('\nShutting down Tideways MCP Server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down Tideways MCP Server...');
  process.exit(0);
});

main().catch(error => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});
