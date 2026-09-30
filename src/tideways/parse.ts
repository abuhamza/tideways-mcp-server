import * as z from 'zod/v4';

import { TidewaysApiError } from './errors.js';

/** Number that may be missing or null in API responses; defaults to 0. */
export const num = z
  .number()
  .nullish()
  .transform(value => value ?? 0);

/** String that may be missing or null in API responses; normalized to null. */
export const text = z
  .string()
  .nullish()
  .transform(value => value ?? null);

/** Validate a Tideways response body against the shape this server relies on. */
export function parseResponse<T extends z.ZodType>(
  schema: T,
  body: unknown,
  endpoint: string
): z.output<T> {
  const result = schema.safeParse(body);
  if (result.success) return result.data;
  const issues = result.error.issues
    .slice(0, 3)
    .map(issue => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');
  throw new TidewaysApiError(
    'invalid_response',
    `Tideways returned an unexpected response shape for ${endpoint} (${issues}). ` +
      'Please report this at https://github.com/abuhamza/tideways-mcp-server/issues.'
  );
}
