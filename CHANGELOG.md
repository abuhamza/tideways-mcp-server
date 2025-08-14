# [1.1.0](https://github.com/abuhamza/tideways-mcp-server/compare/v1.0.0...v1.1.0) (2025-08-14)


### Bug Fixes

* add always-auth true for NPM OIDC authentication ([82e1975](https://github.com/abuhamza/tideways-mcp-server/commit/82e1975d63716b5051bcffcb61d9f5398e000599))
* add NPM_TOKEN back to semantic-release step ([dfd38fd](https://github.com/abuhamza/tideways-mcp-server/commit/dfd38fd4e75dd3f0530830b3d6d4baf64e5efd01))
* prefix to trigger semantic-release ([2621695](https://github.com/abuhamza/tideways-mcp-server/commit/2621695a06ba75704fb97c8e43fe4245b071ac1c))
* prefix to trigger semantic-release ([25842c6](https://github.com/abuhamza/tideways-mcp-server/commit/25842c6659f03934dca02a4f2d7522c0b44e9805))
* remove npm upgrade that breaks semantic-release authentication ([906da15](https://github.com/abuhamza/tideways-mcp-server/commit/906da15421415381bb84d38e8b900b457a700d47))
* resolve NPM publishing authentication issues ([8f3b114](https://github.com/abuhamza/tideways-mcp-server/commit/8f3b1147673fb4d99753d5838d013d7433724d97)), closes [semantic-release/npm#381](https://github.com/semantic-release/npm/issues/381)
* restore NPM_TOKEN for semantic-release compatibility ([204439e](https://github.com/abuhamza/tideways-mcp-server/commit/204439ece5135f72a19111cc73be1c3af211a834))
* upgrade npm CLI to enable OIDC trusted publisher support ([6963e06](https://github.com/abuhamza/tideways-mcp-server/commit/6963e06e170f759780ab28c3d500573f61f37d74))


### Features

* **build:** Enable package provenance attestation in release workflow and update semantic-release configuration. ([7345b17](https://github.com/abuhamza/tideways-mcp-server/commit/7345b172ca009f7c6487a7c438208a43e8cc67b8))
* **build:** Enable package provenance attestation in release workflow and update semantic-release configuration. ([39cfc73](https://github.com/abuhamza/tideways-mcp-server/commit/39cfc7332a8f186123607884672163c7dbede588))
* implement NPM Trusted Publishers with OIDC authentication ([920424a](https://github.com/abuhamza/tideways-mcp-server/commit/920424acbc28909e0dddec6ece388a2c462a65a9))

# 1.0.0 (2025-08-13)


### Bug Fixes

* adjust Jest coverage thresholds for MVP ([93efc44](https://github.com/abuhamza/tideways-mcp-server/commit/93efc44484c28e1e269faaeeeecd40c63148fa5f))
* correct MCP protocol and API configuration issues ([0cdd625](https://github.com/abuhamza/tideways-mcp-server/commit/0cdd62580919b6418f566577425fce9a032e6b6b))
* implement comprehensive get_issues tool improvements ([bb22a7b](https://github.com/abuhamza/tideways-mcp-server/commit/bb22a7b232a367fd7c1329e1b8a0f968bc3e97d4))
* resolve CI/CD pipeline linting and test failures ([a457aa7](https://github.com/abuhamza/tideways-mcp-server/commit/a457aa75df8b2f15581dd584607312948cd19062))
* resolve Jest hanging issue with cleanup intervals ([adb19c3](https://github.com/abuhamza/tideways-mcp-server/commit/adb19c3e5cdffd970243ab492f317bb5a7d56157))
* resolve linting error in historical formatter ([be3852f](https://github.com/abuhamza/tideways-mcp-server/commit/be3852f8ac135f4776d3a77b1ad435ebaf44dea7))
* upgrade deprecated download-artifact action to v4 ([364d994](https://github.com/abuhamza/tideways-mcp-server/commit/364d9947a601e7a6f377cc7216971fbc7cac9885))
* upgrade deprecated upload-artifact action to v4 ([3349b74](https://github.com/abuhamza/tideways-mcp-server/commit/3349b74ff87e695486128321e4295c77c78b47fc))


### Features

* Add security feature ([dab97dd](https://github.com/abuhamza/tideways-mcp-server/commit/dab97ddebea5dded91e0416a485d085f73cb7d06))
* **build:** add back commit linting with conventional commits ([f4f42f0](https://github.com/abuhamza/tideways-mcp-server/commit/f4f42f06565b7b7291f7ddd5a2b29d7c0912f7f6))
* Implement automated NPM publishing workflow ([50b0cee](https://github.com/abuhamza/tideways-mcp-server/commit/50b0cee236b53ba46f7ddb18439c448c7fa27991)), closes [#22](https://github.com/abuhamza/tideways-mcp-server/issues/22)
* implement comprehensive get_historical_data tool ([f2a869f](https://github.com/abuhamza/tideways-mcp-server/commit/f2a869fd249d472fdeba4e11d6eb55ea06baafcc))
* implement foundation setup for Tideways MCP server ([5eabb6c](https://github.com/abuhamza/tideways-mcp-server/commit/5eabb6c2b9bbbe3c87a777b62cd4754c3f61d4b9))
* prepare package for npm publishing with npx support ([caf5a17](https://github.com/abuhamza/tideways-mcp-server/commit/caf5a1754719b03f4177c217f4b1614ff9b18fb4))
* **security:** Skip security scan ([cd051c1](https://github.com/abuhamza/tideways-mcp-server/commit/cd051c1997da3cdda12551dfc066d7f5785e68fc))
* **security:** Skip security scan Mouhammed Diop 3 minutes ago ([95ffab7](https://github.com/abuhamza/tideways-mcp-server/commit/95ffab7850ce76e1e5245131723a93df5274e0df))
* **security:** Skip security scan Mouhammed Diop 3 minutes ago Mouhammed Diop 13 minutes ago ([dc3593c](https://github.com/abuhamza/tideways-mcp-server/commit/dc3593cff52156f56f90e92c9fcb18c8dc974532))

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Automated NPM publishing workflow with semantic versioning
- Conventional commits support with commitlint
- Automated changelog generation
- Release workflow with quality gates
- Package provenance for supply chain security

### Changed
- Enhanced CI/CD pipeline with comprehensive quality checks
- Improved release process with semantic-release

### Security
- Added automated security scanning in CI/CD
- Implemented package provenance for npm publishing

## [0.1.1] - 2024-XX-XX

### Added
- Initial MCP server implementation for Tideways integration
- Performance metrics and traces analysis tools
- Comprehensive error handling and logging
- CLI interface for easy integration
- Docker support and deployment configurations

### Features
- `get_performance_metrics` - Retrieve performance data
- `get_performance_summary` - Time-series performance data
- `get_issues` - Error and performance issue analysis
- `get_traces` - Advanced trace analysis with bottleneck detection
- `get_historical_data` - Historical performance trends

### Security
- API token security with automatic redaction
- Rate limiting and retry logic
- Input validation on all MCP functions
