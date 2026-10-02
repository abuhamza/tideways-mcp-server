import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import type { ToolContext } from '../context.js';
import { TidewaysApiError, type TidewaysErrorKind } from '../tideways/errors.js';
import { apiPath } from '../tideways/http.js';
import { parseResponse, text } from '../tideways/parse.js';
import { projectLabel, type ProjectRef } from '../tideways/projects.js';
import { ISSUE_TYPES } from './issues.js';
import {
  assertAnsweredScope,
  environmentParam,
  jsonResult,
  projectParam,
  READ_ONLY_ANNOTATIONS,
  sameName,
} from './shared.js';
import { stripQuery, TRACE_LIMIT, tracesResponse } from './traces.js';

/** One call searches at most this many services. */
const MAX_SEARCHED_SERVICES = 30;
const CONCURRENT_SEARCHES = 4;
/** Requests of the hourly rate limit a search leaves for later calls. */
const RATE_LIMIT_RESERVE = 10;
/** Failures every further request would hit too; any other failure affects one service only. */
const FATAL_ERRORS: ReadonlySet<TidewaysErrorKind> = new Set(['auth', 'forbidden', 'rate_limited']);

const issuesResponse = z.object({
  issues: z.array(z.object({ services: z.array(z.string()).default([]) })).default([]),
  criteria: z.object({ environment: text, service: text }).optional(),
});

export const listServicesInput = z.strictObject({
  project: projectParam,
  environment: environmentParam.describe(
    'Environment, e.g. "production" or "staging". Defaults to the configured environment, else ' +
      'production; "environment" in the result shows which was used. When results come back, an ' +
      'unknown name fails with an error.'
  ),
  search: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe(
      'One whole word of the app, API or endpoint the user named (e.g. "voucher"). Searches the ' +
        `traces of each service for it (one request per service, at most ${MAX_SEARCHED_SERVICES} ` +
        'services) and sorts the services by matching traces.'
    ),
});

export const listServicesOutput = z.object({
  project: z.string(),
  environment: z.string().nullable().describe('Environment whose issues were read'),
  defaultService: z
    .string()
    .nullable()
    .describe("The project's default service, read when no service is passed or configured"),
  services: z
    .array(
      z.object({
        name: z
          .string()
          .describe(
            'Pass as "service". A ":cli" suffix marks the CLI scripts and workers of the service ' +
              'named before it.'
          ),
        issues: z.number().describe('How many of the open issues this call read name this service'),
        matchingTraces: z
          .number()
          .nullable()
          .optional()
          .describe(
            `With "search": traces matching the word, up to ${TRACE_LIMIT} (${TRACE_LIMIT} means at ` +
              `least ${TRACE_LIMIT}); null when the service was not searched or its search failed`
          ),
        example: z
          .object({
            transaction: z.string().nullable(),
            url: z.string().nullable().describe('Request URL without query string'),
            date: z.string().nullable().describe('UTC "YYYY-MM-DD HH:mm"'),
          })
          .nullable()
          .optional()
          .describe('With "search": the newest matching trace'),
        searchError: z
          .string()
          .nullable()
          .optional()
          .describe('With "search": why searching this service failed'),
      })
    )
    .describe(
      'Services named by the newest open errors, slow SQL queries and deprecations (first page ' +
        'of each), plus the default service; other services are missing, and the Tideways UI ' +
        'service selector lists all. Sorted default first, then by issues; with "search", by ' +
        'matchingTraces.'
    ),
  search: z
    .object({
      word: z.string(),
      searched: z.number(),
      notSearched: z
        .number()
        .describe(
          `Services left out because one call searches at most ${MAX_SEARCHED_SERVICES}, or ` +
            'fewer when the hourly rate limit is nearly used up; search them with ' +
            'tideways_search_traces'
        ),
    })
    .optional()
    .describe('Present only with "search"'),
});

export type ListServicesOutput = z.infer<typeof listServicesOutput>;
type ServiceSearch = Required<
  Pick<ListServicesOutput['services'][number], 'matchingTraces' | 'example' | 'searchError'>
>;

/**
 * Calls `fn` for each item with at most `limit` calls in flight. After a call throws, no new
 * call starts; the first error is rethrown once the running calls have settled.
 */
