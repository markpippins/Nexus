# syntax=docker/dockerfile:1
# wind-srv — legacy REST server (plain JS, no build step)
# Replaced by nexus-control-edge (Wave 3.4). Packaged for the survivable
# legacy tier per decision D-2026-08-15 (dockerize, not decommission).
# Build context is the typescript/ repo root so file:../heartbeat-client resolves.
FROM node:20-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app/wind-srv

COPY wind-srv/package.json ./
COPY heartbeat-client ../heartbeat-client
RUN npm install --omit=dev --no-package-lock

COPY wind-srv/src ./src

ENV WIND_SRV_PORT=3300
EXPOSE 3300

CMD ["node", "src/index.js"]
