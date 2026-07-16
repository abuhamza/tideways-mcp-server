import { readFileSync } from 'fs';
import { join } from 'path';

describe('README OpenCode configuration', () => {
  const readme = readFileSync(join(process.cwd(), 'README.md'), 'utf8');

  it('documents the local OpenCode server path', () => {
    expect(readme).toContain('node');
    expect(readme).toContain('/home/nhp/projects/dev/nhp/tideways-mcp/dist/index.js');
  });

  it('uses environment substitution for the Tideways token', () => {
    expect(readme).toContain('{env:TIDEWAYS_TOKEN}');
    expect(readme).not.toMatch(/TIDEWAYS_TOKEN": "(?!\{env:TIDEWAYS_TOKEN\}|your_token)[^"]+"/);
  });

  it('documents token capabilities and observations tools', () => {
    expect(readme).toContain('get_token_capabilities');
    expect(readme).toContain('get_observations');
  });
});