async function mapLimited<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  let next = 0;
  let failure: { error: unknown } | undefined;
  const worker = async () => {
    for (let index = next++; failure === undefined && index < items.length; index = next++) {
      try {
        results[index] = await fn(items[index] as T);
      } catch (error) {
        failure ??= { error };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  if (failure) throw failure.error;
  return results;
}

async function searchService(
  ctx: ToolContext,
  ref: ProjectRef,
  environment: string | undefined,
  service: string,
  search: string
): Promise<ServiceSearch> {
  const failed = (searchError: string): ServiceSearch => ({
    matchingTraces: null,
    example: null,
    searchError,
  });
  let traces: z.output<typeof tracesResponse>['traces'];
  try {
    const body = await ctx.http.get(apiPath(ref.organization, ref.project, 'traces'), {
      query: { env: environment ?? ctx.defaults.environment, s: service, search },
      scope: 'traces',
      resource: `traces of ${projectLabel(ref)} (service ${service})`,
    });
    ({ traces } = parseResponse(tracesResponse, body, 'traces'));
  } catch (error) {
    if (error instanceof TidewaysApiError && !FATAL_ERRORS.has(error.kind)) {
      return failed(error.message);
    }
    throw error;
  }
  // Every service is searched in the same environment, so a mismatch there fails the call.
  for (const trace of traces) {
    assertAnsweredScope(ctx, { environment }, trace, { checkService: false });
  }
  const mismatch = traces.find(trace => trace.service && !sameName(trace.service, service));
  if (mismatch?.service) {
    return failed(
      `Tideways does not know service "${service}" in ${mismatch.environment ?? 'this environment'} ` +
        `and answered for "${mismatch.service}" instead; its traces cannot be searched.`
    );
  }
  const [newest] = traces;
  return {
    matchingTraces: traces.length,
    example: newest
      ? {
          transaction: newest.transaction_name,
          url: newest.http?.url ? stripQuery(newest.http.url) : null,
          date: newest.date,
        }
      : null,
    searchError: null,
  };
}

export function registerListServicesTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'tideways_list_services',
    {
      title: 'List services',
      description:
        'List the services of a project (web, APIs, workers, CLI) named by its open issues, the ' +
        'default service first. Call it when the user names an app, API, endpoint or worker that ' +
        'is not a project, with "search" set to one word of it: each service is searched for that ' +
        'word and the services are sorted by matching traces, so the first ones serve it. Costs 3 ' +
        'requests, plus 1 per service with "search". Only services named by the newest open ' +
        'issues are listed; the Tideways UI service selector lists all.',
      inputSchema: listServicesInput,
      outputSchema: listServicesOutput,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ project, environment, search }) => {
      const ref = await ctx.projects.resolve(project);
      const label = projectLabel(ref);
      const pages = await Promise.all(
        ISSUE_TYPES.map(async issueType => {
          const body = await ctx.http.get(apiPath(ref.organization, ref.project, 'issues'), {
            query: { issueType, status: 'open', env: environment ?? ctx.defaults.environment },
            scope: 'errors',
            resource: `${issueType} issues of ${label}`,
          });
          const parsed = parseResponse(issuesResponse, body, 'issues');
          assertAnsweredScope(ctx, { environment }, parsed.criteria ?? {}, {
            checkService: false,
          });
          return parsed;
        })
      );

      const defaultService = pages.find(page => page.criteria?.service)?.criteria?.service ?? null;
      const mentions = new Map<string, number>();
      if (defaultService !== null) mentions.set(defaultService, 0);
      for (const issue of pages.flatMap(page => page.issues)) {
        for (const name of new Set(issue.services)) {
          mentions.set(name, (mentions.get(name) ?? 0) + 1);
        }
      }
      const isDefault = (name: string) => Number(name === defaultService);
      const services = [...mentions]
        .map(([name, issues]) => ({ name, issues }))
        .sort(
          (a, b) =>
            isDefault(b.name) - isDefault(a.name) ||
            b.issues - a.issues ||
            a.name.localeCompare(b.name)
        );

      const output: ListServicesOutput = {
        project: label,
        environment: pages.find(page => page.criteria?.environment)?.criteria?.environment ?? null,
        defaultService,
        services,
      };
      if (search !== undefined) {
        const remaining = ctx.http.lastRateLimit()?.remaining;
        const budget = remaining === undefined ? Infinity : remaining - RATE_LIMIT_RESERVE;
        const searched = services.slice(0, Math.max(0, Math.min(MAX_SEARCHED_SERVICES, budget)));
        const results = await mapLimited(searched, CONCURRENT_SEARCHES, service =>
          searchService(ctx, ref, environment, service.name, search)
        );
        const notSearched: ServiceSearch = {
          matchingTraces: null,
          example: null,
          searchError: null,
        };
        output.services = services
          .map((service, index) => ({ ...service, ...(results[index] ?? notSearched) }))
          .sort((a, b) => (b.matchingTraces ?? -1) - (a.matchingTraces ?? -1));
        output.search = {
          word: search,
          searched: searched.length,
          notSearched: services.length - searched.length,
        };
      }
      return jsonResult(output);
    }
  );
}
