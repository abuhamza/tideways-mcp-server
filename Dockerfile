# Tideways MCP server (stdio transport).
#   docker run -i --rm -e TIDEWAYS_TOKEN=... ghcr.io/abuhamza/tideways-mcp-server:latest
# Base images are pinned by multi-arch index digest; Dependabot (docker ecosystem) bumps the digests.

# ---- build: compile TypeScript -------------------------------------------------
# Runs on the build host's architecture: tsc output is plain JS, so there is no need to emulate
# the target arch (QEMU) for this stage.
FROM --platform=$BUILDPLATFORM node:24-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS build
WORKDIR /app
COPY package.json package-lock.json ./
# --ignore-scripts: compiling needs no dependency install scripts; tsc runs explicitly below.
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npx --no-install tsc -p tsconfig.build.json

# ---- deps: production node_modules for the TARGET architecture -----------------
# Runs per target platform, so dependencies with native addons (none today) would still be correct.
FROM node:24-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund

# ---- runtime: distroless Node 24, no shell, no npm, runs as uid 65532 ("nonroot") ----
FROM gcr.io/distroless/nodejs24-debian13:nonroot@sha256:bb6b03d81066993293a10feda7250e8e1cc034035fe9b61cfceededa7c8bf04d AS runtime

# The MCP Registry verifies ownership of OCI packages through this label (read from the image config).
LABEL io.modelcontextprotocol.server.name="io.github.abuhamza/tideways-mcp-server" \
      org.opencontainers.image.title="tideways-mcp-server" \
      org.opencontainers.image.description="MCP server that lets AI assistants query Tideways PHP performance monitoring data" \
      org.opencontainers.image.source="https://github.com/abuhamza/tideways-mcp-server" \
      org.opencontainers.image.url="https://github.com/abuhamza/tideways-mcp-server" \
      org.opencontainers.image.documentation="https://github.com/abuhamza/tideways-mcp-server#readme" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.authors="Mouhammed Diop"

ENV NODE_ENV=production
WORKDIR /app

# package.json is required at runtime: its "type": "module" makes Node load dist/*.js as ESM.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

USER 65532:65532

# Distroless images have no `node` on PATH; the binary lives at /nodejs/bin/node.
ENTRYPOINT ["/nodejs/bin/node", "dist/index.js"]
