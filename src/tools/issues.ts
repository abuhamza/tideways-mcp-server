import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import type { ToolContext } from '../context.js';
import { apiPath } from '../tideways/http.js';
import { num, parseResponse, text } from '../tideways/parse.js';
import { projectLabel } from '../tideways/projects.js';
import {
  assertAnsweredScope,
  detailParam,
  environmentParam,
  jsonResult,
  LARGE_RESULT_META,
  projectParam,
  rawOutput,
  READ_ONLY_ANNOTATIONS,
  truncate,
} from './shared.js';

export const ISSUE_TYPES = ['error', 'slowsql', 'deprecated'] as const;
export const ISSUE_STATUSES = ['open', 'new', 'resolved', 'not_error', 'ignored'] as const;
const PAGE_SIZE = 10;
const MAX_MESSAGE_LENGTH = 500;
const MAX_TRANSACTIONS = 5;

const issuesResponse = z.object({
  issues: z
    .array(
      z.object({
        id: z.union([z.string(), z.number()]).transform(String),
        issueType: text,
        type: text,
        exceptionType: text,
        lastMessage: text,
        source: text,
        originatingFunction: text,
        status: text,
        occurrences: num,
        occurrencesSinceLastRelease: z.number().nullish(),
        firstOccurred: text,
        lastOccurred: text,
        environments: z.array(z.string()).default([]),
        services: z.array(z.string()).default([]),
        transactions: z.array(z.string()).default([]),
        lastStackTrace: z
          .array(z.object({ file: text, line: z.number().nullish(), function: text }))
          .default([]),
      })
    )
    .default([]),
  criteria: z
    .object({ environment: text, service: text, status: text, page: z.number().nullish() })
    .optional(),
});

export const listIssuesInput = z.strictObject({
  project: projectParam,
  environment: environmentParam,
  type: z
    .enum(ISSUE_TYPES)
    .default('error')
    .describe(
      'error = exceptions and fatal errors, slowsql = slow SQL queries, deprecated = deprecations'
    ),
  status: z
    .enum(ISSUE_STATUSES)
    .default('open')
    .describe(
      'open (default) = unresolved; resolved, ignored and not_error are triaged states; "new" ' +
        'currently returns the same list as "open". There is no "all"; call once per status you need.'
    ),
  page: z.number().int().min(1).default(1).describe('Page number; 10 issues per page'),
  detail: detailParam,
});

export const listIssuesOutput = z.object({
  project: z.string(),
  criteria: z.object({
    environment: z.string().nullable(),
    service: z.string().nullable(),
    type: z.enum(ISSUE_TYPES),
    status: z.string(),
    page: z.number(),
  }),
  issues: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      title: z.string().describe('Exception class, or the tables of a slow SQL query'),
      message: z.string().nullable().describe('Last message or SQL, truncated to 500 characters'),
      source: z.string().nullable(),
      originatingFunction: z.string().nullable(),
      status: z.string().nullable(),
      occurrences: z
        .number()
        .describe('All occurrences since firstOccurred, not limited to any period'),
      occurrencesSinceLastRelease: z
        .number()
        .nullable()
        .describe('Occurrences since the last release marker'),
      firstOccurred: z.string().nullable(),
      lastOccurred: z.string().nullable(),
      environments: z.array(z.string()),
      services: z.array(z.string()),
      transactionCount: z.number(),
      transactions: z
        .array(z.string())
        .describe(
          'First 5 of transactionCount affected transactions, in no particular order; detail ' +
            '"full" lists all (large)'
        ),
      topFrame: z.string().nullable().describe('Innermost stack frame of the last occurrence'),
    })
  ),
  hasMore: z
    .boolean()
    .describe(
      'True when the page is full; request the next page for more. The API reports no total.'
    ),
  raw: rawOutput,
});

export type ListIssuesOutput = z.infer<typeof listIssuesOutput>;

export function registerListIssuesTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'tideways_list_issues',
    {
      title: 'List issues',
      description:
        'List error, slow-SQL or deprecation issues of a project, newest occurrence first, 10 per ' +
        'page. Use to find what is failing or slow and how often. One type and one status per call. ' +
        'Lists issues seen in the default service of one environment. There is no time filter; ' +
        'use lastOccurred to judge recency.',
      inputSchema: listIssuesInput,
      outputSchema: listIssuesOutput,
      annotations: READ_ONLY_ANNOTATIONS,
      _meta: LARGE_RESULT_META,
    },
    async ({ project, environment, type, status, page, detail }) => {
      const ref = await ctx.projects.resolve(project);
      const label = projectLabel(ref);
      const body = await ctx.http.get(apiPath(ref.organization, ref.project, 'issues'), {
        query: { issueType: type, status, page, env: environment ?? ctx.defaults.environment },
        scope: 'errors',
        resource: `issues of ${label}`,
      });
      const parsed = parseResponse(issuesResponse, body, 'issues');
      assertAnsweredScope(ctx, { environment }, parsed.criteria ?? {}, { checkService: false });
      const output: ListIssuesOutput = {
        project: label,
        criteria: {
          environment: parsed.criteria?.environment ?? null,
          service: parsed.criteria?.service ?? null,
          type,
          status: parsed.criteria?.status ?? status,
          page: parsed.criteria?.page ?? page,
        },
        issues: parsed.issues.map(issue => {
          const [frame] = issue.lastStackTrace;
          return {
            id: issue.id,
            type: issue.issueType ?? type,
            title: issue.type ?? issue.exceptionType ?? 'Unknown',
            message:
              issue.lastMessage === null ? null : truncate(issue.lastMessage, MAX_MESSAGE_LENGTH),
            source: issue.source,
            originatingFunction: issue.originatingFunction,
            status: issue.status,
            occurrences: issue.occurrences,
            occurrencesSinceLastRelease: issue.occurrencesSinceLastRelease ?? null,
            firstOccurred: issue.firstOccurred,
            lastOccurred: issue.lastOccurred,
            environments: issue.environments,
            services: issue.services,
            transactionCount: issue.transactions.length,
            transactions: issue.transactions.slice(0, MAX_TRANSACTIONS),
            topFrame: frame
              ? `${frame.function ?? '?'} (${frame.file ?? '?'}:${frame.line ?? '?'})`
              : null,
          };
        }),
        hasMore: parsed.issues.length >= PAGE_SIZE,
        ...(detail === 'full' ? { raw: body } : {}),
      };
      return jsonResult(output);
    }
  );
}
