# Tideways MCP Server

[![npm](https://img.shields.io/npm/v/tideways-mcp-server)](https://www.npmjs.com/package/tideways-mcp-server)
[![CI](https://github.com/abuhamza/tideways-mcp-server/actions/workflows/ci.yml/badge.svg)](https://github.com/abuhamza/tideways-mcp-server/actions/workflows/ci.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/abuhamza/tideways-mcp-server/badge)](https://scorecard.dev/viewer/?uri=github.com/abuhamza/tideways-mcp-server)

A [Model Context Protocol](https://modelcontextprotocol.io) server that lets AI assistants such as Claude query [Tideways](https://tideways.com/) performance monitoring data for PHP applications. Ask "why was checkout slow yesterday?" and the assistant reads your Tideways performance data, issues and traces to answer.

The server is **read-only**: it only calls `GET` endpoints of the [Tideways REST API](https://support.tideways.com/documentation/reference/api/index.html).

## Tools

| Tool | What it answers |
|---|---|
| `tideways_list_projects` | Which projects, scopes and rate-limit budget does my token have? |
| `tideways_get_performance` | How is the app doing in the last 1–1440 minutes? Totals, time per layer, top 20 transactions, timeline. |
| `tideways_get_performance_summary` | Requests, errors and p95 in 15-minute buckets over up to 30 days. |
| `tideways_list_issues` | Which errors, slow SQL queries or deprecations are open, resolved or ignored, per environment? |
| `tideways_search_traces` | Which individual requests were slow, and where did the time go? |
| `tideways_get_history` | Day, week or month report for a past date. |
| `tideways_get_observations` | Configuration problems and code bottlenecks Tideways detected (e.g. N+1 queries). |

Every tool except `tideways_list_projects` takes an optional `project` (`"project"` or `"organization/project"`), so one server covers all projects of your token. `tideways_get_performance`, `tideways_get_performance_summary`, `tideways_list_issues`, `tideways_search_traces` and `tideways_get_history` accept `detail: "full"` to add the unmodified API response.

## Requirements

- A Tideways API token: Tideways → Organization settings → API Access → *Generate API Token*, with the scopes `metrics`, `traces` and `errors`.
- One of: Node.js 22+, Docker, or Claude Desktop (MCPB bundle).

## Setup

### Claude Code

```bash
claude mcp add tideways -e TIDEWAYS_TOKEN=your-token -e TIDEWAYS_PROJECT=my-project -- npx -y tideways-mcp-server
```

### Claude Desktop

Download `tideways-mcp-server-<version>.mcpb` from the [latest release](https://github.com/abuhamza/tideways-mcp-server/releases/latest) and open it; Claude Desktop asks for the token and stores it in the OS keychain.

Or add it to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "tideways": {
      "command": "npx",
      "args": ["-y", "tideways-mcp-server"],
      "env": { "TIDEWAYS_TOKEN": "your-token", "TIDEWAYS_PROJECT": "my-project" }
    }
  }
}
```

### Other MCP clients (Cursor, VS Code, …)

Use the same `command`/`args`/`env` as above in the client's MCP configuration.

### Docker

```json
{
  "mcpServers": {
    "tideways": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "-e", "TIDEWAYS_TOKEN", "-e", "TIDEWAYS_PROJECT", "ghcr.io/abuhamza/tideways-mcp-server:latest"],
      "env": { "TIDEWAYS_TOKEN": "your-token", "TIDEWAYS_PROJECT": "my-project" }
    }
  }
}
```

The image is multi-arch (amd64, arm64), runs as a non-root user and ships with SBOM and provenance attestations: `gh attestation verify oci://ghcr.io/abuhamza/tideways-mcp-server:<version> -R abuhamza/tideways-mcp-server`.

## Configuration

| Variable | Required | Default | Meaning |
|---|---|---|---|
| `TIDEWAYS_TOKEN` | yes | — | API token |
| `TIDEWAYS_PROJECT` | no | the token's only project | Default project, `project` or `organization/project`; with several projects and no default, pass `project` per call |
| `TIDEWAYS_ORG` | no | taken from the token's projects | Organization, used to match a plain `project` name |
| `TIDEWAYS_ENV` | no | API default (`production`) | Default environment |
| `TIDEWAYS_SERVICE` | no | the project's default service | Default service |
| `TIDEWAYS_BASE_URL` | no | `https://app.tideways.io/apps/api` | API base URL (https only) |
| `TIDEWAYS_REQUEST_TIMEOUT` | no | `30000` | Request timeout in ms, a positive integer up to `600000` |
| `LOG_LEVEL` | no | `info` | `debug`, `info`, `warn`, `error`, case-insensitive; other values stop the server with a config error (logs go to stderr) |

The server reads only its environment; it does not load `.env` files.

## Good to know

- All times are UTC, written `YYYY-MM-DD HH:mm`.
- Without `service`, tools read the project's default service. A project often has several services (web, APIs, workers, CLI); the API cannot list them, but `tideways_list_issues` results name them. If your assistant cannot find an endpoint, tell it which service to look in, or set `TIDEWAYS_SERVICE`.
- The Tideways API rate limit is per token and per clock hour, shared by all projects. `tideways_list_projects` reports the rate-limit status seen on the most recent counted request of the session (null before the first one); a limit error names the reset time.
- `tideways_search_traces` returns at most 30 traces per call (an API limit); narrow the time window or sort by response time to find others.
- Observations such as "N+1 queries" name the problem, not the affected transactions. Example traces carry it in `bottlenecks` (`nplus1`); the observation's link opens the full list in Tideways.
- Issues have no "all" filter in the API: ask for one type (`error`, `slowsql`, `deprecated`) and one status at a time.

## Security

The token is read from the environment and never logged. Trace URLs are returned without query strings. Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md). Releases are published from GitHub Actions with npm provenance, signed container attestations and SHA-pinned actions.

## Upgrading from 1.x

Version 2 renames every tool and needs Node.js 22+.

| 1.x | 2.x |
|---|---|
| `get_performance_metrics` (`ts`, `m`, `env`, `s`) | `tideways_get_performance` (`end`, `minutes`, `environment`, `service`) |
| `get_performance_summary` (`s`) | `tideways_get_performance_summary` (`service`, `environment`, `hours`) |
| `get_issues` (`issue_type`, `status`, `page`) | `tideways_list_issues` (`type`, `status`, `page`, `environment`) |
| `get_traces` | `tideways_search_traces` (`transaction`, `from`/`to`, `withCallgraph`, `sortBy`/`sortOrder`, camelCase response-time filters) |
| `get_historical_data` | `tideways_get_history` (`date`, `granularity`: `day`, `week` or `month`) |

`TIDEWAYS_ORG` and `TIDEWAYS_PROJECT` are optional now, `TIDEWAYS_MAX_RETRIES` is gone, and `.env` files are no longer loaded.

## Development

```bash
npm ci
npm run typecheck && npm run lint && npm run format:check && npm test   # the pre-commit gate
npm run test:coverage                           # 80% thresholds
npm run build && npm run inspect                # try the tools in the MCP Inspector
```

Architecture, invariants and the checklist for adding a tool live in [CLAUDE.md](CLAUDE.md). Commits follow [Conventional Commits](https://www.conventionalcommits.org/); release-please turns them into release PRs.

## License

[MIT](LICENSE)
