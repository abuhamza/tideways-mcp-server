import * as z from 'zod/v4';

import type { ToolContext } from '../context.js';
import { parseApiDate, parseApiMinute } from '../tideways/time.js';

export const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

/** Lets Claude hosts accept large `detail: "full"` results instead of truncating them. */
export const LARGE_RESULT_META = { 'anthropic/maxResultSizeChars': 300_000 } as const;

/** Name shown for a transaction Tideways reports without one. */
export const UNNAMED = '(unnamed)';

export const projectParam = z
  .string()
  .min(1)
  .max(200)
  .optional()
  .describe(
    'Tideways project as "project" or "organization/project". Defaults to the defaultProject ' +
      'that tideways_list_projects reports; call it for valid names.'
  );

export const environmentParam = z
  .string()
  .min(1)
  .max(100)
  .optional()
  .describe(
    'Environment, e.g. "production" or "staging". Defaults to the configured environment, else ' +
      "production; criteria.environment (traces: each trace's environment) shows which was used. " +
      'When results come back, an unknown name fails with an error.'
  );

export const serviceParam = z
  .string()
  .min(1)
  .max(100)
  .optional()
  .describe(
    'Service, e.g. "web" or "worker". Defaults to the configured service, else the project\'s ' +
      'default service. A project can have several services; tideways_list_services lists ' +
      'them. When results come back, an unknown name fails with an error.'
  );

export const detailParam = z
  .enum(['concise', 'full'])
  .default('concise')
  .describe(
    '"concise" (default) returns a trimmed summary. "full" also includes the unmodified API ' +
      'response under "raw"; it can be very large.'
  );

/** Numeric transaction IDs, as in transactions[].id of tideways_get_performance. */
export const transactionIdsParam = z.array(z.number().int().positive()).min(1).max(20);

export const apiMinuteParam = z.string().refine(value => parseApiMinute(value) !== undefined, {
  message: 'Use "YYYY-MM-DD HH:mm" in UTC, e.g. "2026-09-30 14:05"',
});

export const apiDateParam = z.string().refine(value => parseApiDate(value) !== undefined, {
  message: 'Use "YYYY-MM-DD", e.g. "2026-09-29"',
});

export const rawOutput = z
  .unknown()
  .optional()
  .describe('Unmodified Tideways API response; present only when detail is "full".');

export const criteriaOutput = z
  .object({
    start: z.string().nullable(),
    end: z.string().nullable(),
    environment: z.string().nullable(),
    service: z.string().nullable(),
  })
  .describe('What Tideways actually queried. Times are UTC "YYYY-MM-DD HH:mm".');

export interface ApiCriteria {
  start?: string | null | undefined;
  end?: string | null | undefined;
  environment?: string | null | undefined;
  service?: string | null | undefined;
}

export function toCriteria(criteria: ApiCriteria | undefined): z.infer<typeof criteriaOutput> {
  return {
    start: criteria?.start ?? null,
    end: criteria?.end ?? null,
    environment: criteria?.environment ?? null,
    service: criteria?.service ?? null,
  };
}

/** Query params for environment/service: explicit argument, else configured default, else omitted. */
export function scopeQuery(
  ctx: ToolContext,
  environment: string | undefined,
  service: string | undefined
): { env: string | undefined; s: string | undefined } {
  return { env: environment ?? ctx.defaults.environment, s: service ?? ctx.defaults.service };
}

export const sameName = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

/**
 * Tideways answers for the default environment and service when asked for an unknown one.
 * Throws when what it answered for differs from what was asked (argument, else configured
 * default); a side nobody asked for, or that the response does not name, is not checked.
 */
export function assertAnsweredScope(
  ctx: ToolContext,
  asked: { environment?: string | undefined; service?: string | undefined },
  answered: { environment?: string | null | undefined; service?: string | null | undefined },
  options: { checkService?: boolean } = {}
): void {
  const environment = asked.environment ?? ctx.defaults.environment;
  const configured = (name: 'environment' | 'service') =>
    asked[name] === undefined ? ` (the configured default; pass "${name}" to override)` : '';
  if (environment && answered.environment && !sameName(environment, answered.environment)) {
    throw new Error(
      `Tideways has no environment "${environment}"${configured('environment')} and answered for ` +
        `"${answered.environment}" instead; ask the user which environment to use.`
    );
  }
  const service = asked.service ?? ctx.defaults.service;
  if (
    options.checkService !== false &&
    service &&
    answered.service &&
    !sameName(service, answered.service)
  ) {
    throw new Error(
      `Tideways has no service "${service}"${configured('service')} in ` +
        `${answered.environment ?? environment ?? 'that environment'} and answered for the default service "${answered.service}" instead. ` +
        'tideways_list_services lists the services; ask the user if none fits.'
    );
  }
}

/** Tool result carrying typed structured content plus the same data as compact JSON text. */
export function jsonResult(structured: Record<string, unknown>) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(structured) }],
    structuredContent: structured,
  };
}

export function byKey<T>([a]: [string, T], [b]: [string, T]): number {
  return a.localeCompare(b);
}

export function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}
