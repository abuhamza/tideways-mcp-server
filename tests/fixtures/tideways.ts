// Synthetic Tideways API payloads. Shapes mirror the live API (verified 2026-09-30; issues v2
// on 2026-10-04); every name, host and value is made up.

export const tokenInfo = {
  scopes: ['metrics', 'traces', 'errors'],
  projects: [
    { name: 'acme/shop', license: 'enterprise' },
    { name: 'acme/blog', license: 'profiler' },
  ],
  expired: false,
};

export const performance = {
  application: {
    by_time: {
      '2026-09-30 12:43': {
        requests: 1500,
        errors: 2,
        responseTimeTargetExceeded: 0,
        percentile_95p: 310,
        median: 22,
        average: 85,
        downstream: { sql: { average: 27.3 }, http: { average: 17.5 } },
        page_cache: [],
      },
      '2026-09-30 12:42': {
        requests: 1400,
        errors: 1,
        responseTimeTargetExceeded: 0,
        percentile_95p: 300,
        median: 20,
        average: 80,
        downstream: { sql: { average: 25.1 } },
        page_cache: [],
      },
    },
    by_transactions: [
      {
        id: 101,
        name: 'App\\Controller\\CartController::show',
        requests: 4700,
        response_time_average: 289,
        response_time_worst: 1170,
        response_time_slowest: 10274,
        response_time: 1170,
        memory: 475998,
        impact: 18.19,
        href: 'https://app.tideways.io/apps/api/acme/shop/transaction/101?env=production&s=web',
      },
    ],
    total: {
      error_rate: 0.0427,
      requests: 2900,
      response_time: 307,
      average: 83,
      median: 21,
      downstream: { sql: { average: 27 }, http: { average: 17 }, sleep: { average: 0 } },
      page_cache: { hits: 0, misses: 0 },
    },
    criteria: {
      start: '2026-09-30 11:44',
      end: '2026-09-30 12:44',
      service: 'web',
      environment: 'production',
    },
  },
};

/** Summary with 15-minute buckets from `from` to `to` (UTC), trailing `pending` buckets zero-filled. */
export function summary(from: string, to: string, pending = 2, environment = 'production') {
  const byTime: Record<string, { requests: number; errors: number; percentile_95p: number }> = {};
  const end = new Date(`${to.replace(' ', 'T')}:00Z`).getTime();
  for (let t = new Date(`${from.replace(' ', 'T')}:00Z`).getTime(); t <= end; t += 900_000) {
    byTime[new Date(t).toISOString().slice(0, 16).replace('T', ' ')] = {
      requests: 1000,
      errors: 1,
      percentile_95p: 300,
    };
  }
  const keys = Object.keys(byTime).sort();
  for (const key of keys.slice(keys.length - pending)) {
    byTime[key] = { requests: 0, errors: 0, percentile_95p: 0 };
  }
  return {
    summary: {
      by_time: byTime,
      criteria: { service: 'web', environment, start: from, end: to },
    },
  };
}

/** Issue list item of the issues v2 media type. */
export function issue(overrides: Record<string, unknown> = {}) {
  return {
    id: '1234-5_0123456789abcdef',
    issueType: 'error',
    exceptionType: 'PDOException',
    type: 'PDOException',
    message: 'SQLSTATE[HY000]: example failure',
    source: 'src/Service/Cart.php:649',
    occurrences: 17000,
    occurrencesSinceLastRelease: 2147,
    firstOccurred: '2026-09-01 19:13:19',
    lastOccurred: '2026-09-30 12:43:50',
    status: 'open',
    environments: ['production'],
    services: ['web', 'worker'],
    annotations: {
      'http.method': 'GET',
      'http.url': 'https://shop.example.test/cart?session=secret',
    },
    ...overrides,
  };
}

/** Issues v2 page; `criteria` and `pagination` override the defaults (default service "web"). */
export function issues(
  count: number,
  criteria: Record<string, unknown> = {},
  pagination: Record<string, unknown> = {}
) {
  return {
    issues: Array.from({ length: count }, (_, i) => issue({ id: `issue-${i + 1}` })),
    criteria: {
      environment: 'production',
      service: 'web',
      status: 'open',
      level: null,
      transactionName: null,
      ...criteria,
    },
    pagination: { page: 1, totalPages: count > 0 ? 1 : 0, totalItems: count, ...pagination },
  };
}

/** Issues page whose items name the given services, one array per issue. */
export function issuesNaming(services: string[][], criteria: Record<string, unknown> = {}) {
  return {
    issues: services.map((names, i) => issue({ id: `issue-${i + 1}`, services: names })),
    criteria: { ...issues(0).criteria, ...criteria },
  };
}

