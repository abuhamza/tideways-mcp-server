# Tideways MCP Server

[![npm](https://img.shields.io/npm/v/tideways-mcp-server)](https://www.npmjs.com/package/tideways-mcp-server)
[![CI](https://github.com/abuhamza/tideways-mcp-server/actions/workflows/ci.yml/badge.svg)](https://github.com/abuhamza/tideways-mcp-server/actions/workflows/ci.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/abuhamza/tideways-mcp-server/badge)](https://scorecard.dev/viewer/?uri=github.com/abuhamza/tideways-mcp-server)

An unofficial, community-maintained server, not affiliated with or supported by Tideways. For Tideways' own tooling, see the official [Tideways CLI](https://support.tideways.com/documentation/reference/commandline-interface/overview.html).

A read-only [Model Context Protocol](https://modelcontextprotocol.io) server for [Tideways](https://tideways.com/). It lets an AI assistant answer questions such as "why was checkout slow yesterday?" from your performance data, issues and traces. It only calls `GET` endpoints of the [Tideways REST API](https://support.tideways.com/documentation/reference/api/index.html).

## Install

You need a Tideways API token with the scopes `metrics`, `traces` and `errors` (Organization settings → API Access), and Node.js 22+ or Docker. Coming from 1.x? See [UPGRADING.md](UPGRADING.md).

<details>
<summary><b>Claude Code</b></summary>

```bash
claude mcp add tideways -e TIDEWAYS_TOKEN=your-token -- npx -y tideways-mcp-server
```

Add `-s user` to use it in every project.

</details>

<details>
<summary><b>Claude Desktop</b></summary>

Open the `.mcpb` bundle from the [latest release](https://github.com/abuhamza/tideways-mcp-server/releases/latest). It asks for the token and keeps it in the OS keychain.

</details>

<details>
<summary><b>Codex</b></summary>

```bash
codex mcp add tideways --env TIDEWAYS_TOKEN=your-token -- npx -y tideways-mcp-server
```

The Codex CLI, IDE extension and app share this entry in `~/.codex/config.toml`.

</details>

<details>
<summary><b>Cursor, Gemini CLI and other clients</b></summary>

Add to the client's MCP configuration (Cursor: `~/.cursor/mcp.json`; Gemini CLI: `~/.gemini/settings.json`; either also per project):

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

</details>

<details>
<summary><b>VS Code</b></summary>

Add to `.vscode/mcp.json`, or run **MCP: Open User Configuration** for all workspaces. VS Code asks for the token on first start and stores it.

```json
{
  "inputs": [
    { "type": "promptString", "id": "tideways-token", "description": "Tideways API token", "password": true }
  ],
  "servers": {
    "tideways": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "tideways-mcp-server"],
      "env": { "TIDEWAYS_TOKEN": "${input:tideways-token}" }
    }
  }
}
```

</details>

<details>
<summary><b>Docker</b></summary>

In any setup above, replace `npx -y tideways-mcp-server` with `docker run -i --rm -e TIDEWAYS_TOKEN ghcr.io/abuhamza/tideways-mcp-server` (pin a version with `:2.0.0`). For example:

```bash
claude mcp add tideways -e TIDEWAYS_TOKEN=your-token -- docker run -i --rm -e TIDEWAYS_TOKEN ghcr.io/abuhamza/tideways-mcp-server
```

```json
"command": "docker",
"args": ["run", "-i", "--rm", "-e", "TIDEWAYS_TOKEN", "ghcr.io/abuhamza/tideways-mcp-server"],
"env": { "TIDEWAYS_TOKEN": "your-token" }
```

</details>

## Tools

| Tool | Answers |
|---|---|
| `tideways_list_projects` | Which projects and scopes does my token have, and how much of the hourly rate limit is left? |
| `tideways_list_services` | Which services does a project have, and which of them serve "voucher"? |
| `tideways_get_performance` | How is the app doing in any window of up to 24 h within the last ~30 days? Totals, layers, top transactions |
| `tideways_get_performance_summary` | Requests, errors and p95 in 15-minute buckets over up to 30 days |
| `tideways_list_issues` | Which errors, slow SQL queries, deprecations, warnings or notices are open, resolved or ignored, in any service or transaction? |
| `tideways_search_traces` | Which individual requests were slow, in any transaction, and where did the time go? |
| `tideways_get_history` | Day, week or month report for a past date |
| `tideways_get_observations` | Configuration problems and code bottlenecks Tideways detected (e.g. N+1 queries) |

All tools except `tideways_list_projects` take an optional `project` (`name` or `organization/name`).

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

- All times are UTC, `YYYY-MM-DD HH:mm`. The API rate limit is per Tideways organization and clock hour; its size depends on the plan, and all tokens and projects of the organization share it.
- Tools read the project's default service unless you name one; `tideways_list_issues` reads all services. The API cannot list services; `tideways_list_services` finds them through open issues, and its `search` costs one request per service.
- `tideways_search_traces` returns 30 traces per call, or up to 100 with `limit`.
- Limits of the Tideways API: history for production and the default service only, issues 10 per page, and no trace filter by bottleneck (an N+1 observation's link opens the affected traces in Tideways).

## Security

The token is read from the environment and never logged, and trace URLs are returned without query strings. Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

## Development

```bash
npm ci
npm run typecheck && npm run lint && npm run format:check && npm test   # the gate
npm run build && npm run inspect                                        # try the tools in the MCP Inspector
```

Architecture, invariants and how to add a tool: [CLAUDE.md](CLAUDE.md). Commits follow [Conventional Commits](https://www.conventionalcommits.org/).

## License

[MIT](LICENSE)
