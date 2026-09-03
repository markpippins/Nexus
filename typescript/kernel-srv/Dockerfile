# syntax=docker/dockerfile:1
# kernel-srv — legacy REST server (TypeScript)
# Replaced by nexus-control-edge (Wave 3.6). Packaged for the survivable
# legacy tier per decision D-2026-08-15 (dockerize, not decommission).
# Build context is the typescript/ repo root so file:../heartbeat-client resolves.
FROM node:20-bookworm AS build
WORKDIR /app/kernel-srv
COPY kernel-srv/package.json ./
COPY heartbeat-client ../heartbeat-client
RUN npm install --no-package-lock
# Build file: sibling so its dist/ exists at runtime (main -> ./dist/index.js)
RUN cd ../heartbeat-client && npm install --no-package-lock && npm run build
COPY kernel-srv/tsconfig.json ./
COPY kernel-srv/src ./src
RUN npm run build
RUN npm prune --omit=dev

FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app/kernel-srv
COPY --from=build /app/kernel-srv/package.json ./
COPY --from=build /app/kernel-srv/node_modules ./node_modules
COPY --from=build /app/kernel-srv/dist ./dist
COPY --from=build /app/heartbeat-client /app/heartbeat-client

ENV PORT=8100
EXPOSE 8100

# Drop privileges: the base image runs as root by default.
RUN chown -R node:node /app
USER node
CMD ["node", "dist/index.js"]
