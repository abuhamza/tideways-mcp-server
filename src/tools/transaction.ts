import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import type { ToolContext } from '../context.js';
import { TidewaysApiError } from '../tideways/errors.js';
import { apiPath } from '../tideways/http.js';
import { num, parseResponse, phpMap, phpObject, text } from '../tideways/parse.js';
import { projectLabel } from '../tideways/projects.js';
import { parseApiMinute } from '../tideways/time.js';
import {
  apiMinuteParam,
  assertAnsweredScope,
  byKey,
  criteriaOutput,
  environmentParam,
  jsonResult,
  projectParam,
  READ_ONLY_ANNOTATIONS,
  round,
  scopeQuery,
  serviceParam,
  toCriteria,
  UNNAMED,
} from './shared.js';

const downstream = phpMap(z.object({ average: num })).default({});

const transactionResponse = z.object({
  transaction: z.object({
    id: z.number().nullish(),
    name: text,
    by_time: phpMap(
      z.object({
        requests: num,
        errors: num,
        responseTimeTargetExceeded: num,
        percentile_95p: num,
        average: num,
        median: num,
        downstream,
      })
    ).default({}),
    total: phpObject(
      z
        .object({
          error_rate: num,
          requests: num,
          response_time: num,
          average: num,
          median: num,
          downstream,
          histogram: phpObject(
            z
              .object({
                buckets: z
                  .array(z.object({ start_from_ms: num, end_to_ms: num, requests: num }))
                  .default([]),
                markers: z
                  .array(z.object({ name: text, label: text, value: z.number().nullish() }))
                  .default([]),
                total: num,
              })
              .nullish()
          ),
        })
        .nullish()
    ),
    criteria: phpObject(
      z.object({ start: text, end: text, environment: text, service: text }).nullish()
    ),
  }),
});

export const getTransactionInput = z.strictObject({
  project: projectParam,
  transactionId: z
    .number()
    .int()
    .positive()
    .describe('Numeric transaction ID from transactions[].id of tideways_get_performance'),
  minutes: z
    .number()
    .int()
    .min(1)
    .max(1440)
    .default(60)
    .describe(
      'Window length in minutes (max 1440 = 24h). Above 60 the timeline is downsampled to at ' +
        'most 60 points; bucketMinutes says how long each one is.'
    ),
  end: apiMinuteParam
    .optional()
    .describe('Last minute included, "YYYY-MM-DD HH:mm" in UTC. Defaults to now.'),
  environment: environmentParam,
  service: serviceParam,
});

const layersOutput = z
  .record(z.string(), z.number())
  .describe(
    'Average ms per request in each layer: sql, http, cache, al = autoloading, ct = compiling, ' +
      'io = file I/O, dns, runq = waiting for CPU'
  );

export const getTransactionOutput = z.object({
  project: z.string(),
  id: z.number(),
  name: z.string(),
  criteria: criteriaOutput,
  bucketMinutes: z.number().describe('Minutes covered by each timeline point'),
  totals: z.object({
    requests: z.number(),
    errorRatePercent: z.number(),
    p95Ms: z.number(),
    averageMs: z.number(),
    medianMs: z.number(),
    downstreamAverageMs: layersOutput,
    histogram: z
      .object({
        requests: z.number(),
        buckets: z
          .array(z.object({ fromMs: z.number(), toMs: z.number(), requests: z.number() }))
          .describe('Requests per response-time range'),
        markers: z
          .array(
            z.object({
              name: z.string().nullable(),
              label: z.string().nullable(),
              value: z.number().nullable(),
            })
          )
          .describe('Named values Tideways marks on the histogram'),
      })
      .nullable()
      .describe('Response-time distribution of the window; null when Tideways sends none'),
  }),
  timeline: z.array(
    z.object({
      time: z.string().describe('Start of the bucket, UTC'),
      requests: z.number(),
      errors: z.number(),
      responseTimeTargetExceeded: z
        .number()
        .describe("Requests slower than the project's response-time target"),
      p95Ms: z.number(),
      medianMs: z.number(),
      averageMs: z.number(),
      downstreamAverageMs: layersOutput,
    })
  ),
});

