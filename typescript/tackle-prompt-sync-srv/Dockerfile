# syntax=docker/dockerfile:1
# tackle-prompt-sync-srv — legacy prompt sync server (TypeScript)
# Replaced by nexus-control-edge prompt-sync routes (Wave 1.1). Packaged for
# the survivable legacy tier per decision D-2026-08-15 (dockerize, not decommission).
# Build context is the typescript/ repo root so file:../heartbeat-client resolves.
FROM node:20-bookworm AS build
WORKDIR /app/tackle-prompt-sync-srv
COPY tackle-prompt-sync-srv/package.json ./
COPY heartbeat-client ../heartbeat-client
RUN npm install --no-package-lock
# Build file: sibling so its dist/ exists at runtime (main -> ./dist/index.js)
RUN cd ../heartbeat-client && npm install --no-package-lock && npm run build
COPY tackle-prompt-sync-srv/tsconfig.json ./
COPY tackle-prompt-sync-srv/src ./src
# Build the file dep's dist first: the root .dockerignore excludes **/dist,
# so without this tsc type-checks heartbeat-client's TS source (ESM
# import.meta under CommonJS -> TS1343).
WORKDIR /app/heartbeat-client
RUN npm install --no-package-lock && npm run build
# __tests__ is excluded by the root .dockerignore; guard in case the
# context changes — tests must not ship in the image.
WORKDIR /app/tackle-prompt-sync-srv
RUN rm -rf src/__tests__
RUN npm run build
RUN npm prune --omit=dev

FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app/tackle-prompt-sync-srv
COPY --from=build /app/tackle-prompt-sync-srv/package.json ./
COPY --from=build /app/tackle-prompt-sync-srv/node_modules ./node_modules
COPY --from=build /app/tackle-prompt-sync-srv/dist ./dist
COPY --from=build /app/heartbeat-client /app/heartbeat-client

ENV PROMPT_SRV_PORT=3501
EXPOSE 3501

# Drop privileges: the base image runs as root by default.
RUN chown -R node:node /app
USER node
CMD ["node", "dist/index.js"]
