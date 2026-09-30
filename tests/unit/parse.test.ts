import * as z from 'zod/v4';
import { describe, expect, it } from 'vitest';

import { phpMap, phpObject } from '../../src/tideways/parse.js';

describe('phpMap', () => {
  const schema = phpMap(z.number());

  it('accepts a map and turns the empty PHP array into an empty map', () => {
    expect(schema.parse({ a: 1 })).toEqual({ a: 1 });
    expect(schema.parse([])).toEqual({});
  });

  it('still rejects non-empty arrays and other types', () => {
    expect(schema.safeParse([1]).success).toBe(false);
    expect(schema.safeParse('x').success).toBe(false);
  });

  it('supports a default when the key is missing', () => {
    expect(z.object({ m: phpMap(z.number()).default({}) }).parse({})).toEqual({ m: {} });
  });
});

describe('phpObject', () => {
  const schema = z.object({ o: phpObject(z.object({ a: z.number() }).optional()) });

  it('accepts an object and turns the empty PHP array into undefined', () => {
    expect(schema.parse({ o: { a: 1 } })).toEqual({ o: { a: 1 } });
    expect(schema.parse({ o: [] })).toEqual({ o: undefined });
    expect(schema.parse({})).toEqual({});
  });

  it('still rejects non-empty arrays', () => {
    expect(schema.safeParse({ o: [1] }).success).toBe(false);
  });
});
