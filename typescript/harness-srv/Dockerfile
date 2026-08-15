# syntax=docker/dockerfile:1
# harness-srv — legacy agent-run server (TypeScript)
# Replaced by worker.harness in nexus-broker (Wave 4). Packaged for the
# survivable legacy tier per decision D-2026-08-15 (dockerize, not decommission).
# Build context is the typescript/ repo root.
# NOTE: spawns agent subprocesses — mount HARNESS_WORK_DIR and make
# OPENCODE_BIN available (see docker/legacy-tier/README.md).
FROM node:20-bookworm AS build
WORKDIR /app/harness-srv
COPY harness-srv/package.json ./
RUN npm install --no-package-lock
COPY harness-srv/tsconfig.json ./
COPY harness-srv/src ./src
RUN npm run build
RUN npm prune --omit=dev

FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app/harness-srv
COPY --from=build /app/harness-srv/package.json ./
COPY --from=build /app/harness-srv/node_modules ./node_modules
COPY --from=build /app/harness-srv/dist ./dist

ENV HARNESS_PORT=3420
EXPOSE 3420

CMD ["node", "dist/index.js"]
