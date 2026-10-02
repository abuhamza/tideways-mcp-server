import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import type { ToolContext } from '../context.js';
import { apiPath } from '../tideways/http.js';
import { parseResponse, text } from '../tideways/parse.js';
import { projectLabel } from '../tideways/projects.js';
import {
  assertAnsweredScope,
  environmentParam,
  jsonResult,
  projectParam,
  READ_ONLY_ANNOTATIONS,
  scopeQuery,
  serviceParam,
} from './shared.js';

const observationsResponse = z.object({
  observations: z
    .array(
      z.object({
        type: z.string(),
        source: text,
        label: text,
        status: text,
        app_link: text,
        doc_link: text,
        origins: z.array(z.string()).default([]),
      })
    )
    .default([]),
  criteria: z.object({ environment: text, service: text, status: text }).optional(),
});

export const getObservationsInput = z.strictObject({
  project: projectParam,
  environment: environmentParam,
  service: serviceParam,
});

export const getObservationsOutput = z.object({
  project: z.string(),
  criteria: z.object({
    environment: z.string().nullable(),
    service: z.string().nullable(),
    status: z.string().nullable(),
  }),
  observations: z.array(
    z.object({
      type: z.string().describe('e.g. bottleneck-nplus1, opcache_low_interned_strings'),
      source: z.string().nullable().describe('"configuration" or "traces"'),
      label: z.string().nullable(),
      status: z.string().nullable().describe('"error" or "warning"'),
      link: z.string().nullable().describe('Observation page in the Tideways UI'),
      docLink: z.string().nullable(),
      origins: z.array(z.string()).describe('Hosts where a configuration finding was seen'),
    })
  ),
});

export type GetObservationsOutput = z.infer<typeof getObservationsOutput>;

export function registerGetObservationsTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'tideways_get_observations',
    {
      title: 'Get observations',
      description:
        'Automatic findings Tideways made for a project: PHP configuration problems (e.g. OPcache ' +
        'buffers, timeouts) and code bottlenecks detected in traces (e.g. N+1 queries, sleep, waits). ' +
        'Use for a quick health check or optimization ideas. Findings do not name the affected ' +
        'requests, and the API cannot filter traces by bottleneck: give the user the link, whose ' +
        'page in the Tideways UI lists recent affected traces. Do not infer N+1 queries from ' +
        'slow-SQL issues.',
      inputSchema: getObservationsInput,
      outputSchema: getObservationsOutput,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ project, environment, service }) => {
      const ref = await ctx.projects.resolve(project);
      const label = projectLabel(ref);
      const body = await ctx.http.get(apiPath(ref.organization, ref.project, 'observations'), {
        query: scopeQuery(ctx, environment, service),
        scope: 'errors',
        resource: `observations of ${label}`,
      });
      const parsed = parseResponse(observationsResponse, body, 'observations');
      assertAnsweredScope(ctx, { environment, service }, parsed.criteria ?? {});
      const output: GetObservationsOutput = {
        project: label,
        criteria: {
          environment: parsed.criteria?.environment ?? null,
          service: parsed.criteria?.service ?? null,
          status: parsed.criteria?.status ?? null,
        },
        observations: parsed.observations.map(o => ({
          type: o.type,
          source: o.source,
          label: o.label,
          status: o.status,
          link: o.app_link,
          docLink: o.doc_link,
          origins: o.origins,
        })),
      };
      return jsonResult(output);
    }
  );
}
