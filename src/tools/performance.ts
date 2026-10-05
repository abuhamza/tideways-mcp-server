import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import type { ToolContext } from '../context.js';
import { apiPath } from '../tideways/http.js';
import { num, parseResponse, phpMap, text } from '../tideways/parse.js';
import { projectLabel } from '../tideways/projects.js';
import {
  apiMinuteParam,
  assertAnsweredScope,
  byKey,
  criteriaOutput,
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
  toCriteria,
  UNNAMED,
} from './shared.js';

const criteriaSchema = z.object({
  start: text,
  end: text,
  environment: text,
  service: text,
});

const performanceResponse = z.object({
  application: z.object({
    by_time: phpMap(
      z.object({ requests: num, errors: num, percentile_95p: num, median: num, average: num })
    ).default({}),
    by_transactions: z
      .array(
        z.object({
          id: z.number().nullish(),
          name: text,
          requests: num,
          response_time_average: num,
          response_time_worst: num,
          response_time_slowest: num,
          memory: z.number().nullish(),
          impact: z.number().nullish(),
        })
      )
      .default([]),
    total: z
      .object({
        error_rate: num,
        requests: num,
        response_time: num,
        average: num,
        median: num,
        downstream: phpMap(z.object({ average: num })).default({}),
      })
      .optional(),
    criteria: criteriaSchema.optional(),
  }),
});

export const performanceInput = z.strictObject({
  project: projectParam,
  environment: environmentParam,
  service: serviceParam,
  minutes: z
    .number()
    .int()
    .min(1)
    .max(1440)
    .default(60)
    .describe(
      'Window length in minutes (max 1440 = 24h). Above 60 the timeline is downsampled to at most 60 points.'
    ),
  end: apiMinuteParam
    .optional()
    .describe('Last minute included, "YYYY-MM-DD HH:mm" in UTC. Defaults to now.'),
  detail: detailParam,
});

export const performanceOutput = z.object({
  project: z.string(),
  criteria: criteriaOutput,
  totals: z.object({
    requests: z.number(),
    errorRatePercent: z.number(),
    p95Ms: z.number(),
    averageMs: z.number(),
    medianMs: z.number(),
    downstreamAverageMs: z
      .record(z.string(), z.number())
      .describe(
        'Average ms per request in each layer: sql, http, cache, al = autoloading, ct = compiling, ' +
          'io = file I/O, dns, runq = waiting for CPU, sleep, shell'
      ),
  }),
  transactions: z
    .array(
      z.object({
        id: z
          .number()
          .nullable()
          .describe(
            'Transaction ID: pass it in "transactionIds" of tideways_list_issues or ' +
              'tideways_search_traces'
          ),
        name: z.string(),
        requests: z.number(),
        averageMs: z.number(),
        p95Ms: z.number(),
        maxMs: z.number(),
        memory: z
          .number()
          .nullable()
          .describe("Peak memory in KB (same scale as traces' memoryKb)"),
        impactPercent: z.number().nullable(),
      })
    )
    .describe('Top transactions by impact; the API returns at most 20'),
  timeline: z.array(
    z.object({
      time: z.string(),
      requests: z.number(),
      errors: z.number(),
      p95Ms: z.number(),
      medianMs: z.number(),
      averageMs: z.number(),
    })
  ),
  raw: rawOutput,
});

export type PerformanceOutput = z.infer<typeof performanceOutput>;

export function registerPerformanceTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'tideways_get_performance',
    {
      title: 'Get performance metrics',
      description:
        'Performance of any window of 1-1440 minutes ending at "end" (default now) within the last ' +
        '~30 days: totals (requests, error rate, p95/median/average response time, time per layer), ' +
        'the top 20 transactions by impact, and a timeline. Older windows return zeros; use ' +
        'tideways_get_history for them. For 15-minute trends over 30 days use ' +
        'tideways_get_performance_summary.',
      inputSchema: performanceInput,
      outputSchema: performanceOutput,
      annotations: READ_ONLY_ANNOTATIONS,
      _meta: LARGE_RESULT_META,
    },
    async ({ project, environment, service, minutes, end, detail }) => {
      const ref = await ctx.projects.resolve(project);
      const label = projectLabel(ref);
      const body = await ctx.http.get(apiPath(ref.organization, ref.project, 'performance'), {
        query: { m: minutes, ts: end, ...scopeQuery(ctx, environment, service) },
        scope: 'metrics',
        resource: `performance data of ${label}`,
      });
      const app = parseResponse(performanceResponse, body, 'performance').application;
      assertAnsweredScope(ctx, { environment, service }, app.criteria ?? {});
      const total = app.total;
      const output: PerformanceOutput = {
        project: label,
        criteria: toCriteria(app.criteria),
        totals: {
          requests: total?.requests ?? 0,
          errorRatePercent: round(total?.error_rate ?? 0, 4),
          p95Ms: total?.response_time ?? 0,
          averageMs: total?.average ?? 0,
          medianMs: total?.median ?? 0,
          downstreamAverageMs: Object.fromEntries(
            Object.entries(total?.downstream ?? {}).map(([layer, { average }]) => [layer, average])
          ),
        },
        transactions: app.by_transactions.map(t => ({
          id: t.id ?? null,
          name: t.name ?? UNNAMED,
          requests: t.requests,
          averageMs: t.response_time_average,
          p95Ms: t.response_time_worst,
          maxMs: t.response_time_slowest,
          memory: t.memory === null || t.memory === undefined ? null : Math.round(t.memory),
          impactPercent: t.impact === null || t.impact === undefined ? null : round(t.impact, 4),
        })),
        timeline: Object.entries(app.by_time)
          .sort(byKey)
          .map(([time, bucket]) => ({
            time,
            requests: bucket.requests,
            errors: bucket.errors,
            p95Ms: bucket.percentile_95p,
            medianMs: bucket.median,
            averageMs: bucket.average,
          })),
        ...(detail === 'full' ? { raw: body } : {}),
      };
      return jsonResult(output);
    }
  );
}
