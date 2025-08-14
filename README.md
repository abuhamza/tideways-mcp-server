# Tideways MCP Server

[![CI/CD Pipeline](https://github.com/abuhamza/tideways-mcp-server/actions/workflows/ci.yml/badge.svg)](https://github.com/abuhamza/tideways-mcp-server/actions/workflows/ci.yml)
[![Release](https://github.com/abuhamza/tideways-mcp-server/actions/workflows/release.yml/badge.svg)](https://github.com/abuhamza/tideways-mcp-server/actions/workflows/release.yml)
[![Security Pipeline](https://github.com/abuhamza/tideways-mcp-server/actions/workflows/security.yml/badge.svg)](https://github.com/abuhamza/tideways-mcp-server/actions/workflows/security.yml)
[![CodeQL](https://github.com/abuhamza/tideways-mcp-server/actions/workflows/security.yml/badge.svg?event=push)](https://github.com/abuhamza/tideways-mcp-server/security/code-scanning)
[![codecov](https://codecov.io/gh/abuhamza/tideways-mcp-server/branch/main/graph/badge.svg)](https://codecov.io/gh/abuhamza/tideways-mcp-server)
[![npm version](https://img.shields.io/npm/v/tideways-mcp-server.svg)](https://www.npmjs.com/package/tideways-mcp-server)
[![npm downloads](https://img.shields.io/npm/dt/tideways-mcp-server.svg)](https://www.npmjs.com/package/tideways-mcp-server)
[![npm audit](https://img.shields.io/badge/npm%20audit-0%20vulnerabilities-brightgreen)](https://www.npmjs.com/package/tideways-mcp-server)
[![Dependabot](https://img.shields.io/badge/Dependabot-enabled-brightgreen)](https://github.com/abuhamza/tideways-mcp-server/security/dependabot)

A Model Context Protocol (MCP) server that enables AI assistants to query [Tideways](https://tideways.com/) performance monitoring data and provide conversational performance insights for PHP applications.

> **About Tideways**: [Tideways](https://tideways.com/) is a powerful application performance monitoring (APM) platform designed specifically for PHP applications. For technical details, see the [REST API documentation](https://support.tideways.com/documentation/reference/index.html).

## Features

- **Conversational Performance Insights**: Get performance data in natural language format optimized for AI assistants
- **AI Assistant Integration**: Works with Claude Desktop, Cursor, Claude Code, and other MCP-compatible tools
- **Real-time Performance Metrics**: Query current performance data with intelligent rate limiting
- **Issue Analysis**: Retrieve and analyze errors, exceptions, and performance issues
- **Intelligent API Management**: Built-in rate limiting with respect for Tideways API constraints
- **Robust Error Handling**: Comprehensive error handling with user-friendly messages

**Package Information:**
- **NPM Package**: [`tideways-mcp-server`](https://www.npmjs.com/package/tideways-mcp-server)
- **Repository**: [abuhamza/tideways-mcp-server](https://github.com/abuhamza/tideways-mcp-server)
- **Latest Version**: Check [npm version badge](#) above
- **License**: MIT

## Prerequisites

- [Tideways](https://tideways.com/) account with a valid API token
- API token with appropriate scopes (`metrics`, `issues`, `traces`) - see [API documentation](https://support.tideways.com/documentation/reference/index.html)
- Access to a Tideways organization and project

## AI Integration Setup

**This is an MCP (Model Context Protocol) server designed exclusively for AI assistants. It cannot be used as a standalone CLI tool.**

The server integrates with AI assistants through MCP configuration using the npm package `tideways-mcp-server`.

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TIDEWAYS_TOKEN` | ✅ | - | Tideways API access token (see Security section) |
| `TIDEWAYS_ORG` | ✅ | - | Tideways organization name |
| `TIDEWAYS_PROJECT` | ✅ | - | Tideways project name |
| `TIDEWAYS_BASE_URL` | ❌ | `https://app.tideways.io/apps/api` | Tideways API base URL |
| `TIDEWAYS_MAX_RETRIES` | ❌ | `3` | Maximum API retry attempts |
| `TIDEWAYS_REQUEST_TIMEOUT` | ❌ | `30000` | API request timeout (ms) |
| `LOG_LEVEL` | ❌ | `info` | Log level (debug, info, warn, error) |

## AI Assistant Integration

**This server only works with MCP-compatible AI assistants. It uses stdio transport.**

#### Claude Desktop

Add to your Claude Desktop MCP configuration file:

**Location:**
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/claude/claude_desktop_config.json`

**Configuration (Recommended - using npx):**
```json
{
  "mcpServers": {
    "tideways": {
      "command": "npx",
      "args": ["tideways-mcp-server"],
      "env": {
        "TIDEWAYS_TOKEN": "your_token",
        "TIDEWAYS_ORG": "your_org",
        "TIDEWAYS_PROJECT": "your_project"
      }
    }
  }
}
```

**Alternative (if installed globally):**
```json
{
  "mcpServers": {
    "tideways": {
      "command": "tideways-mcp-server",
      "env": {
        "TIDEWAYS_TOKEN": "your_token",
        "TIDEWAYS_ORG": "your_org",
        "TIDEWAYS_PROJECT": "your_project"
      }
    }
  }
}
```

#### Cursor IDE

Cursor supports MCP through its settings. Add the server configuration in Cursor's MCP settings:

1. Open Cursor Settings
2. Tools & Integration
3. Add a new server with:
```json
{
  "mcpServers": {
    "tideways": {
      "command": "tideways-mcp-server",
      "env": {
        "TIDEWAYS_TOKEN": "your_token",
        "TIDEWAYS_ORG": "your_org",
        "TIDEWAYS_PROJECT": "your_project"
      }
    }
  }
}
```

#### VS Code with MCP Extension

If using VS Code with an MCP-compatible extension:

```json
{
  "mcp.servers": {
    "tideways": {
      "command": "npx",
      "args": ["tideways-mcp-server"],
      "env": {
        "TIDEWAYS_TOKEN": "your_token",
        "TIDEWAYS_ORG": "your_org",
        "TIDEWAYS_PROJECT": "your_project"
      }
    }
  }
}
```

### Using with AI Assistants

Once configured, you can ask your AI assistant questions like:

#### Basic Performance Queries
- "What's the current performance of my application?"
- "Show me recent errors in the last 24 hours"
- "How is my API performing compared to yesterday?"
- "What are the slowest transactions right now?"

#### Advanced Trace Analysis & Optimization
- "Analyze the `/api/users/{id}` endpoint and identify bottlenecks"
- "Find the root cause of slow performance in my checkout process"
- "Detect N+1 queries in my product listing endpoint and suggest fixes"
- "Analyze traces for `/dashboard` and recommend code optimizations"
- "Identify database query bottlenecks in my user authentication flow"
- "Find memory leaks or inefficient code paths in my API endpoints"
- "Analyze dependency injection overhead in my application"
- "Detect redundant database calls and suggest caching strategies"

#### Performance Optimization Suggestions
- "Recommend performance improvements for my slowest endpoints"
- "Analyze my SQL queries and suggest indexing strategies"
- "Identify opportunities for query batching or lazy loading"
- "Find inefficient loops or recursive calls in my traces"
- "Suggest code refactoring based on performance bottlenecks"
- "Analyze memory usage patterns and recommend optimizations"

## Available MCP Tools

All tools return structured JSON data for optimal AI assistant integration. The MCP server follows a "raw JSON approach" where tools return complete API responses without formatting, allowing AI assistants to analyze and present data flexibly.

### `get_performance_metrics`

Retrieve aggregate performance metrics and system-wide statistics.

**Parameters:**
- `ts` (optional): End timestamp in Y-m-d H:i format (e.g., "2025-08-12 18:30")
- `m` (optional): Number of minutes backward from timestamp (e.g., 60 for 1 hour, 1440 for 24 hours)
- `env` (optional): Filter by specific environment
- `s` (optional): Filter by specific service name

**Conversational Examples:**
```
"What's the current performance of my application?"
"Show me performance metrics for the last 6 hours"
"Get metrics for the API service in production"
"How is my web service performing in the staging environment?"
"Compare today's metrics with the last 24 hours"
```

**Returns:** Complete performance data including response times, throughput, error rates, memory usage, and database performance.

### `get_performance_summary`

Retrieve time-series performance summary data in 15-minute intervals for trend analysis.

**Parameters:**
- `s` (optional): Service name to filter by (e.g., "web", "api", "worker"). Default: "web"

**Conversational Examples:**
```
"Show me performance trends over the last few hours"
"Get the performance summary for my API service"
"How has my web service been performing recently?"
"Display trends for the worker service"
"Show me response time patterns for today"
```

**Returns:** Time-series data with 15-minute intervals showing response times, request counts, error rates, and resource utilization trends.

### `get_issues`

Retrieve and analyze recent errors, exceptions, and performance issues.

**Parameters:**
- `issue_type` (optional): "error", "slowsql", "deprecated", "all" (default: "all")
- `status` (optional): "open", "new", "resolved", "not_error", "ignored", "all" (default: "open")
- `page` (optional): Page number for pagination (default: 1)

**Conversational Examples:**
```
"What errors are currently happening in my application?"
"Show me all open errors from the last 24 hours"
"Get slow SQL queries that need attention"
"Are there any new performance issues I should know about?"
"List all deprecated function calls in my code"
"Show me resolved errors to understand what was fixed"
```

**Returns:** Detailed error information including stack traces, occurrence frequency, affected endpoints, and suggested fixes for common issues.

### `get_traces`

Analyze individual trace samples for detailed bottleneck identification and performance debugging. Includes advanced AI-powered bottleneck detection and optimization recommendations.

**Parameters:**
- `env` (optional): Environment name (e.g., "production", "staging")
- `s` (optional): Service name (e.g., "web", "api", "worker")
- `transaction_name` (optional): Filter by specific transaction/endpoint name
- `has_callgraph` (optional): Only return traces with detailed callgraph data
- `search` (optional): Word-based search on transaction_name, host, and URL
- `min_date` (optional): Minimal date in YYYY-MM-DD HH:MM format (requires max_date)
- `max_date` (optional): Maximal date in YYYY-MM-DD HH:MM format (requires min_date)
- `min_response_time_ms` (optional): Minimum response time filter
- `max_response_time_ms` (optional): Maximum response time filter
- `sort_by` (optional): "response_time", "date", "memory" (default: "response_time")
- `sort_order` (optional): "ASC", "DESC" (default: "DESC")

**Conversational Examples:**
```
"Analyze traces for the /api/products endpoint and find bottlenecks"
"Show me the slowest requests from the last hour with details"
"Find traces with callgraph data for the checkout process"
"What's causing slow response times in my user registration flow?"
"Detect N+1 query problems in my product listing page"
"Analyze memory usage patterns in my API endpoints"
"Find database bottlenecks in the /dashboard endpoint"
"Show me traces where response time is over 2 seconds"
```

**Returns:** Detailed trace data with AI-powered analysis including:
- Individual request traces with timing breakdown
- Bottleneck detection (database, CPU, memory, API calls)
- N+1 query detection and suggested fixes
- Performance optimization recommendations
- Call graph visualization data
- Resource utilization analysis

### `get_historical_data`

Retrieve historical performance data for specific dates with configurable granularity.

**Parameters:**
- `date` (required): Date in YYYY-MM-DD format
- `granularity` (optional): "day", "week", "month" (default: "day")

**Conversational Examples:**
```
"Get historical performance data for August 1st, 2025"
"Show me weekly performance trends for last Monday"
"Compare this month's performance with last month"
"How did my application perform on 2025-07-15?"
"Get daily performance data for the past week"
"Show me monthly trends for the last quarter"
```

**Returns:** Historical performance metrics with trend analysis, comparisons to previous periods, and insights into performance patterns over time.

## Development

### Project Structure

```
├── src/
│   ├── config/           # Configuration management
│   ├── lib/              # Core libraries
│   │   ├── errors.ts     # Error handling utilities  
│   │   ├── logger.ts     # Structured logging
│   │   └── tideways-client.ts  # Tideways API client
│   ├── tools/            # MCP tool implementations
│   │   ├── definitions.ts # Tool schema definitions
│   │   ├── registry.ts   # Tool execution registry
│   │   └── handlers/     # Individual tool handlers
│   ├── types/            # TypeScript type definitions
│   ├── utils/            # Utility functions
│   ├── server.ts         # Main MCP server implementation
│   └── index.ts          # Application entry point
├── tests/                # Test suites
└── dist/                 # Compiled JavaScript (generated)
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch

# Run type checking
npm run typecheck
```

### Building

```bash
# Build TypeScript to JavaScript
npm run build

# Clean build artifacts
npm run clean
```

### Code Quality

```bash
# Run linter
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format
```

## Architecture

### Core Components

1. **MCP Server** (`src/server.ts`): Main server implementing MCP protocol, handles tool definitions and routing
2. **Tideways API Client** (`src/lib/tideways-client.ts`): HTTP client with rate limiting, retry logic, and security measures
3. **Tool Registry** (`src/tools/`): Modular tool system with individual handlers for each MCP tool
4. **Error Handler** (`src/lib/errors.ts`): Centralized error handling with user-friendly messages
5. **Logger** (`src/lib/logger.ts`): Structured JSON logging for monitoring and debugging
6. **Configuration** (`src/config/index.ts`): Environment-based configuration management

### Data Flow

```
AI Assistant ←→ MCP Protocol (stdio) ←→ TidewaysMCPServer → TidewaysClient → Tideways API
                                               ↓
                                        Raw JSON Response → AI Assistant
```

### Response Format Philosophy

This server uses a **simplified raw JSON approach** for optimal performance:
- **Direct API-to-LLM Pipeline**: Tools return `JSON.stringify(apiData, null, 2)` without formatting
- **Zero Processing Overhead**: No complex formatting, caching, or interpretation logic  
- **Complete Data Preservation**: LLM receives all available data for flexible analysis
- **Modern LLM Optimized**: GPT-4/Claude excel at parsing structured JSON data
- **Minimal Maintenance**: No formatter or caching logic to maintain or debug

### Rate Limiting Strategy

- **Rate Limiter**: Built-in rate limiting respects Tideways API constraints (900 requests/hour by default)
- **Direct API Calls**: All requests go directly to Tideways API without caching layer
- **Retry Logic**: Automatic retries for transient failures with exponential backoff
- **YAGNI Principle**: No caching complexity until performance issues are observed

## 🛡️ Security

- API tokens stored securely in environment variables
- Rate limiting to respect Tideways API constraints
- Input validation on all MCP function parameters
- No sensitive data logged or exposed in error messages

## 📊 Monitoring

The server provides structured JSON logs for monitoring:

```json
{
  "timestamp": "2025-08-09T10:00:00.000Z",
  "level": "info",
  "message": "Tool called",
  "context": {
    "toolName": "get_performance_metrics",
    "arguments": {"time_range": "24h"}
  }
}
```

## 🔧 Troubleshooting

### Common Issues

**Authentication Error**
```
Error: Authentication failed. Please check your API token.
```
- Verify `TIDEWAYS_TOKEN` is correct and has required scopes (`metrics`, `issues`, `traces`)
- Check token hasn't expired
- Ensure organization and project names are correct
- Verify environment variables are properly loaded

**Rate Limit Exceeded**
```
Error: Rate limit exceeded. Please try again later.
```
- Wait for rate limit reset (shown in error message)
- Reduce query frequency
- Built-in rate limiting respects Tideways API constraints (900 requests/hour)

**Connection Issues**
```
Error: Network error: Unable to connect to Tideways API.
```
- Check internet connection
- Verify Tideways API is accessible from your network
- Check if corporate firewall blocks API access to `app.tideways.io`
- Test with curl: `curl -H "Authorization: Bearer YOUR_TOKEN" https://app.tideways.io/apps/api/`

**MCP Integration Issues**
```
Error: MCP server not responding or connection failed
```
- Restart your AI assistant (Claude Desktop, Cursor, etc.)
- Verify MCP configuration file syntax is correct
- Check that the server command path is correct
- Ensure environment variables are properly set in MCP config
- Try running the server manually first: `npx tideways-mcp-server`

**Package Installation Issues**
```
Error: Command 'tideways-mcp-server' not found
```
- Install the package: `npm install -g tideways-mcp-server`
- Or use npx directly: `npx tideways-mcp-server`
- Clear npm cache: `npm cache clean --force`

### Debug Mode

Enable debug logging for detailed troubleshooting:

```bash
# When running directly
LOG_LEVEL=debug npx tideways-mcp-server

# In MCP configuration, add to env:
{
  "env": {
    "LOG_LEVEL": "debug",
    "TIDEWAYS_TOKEN": "your_token",
    ...
  }
}
```

### Getting Help

1. **Check the logs**: Debug mode provides detailed information about requests and responses
2. **Verify configuration**: Double-check all environment variables and MCP settings
3. **Test API access**: Use curl to verify your Tideways API credentials work
4. **Report issues**: [GitHub Issues](https://github.com/abuhamza/tideways-mcp-server/issues) with debug logs and configuration details

## 🔒 Security

This MCP server implements comprehensive security measures to protect your Tideways API credentials and ensure secure operation:

### Security Pipeline
- **Automated Security Scanning**: CodeQL static analysis for vulnerability detection
- **Dependency Monitoring**: Snyk and npm audit for dependency vulnerabilities
- **Secrets Scanning**: TruffleHog and GitLeaks for credential exposure prevention
- **Supply Chain Security**: SLSA verification and package integrity checks
- **Continuous Monitoring**: Daily automated security scans

### Token Security
- **Validation**: API tokens are validated to ensure they are set (any format accepted)
- **Logging Protection**: Authorization headers are automatically redacted in debug logs as `Bearer [REDACTED]`
- **Secure Storage**: Tokens should be stored in environment variables, never in code
- **Input Sanitization**: All user inputs are validated and sanitized

### CI/CD Security
- **Hardened GitHub Actions**: Minimal permissions for each workflow job
- **Secrets Management**: Secure handling of environment variables and API tokens
- **Supply Chain Protection**: Dependabot for automated security updates
- **Security Gates**: All security checks must pass before deployment

### Runtime Security
- **Rate Limiting**: Built-in protection against API abuse
- **Error Handling**: No sensitive data exposed in error messages
- **Network Security**: HTTPS enforcement for all API communications
- **Memory Safety**: No credential persistence in memory logs

### Best Practices
- Store your API token securely in environment variables or `.env` files
- Never commit API tokens to version control
- Use unique, strong tokens with minimal required permissions
- Regularly rotate your API tokens
- Monitor access logs for suspicious activity
- Keep dependencies updated with automated security patches

### Security Monitoring
- **Zero Known Vulnerabilities**: Continuous npm audit reporting
- **Active Dependency Updates**: Weekly Dependabot security patches
- **Code Quality Gates**: Security scans integrated in CI/CD pipeline
- **Vulnerability Alerts**: Immediate notifications for security issues

### Reporting Security Issues
If you discover a security vulnerability, please report it responsibly through GitHub's security advisory feature or contact the maintainers directly.

## Contributing

We welcome contributions!

### Development Setup

1. Fork the repository
2. Create a feature branch: `git checkout -b your-feature`
3. Make changes and add tests
4. Run tests: `npm test`
5. Submit a pull request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- GitHub Issues: [Report bugs or request features](https://github.com/abuhamza/tideways-mcp-server/issues)


## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

---
