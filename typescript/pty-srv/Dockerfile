# syntax=docker/dockerfile:1
# pty-srv — legacy pty session server (TypeScript, node-pty native module)
# Replaced by worker.pty in nexus-broker (Wave 4). Packaged for the
# survivable legacy tier per decision D-2026-08-15 (dockerize, not decommission).
# Build context is the typescript/ repo root so file:../heartbeat-client resolves.
# node-pty requires build tools at install time — build stage uses the full
# bookworm image which ships python3/make/g++.
FROM node:20-bookworm AS build
WORKDIR /app/pty-srv
COPY pty-srv/package.json ./
COPY heartbeat-client ../heartbeat-client
RUN npm install --no-package-lock
# Build file: sibling so its dist/ exists at runtime (main -> ./dist/index.js)
RUN cd ../heartbeat-client && npm install --no-package-lock && npm run build
COPY pty-srv/tsconfig.json ./
COPY pty-srv/src ./src
RUN npm run build
RUN npm prune --omit=dev

# Runtime keeps the full image: node-pty is a native module loaded at runtime.
FROM node:20-bookworm AS runtime
ENV NODE_ENV=production
WORKDIR /app/pty-srv
COPY --from=build /app/pty-srv/package.json ./
COPY --from=build /app/pty-srv/node_modules ./node_modules
COPY --from=build /app/pty-srv/dist ./dist
COPY --from=build /app/heartbeat-client /app/heartbeat-client

ENV PTY_SRV_PORT=3120
EXPOSE 3120

# Drop privileges: the base image runs as root by default.
RUN chown -R node:node /app
USER node
CMD ["node", "dist/index.js"]
