export interface FakeReply {
  status?: number;
  /** JSON-serialized into the response body. */
  body?: unknown;
  /** Sent verbatim instead of `body` (e.g. to simulate non-JSON). */
  rawBody?: string;
  headers?: Record<string, string>;
  /** Throw this instead of responding (simulates network failures and timeouts). */
  throws?: Error;
  /** Error to throw when reading the response body. */
  bodyThrows?: Error;
}

export type FakeRoute =
  FakeReply | ((url: URL, callNumber: number) => FakeReply | Promise<FakeReply>);

export interface RecordedRequest {
  url: URL;
  headers: Headers;
}

export interface FakeApi {
  fetch: typeof globalThis.fetch;
  requests: RecordedRequest[];
}

/** Epoch 1790773200 = 2026-09-30T13:00:00Z. */
export const RATE_HEADERS = {
  'x-ratelimit-limit': '5000',
  'x-ratelimit-remaining': '4999',
  'x-ratelimit-reset': '1790773200',
};

/**
 * In-memory stand-in for the Tideways API. Routes are keyed by path below the base URL,
 * e.g. "/acme/shop/performance". Unknown paths answer 404 like Tideways does.
 */
export function createFakeApi(routes: Record<string, FakeRoute>): FakeApi {
  const requests: RecordedRequest[] = [];
  const calls = new Map<string, number>();

  const fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    );
    requests.push({ url, headers: new Headers(init?.headers) });
    const path = url.pathname.replace(/^\/apps\/api/, '');
    const callNumber = (calls.get(path) ?? 0) + 1;
    calls.set(path, callNumber);

    const route = routes[path];
    const reply: FakeReply =
      route === undefined
        ? { status: 404, body: { status: 404, msg: 'Not Found' } }
        : typeof route === 'function'
          ? await route(url, callNumber)
          : route;
    if (reply.throws) throw reply.throws;

    const status = reply.status ?? 200;
    const counted = status !== 401 && status !== 404 && path !== '/_token';
    const bodyText = reply.rawBody ?? JSON.stringify(reply.body ?? {});

    // If bodyThrows is set, return a response whose .text() fails
    if (reply.bodyThrows) {
      const response = new Response(bodyText, {
        status,
        headers: {
          'content-type': 'application/json',
          ...(counted ? RATE_HEADERS : {}),
          ...reply.headers,
        },
      });
      const error = reply.bodyThrows;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any,@typescript-eslint/no-unsafe-member-access
      (response as any).text = () => Promise.reject(error);
      return response;
    }

    return new Response(bodyText, {
      status,
      headers: {
        'content-type': 'application/json',
        ...(counted ? RATE_HEADERS : {}),
        ...reply.headers,
      },
    });
  };

  return { fetch, requests };
}
