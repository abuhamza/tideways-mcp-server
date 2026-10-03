# Upgrading from 1.x

Version 2 renames every tool and needs Node.js 22+. `TIDEWAYS_ORG` and `TIDEWAYS_PROJECT` are optional, `TIDEWAYS_MAX_RETRIES` is gone and `.env` files are no longer loaded.

| 1.x | 2.x |
|---|---|
| `get_performance_metrics` (`ts`, `m`, `env`, `s`) | `tideways_get_performance` (`end`, `minutes`, `environment`, `service`) |
| `get_performance_summary` (`s`) | `tideways_get_performance_summary` (`service`, `environment`, `hours`) |
| `get_issues` (`issue_type`, `status`, `page`) | `tideways_list_issues` (`type`, `status`, `page`, `environment`) |
| `get_traces` | `tideways_search_traces` (`search`, `from`/`to`, `withCallgraph`, `sortBy`, `minResponseTimeMs`/`maxResponseTimeMs`) |
| `get_historical_data` | `tideways_get_history` (`date`, `granularity`: `day`, `week` or `month`) |

Version 2 also adds `tideways_list_projects`, `tideways_list_services` and `tideways_get_observations`.

To stay on 1.x, run `npx -y tideways-mcp-server@1`; its documentation is the [1.2.0 README](https://github.com/abuhamza/tideways-mcp-server/blob/v1.2.0/README.md).