export type GetTransactionOutput = z.infer<typeof getTransactionOutput>;

const averages = (layers: Record<string, { average: number }>): Record<string, number> =>
  Object.fromEntries(Object.entries(layers).map(([layer, { average }]) => [layer, average]));

/** Minutes between the first two timeline keys; one point (or none) falls back to the request. */
function bucketMinutes(times: string[], minutes: number): number {
  const [first, second] = times.map(parseApiMinute);
  if (first && second) return (second.getTime() - first.getTime()) / 60_000;
  return Math.max(1, Math.ceil(minutes / 60));
}

export function registerGetTransactionTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'tideways_get_transaction',
    {
      title: 'Get one transaction',
      description:
        'Timeline of one transaction over 1-1440 minutes ending at "end" (default now): per ' +
        'minute (or per bucket above 60 minutes) requests, errors, requests over the ' +
        'response-time target, p95/median/average and time per layer, plus totals with a ' +
        'response-time histogram. Use it to see when a transaction got slow and in which ' +
        'layer. Take transactionId from transactions[].id of tideways_get_performance.',
      inputSchema: getTransactionInput,
      outputSchema: getTransactionOutput,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ project, transactionId, minutes, end, environment, service }) => {
      const ref = await ctx.projects.resolve(project);
      const label = projectLabel(ref);
      const body = await ctx.http
        .get(apiPath(ref.organization, ref.project, 'transaction', String(transactionId)), {
          query: { m: minutes, ts: end, ...scopeQuery(ctx, environment, service) },
          scope: 'metrics',
          resource: `transaction ${transactionId} of ${label}`,
        })
        .catch((error: unknown) => {
          if (error instanceof TidewaysApiError && error.kind === 'not_found') {
            throw new Error(
              `Transaction ${transactionId} not found in ${label}; take IDs from ` +
                'transactions[].id of tideways_get_performance.'
            );
          }
          throw error;
        });
      const report = parseResponse(transactionResponse, body, 'transaction').transaction;
      assertAnsweredScope(ctx, { environment, service }, report.criteria ?? {});
      const total = report.total;
      const histogram = total?.histogram;
      const timeline = Object.entries(report.by_time).sort(byKey);
      const output: GetTransactionOutput = {
        project: label,
        id: report.id ?? transactionId,
        name: report.name ?? UNNAMED,
        criteria: toCriteria(report.criteria ?? undefined),
        bucketMinutes: bucketMinutes(
          timeline.map(([time]) => time),
          minutes
        ),
        totals: {
          requests: total?.requests ?? 0,
          errorRatePercent: round(total?.error_rate ?? 0, 4),
          p95Ms: total?.response_time ?? 0,
          averageMs: total?.average ?? 0,
          medianMs: total?.median ?? 0,
          downstreamAverageMs: averages(total?.downstream ?? {}),
          histogram: histogram
            ? {
                requests: histogram.total,
                buckets: histogram.buckets.map(b => ({
                  fromMs: b.start_from_ms,
                  toMs: b.end_to_ms,
                  requests: b.requests,
                })),
                markers: histogram.markers.map(m => ({
                  name: m.name,
                  label: m.label,
                  value: m.value ?? null,
                })),
              }
            : null,
        },
        timeline: timeline.map(([time, bucket]) => ({
          time,
          requests: bucket.requests,
          errors: bucket.errors,
          responseTimeTargetExceeded: bucket.responseTimeTargetExceeded,
          p95Ms: bucket.percentile_95p,
          medianMs: bucket.median,
          averageMs: bucket.average,
          downstreamAverageMs: averages(bucket.downstream),
        })),
      };
      return jsonResult(output);
    }
  );
}
