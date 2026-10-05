import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import type { ToolContext } from '../context.js';
import { TidewaysApiError } from '../tideways/errors.js';
import { apiPath } from '../tideways/http.js';
import { ISSUE_TYPES, ISSUES_V2_ACCEPT, issueTypeQuery, issueV2 } from '../tideways/issues.js';
import { num, parseResponse, phpMap, phpObject, text } from '../tideways/parse.js';
import { projectLabel } from '../tideways/projects.js';
import { toApiMinute } from '../tideways/time.js';
import {
  detailParam,
  jsonResult,
  LARGE_RESULT_META,
  projectParam,
  rawOutput,
  READ_ONLY_ANNOTATIONS,
  truncate,
  UNNAMED,
} from './shared.js';
import { issueSummary } from './issues.js';
import { stripQuery } from './traces.js';

const MAX_MESSAGE_LENGTH = 2000;
const MAX_STACK_FRAMES = 15;

const timestamp = z.union([z.string(), z.number()]).nullish();

const issueDetailResponse = z.object({
  issue: issueV2
    .extend({
      lastReopened: timestamp,
      transactions: z.array(z.object({ name: text, count: num })).default([]),
      occurrenceDistribution: phpObject(
        z
          .object({
            retentionDays: z.number().nullish(),
            totalOccurrences: z.number().nullish(),
            buckets: z
              .array(z.object({ start: timestamp, end: timestamp, count: num }))
              .default([]),
          })
          .nullish()
      ),
      latestOccurrence: phpObject(
        z
          .object({
            time: timestamp,
            message: text,
            type: text,
            code: z
              .union([z.string(), z.number()])
              .nullish()
              .transform(value => (value === null || value === undefined ? null : String(value))),
            service: text,
            environment: text,
            transaction: text,
            stackTrace: z
              .array(
                z.object({
                  file: text,
                  line: z.number().nullish(),
                  function: text,
                  previousException: z
                    .unknown()
                    .optional()
                    .transform(value => value ?? null),
                })
              )
              .default([]),
            annotations: phpMap(z.unknown()).optional(),
          })
          .nullish()
      ),
    })
    .nullish(),
});

export const getIssueInput = z.strictObject({
  project: projectParam,
  issueId: z.string().min(1).max(200).describe('Issue ID from issues[].id of tideways_list_issues'),
  type: z
    .enum(ISSUE_TYPES)
    .default('error')
    .describe('Type the issue was listed under in tideways_list_issues'),
  detail: detailParam,
});

export const getIssueOutput = z.object({
  project: z.string(),
  id: z.string(),
  type: z.enum(ISSUE_TYPES),
  title: z.string().describe('Exception class, or the tables of a slow SQL query'),
  message: z.string().nullable().describe('Last message or SQL, truncated to 2000 characters'),
  source: z.string().nullable(),
  status: z.string().nullable(),
  occurrences: z
    .number()
    .describe('All occurrences since firstOccurred, not limited to any period'),
  occurrencesSinceLastRelease: z.number().nullable(),
  firstOccurred: z.string().nullable(),
  lastOccurred: z.string().nullable(),
  lastReopened: z.string().nullable(),
  environments: z.array(z.string()),
  services: z.array(z.string()),
  durationMs: z
    .number()
    .nullable()
    .describe('Slow SQL queries: duration of the query in ms; null for other types'),
  transactions: z
    .array(z.object({ name: z.string(), count: z.number() }))
    .describe('Transactions that raised the issue, with their occurrence counts'),
  occurrenceHistogram: z
    .object({
      retentionDays: z.number().nullable(),
      total: z.number().nullable(),
      buckets: z.array(
        z.object({ start: z.string().nullable(), end: z.string().nullable(), count: z.number() })
      ),
    })
    .nullable()
    .describe('Occurrences per time bucket over the retention period'),
  latestOccurrence: z
    .object({
      time: z.string().nullable(),
      message: z.string().nullable(),
      type: z.string().nullable(),
      code: z.string().nullable(),
      service: z.string().nullable(),
      environment: z.string().nullable(),
      transaction: z.string().nullable(),
      stack: z
        .array(
          z.object({
            file: z.string().nullable(),
            line: z.number().nullable(),
            function: z.string().nullable(),
            previousException: z
              .unknown()
              .describe(
                'Previous (chained) exception of the frame as Tideways returns it, or null'
              ),
          })
        )
        .describe(
          `Stack trace in the order Tideways returns it, at most ${MAX_STACK_FRAMES} frames`
        ),
      stackTruncated: z
        .boolean()
        .describe('True when frames were cut; detail "full" returns the whole stack under "raw"'),
      annotations: z
        .record(z.string(), z.string())
        .describe(
          'Request context, e.g. http.url (without query string), http.method, http.status'
        ),
    })
    .nullable(),
  raw: rawOutput,
});

