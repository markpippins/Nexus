# syntax=docker/dockerfile:1
# nebula-mcp — database-first agent records MCP (SSE transport, :3102).
# Packaged for the vanadium deployment per architect ruling X2 (2026-08-23):
# only nebula-srv REST (:3101) was containerized; agents were degraded to
# raw REST. This is the MCP front door over it. No file: deps — plain tsc.
FROM node:20-bookworm AS build
WORKDIR /app/nebula-mcp
COPY nebula-mcp/package.json ./
# --no-package-lock: match sibling Dockerfiles; resolve fresh in-image.
RUN npm install --no-package-lock
COPY nebula-mcp/tsconfig.json ./
COPY nebula-mcp/src ./src
RUN npm run build && npm prune --omit=dev

FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app/nebula-mcp
COPY --from=build /app/nebula-mcp/package.json ./
COPY --from=build /app/nebula-mcp/node_modules ./node_modules
COPY --from=build /app/nebula-mcp/dist ./dist

# SSE entry (src/sse.ts -> dist/sse.js) serves Streamable HTTP on :3102;
# dist/index.js is the stdio variant used by local CLI clients.
ENV NEBULA_MCP_PORT=3102
EXPOSE 3102

# Drop privileges: the base image runs as root by default.
RUN chown -R node:node /app
USER node
CMD ["node", "dist/sse.js"]
