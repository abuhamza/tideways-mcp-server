import { describe, expect, it } from 'vitest';

import {
  formatApiMinute,
  parseApiDate,
  parseApiMinute,
  toApiMinute,
} from '../../src/tideways/time.js';

describe('API time helpers', () => {
  it('formats and parses minutes as UTC', () => {
    const date = new Date('2026-09-30T14:05:59Z');
    expect(formatApiMinute(date)).toBe('2026-09-30 14:05');
    expect(parseApiMinute('2026-09-30 14:05')).toEqual(new Date('2026-09-30T14:05:00Z'));
  });

  it.each([
    '2026-09-30T14:05',
    '2026-09-30 14:05:00',
    '2026-9-30 14:05',
    '2026-02-30 10:00',
    '2026-09-30 24:00',
    '',
  ])('rejects minute %j', value => {
    expect(parseApiMinute(value)).toBeUndefined();
  });

  it('parses real dates only', () => {
    expect(parseApiDate('2026-09-29')).toEqual(new Date('2026-09-29T00:00:00Z'));
    expect(parseApiDate('2026-02-29')).toBeUndefined();
    expect(parseApiDate('2026-09-29 00:00')).toBeUndefined();
    expect(parseApiDate('29.09.2026')).toBeUndefined();
  });

  it.each([
    ['2026-09-30 14:05:59', '2026-09-30 14:05'],
    ['2026-09-30T14:05', '2026-09-30 14:05'],
    ['2026-09-30T16:05:59+02:00', '2026-09-30 14:05'],
    [1790777100, '2026-09-30 14:05'],
    ['last week', 'last week'],
    [null, null],
  ])('normalizes timestamp %j to %j', (value, expected) => {
    expect(toApiMinute(value)).toBe(expected);
  });
});
