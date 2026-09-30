import { rateLimitMessage, type RateLimitSnapshot } from './rate-limit.js';

/** Token scopes as reported by GET /_token. The docs call "errors" the "issues" scope. */
export type TokenScope = 'metrics' | 'traces' | 'errors';

export type TidewaysErrorKind =
  | 'auth'
  | 'forbidden'
  | 'not_found'
  | 'bad_request'
  | 'rate_limited'
  | 'server'
  | 'network'
  | 'timeout'
  | 'invalid_response';

/**
 * Thrown for every failed Tideways request. The message is written for the model:
 * what failed, why, and what to do next. The MCP SDK turns a thrown Error into an
 * `isError: true` tool result carrying this message.
 */
export class TidewaysApiError extends Error {
  override readonly name = 'TidewaysApiError';

  constructor(
    readonly kind: TidewaysErrorKind,
    message: string,
    readonly status?: number,
    readonly resetAt?: Date
  ) {
    super(message);
  }
}

export interface RequestContext {
  scope: TokenScope | undefined;
  resource: string;
  host: string;
  timeoutMs: number;
  attempts: number;
}

function truncate(text: string, max = 300): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Tideways error bodies come as `{error}`, `{status, msg}` or a bare JSON string. */
export function extractApiMessage(body: unknown): string | undefined {
  if (typeof body === 'string') return body === '' ? undefined : truncate(body);
  if (body !== null && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    for (const key of ['error', 'msg', 'message']) {
      const value = record[key];
      if (typeof value === 'string' && value !== '') return truncate(value);
    }
  }
  return undefined;
}

export function errorForStatus(
  status: number,
  body: unknown,
  context: RequestContext,
  rateLimit: RateLimitSnapshot | undefined
): TidewaysApiError {
  const apiMessage = extractApiMessage(body);
  const detail = apiMessage === undefined ? '' : `: ${apiMessage}`;
  const { resource } = context;

  if (status === 401) {
    return new TidewaysApiError(
      'auth',
      `Tideways rejected the API token (HTTP 401${detail}). Check that TIDEWAYS_TOKEN is a ` +
        'valid, unexpired token created under Organization settings → API Access.',
      status
    );
  }
  if (status === 403) {
    const scopeHint =
      context.scope === undefined ? '' : ` This endpoint needs the "${context.scope}" scope.`;
    return new TidewaysApiError(
      'forbidden',
      `The API token may not access ${resource} (HTTP 403${detail}).${scopeHint} ` +
        "Call tideways_list_projects to see the token's scopes and projects.",
      status
    );
  }
  if (status === 404) {
    return new TidewaysApiError(
      'not_found',
      `Tideways found nothing for ${resource} (HTTP 404${detail}). ` +
        'Check the organization and project with tideways_list_projects.',
      status
    );
  }
  if (status === 429) {
    return new TidewaysApiError(
      'rate_limited',
      rateLimitMessage(rateLimit),
      status,
      rateLimit?.resetAt
    );
  }
  if (status >= 500) {
    return new TidewaysApiError(
      'server',
      `Tideways API error for ${resource} (HTTP ${status}${detail}) after ` +
        `${context.attempts} attempt(s). Try again in a few minutes.`,
      status
    );
  }
  return new TidewaysApiError(
    'bad_request',
    `Tideways rejected the request for ${resource} (HTTP ${status}${detail}). Check the tool arguments.`,
    status
  );
}

export function errorForTransport(cause: unknown, context: RequestContext): TidewaysApiError {
  if (cause instanceof Error && cause.name === 'TimeoutError') {
    return new TidewaysApiError(
      'timeout',
      `Tideways API did not answer the request for ${context.resource} within ` +
        `${context.timeoutMs} ms (${context.attempts} attempt(s)). Try again, or raise TIDEWAYS_REQUEST_TIMEOUT.`
    );
  }
  const code =
    cause instanceof Error && cause.cause instanceof Error && 'code' in cause.cause
      ? String(cause.cause.code)
      : undefined;
  const reason = code ?? (cause instanceof Error ? cause.message : String(cause));
  return new TidewaysApiError(
    'network',
    `Could not reach the Tideways API at ${context.host} (${reason}). ` +
      'Check network access and TIDEWAYS_BASE_URL.'
  );
}
