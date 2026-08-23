# syntax=docker/dockerfile:1
# tackle-mcp — AI config registry MCP server (Streamable HTTP, :3400).
# Packaged for the vanadium deployment per architect ruling X2 (2026-08-23):
# the legacy-tier rehoming containerized every *-srv but skipped this MCP
# front door, leaving persona bridge + procedure registry unreachable.
# Build context is the typescript/ repo root so file:../tackle-seeds resolves.
FROM node:20-bookworm AS build
WORKDIR /app/tackle-mcp
COPY tackle-mcp/package.json ./
COPY tackle-seeds ../tackle-seeds
# --no-package-lock: same stale-lockfile workaround as tackle-srv/Dockerfile
RUN npm install --no-package-lock
# Build the tackle-seeds file: dep so its dist/ exists at runtime.
RUN cd ../tackle-seeds && npm install --no-package-lock && npm run build
COPY tackle-mcp/tsconfig.json ./
COPY tackle-mcp/src ./src
RUN npm run build && npm prune --omit=dev

FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app/tackle-mcp
COPY --from=build /app/tackle-mcp/package.json ./
COPY --from=build /app/tackle-mcp/node_modules ./node_modules
COPY --from=build /app/tackle-mcp/dist ./dist
COPY --from=build /app/tackle-seeds /app/tackle-seeds

ENV PORT=3400
EXPOSE 3400

CMD ["node", "dist/index.js"]
