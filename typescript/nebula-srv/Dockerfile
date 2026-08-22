# syntax=docker/dockerfile:1
# nebula-srv — canonical REST API over the relational schemas (:3101).
# Vanadium failover tier per operator scope 2026-08-22 (.directory-marked).
# Build context is the typescript/ repo root.
FROM node:20-bookworm AS build
WORKDIR /app/nebula-srv
COPY nebula-srv/package.json ./
RUN npm install --no-package-lock
COPY nebula-srv/tsconfig.json ./
COPY nebula-srv/src ./src
COPY nebula-srv/migrations ./migrations
RUN npm run build && npm prune --omit=dev

FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app/nebula-srv
COPY --from=build /app/nebula-srv/package.json ./
COPY --from=build /app/nebula-srv/node_modules ./node_modules
COPY --from=build /app/nebula-srv/dist ./dist
COPY --from=build /app/nebula-srv/migrations ./migrations

ENV NEBULA_PORT=3101
EXPOSE 3101
CMD ["node", "dist/index.js"]
