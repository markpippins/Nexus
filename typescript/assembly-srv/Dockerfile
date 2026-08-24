# syntax=docker/dockerfile:1
# assembly-srv — legacy REST API (plain JS, no build step).
# Build context is the typescript/ repo root so file:../heartbeat-client
# resolves — same pattern as wind-srv. (The previous version of this file
# assumed a per-service context and a Bun runtime; it could never build via
# docker-compose, which passes the shared context.)
FROM node:20-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app/assembly-srv

COPY assembly-srv/package.json ./
COPY heartbeat-client ../heartbeat-client
RUN npm install --omit=dev --no-package-lock \
 && cd ../heartbeat-client && npm install --no-package-lock --include=dev && npm run build

COPY assembly-srv/src ./src

ENV PORT=3107
EXPOSE 3107

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/health || exit 1

CMD ["node", "src/index.js"]