export function trace(overrides: Record<string, unknown> = {}) {
  return {
    id: 'AbCdEfGhIjKlMnOpQrSt',
    transaction_name: 'App\\Controller\\CartController::show',
    title: 'GET /cart/items/42',
    has_callgraph: false,
    server: 'web-1.example.test',
    date: '2026-09-30 12:44',
    response_time_ms: 60,
    memory_kb: 11284,
    bottlenecks: ['sql'],
    layers: [
      { name: 'SQL', perc: 42.97, latency_sum_ms: 26, count: 4 },
      { name: 'Cache', perc: 3.1, latency_sum_ms: 2, count: 10 },
      { name: 'HTTP', perc: 20.5, latency_sum_ms: 12, count: 1 },
      { name: 'Autoloading', perc: 1.2, latency_sum_ms: 1, count: 80 },
    ],
    service: 'web',
    environment: 'production',
    _links: { html_url: 'https://app.tideways.io/o/acme/shop/trace/AbCdEfGhIjKlMnOpQrSt/quick' },
    http: {
      status_code: 200,
      url: 'https://shop.example.test/cart/items/42?token=abc#top',
      method: 'GET',
    },
    ...overrides,
  };
}

/** Report of one transaction; the timeline is two buckets of `bucketMinutes` before `end`. */
export function transaction(id = 101, bucketMinutes = 1, end = '2026-09-30 12:44') {
  const endMs = new Date(`${end.replace(' ', 'T')}:00Z`).getTime();
  const key = (bucketsBack: number) =>
    new Date(endMs - bucketsBack * bucketMinutes * 60_000)
      .toISOString()
      .slice(0, 16)
      .replace('T', ' ');
  return {
    transaction: {
      id,
      name: 'App\\Controller\\CartController::show',
      identifier: 'cart-show',
      by_time: {
        [key(1)]: {
          requests: 120,
          errors: 1,
          responseTimeTargetExceeded: 4,
          percentile_95p: 900,
          average: 290,
          median: 210,
          downstream: { sql: { average: 120.5 }, http: { average: 40.25 }, al: { average: 3 } },
          page_cache: [],
        },
        [key(2)]: {
          requests: 100,
          errors: 0,
          responseTimeTargetExceeded: 2,
          percentile_95p: 800,
          average: 280,
          median: 200,
          downstream: { sql: { average: 110 } },
          page_cache: [],
        },
      },
      total: {
        error_rate: 0.4545,
        requests: 220,
        response_time: 850,
        average: 285,
        median: 205,
        histogram: {
          buckets: [
            { start_from_ms: 0, end_to_ms: 100, requests: 20 },
            { start_from_ms: 100, end_to_ms: 500, requests: 150 },
            { start_from_ms: 500, end_to_ms: 1000, requests: 50 },
          ],
          markers: [
            { name: 'median', label: 'Median', value: 205 },
            { name: 'p95', label: '95%', value: 850 },
          ],
          total: 220,
        },
        downstream: { sql: { average: 115 }, http: { average: 22 }, al: { average: 3 } },
        page_cache: { hits: 0, misses: 0 },
      },
      criteria: {
        start: key(2),
        end,
        service: 'web',
        environment: 'production',
      },
    },
  };
}

export function history(granularity: 'day' | 'week' | 'month' = 'day') {
  const byTime: Record<string, { requests: number; errors: number; percentile_95p: number }> = {
    '2026-09-28 22:00': { requests: 3600, errors: 9, percentile_95p: 330 },
    '2026-09-28 23:00': { requests: 3000, errors: 3, percentile_95p: 310 },
    '2026-09-29 00:00': { requests: 2000, errors: 2, percentile_95p: 350 },
    '2026-09-29 01:00': { requests: 0, errors: 0, percentile_95p: 0 },
    '2026-09-29 02:00': { requests: 0, errors: 0, percentile_95p: 0 },
  };
  return {
    _links: {
      self: { href: `/apps/api/acme/shop/history?date=2026-09-29&granularity=${granularity}` },
      chart: [{ href: '/images/history/2026-09-29/day/1/graph.svg?hash=x', type: 'image/svg+xml' }],
    },
    date_range: { start: '2026-09-29 00:00:00', end: '2026-09-29 23:59:59', granularity },
    report: { response_time_p95: 341, total_requests: 8600, error_rate_percent: 0.16 },
    history: { by_time: byTime },
    transaction_report: Array.from({ length: 25 }, (_, i) => ({
      name: `App\\Controller\\Page${i}::index`,
      response_time_p95: 1000 - i,
      response_time_worst: 1000 - i,
      response_time_average: 300,
      total_requests: 100 * (i + 1),
      memory_max: 982632,
      impact_percent: i,
    })),
  };
}

export const observations = {
  observations: [
    {
      type: 'opcache_low_interned_strings',
      source: 'configuration',
      label: 'OPcache interned strings buffer is almost full',
      status: 'error',
      app_link:
        'https://app.tideways.io/o/acme/shop/issues/observation?error=opcache_low_interned_strings',
      origins: ['web-1.example.test', 'web-2.example.test'],
    },
    {
      type: 'bottleneck-nplus1',
      source: 'traces',
      label: 'N+1 queries',
      status: 'warning',
      app_link: 'https://app.tideways.io/o/acme/shop/issues/observation?error=bottleneck-nplus1',
    },
  ],
  criteria: {
    organization: 'acme',
    application: 'shop',
    environment: 'production',
    service: 'web',
    status: 'open',
  },
};
