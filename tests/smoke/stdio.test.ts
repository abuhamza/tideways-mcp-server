import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { beforeAll, describe, expect, it } from 'vitest';

import pkg from '../../package.json' with { type: 'json' };

const root = fileURLToPath(new URL('../..', import.meta.url));
const entry = join(root, 'dist', 'index.js');
const env = {
  PATH: process.env.PATH ?? '',
  TIDEWAYS_TOKEN: 'dummy-token',
  TIDEWAYS_ORG: 'acme',
  TIDEWAYS_PROJECT: 'shop',
};

beforeAll(() => {
  const tsc = join(
    dirname(createRequire(import.meta.url).resolve('typescript/package.json')),
    'bin',
    'tsc'
  );
  execFileSync(process.execPath, [tsc, '-p', 'tsconfig.build.json'], {
    cwd: root,
    stdio: 'inherit',
  });
}, 120_000);

function run(args: string[], childEnv: Record<string, string>) {
  const child = spawn(process.execPath, [entry, ...args], {
    env: childEnv,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
  child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
  return {
    child,
    output: () => ({ stdout, stderr }),
  };
}

describe('built binary over stdio', () => {
  it('serves the tools to a real MCP client', async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [entry],
      env,
      stderr: 'pipe',
    });
    const client = new Client({ name: 'smoke', version: '0.0.0' });
    await client.connect(transport);
    try {
      expect(client.getServerVersion()?.version).toBe(pkg.version);
      const { tools } = await client.listTools();
      expect(tools).toHaveLength(7);
    } finally {
      await client.close();
    }
  });

  it('writes only JSON-RPC to stdout and exits 0 on SIGTERM', async () => {
    const { child, output } = run([], env);
    child.stdin.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'raw', version: '0' },
        },
      })}\n`
    );
    while (!output().stdout.includes('\n')) {
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    child.kill('SIGTERM');
    const [code] = (await once(child, 'exit')) as [number | null];
    expect(code).toBe(0);
    const lines = output().stdout.trim().split('\n');
    for (const line of lines) {
      expect(JSON.parse(line)).toMatchObject({ jsonrpc: '2.0' });
    }
    expect(output().stderr).toContain('listening on stdio');
    expect(output().stderr).not.toContain('dummy-token');
  });

  it('exits 1 with a clear message when the token is missing', async () => {
    const { child, output } = run([], { PATH: env.PATH });
    const [code] = (await once(child, 'exit')) as [number | null];
    expect(code).toBe(1);
    expect(output().stderr).toContain('TIDEWAYS_TOKEN is required');
    expect(output().stdout).toBe('');
  });

  it('prints version and help without starting the server', async () => {
    const version = run(['--version'], { PATH: env.PATH });
    await once(version.child, 'exit');
    expect(version.output().stdout).toBe(`${pkg.version}\n`);

    const help = run(['--help'], { PATH: env.PATH });
    await once(help.child, 'exit');
    expect(help.output().stdout).toContain('TIDEWAYS_TOKEN');
  });
});
