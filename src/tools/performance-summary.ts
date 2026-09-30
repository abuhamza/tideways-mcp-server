import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import type { ToolContext } from '../context.js';
import { apiPath } from '../tideways/http.js';
import { num, parseResponse, text } from '../tideways/parse.js';
import { projectLabel } from '../tideways/projects.js';
import { parseApiMinute } from '../tideways/time.js';
import {
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
} from './shared.js';

const summaryResponse = z.object({
  summary: z.object({
    by_time: z
      .record(z.string(), z.object({ requests: num, errors: num, percentile_95p: num }))
      .default({}),
    criteria: z.object({ start: text, end: text, environment: text, service: text }).optional(),
  }),
});

export const performanceSummaryInput = z.object({
  project: projectParam,
  environment: environmentParam,
  service: serviceParam,
  hours: z
    .number()
    .int()
    .min(1)
    .max(744)
    .default(24)
    .describe(
      'How many hours back to include (max 744 = 31 days). The API always returns ~30 days.'
    ),
  detail: detailParam,
});

export const performanceSummaryOutput = z.object({
  project: z.string(),
  criteria: criteriaOutput,
  window: z.object({
    hours: z.number(),
    from: z.string().nullable().describe('First bucket included (UTC)'),
    to: z.string().nullable().describe('Last bucket included (UTC)'),
  }),
  totals: z.object({
    requests: z.number(),
    errors: z.number(),
    errorRatePercent: z.number(),
    maxP95Ms: z.number(),
  }),
  buckets: z
    .array(
      z.object({ time: z.string(), requests: z.number(), errors: z.number(), p95Ms: z.number() })
    )
    .describe('15-minute buckets, oldest first; a bucket keyed 12:00 covers 12:00-12:14 UTC'),
  pendingBuckets: z
    .number()
    .describe(
      'Most recent buckets Tideways has not aggregated yet (zero-filled by the API), left out'
    ),
  raw: rawOutput,
});

export type PerformanceSummaryOutput = z.infer<typeof performanceSummaryOutput>;

interface Bucket {
  time: string;
  requests: number;
  errors: number;
  p95Ms: number;
}

const isEmpty = (bucket: Bucket): boolean =>
  bucket.requests === 0 && bucket.errors === 0 && bucket.p95Ms === 0;

export function registerPerformanceSummaryTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'tideways_get_performance_summary',
    {
      title: 'Get performance summary',
      description:
        'Requests, errors and p95 response time in 15-minute buckets for the last `hours` hours ' +
        '(up to ~30 days), with totals. Use for trends, before/after comparisons and spotting ' +
        'incidents. For per-minute detail and top transactions use tideways_get_performance.',
      inputSchema: performanceSummaryInput,
      outputSchema: performanceSummaryOutput,
      annotations: READ_ONLY_ANNOTATIONS,
      _meta: LARGE_RESULT_META,
    },
    async ({ project, environment, service, hours, detail }) => {
      const ref = await ctx.projects.resolve(project);
      const label = projectLabel(ref);
      const body = await ctx.http.get(apiPath(ref.organization, ref.project, 'summary'), {
        query: scopeQuery(ctx, environment, service),
        scope: 'metrics',
        resource: `the performance summary of ${label}`,
      });
      const { summary } = parseResponse(summaryResponse, body, 'summary');

      const all: Bucket[] = Object.entries(summary.by_time)
        .sort(byKey)
        .map(([time, b]) => ({
          time,
          requests: b.requests,
          errors: b.errors,
          p95Ms: b.percentile_95p,
        }));
      let end = all.length;
      for (let last = all[end - 1]; last && isEmpty(last); last = all[end - 1]) end--;
      const cutoff = ctx.now().getTime() - hours * 3_600_000;
      const buckets = all.slice(0, end).filter(bucket => {
        const time = parseApiMinute(bucket.time);
        return time !== undefined && time.getTime() >= cutoff;
      });

      const requests = buckets.reduce((sum, b) => sum + b.requests, 0);
      const errors = buckets.reduce((sum, b) => sum + b.errors, 0);
      const output: PerformanceSummaryOutput = {
        project: label,
        criteria: toCriteria(summary.criteria),
        window: { hours, from: buckets[0]?.time ?? null, to: buckets.at(-1)?.time ?? null },
        totals: {
          requests,
          errors,
          errorRatePercent: requests === 0 ? 0 : round((errors / requests) * 100, 4),
          maxP95Ms: buckets.reduce((max, b) => Math.max(max, b.p95Ms), 0),
        },
        buckets,
        pendingBuckets: all.length - end,
        ...(detail === 'full' ? { raw: body } : {}),
      };
      return jsonResult(output);
    }
  );
}
