# syntax=docker/dockerfile:1
# Build context is the typescript/ repo root so file:../heartbeat-client resolves.
# Vanadium failover tier per operator scope 2026-08-22 (.directory-marked).
FROM node:20-bookworm AS build
WORKDIR /app/semantics-srv
COPY semantics-srv/package.json ./
COPY heartbeat-client ../heartbeat-client
RUN npm install --no-package-lock
RUN cd ../heartbeat-client && npm install --no-package-lock --include=dev && npm run build
COPY semantics-srv/tsconfig.json ./
COPY semantics-srv/src ./src
RUN npm run build && npm prune --omit=dev

FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app/semantics-srv
COPY --from=build /app/semantics-srv/package.json ./
COPY --from=build /app/semantics-srv/node_modules ./node_modules
COPY --from=build /app/semantics-srv/dist ./dist
COPY --from=build /app/heartbeat-client /app/heartbeat-client
EXPOSE 3160
CMD ["node", "dist/index.js"]
