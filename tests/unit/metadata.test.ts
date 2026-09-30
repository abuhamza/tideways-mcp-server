import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import pkg from '../../package.json' with { type: 'json' };
import { startTestServer } from '../helpers/harness.js';

interface ServerJson {
  name: string;
  version: string;
  packages: {
    registryType: string;
    identifier: string;
    version?: string;
    environmentVariables?: { name: string }[];
  }[];
}

interface Manifest {
  version: string;
  tools: { name: string }[];
  server: { mcp_config: { env: Record<string, string> } };
}

function read(file: string): unknown {
  return JSON.parse(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'));
}

const ENV_VARS = [
  'TIDEWAYS_TOKEN',
  'TIDEWAYS_ORG',
  'TIDEWAYS_PROJECT',
  'TIDEWAYS_ENV',
  'TIDEWAYS_SERVICE',
];

describe('distribution metadata', () => {
  const serverJson = read('server.json') as ServerJson;
  const manifest = read('manifest.json') as Manifest;

  it('keeps the registry name and versions in sync with package.json', () => {
    expect(pkg.mcpName).toBe(serverJson.name);
    expect(serverJson.version).toBe(pkg.version);
    expect(serverJson.packages[0]?.registryType).toBe('npm');
    expect(serverJson.packages.find(p => p.registryType === 'npm')).toMatchObject({
      identifier: pkg.name,
      version: pkg.version,
    });
    expect(manifest.version).toBe(pkg.version);
  });

  it('declares the same environment variables everywhere', () => {
    for (const entry of serverJson.packages.filter(p => p.environmentVariables)) {
      expect(entry.environmentVariables?.map(v => v.name)).toEqual(ENV_VARS);
    }
    expect(Object.keys(manifest.server.mcp_config.env)).toEqual(ENV_VARS);
  });

  it('lists exactly the tools the server registers in the MCPB manifest', async () => {
    const server = await startTestServer({});
    try {
      const { tools } = await server.client.listTools();
      expect(manifest.tools.map(t => t.name)).toEqual(tools.map(t => t.name));
    } finally {
      await server.close();
    }
  });
});
