import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import type { ToolContext } from '../context.js';
import { apiPath } from '../tideways/http.js';
import { num, parseResponse, phpMap, text } from '../tideways/parse.js';
import { projectLabel } from '../tideways/projects.js';
import {
  apiDateParam,
  byKey,
  detailParam,
  jsonResult,
  LARGE_RESULT_META,
  projectParam,
  rawOutput,
  READ_ONLY_ANNOTATIONS,
  round,
  UNNAMED,
} from './shared.js';

const TOP_TRANSACTIONS = 20;

const historyResponse = z.object({
  date_range: z.object({ start: text, end: text, granularity: text }).optional(),
  report: z
    .object({ response_time_p95: num, total_requests: num, error_rate_percent: num })
    .optional(),
  history: z
    .object({
      by_time: phpMap(z.object({ requests: num, errors: num, percentile_95p: num })).default({}),
    })
    .optional(),
  transaction_report: z
    .array(
      z.object({
        name: text,
        response_time_p95: num,
        response_time_average: z.number().nullish(),
        total_requests: num,
        memory_max: z.number().nullish(),
        impact_percent: num,
      })
    )
    .default([]),
});

export const getHistoryInput = z.strictObject({
  project: projectParam,
  date: apiDateParam.describe(
    'Day to report, "YYYY-MM-DD". For week the API uses the Monday of that week, for month the 1st.'
  ),
  granularity: z.enum(['day', 'week', 'month']).default('day'),
  detail: detailParam,
});

export const getHistoryOutput = z.object({
  project: z.string(),
  dateRange: z
    .object({
      start: z.string().nullable(),
      end: z.string().nullable(),
      granularity: z.string().nullable(),
    })
    .describe("Report boundaries in the organization's local calendar (timeline keys are UTC)"),
  report: z.object({
    totalRequests: z.number(),
    errorRatePercent: z.number(),
    p95Ms: z.number(),
  }),
  transactionCount: z
    .number()
    .describe(
      `Transactions in the full report; only the top ${TOP_TRANSACTIONS} by impact are listed, ` +
        'detail "full" has all under raw.transaction_report'
    ),
  transactions: z
    .array(
      z.object({
        name: z.string(),
        totalRequests: z.number(),
        p95Ms: z.number(),
        averageMs: z.number().nullable(),
        memoryMax: z
          .number()
          .nullable()
          .describe("Peak memory in KB (same scale as traces' memoryKb)"),
        impactPercent: z.number(),
      })
    )
    .describe(`Top ${TOP_TRANSACTIONS} transactions by impact`),
  timeline: z
    .array(
      z.object({ time: z.string(), requests: z.number(), errors: z.number(), p95Ms: z.number() })
    )
    .describe(
      'Hourly (UTC) for a day; daily (UTC date, max p95) for a week or month. The first and last ' +
        "days can be partial because the report follows the organization's calendar"
    ),
  pendingBuckets: z
    .number()
    .describe(
      'Hours of the period not aggregated yet (zero-filled by the API, left out); when > 0, ' +
        'report totals cover only part of the period'
    ),
  raw: rawOutput,
});

export type GetHistoryOutput = z.infer<typeof getHistoryOutput>;

interface Point {
  time: string;
  requests: number;
  errors: number;
  p95Ms: number;
}

function toDaily(hourly: Point[]): Point[] {
  const days = new Map<string, Point>();
  for (const point of hourly) {
    const day = point.time.slice(0, 10);
    const current = days.get(day) ?? { time: day, requests: 0, errors: 0, p95Ms: 0 };
    current.requests += point.requests;
    current.errors += point.errors;
    current.p95Ms = Math.max(current.p95Ms, point.p95Ms);
    days.set(day, current);
  }
  return [...days.values()];
}

export function registerGetHistoryTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'tideways_get_history',
    {
      title: 'Get historical report',
      description:
        'Daily, weekly or monthly performance report for a past date: total requests, error rate, p95, ' +
        `top ${TOP_TRANSACTIONS} transactions by impact and a timeline. Use to compare days or weeks. ` +
        'A period that has not ended covers only its finished hours (pendingBuckets > 0), and today ' +
        'has no data until it ends; compare such periods per day or use ' +
        "tideways_get_performance_summary. Covers production and the project's default service only; " +
        'for another environment or service use tideways_get_performance with end and minutes=1440 ' +
        '(one day per call).',
      inputSchema: getHistoryInput,
      outputSchema: getHistoryOutput,
      annotations: READ_ONLY_ANNOTATIONS,
      _meta: LARGE_RESULT_META,
    },
    async ({ project, date, granularity, detail }) => {
      const ref = await ctx.projects.resolve(project);
      const label = projectLabel(ref);
      const segments = granularity === 'day' ? [date] : [date, granularity];
      const body = await ctx.http.get(
        apiPath(ref.organization, ref.project, 'history', ...segments),
        {
          scope: 'metrics',
          resource: `the ${granularity} history of ${label} for ${date}`,
        }
      );
      const parsed = parseResponse(historyResponse, body, 'history');

      const hourly: Point[] = Object.entries(parsed.history?.by_time ?? {})
        .sort(byKey)
        .map(([time, b]) => ({
          time,
          requests: b.requests,
          errors: b.errors,
          p95Ms: b.percentile_95p,
        }));
      let end = hourly.length;
      for (
        let last = hourly[end - 1];
        last && last.requests === 0 && last.errors === 0 && last.p95Ms === 0;
        last = hourly[end - 1]
      ) {
        end--;
      }
      const complete = hourly.slice(0, end);

      const output: GetHistoryOutput = {
        project: label,
        dateRange: {
          start: parsed.date_range?.start ?? null,
          end: parsed.date_range?.end ?? null,
          granularity: parsed.date_range?.granularity ?? granularity,
        },
        report: {
          totalRequests: parsed.report?.total_requests ?? 0,
          errorRatePercent: round(parsed.report?.error_rate_percent ?? 0, 4),
          p95Ms: parsed.report?.response_time_p95 ?? 0,
        },
        transactionCount: parsed.transaction_report.length,
        transactions: [...parsed.transaction_report]
          .sort((a, b) => b.impact_percent - a.impact_percent)
          .slice(0, TOP_TRANSACTIONS)
          .map(t => ({
            name: t.name ?? UNNAMED,
            totalRequests: t.total_requests,
            p95Ms: t.response_time_p95,
            averageMs: t.response_time_average ?? null,
            memoryMax:
              t.memory_max === null || t.memory_max === undefined ? null : Math.round(t.memory_max),
            impactPercent: round(t.impact_percent, 4),
          })),
        timeline: granularity === 'day' ? complete : toDaily(complete),
        pendingBuckets: hourly.length - end,
        ...(detail === 'full' ? { raw: body } : {}),
      };
      return jsonResult(output);
    }
  );
}
