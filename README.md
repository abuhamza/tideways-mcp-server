# Tideways MCP Server

[![npm](https://img.shields.io/npm/v/tideways-mcp-server)](https://www.npmjs.com/package/tideways-mcp-server)
[![CI](https://github.com/abuhamza/tideways-mcp-server/actions/workflows/ci.yml/badge.svg)](https://github.com/abuhamza/tideways-mcp-server/actions/workflows/ci.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/abuhamza/tideways-mcp-server/badge)](https://scorecard.dev/viewer/?uri=github.com/abuhamza/tideways-mcp-server)

A read-only [Model Context Protocol](https://modelcontextprotocol.io) server for [Tideways](https://tideways.com/). It lets an AI assistant answer questions such as "why was checkout slow yesterday?" from your performance data, issues and traces. It only calls `GET` endpoints of the [Tideways REST API](https://support.tideways.com/documentation/reference/api/index.html).

## Tools

| Tool | Answers |
|---|---|
| `tideways_list_projects` | Which projects, scopes and rate-limit budget does my token have? |
| `tideways_list_services` | Which services does a project have, and which of them serve "voucher"? |
| `tideways_get_performance` | How is the app doing in any window of up to 24 h within the last ~30 days? Totals, layers, top transactions |
| `tideways_get_performance_summary` | Requests, errors and p95 in 15-minute buckets over up to 30 days |
| `tideways_list_issues` | Which errors, slow SQL queries or deprecations are open, resolved or ignored? |
| `tideways_search_traces` | Which individual requests were slow, and where did the time go? |
| `tideways_get_history` | Day, week or month report for a past date |
| `tideways_get_observations` | Configuration problems and code bottlenecks Tideways detected (e.g. N+1 queries) |

All tools except `tideways_list_projects` take an optional `project` (`name` or `organization/name`). Tools with large responses take `detail: "full"` to include the unmodified response.

## Setup

You need Node.js 22+ (or Docker, or Claude Desktop) and a Tideways API token with the scopes `metrics`, `traces` and `errors` (Organization settings → API Access).

**Claude Code**

```bash
claude mcp add tideways -e TIDEWAYS_TOKEN=your-token -- npx -y tideways-mcp-server
```

**Claude Desktop**: open the `.mcpb` bundle from the [latest release](https://github.com/abuhamza/tideways-mcp-server/releases/latest); it asks for the token and keeps it in the OS keychain.

**Other MCP clients** (Claude Desktop JSON, Cursor, VS Code, …):

```json
{
  "mcpServers": {
    "tideways": {
      "command": "npx",
      "args": ["-y", "tideways-mcp-server"],
      "env": { "TIDEWAYS_TOKEN": "your-token" }
    }
  }
}
```

**Docker**: use `"command": "docker"` with `"args": ["run", "-i", "--rm", "-e", "TIDEWAYS_TOKEN", "ghcr.io/abuhamza/tideways-mcp-server:latest"]` and the same `env`.

## Configuration

Environment variables; empty values count as unset. The server does not load `.env` files.

| Variable | Default | Meaning |
|---|---|---|
| `TIDEWAYS_TOKEN` | required | API token |
| `TIDEWAYS_PROJECT` | the token's only project | Default project; with several projects and no default, pass `project` per call |
| `TIDEWAYS_ORG` | from the token's projects | Organization, to match a plain project name |
| `TIDEWAYS_ENV` | API default | Default environment |
| `TIDEWAYS_SERVICE` | the project's default service | Default service |
| `TIDEWAYS_BASE_URL` | `https://app.tideways.io/apps/api` | API base URL, https only |
| `TIDEWAYS_REQUEST_TIMEOUT` | `30000` | Request timeout in ms, a positive integer up to `600000` |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn` or `error`, case-insensitive; logs go to stderr |

## Good to know

- All times are UTC, `YYYY-MM-DD HH:mm`.
- The API rate limit is per token and clock hour, shared by all projects. `tideways_list_projects` shows the last seen status.
- `tideways_search_traces` returns at most 30 traces per call; narrow the time window to find others.
- `search` in `tideways_search_traces` takes one word of a transaction name or URL; several words widen the result. Pass `from` and `to` together.
- `tideways_get_history` covers production and the default service only. For another environment or service, ask `tideways_get_performance` for a window ending at a past `end`.
- `tideways_list_issues` takes one type (`error`, `slowsql`, `deprecated`) and one status at a time, 10 issues per page.
- Tools read the project's default service unless you name one. A project can have several (web, APIs, workers, CLI). The API cannot list them: `tideways_list_services` lists those named by open issues, and with `search` it searches each one's traces for a word, which finds the services behind an app, API or worker, or a transaction the default service does not show. A search costs one request per service, at most 30 and a tenth of the hourly rate limit. When results come back, an unknown environment or service fails with an error.
- Observations such as N+1 queries do not name the affected requests, and the API cannot filter traces by bottleneck. The observation's link opens a Tideways page that lists recent affected traces.

## Security

The token is read from the environment and never logged, and trace URLs are returned without query strings. Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

## Upgrading from 1.x

Version 2 renames every tool and needs Node.js 22+. `TIDEWAYS_ORG` and `TIDEWAYS_PROJECT` are optional, `TIDEWAYS_MAX_RETRIES` is gone and `.env` files are no longer loaded.

| 1.x | 2.x |
|---|---|
| `get_performance_metrics` (`ts`, `m`, `env`, `s`) | `tideways_get_performance` (`end`, `minutes`, `environment`, `service`) |
| `get_performance_summary` (`s`) | `tideways_get_performance_summary` (`service`, `environment`, `hours`) |
| `get_issues` (`issue_type`, `status`, `page`) | `tideways_list_issues` (`type`, `status`, `page`, `environment`) |
| `get_traces` | `tideways_search_traces` (`search`, `from`/`to`, `withCallgraph`, `sortBy`, `minResponseTimeMs`/`maxResponseTimeMs`) |
| `get_historical_data` | `tideways_get_history` (`date`, `granularity`: `day`, `week` or `month`) |

## Development

```bash
npm ci
npm run typecheck && npm run lint && npm run format:check && npm test   # the gate
npm run build && npm run inspect                                        # try the tools in the MCP Inspector
```

Architecture, invariants and how to add a tool: [CLAUDE.md](CLAUDE.md). Commits follow [Conventional Commits](https://www.conventionalcommits.org/).

## License

[MIT](LICENSE)
