# syntax=docker/dockerfile:1
# peb-srv — legacy REST server (plain JS, no build step)
# Replaced by nexus-control-edge (Wave 3.7). Packaged for the survivable
# legacy tier per decision D-2026-08-15 (dockerize, not decommission).
# Build context is the typescript/ repo root so file:../heartbeat-client resolves.
FROM node:20-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app/peb-srv

COPY peb-srv/package.json ./
COPY heartbeat-client ../heartbeat-client
RUN npm install --omit=dev --no-package-lock
# Build file: sibling so its dist/ exists at runtime (main -> ./dist/index.js)
RUN cd ../heartbeat-client && npm install --no-package-lock --include=dev && npm run build

COPY peb-srv/src ./src

ENV PEB_SRV_PORT=3111
EXPOSE 3111

# Drop privileges: the base image runs as root by default.
RUN chown -R node:node /app
USER node
CMD ["node", "src/index.js"]
