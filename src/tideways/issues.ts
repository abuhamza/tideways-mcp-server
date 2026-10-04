import * as z from 'zod/v4';

import { num, phpMap, phpObject, text } from './parse.js';

/** Media type that selects the v2 format of `/issues` and `/issues/{id}`. */
export const ISSUES_V2_ACCEPT = 'application/vnd.tideways.issues.v2+json';

/** `s` value that reads the issues of every service. */
export const ALL_SERVICES = '__all';

export const ISSUE_TYPES = ['error', 'slowsql', 'deprecated', 'warning', 'notice'] as const;
export type IssueType = (typeof ISSUE_TYPES)[number];

/** Query parameters selecting one issue type: warnings and notices are levels of `non-fatals`. */
export function issueTypeQuery(type: IssueType): { issueType: string; level?: string } {
  return type === 'warning' || type === 'notice'
    ? { issueType: 'non-fatals', level: type }
    : { issueType: type };
}

/** One issue in the v2 format, as the list returns it. */
export const issueV2 = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  issueType: text,
  exceptionType: text,
  type: text,
  message: text,
  source: text,
  status: text,
  occurrences: num,
  occurrencesSinceLastRelease: z.number().nullish(),
  firstOccurred: text,
  lastOccurred: text,
  environments: z.array(z.string()).default([]),
  services: z.array(z.string()).default([]),
  annotations: phpMap(z.unknown()).optional(),
});

export type IssueV2 = z.output<typeof issueV2>;

export const issuesV2Response = z.object({
  issues: z.array(issueV2).default([]),
  criteria: phpObject(
    z.object({ environment: text, service: text, status: text, level: text }).optional()
  ),
  /** Required: a body without it is not in the v2 format. */
  pagination: z.object({
    page: z.number().nullish(),
    totalPages: z.number(),
    totalItems: z.number(),
  }),
});

/**
 * Duration of a slow SQL query in ms, rounded to 2 decimals. The `duration` annotation holds
 * nanoseconds as a numeric string. Null when absent or not numeric.
 */
export function slowSqlDurationMs(issue: IssueV2): number | null {
  const value = issue.annotations?.duration;
  const duration =
    typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')
      ? Number(value)
      : Number.NaN;
  return Number.isFinite(duration) ? Math.round(duration / 10_000) / 100 : null;
}
