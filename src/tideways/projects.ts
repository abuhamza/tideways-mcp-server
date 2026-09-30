import * as z from 'zod/v4';

import type { TidewaysHttp } from './http.js';
import { parseResponse } from './parse.js';

const tokenResponseSchema = z.object({
  scopes: z.array(z.string()).default([]),
  projects: z.array(z.object({ name: z.string(), license: z.string().nullish() })).default([]),
  expired: z.boolean().default(false),
});

export interface ProjectRef {
  organization: string;
  project: string;
}

export interface TokenProject extends ProjectRef {
  /** "organization/project", as Tideways names it. */
  name: string;
  license: string | null;
}

export interface TokenInfo {
  scopes: string[];
  projects: TokenProject[];
  expired: boolean;
}

/** Split "organization/project"; undefined unless there is exactly one slash with text on both sides. */
export function splitProjectName(name: string): ProjectRef | undefined {
  const parts = name.split('/');
  const [organization, project] = parts;
  if (parts.length !== 2 || !organization || !project) return undefined;
  return { organization, project };
}

export function projectLabel(ref: ProjectRef): string {
  return `${ref.organization}/${ref.project}`;
}

function describeAvailable(projects: TokenProject[]): string {
  return projects.length === 0
    ? 'This token cannot access any project.'
    : `Projects available to this token: ${projects.map(p => p.name).join(', ')}.`;
}

/**
 * Resolves the project a tool call targets. The token info (GET /_token, which does not
 * count against the rate limit) is fetched lazily once and reused; failures are not cached.
 */
export class ProjectResolver {
  private tokenInfo: Promise<TokenInfo> | undefined;

  constructor(
    private readonly http: TidewaysHttp,
    private readonly defaults: { organization: string | undefined; project: string | undefined }
  ) {}

  getTokenInfo(): Promise<TokenInfo> {
    this.tokenInfo ??= this.fetchTokenInfo().catch((error: unknown) => {
      this.tokenInfo = undefined;
      throw error;
    });
    return this.tokenInfo;
  }

  /**
   * An explicit `requested` project is always checked against the token's project list, so
   * arbitrary strings never reach URL paths. The configured default is trusted when complete.
   */
  async resolve(requested?: string): Promise<ProjectRef> {
    const candidate = requested ?? this.defaults.project;
    if (requested === undefined && candidate !== undefined) {
      const configured =
        splitProjectName(candidate) ??
        (this.defaults.organization === undefined
          ? undefined
          : { organization: this.defaults.organization, project: candidate });
      if (configured) return configured;
    }

    const { projects } = await this.getTokenInfo();
    if (candidate === undefined) {
      const [only] = projects;
      if (projects.length === 1 && only)
        return { organization: only.organization, project: only.project };
      throw new Error(
        `No project selected. Pass the "project" argument or set TIDEWAYS_PROJECT. ${describeAvailable(projects)}`
      );
    }

    const matches = candidate.includes('/')
      ? projects.filter(p => p.name === candidate)
      : projects.filter(
          p =>
            p.project === candidate &&
            (this.defaults.organization === undefined ||
              p.organization === this.defaults.organization)
        );
    const [match] = matches;
    if (matches.length === 1 && match)
      return { organization: match.organization, project: match.project };
    if (matches.length > 1) {
      throw new Error(
        `Project "${candidate}" is ambiguous; use "organization/project": ${matches.map(m => m.name).join(', ')}.`
      );
    }
    throw new Error(`Unknown project "${candidate}". ${describeAvailable(projects)}`);
  }

  /** The project used when a call omits "project", or null if none can be chosen. */
  async defaultProjectName(): Promise<string | null> {
    try {
      return projectLabel(await this.resolve());
    } catch {
      return null;
    }
  }

  private async fetchTokenInfo(): Promise<TokenInfo> {
    const body = await this.http.get('/_token', {
      resource: 'the token info endpoint (/_token)',
      uncounted: true,
    });
    const parsed = parseResponse(tokenResponseSchema, body, '/_token');
    return {
      scopes: parsed.scopes,
      expired: parsed.expired,
      projects: parsed.projects.flatMap(entry => {
        const ref = splitProjectName(entry.name);
        return ref ? [{ ...ref, name: entry.name, license: entry.license ?? null }] : [];
      }),
    };
  }
}
