import { describe, expect, it } from 'vitest';

import { createLogger } from '../../src/logger.js';

function capture(level: Parameters<typeof createLogger>[0]) {
  const lines: string[] = [];
  const logger = createLogger(level, line => {
    lines.push(line);
  });
  const entries = () => lines.map(line => JSON.parse(line) as Record<string, unknown>);
  return { logger, lines, entries };
}

describe('createLogger', () => {
  it('writes one JSON object per line with level and message', () => {
    const { logger, lines, entries } = capture('debug');
    logger.info('hello', { path: '/x' });
    expect(lines[0]?.endsWith('\n')).toBe(true);
    expect(entries()[0]).toMatchObject({ level: 'info', msg: 'hello', path: '/x' });
    expect(typeof entries()[0]?.time).toBe('string');
  });

  it('drops messages below the configured level', () => {
    const { logger, entries } = capture('warn');
    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');
    expect(entries().map(e => e.level)).toEqual(['warn', 'error']);
  });

  it('redacts sensitive field names', () => {
    const { logger, entries } = capture('debug');
    logger.debug('request', { token: 't', Authorization: 'Bearer t', apiKey: 'k', status: 200 });
    expect(entries()[0]).toMatchObject({
      token: '[REDACTED]',
      Authorization: '[REDACTED]',
      apiKey: '[REDACTED]',
      status: 200,
    });
  });
});
