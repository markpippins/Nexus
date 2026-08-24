# syntax=docker/dockerfile:1
# Build context is the typescript/ repo root so file:../heartbeat-client resolves.
# Vanadium failover tier per operator scope 2026-08-22 (.directory-marked).
FROM node:20-bookworm AS build
WORKDIR /app/voyager-srv
COPY voyager-srv/package.json ./
COPY heartbeat-client ../heartbeat-client
RUN npm install --no-package-lock
RUN cd ../heartbeat-client && npm install --no-package-lock --include=dev && npm run build
COPY voyager-srv/tsconfig.json ./
COPY voyager-srv/src ./src
RUN npm run build && npm prune --omit=dev

FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app/voyager-srv
COPY --from=build /app/voyager-srv/package.json ./
COPY --from=build /app/voyager-srv/node_modules ./node_modules
COPY --from=build /app/voyager-srv/dist ./dist
COPY --from=build /app/heartbeat-client /app/heartbeat-client
EXPOSE 3114
CMD ["node", "dist/index.js"]
