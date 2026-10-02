import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import type { ToolContext } from '../context.js';
import { apiPath } from '../tideways/http.js';
import { num, parseResponse, phpObject, text } from '../tideways/parse.js';
import { projectLabel } from '../tideways/projects.js';
import { parseApiMinute } from '../tideways/time.js';
import {
  apiMinuteParam,
  assertAnsweredScope,
  detailParam,
  environmentParam,
  jsonResult,
  LARGE_RESULT_META,
  projectParam,
  rawOutput,
  READ_ONLY_ANNOTATIONS,
  round,
  scopeQuery,
  serviceParam,
} from './shared.js';

/** The traces endpoint always returns at most this many traces and has no pagination. */
export const TRACE_LIMIT = 30;
const TOP_LAYERS = 3;

const tracesResponse = z.object({
  traces: z
    .array(
      z.object({
        id: z.union([z.string(), z.number()]).transform(String),
        transaction_name: text,
        title: text,
        has_callgraph: z.boolean().nullish(),
        server: text,
        date: text,
        response_time_ms: num,
        memory_kb: num,
        bottlenecks: z.array(z.string()).default([]),
        layers: z
          .array(z.object({ name: z.string(), perc: num, latency_sum_ms: num, count: num }))
          .default([]),
        service: text,
        environment: text,
        _links: phpObject(z.object({ html_url: text }).nullish()),
        http: phpObject(
          z.object({ status_code: z.number().nullish(), url: text, method: text }).nullish()
        ),
      })
    )
    .default([]),
});

export const searchTracesInput = z.strictObject({
  project: projectParam,
  environment: environmentParam,
  service: serviceParam,
  transaction: z
    .string()
    .min(1)
    .max(500)
    .optional()
    .describe(
      'Exact, full transaction name as traces return it (often longer than the name shown in ' +
        'the Tideways UI), e.g. "App\\\\Controller\\\\CartController::show". Unsure? Use search first.'
    ),
  search: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe('Word search over transaction name, host and URL tokens (not full-text)'),
  from: apiMinuteParam.optional().describe('Earliest trace time, "YYYY-MM-DD HH:mm" UTC'),
  to: apiMinuteParam.optional().describe('Latest trace time (inclusive), "YYYY-MM-DD HH:mm" UTC'),
  minResponseTimeMs: z.number().int().min(0).optional(),
  maxResponseTimeMs: z.number().int().min(0).optional(),
  withCallgraph: z
    .boolean()
    .optional()
    .describe('true = only traces that have a full callgraph (profile)'),
  sortBy: z.enum(['response_time', 'date', 'memory']).optional().describe('API default: date'),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  detail: detailParam,
});

export const searchTracesOutput = z.object({
  project: z.string(),
  count: z.number(),
  limitReached: z
    .boolean()
    .describe(
      `True when ${TRACE_LIMIT} traces came back, the API maximum: narrow the time window or change sortBy to see others`
    ),
  traces: z.array(
    z.object({
      id: z.string(),
      transaction: z.string().nullable(),
      title: z.string().nullable().describe('HTTP method and path'),
      date: z.string().nullable().describe('UTC "YYYY-MM-DD HH:mm"'),
      responseTimeMs: z.number(),
      memoryKb: z.number(),
      server: z.string().nullable(),
      environment: z.string().nullable(),
      service: z.string().nullable(),
      httpMethod: z.string().nullable(),
      httpStatus: z.number().nullable(),
      url: z.string().nullable().describe('Request URL without query string'),
      bottlenecks: z
        .array(z.string())
        .describe(
          'Bottlenecks Tideways detected in this trace, e.g. "nplus1" (N+1 queries or calls, the ' +
            'trace-level form of the bottleneck-nplus1 observation), "sql", "http"'
        ),
      topLayers: z
        .array(
          z.object({
            name: z.string(),
            percent: z.number(),
            totalMs: z.number(),
            count: z.number(),
          })
        )
        .describe('Layers with the largest share of the response time'),
      hasCallgraph: z.boolean(),
      link: z.string().nullable().describe('Trace page in the Tideways UI'),
    })
  ),
  raw: rawOutput,
});

export type SearchTracesOutput = z.infer<typeof searchTracesOutput>;

/** Drop query string and fragment: they can carry session ids, tokens or personal data. */
export function stripQuery(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return url.split(/[?#]/, 1)[0] ?? url;
  }
}

export function registerSearchTracesTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'tideways_search_traces',
    {
      title: 'Search traces',
      description:
        `Find individual request traces (at most ${TRACE_LIMIT} per call, newest first unless sortBy is set) ` +
        'with response time, memory, bottlenecks and the slowest layers. Use to investigate specific slow ' +
        'or failing requests; filter by transaction, text, time window and response time.',
      inputSchema: searchTracesInput,
      outputSchema: searchTracesOutput,
      annotations: READ_ONLY_ANNOTATIONS,
      _meta: LARGE_RESULT_META,
    },
    async args => {
      const fromDate = args.from === undefined ? undefined : parseApiMinute(args.from);
      const toDate = args.to === undefined ? undefined : parseApiMinute(args.to);
      if (fromDate && toDate && fromDate >= toDate) {
        throw new Error('"from" must be earlier than "to".');
      }
      if (
        args.minResponseTimeMs !== undefined &&
        args.maxResponseTimeMs !== undefined &&
        args.minResponseTimeMs > args.maxResponseTimeMs
      ) {
        throw new Error('"minResponseTimeMs" must not exceed "maxResponseTimeMs".');
      }

      const ref = await ctx.projects.resolve(args.project);
      const label = projectLabel(ref);
      const body = await ctx.http.get(apiPath(ref.organization, ref.project, 'traces'), {
        query: {
          ...scopeQuery(ctx, args.environment, args.service),
          transaction_name: args.transaction,
          search: args.search,
          min_date: args.from,
          max_date: args.to,
          min_response_time_ms: args.minResponseTimeMs,
          max_response_time_ms: args.maxResponseTimeMs,
          has_callgraph: args.withCallgraph === true ? 'true' : undefined,
          sort_by: args.sortBy,
          sort_order: args.sortOrder?.toUpperCase(),
        },
        scope: 'traces',
        resource: `traces of ${label}`,
      });
      const { traces } = parseResponse(tracesResponse, body, 'traces');
      for (const t of traces) {
        assertAnsweredScope(ctx, args, t);
      }
      const output: SearchTracesOutput = {
        project: label,
        count: traces.length,
        limitReached: traces.length >= TRACE_LIMIT,
        traces: traces.map(trace => ({
          id: trace.id,
          transaction: trace.transaction_name,
          title: trace.title,
          date: trace.date,
          responseTimeMs: trace.response_time_ms,
          memoryKb: trace.memory_kb,
          server: trace.server,
          environment: trace.environment,
          service: trace.service,
          httpMethod: trace.http?.method ?? null,
          httpStatus: trace.http?.status_code ?? null,
          url: trace.http?.url ? stripQuery(trace.http.url) : null,
          bottlenecks: trace.bottlenecks,
          topLayers: [...trace.layers]
            .sort((a, b) => b.perc - a.perc)
            .slice(0, TOP_LAYERS)
            .map(layer => ({
              name: layer.name,
              percent: round(layer.perc),
              totalMs: layer.latency_sum_ms,
              count: layer.count,
            })),
          hasCallgraph: trace.has_callgraph ?? false,
          link: trace._links?.html_url ?? null,
        })),
        ...(args.detail === 'full' ? { raw: body } : {}),
      };
      return jsonResult(output);
    }
  );
}
