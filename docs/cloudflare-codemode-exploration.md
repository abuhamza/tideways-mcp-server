# Cloudflare CodeMode SDK — Integration Exploration

## 1. What is Cloudflare CodeMode?

Cloudflare CodeMode is a technique that lets LLMs **write and execute code** to orchestrate
tools, instead of calling them one at a time. Inspired by
[CodeAct](https://arxiv.org/abs/2402.01030), it works because LLMs are better at writing code
(having trained on millions of lines) than at making individual tool calls (which appear rarely in
training data).

The `@cloudflare/codemode` package:

1. Generates **TypeScript type definitions** from your tool schemas.
2. Gives the LLM a **single "write code" tool** instead of many individual tools.
3. Executes the generated JavaScript in a **secure, isolated Worker sandbox**.

### Why it matters

MCP has a fundamental tension: agents need many tools to be useful, but every tool definition
consumes context window tokens. For example, the Cloudflare API has 2,500+ endpoints. Exposing
each as an MCP tool would be impractical. CodeMode solves this — **two tools, ~1,000 tokens, full
API coverage**. Benchmarks show **32% token savings** on simple tasks and **81% on complex batch
operations**.

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│  LLM (Claude, GPT, etc.)                            │
│  Sees ONE tool: "codemode" with TypeScript types     │
│  Writes: async () => {                               │
│    const data = await codemode.get_traces({...});    │
│    const issues = await codemode.get_issues({...});  │
│    return { data, issues };                          │
│  }                                                   │
└────────────────────┬────────────────────────────────┘
                     │ code string
                     ▼
┌─────────────────────────────────────────────────────┐
│  createCodeTool()                                    │
│  - AST normalization (acorn parser)                  │
│  - Code validation                                   │
│  - Dispatches to Executor                            │
└────────────────────┬────────────────────────────────┘
                     │ execute(code, fns)
                     ▼
┌─────────────────────────────────────────────────────┐
│  Executor (DynamicWorkerExecutor or custom)          │
│  - Isolated V8 sandbox (no network by default)       │
│  - Proxy intercepts codemode.* calls                 │
│  - Routes calls back to host via Workers RPC         │
│  - Captures console.log/warn/error                   │
│  - Returns ExecuteResult { result, error?, logs? }   │
└────────────────────┬────────────────────────────────┘
                     │ RPC callback
                     ▼
┌─────────────────────────────────────────────────────┐
│  Actual Tool Implementations / MCP Servers           │
│  (Tideways API, Cloudflare API, etc.)                │
└─────────────────────────────────────────────────────┘
```

## 3. Core API Reference

### Installation

```bash
npm install @cloudflare/codemode agents ai zod
```

> **Latest version:** v0.1.0 (Feb 20, 2026) — fully rewritten as a modular, runtime-agnostic SDK.

### `createCodeTool(options)`

The primary export. Combines tools + executor into a single AI SDK-compatible tool.

```typescript
import { createCodeTool } from "@cloudflare/codemode/ai";
import { DynamicWorkerExecutor } from "@cloudflare/codemode";

const codemode = createCodeTool({
  tools,       // AI SDK tool() objects or raw tool descriptors (required)
  executor,    // Executor implementation (required)
  description, // Custom description with {{types}} placeholder (optional)
});
```

### `Executor` Interface

Minimal contract — implement for any sandbox runtime:

```typescript
interface Executor {
  execute(
    code: string,
    fns: Record<string, (...args: unknown[]) => Promise<unknown>>
  ): Promise<ExecuteResult>;
}

interface ExecuteResult {
  result: unknown;
  error?: string;
  logs?: string[];
}
```

### `DynamicWorkerExecutor`

The Cloudflare Workers implementation:

```typescript
const executor = new DynamicWorkerExecutor({
  loader: env.LOADER,        // WorkerLoader binding (required)
  timeout: 30_000,           // Execution timeout in ms (default: 30s)
  globalOutbound: null,      // null = blocked, Fetcher = routed
});
```

Wrangler configuration:

```jsonc
// wrangler.jsonc
{
  "worker_loaders": [{ "binding": "LOADER" }],
  "compatibility_flags": ["nodejs_compat"]
}
```

### Utility Functions

- **`generateTypes(tools)`** — Generates TypeScript declarations from tool definitions.
- **`sanitizeToolName(name)`** — Converts tool names to valid JS identifiers
  (`my-tool` → `my_tool`, `delete` → `delete_`).

## 4. Integration with MCP Servers

MCP tools merge seamlessly with native tools:

```typescript
// Inside an Agent class
const codemode = createCodeTool({
  tools: {
    ...myNativeTools,
    ...this.mcp.getAITools(),  // MCP tools from connected servers
  },
  executor,
});

const result = streamText({
  model,
  system: "You are a helpful assistant.",
  messages,
  tools: { codemode },
});
```

The LLM then writes code like:

```typescript
async () => {
  const metrics = await codemode.get_performance_metrics({
    ts: "transaction",
    m: "walltime",
    env: "production",
  });
  const issues = await codemode.get_issues({
    issue_type: "error",
    status: "open",
  });
  return { metrics, issues, hasOpenErrors: issues.length > 0 };
};
```

## 5. Applicability to Tideways MCP Server

### Current State

The Tideways MCP server currently:
- Uses **stdio transport** with `@modelcontextprotocol/sdk` v0.5.0
- Exposes **5 tools**: `get_performance_metrics`, `get_performance_summary`, `get_issues`,
  `get_traces`, `get_historical_data`
- Is consumed by AI clients (Claude Desktop, Cursor) as a local MCP server

### Integration Paths

There are **three possible integration approaches**:

#### Path A: Remote MCP Server on Cloudflare Workers (Consumer-Side CodeMode)

Keep the Tideways MCP server as-is. The AI agent consuming it (e.g., a Cloudflare Agent) would
connect to it via MCP and wrap it in CodeMode on the consumer side:

```typescript
// Agent-side (not in tideways-mcp-server)
this.addMcpServer("tideways", "https://tideways-mcp.example.com/mcp");
const codemode = createCodeTool({
  tools: this.mcp.getAITools(),
  executor,
});
```

**Pros:** No changes to tideways-mcp-server needed.
**Cons:** Requires the consumer to set up CodeMode. Tideways server must support remote transport.

#### Path B: Deploy Tideways MCP as a Remote Cloudflare Worker

Convert the Tideways MCP server to a Cloudflare Worker with remote MCP transport (SSE or
streamable-http). This makes it accessible to any remote MCP client, including CodeMode-enabled
agents.

**Required changes:**
1. Replace stdio transport with Cloudflare's `McpAgent` class
2. Add OAuth 2.1 authentication (Cloudflare Workers OAuth Provider)
3. Deploy as a Cloudflare Worker
4. Wire up Tideways API credentials via Worker secrets/KV

**Pros:** Accessible from anywhere, no local install needed.
**Cons:** Significant refactor; moves away from simple `npx` usage.

#### Path C: Embed CodeMode Directly (Custom Executor)

Build a custom `Executor` that doesn't require Cloudflare Workers (e.g., Node.js `vm` module
or QuickJS). Bundle CodeMode within the Tideways server itself, so it can offer both individual
tools and a single `codemode` meta-tool.

**Required changes:**
1. Implement a Node.js-compatible `Executor` (the `Executor` interface is runtime-agnostic)
2. Add `@cloudflare/codemode` dependency
3. Register a `codemode` tool alongside existing tools
4. Generate TypeScript types from existing tool definitions

**Pros:** Token savings for all consumers; works locally.
**Cons:** Need a secure sandbox in Node.js; more complex server.

### Recommended Path

**Path A** is the lowest-effort and most practical first step:
- The Tideways MCP server continues working as-is
- Any Cloudflare Agent-based consumer can wrap it in CodeMode automatically
- No breaking changes to existing users

**Path B** could be a future enhancement if there's demand for a hosted/remote version.

## 6. Security Considerations

CodeMode provides strong isolation by default:

- **Network isolation:** `fetch()` and `connect()` blocked via `globalOutbound: null`
- **Sandbox isolation:** V8 isolates (not containers) — fast startup, no shared memory
- **Credential safety:** The sandbox never sees API tokens; RPC callbacks add auth on the host side
- **Console capture:** `console.log/warn/error` captured and returned, not leaked
- **Execution timeout:** Configurable (default 30s) to prevent runaway code

## 7. Current Limitations

- **Experimental:** May have breaking changes in future releases
- **No tool approval:** `needsApproval: true` tools execute immediately in the sandbox
- **JavaScript only:** Generated code is JavaScript (not Python, etc.)
- **Bundle size:** `zod-to-ts` dependency includes the TypeScript compiler
- **DynamicWorkerExecutor** requires Cloudflare Workers environment; custom executors needed
  for Node.js

## 8. Key Resources

- [Code Mode: the better way to use MCP](https://blog.cloudflare.com/code-mode/) — Cloudflare blog
- [Code Mode: give agents an entire API in 1,000 tokens](https://blog.cloudflare.com/code-mode-mcp/) — Cloudflare blog
- [Codemode API Reference](https://developers.cloudflare.com/agents/api-reference/codemode/) — Official docs
- [@cloudflare/codemode v0.1.0 Changelog](https://developers.cloudflare.com/changelog/post/2026-02-20-codemode-sdk-rewrite/) — Feb 2026 rewrite
- [cloudflare/agents (GitHub)](https://github.com/cloudflare/agents/tree/main/packages/codemode) — Source code
- [Codemode example app](https://github.com/cloudflare/agents/tree/main/examples/codemode) — Reference implementation
- [jx-codes/codemode-mcp](https://github.com/jx-codes/codemode-mcp) — Community local implementation
