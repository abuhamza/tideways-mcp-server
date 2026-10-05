# CLAUDE.md

Read-only MCP server (stdio) for the Tideways REST API, on the MCP TypeScript SDK v2 (`@modelcontextprotocol/server`) and zod 4 — the only two runtime dependencies.

## Gate

Before every commit: `npm run typecheck && npm run lint && npm run format:check && npm test`. Commits follow Conventional Commits (commitlint in CI); release-please derives versions from them: `fix` → patch, `feat` → minor, `!` or `BREAKING CHANGE:` → major.

## Invariants

- stdout carries MCP JSON-RPC only. Log through the `Logger` from `src/logger.ts` (JSON lines on stderr, sensitive keys redacted).
- Every tool is read-only and uses `READ_ONLY_ANNOTATIONS`.
- Structured content matches the tool's `outputSchema` exactly: `z.object` is advertised with `additionalProperties: false` and clients validate results after `tools/list`. Build results as the tool's exported `XOutput` type; nullable fields hold `null`.
- Path segments go through `apiPath()`. An explicit `project` argument goes through `ProjectResolver.resolve()`, which checks it against the token's projects from `/_token`.
- Failures are thrown `Error`s whose message says what failed, why, and what to do next; the SDK turns them into `isError` results the model reads.
- Test fixtures are synthetic. Real Tideways responses stay out of the repository.

## Tideways API facts (live-verified 2026-09-30; entries marked 10-02 or 10-04 on those dates)

- Times are UTC `YYYY-MM-DD HH:mm`. History day/week/month boundaries follow the organization's local calendar while its `by_time` keys stay UTC.
- The default service is project-specific, not `web`: send `env`/`s` only when the caller or config sets them.
- A project can have many services; no endpoint lists them. Issue items carry `services[]`, the only place other services' names show up (`tideways_list_services` reads them). With `s=__all`, `criteria.service` is `__all`, not the default service. (10-02) `x:cli` is the CLI context of service `x` and works as `s`.
- Scopes: `metrics` (performance, summary, history), `traces`, `errors` (issues, observations).
- (10-04) `/issues` (and `/issues/{id}`) answer in the v2 format with `Accept: application/vnd.tideways.issues.v2+json`; `tideways_list_issues` sends it. In v2, `s` filters and `s=__all` reads every service; `status=all` is open plus ignored; warnings and notices are `issueType=non-fatals&level=warning|notice`; repeated `transactionIds[]` filter by transaction (`criteria.transactionName` echoes it); `pagination{page, totalPages, totalItems}` gives totals. 10 per page; no "all" type. List items carry `message` and `annotations` (slow SQL: `duration`, nanoseconds as a numeric string) but no stack trace or transactions.
- (10-02) Without the v2 `Accept`, `/issues` ignores `s` (default service only) and turns `all` or any unknown status into `open`.
- (10-04) `/performance` `by_transactions[].id` is the numeric transaction ID that `transactionIds[]` takes.
- `/traces` returns at most 30 traces, newest first, without pagination, and has no bottleneck filter ((10-02) the UI's `bottleneckType` is ignored too). Trace `bottlenecks[]` holds values such as `nplus1`, `sql`, `http`, `cache`; observations name findings (`bottleneck-nplus1`) without the affected transactions. (10-02) `transaction_name` matches nothing (even full names); a single `min_date`/`max_date` is ignored; `sort_order` is ignored and `sort_by=date` is not honored (`response_time`, `memory` work).
- (10-02) History is production and the default service only. Old history reports can hold transactions with a null `name`.
- (10-02) Unknown `env`/`s` fall back to the defaults; `criteria` shows what was used (the tools throw on a mismatch).
- `/summary` always returns ~30 days (~218 KB); trailing all-zero buckets mean "not aggregated yet".
- The rate limit is per organization per clock hour and depends on the plan; all tokens and projects of the organization share it. `X-RateLimit-Reset` is an epoch in seconds. 429 is final until the reset; `/_token`, 401 and 404 responses are not counted.
- Error bodies come as `{error}`, `{status, msg}` or a bare JSON string (`extractApiMessage` handles all three).

## Adding or changing a tool

1. `src/tools/<name>.ts`: lenient response schema (`num`/`text` from `src/tideways/parse.ts`; `phpMap`/`phpObject` for fields where PHP encodes an empty map or object as `[]`), `inputSchema`, `outputSchema`, exported output type, `register…Tool(server, ctx)`.
2. Register it in `src/server.ts`; update `SERVER_INSTRUCTIONS` when it changes which tool answers which question.
3. `tests/tools/<name>.test.ts` through `startTestServer` and the fake API; synthetic payloads in `tests/fixtures/tideways.ts`.
4. Add it to `manifest.json` `tools` and the README tool table.

Done when the gate passes, including `tests/unit/metadata.test.ts` (manifest, `server.json` and `package.json` agree with the registered tools).

## Releases

release-please keeps a release PR open. Merging it publishes npm (Trusted Publishing over OIDC), the MCPB bundle on the GitHub release, the multi-arch image on `ghcr.io`, and the MCP Registry entry (`.github/workflows/release.yml`). release-please owns `version` in `package.json`, `server.json` and `manifest.json`, and `CHANGELOG.md`.

Workflow actions are pinned to full commit SHAs with a `# vX.Y.Z` comment and get per-job `permissions`; new steps follow the same pattern.
