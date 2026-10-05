import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import type { ToolContext } from '../context.js';
import { apiPath } from '../tideways/http.js';
import {
  ALL_SERVICES,
  ISSUE_TYPES,
  ISSUES_V2_ACCEPT,
  issuesV2Response,
  issueTypeQuery,
  slowSqlDurationMs,
  type IssueType,
  type IssueV2,
} from '../tideways/issues.js';
import { parseResponse } from '../tideways/parse.js';
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
  serviceParam,
  transactionIdsParam,
  truncate,
} from './shared.js';

export const ISSUE_STATUSES = ['open', 'all', 'new', 'resolved', 'not_error', 'ignored'] as const;
const MAX_MESSAGE_LENGTH = 500;

export const listIssuesInput = z.strictObject({
  project: projectParam,
  environment: environmentParam,
  service: serviceParam.describe(
    'Service, e.g. "web" or "worker". Defaults to the configured service, else all services ' +
      'of the project; tideways_list_services lists them.'
  ),
  type: z
    .enum(ISSUE_TYPES)
    .default('error')
    .describe(
      'error = exceptions and fatal errors, slowsql = slow SQL queries, deprecated = ' +
        'deprecations, warning = PHP warnings, notice = PHP notices'
    ),
  status: z
    .enum(ISSUE_STATUSES)
    .default('open')
    .describe(
      'open (default) = unresolved; all = open and ignored together; resolved, ignored and ' +
        'not_error are triaged states; "new" currently returns the same list as "open".'
    ),
  transactionIds: transactionIdsParam
    .optional()
    .describe(
      'Only issues raised in these transactions: numeric IDs from transactions[].id of ' +
        'tideways_get_performance.'
    ),
  page: z.number().int().min(1).default(1).describe('Page number; 10 issues per page'),
  detail: detailParam,
});

export const listIssuesOutput = z.object({
  project: z.string(),
  criteria: z.object({
    environment: z.string().nullable(),
    service: z.string().nullable().describe('Service whose issues were read; null = all services'),
    type: z.enum(ISSUE_TYPES),
    status: z.string(),
    page: z.number(),
  }),
  issues: z.array(
    z.object({
      id: z.string(),
      type: z.string().describe('The requested type; tideways_get_issue takes it with the id'),
      title: z.string().describe('Exception class, or the tables of a slow SQL query'),
      message: z.string().nullable().describe('Last message or SQL, truncated to 500 characters'),
      source: z.string().nullable(),
      originatingFunction: z.string().nullable().describe('Always null; source names the code'),
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
      durationMs: z
        .number()
        .nullable()
        .describe('Slow SQL queries: duration of the query in ms; null for other types'),
      transactionCount: z
        .number()
        .nullable()
        .describe('Always null: tideways_get_issue returns the affected transactions'),
      transactions: z
        .array(z.string())
        .nullable()
        .describe(
          'Always null: tideways_get_issue returns the affected transactions with counts; ' +
            'filter the list by transaction with "transactionIds"'
        ),
      topFrame: z
        .string()
        .nullable()
        .describe(
          'Always null: tideways_get_issue returns the stack trace; source names the file and line'
        ),
    })
  ),
  hasMore: z.boolean().describe('True when later pages exist; request the next page for more'),
  totalItems: z.number().describe('Issues matching the filters on all pages'),
  totalPages: z.number(),
  raw: rawOutput,
});

export type ListIssuesOutput = z.infer<typeof listIssuesOutput>;

/** Fields that tideways_list_issues and tideways_get_issue both return for an issue. */
export function issueSummary(issue: IssueV2, type: IssueType, maxMessageLength: number) {
  return {
    id: issue.id,
    type,
    title: issue.type ?? issue.exceptionType ?? 'Unknown',
    message: issue.message === null ? null : truncate(issue.message, maxMessageLength),
    source: issue.source,
    status: issue.status,
    occurrences: issue.occurrences,
    occurrencesSinceLastRelease: issue.occurrencesSinceLastRelease ?? null,
    firstOccurred: issue.firstOccurred,
    lastOccurred: issue.lastOccurred,
    environments: issue.environments,
    services: issue.services,
    durationMs: type === 'slowsql' ? slowSqlDurationMs(issue) : null,
  };
}

export function registerListIssuesTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'tideways_list_issues',
    {
      title: 'List issues',
      description:
        'List error, slow-SQL, deprecation, warning or notice issues of a project, newest ' +
        'occurrence first, 10 per page, with the total count. Use to find what is failing or slow ' +
        'and how often. Reads all services unless "service" is passed or configured; ' +
        '"transactionIds" narrows to issues of given transactions. One type and one status per ' +
        'call. There is no time filter; use lastOccurred to judge recency.',
      inputSchema: listIssuesInput,
      outputSchema: listIssuesOutput,
      annotations: READ_ONLY_ANNOTATIONS,
      _meta: LARGE_RESULT_META,
    },
    async ({ project, environment, service, type, status, transactionIds, page, detail }) => {
      const ref = await ctx.projects.resolve(project);
      const label = projectLabel(ref);
      const sentService = service ?? ctx.defaults.service ?? ALL_SERVICES;
      const body = await ctx.http.get(apiPath(ref.organization, ref.project, 'issues'), {
        query: {
          ...issueTypeQuery(type),
          status,
          page,
          env: environment ?? ctx.defaults.environment,
          s: sentService,
          'transactionIds[]': transactionIds,
        },
        accept: ISSUES_V2_ACCEPT,
        scope: 'errors',
        resource: `issues of ${label}`,
      });
      const parsed = parseResponse(issuesV2Response, body, 'issues');
      const { criteria, pagination } = parsed;
      assertAnsweredScope(ctx, { environment, service }, criteria ?? {});
      const currentPage = pagination.page ?? page;
      const output: ListIssuesOutput = {
        project: label,
        criteria: {
          environment: criteria?.environment ?? null,
          service: sentService === ALL_SERVICES ? null : (criteria?.service ?? sentService),
          type,
          status: criteria?.status ?? status,
          page: currentPage,
        },
        issues: parsed.issues.map(issue => ({
          ...issueSummary(issue, type, MAX_MESSAGE_LENGTH),
          originatingFunction: null,
          transactionCount: null,
          transactions: null,
          topFrame: null,
        })),
        hasMore: currentPage < pagination.totalPages,
        totalItems: pagination.totalItems,
        totalPages: pagination.totalPages,
        ...(detail === 'full' ? { raw: body } : {}),
      };
      return jsonResult(output);
    }
  );
}