export type GetIssueOutput = z.infer<typeof getIssueOutput>;

function annotationValue(key: string, value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const string = typeof value === 'string' ? value : JSON.stringify(value);
  return key === 'http.url' ? stripQuery(string) : string;
}

function toAnnotations(annotations: Record<string, unknown> | undefined): Record<string, string> {
  return Object.fromEntries(
    Object.entries(annotations ?? {}).flatMap(([key, value]) => {
      const string = annotationValue(key, value);
      return string === undefined ? [] : [[key, string]];
    })
  );
}

export function registerGetIssueTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'tideways_get_issue',
    {
      title: 'Get issue',
      description:
        'Get one issue from tideways_list_issues in depth: the stack trace of its latest ' +
        `occurrence (first ${MAX_STACK_FRAMES} frames) with the request it came from (URL, method, status, host, ` +
        'service), the transactions it occurred in with counts, and its occurrences per time ' +
        'bucket over the retention period. Use to point at the failing code, rank the affected ' +
        'endpoints, and say when the issue started, peaked or stopped. Pass the id and the type ' +
        'the issue was listed under.',
      inputSchema: getIssueInput,
      outputSchema: getIssueOutput,
      annotations: READ_ONLY_ANNOTATIONS,
      _meta: LARGE_RESULT_META,
    },
    async ({ project, issueId, type, detail }) => {
      const ref = await ctx.projects.resolve(project);
      const label = projectLabel(ref);
      const notFound = new Error(
        `Tideways has no ${type} issue "${issueId}" in ${label}. Take the ID and its type from ` +
          'tideways_list_issues; an issue listed under another type needs that type.'
      );
      const body = await ctx.http
        .get(apiPath(ref.organization, ref.project, 'issues', issueId), {
          query: issueTypeQuery(type),
          accept: ISSUES_V2_ACCEPT,
          scope: 'errors',
          resource: `issue ${issueId} of ${label}`,
        })
        .catch((error: unknown) => {
          throw error instanceof TidewaysApiError && error.kind === 'not_found' ? notFound : error;
        });
      const { issue } = parseResponse(issueDetailResponse, body, 'issue');
      if (!issue) throw notFound;
      const histogram = issue.occurrenceDistribution;
      const latest = issue.latestOccurrence;
      const output: GetIssueOutput = {
        project: label,
        ...issueSummary(issue, type, MAX_MESSAGE_LENGTH),
        lastReopened: toApiMinute(issue.lastReopened),
        transactions: issue.transactions.map(t => ({ name: t.name ?? UNNAMED, count: t.count })),
        occurrenceHistogram: histogram
          ? {
              retentionDays: histogram.retentionDays ?? null,
              total: histogram.totalOccurrences ?? null,
              buckets: histogram.buckets.map(bucket => ({
                start: toApiMinute(bucket.start),
                end: toApiMinute(bucket.end),
                count: bucket.count,
              })),
            }
          : null,
        latestOccurrence: latest
          ? {
              time: toApiMinute(latest.time),
              message:
                latest.message === null ? null : truncate(latest.message, MAX_MESSAGE_LENGTH),
              type: latest.type,
              code: latest.code,
              service: latest.service,
              environment: latest.environment,
              transaction: latest.transaction,
              stack: latest.stackTrace.slice(0, MAX_STACK_FRAMES).map(frame => ({
                file: frame.file,
                line: frame.line ?? null,
                function: frame.function,
                previousException: frame.previousException,
              })),
              stackTruncated: latest.stackTrace.length > MAX_STACK_FRAMES,
              annotations: toAnnotations(latest.annotations),
            }
          : null,
        ...(detail === 'full' ? { raw: body } : {}),
      };
      return jsonResult(output);
    }
  );
}
