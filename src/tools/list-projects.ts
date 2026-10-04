import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import type { ToolContext } from '../context.js';
import { jsonResult, READ_ONLY_ANNOTATIONS } from './shared.js';

export const listProjectsOutput = z.object({
  organization: z
    .string()
    .nullable()
    .describe("The token's organization (null if its projects span several)"),
  defaultProject: z
    .string()
    .nullable()
    .describe('Project used when a call omits "project" (null if none can be chosen)'),
  projects: z.array(
    z.object({
      name: z.string().describe('"organization/project"; pass this as the project argument'),
      organization: z.string(),
      project: z.string(),
      license: z.string().nullable(),
    })
  ),
  scopes: z
    .array(z.string())
    .describe(
      'Token scopes: metrics (performance, summary, history), traces, errors (issues, observations)'
    ),
  tokenExpired: z.boolean(),
  rateLimit: z
    .object({ limit: z.number(), remaining: z.number(), resetAt: z.string() })
    .nullable()
    .describe(
      'Rate-limit headers from the last counted request (null until another tool has made a ' +
        'request in this session; any data call, e.g. tideways_get_observations, fills it). ' +
        'The hourly limit depends on the Tideways plan and is shared by all tokens and projects ' +
        'of the organization.'
    ),
});

export type ListProjectsOutput = z.infer<typeof listProjectsOutput>;

export function registerListProjectsTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'tideways_list_projects',
    {
      title: 'List Tideways projects',
      description:
        'List the projects and scopes of the configured Tideways API token, and how much of ' +
        "the organization's hourly rate limit is left. " +
        'Call this first when unsure which project to use, or after a scope or unknown-project error.',
      inputSchema: z.strictObject({}),
      outputSchema: listProjectsOutput,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async () => {
      const info = await ctx.projects.getTokenInfo();
      const organizations = [...new Set(info.projects.map(p => p.organization))];
      const rateLimit = ctx.http.lastRateLimit();
      const output: ListProjectsOutput = {
        organization: organizations.length === 1 ? (organizations[0] ?? null) : null,
        defaultProject: await ctx.projects.defaultProjectName(),
        projects: info.projects.map(({ name, organization, project, license }) => ({
          name,
          organization,
          project,
          license,
        })),
        scopes: info.scopes,
        tokenExpired: info.expired,
        rateLimit: rateLimit
          ? {
              limit: rateLimit.limit,
              remaining: rateLimit.remaining,
              resetAt: rateLimit.resetAt.toISOString(),
            }
          : null,
      };
      return jsonResult(output);
    }
  );
}
