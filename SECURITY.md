# Security Policy

## Supported versions

Only the latest release line receives security fixes.

## Reporting a vulnerability

Report vulnerabilities privately through GitHub:
<https://github.com/abuhamza/tideways-mcp-server/security/advisories/new>.
Please do not open public issues for security problems.

You can expect an acknowledgement within 7 days and a fix or mitigation plan within 30 days.

## Scope

This server runs with a Tideways API token. In scope, for example:

- the token or other secrets appearing in logs, error messages or tool output
- requests sent to hosts other than the configured Tideways API
- tampering with the published npm package, container image or MCPB bundle
