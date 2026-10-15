# Changelog

## [2.1.1](https://github.com/abuhamza/tideways-mcp-server/compare/v2.1.0...v2.1.1) (2026-10-10)


### Bug Fixes

* report history date ranges in minutes and validate output times ([#30](https://github.com/abuhamza/tideways-mcp-server/issues/30)) ([1f83002](https://github.com/abuhamza/tideways-mcp-server/commit/1f83002bb1b472d3f449eae6c4b04169978f6d31))

## [2.1.0](https://github.com/abuhamza/tideways-mcp-server/compare/v2.0.0...v2.1.0) (2026-10-06)


### Features

* add limit and transaction filter to tideways_search_traces ([#25](https://github.com/abuhamza/tideways-mcp-server/issues/25)) ([e6a37d0](https://github.com/abuhamza/tideways-mcp-server/commit/e6a37d093b4ab3bcf9d9122c2727ddee79ab9a32))
* add tideways_get_issue for an issue's stack trace, transactions and history ([#28](https://github.com/abuhamza/tideways-mcp-server/issues/28)) ([8add6c2](https://github.com/abuhamza/tideways-mcp-server/commit/8add6c26026f0abc1cf684fb06e0e7e3b3ed1497))
* add tideways_get_transaction for one transaction's timeline and histogram ([#26](https://github.com/abuhamza/tideways-mcp-server/issues/26)) ([9b014c2](https://github.com/abuhamza/tideways-mcp-server/commit/9b014c2770f8cc61124e3544cb227f8b513fbad0))
* list issues of all services, with totals, warnings and notices ([#23](https://github.com/abuhamza/tideways-mcp-server/issues/23)) ([b46940f](https://github.com/abuhamza/tideways-mcp-server/commit/b46940f8741a0460f80158e5eeec9df54c974642))
* list services from open and ignored issues of all services ([#27](https://github.com/abuhamza/tideways-mcp-server/issues/27)) ([949c804](https://github.com/abuhamza/tideways-mcp-server/commit/949c80445386d930ae3d5d030813faf79e917022))


### Bug Fixes

* say the rate limit is per organization, not per token ([#22](https://github.com/abuhamza/tideways-mcp-server/issues/22)) ([a88dffb](https://github.com/abuhamza/tideways-mcp-server/commit/a88dffbf5d83f74d759c8d495be299091fc2061f))

## [2.0.0](https://github.com/abuhamza/tideways-mcp-server/compare/v1.2.0...v2.0.0) (2026-10-02)


### ⚠ BREAKING CHANGES

* v2 requires Node >= 22, no longer loads .env files, and drops TIDEWAYS_MAX_RETRIES. Only TIDEWAYS_TOKEN is required; TIDEWAYS_ORG and TIDEWAYS_PROJECT are optional. All tools are renamed with a tideways_ prefix (see the migration table in the pull request).

### Features

* add tideways_list_services and stop suggesting trace sampling for N+1 ([#18](https://github.com/abuhamza/tideways-mcp-server/issues/18)) ([36d3306](https://github.com/abuhamza/tideways-mcp-server/commit/36d33067417459b1cdbeb8cf31d2267bf0d30b06))
* publish to the MCP Registry, as an MCPB bundle and as a ghcr.io image ([#15](https://github.com/abuhamza/tideways-mcp-server/issues/15)) ([ade1220](https://github.com/abuhamza/tideways-mcp-server/commit/ade1220528fe1a0d2123572225c86c5139a9d8e6))
* v2 on MCP SDK v2 with seven read-only Tideways tools ([#11](https://github.com/abuhamza/tideways-mcp-server/issues/11)) ([0c749b8](https://github.com/abuhamza/tideways-mcp-server/commit/0c749b8259b09c6502d43177938852555537752c))


### Bug Fixes

* **deps:** update the distroless Node 24 base image for OpenSSL fixes ([#17](https://github.com/abuhamza/tideways-mcp-server/issues/17)) ([f5f6d20](https://github.com/abuhamza/tideways-mcp-server/commit/f5f6d2027247a84d4b7b9e0f37f757dd4998a955))
* fail on wrong scopes and unknown arguments, and clarify tool guidance ([#16](https://github.com/abuhamza/tideways-mcp-server/issues/16)) ([0516d81](https://github.com/abuhamza/tideways-mcp-server/commit/0516d81c0fd86416384e8f957080f45e630e3749))

## [1.2.0](https://github.com/abuhamza/tideways-mcp-server/compare/v1.0.2...v1.2.0) (2026-09-30)


### Bug Fixes

* **deps:** upgrade MCP SDK to 1.31 and axios to 1.20 ([811c947](https://github.com/abuhamza/tideways-mcp-server/commit/811c94734a85b50ac8efd42d7b213de7483d20be))
* keep mapped API errors, honor rate-limit reset time and only offer real issue filters ([b650c90](https://github.com/abuhamza/tideways-mcp-server/commit/b650c9062d2b175589b016e083b85abb3dc62558))


### Continuous Integration

* replace semantic-release with release-please and npm trusted publishing ([c0757cc](https://github.com/abuhamza/tideways-mcp-server/commit/c0757ccee82a3be3adc77f1072d10278a5003e83))

## [1.0.2](https://github.com/abuhamza/tideways-mcp-server/compare/v1.0.1...v1.0.2) (2025-08-15)


### Bug Fixes

* standardize error codes and remove redundant logs from CLI server initialization ([8e83a1f](https://github.com/abuhamza/tideways-mcp-server/commit/8e83a1f39b5d1d424938390402b7a60ad633522b))

## [1.0.1](https://github.com/abuhamza/tideways-mcp-server/compare/v1.0.0...v1.0.1) (2025-08-14)

# 1.0.0 (2025-08-14)


### Features

* **ci:** Use specific PAT for the release ([67b87e9](https://github.com/abuhamza/tideways-mcp-server/commit/67b87e9985cd9a2aa697477ccea58d386aa14f41))
* **inital commit:** Initial setup ([ff2592b](https://github.com/abuhamza/tideways-mcp-server/commit/ff2592b8c670f722bd78dcec880fd539daa33ce3))
