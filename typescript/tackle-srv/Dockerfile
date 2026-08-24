# syntax=docker/dockerfile:1
# tackle-srv — legacy REST server (TypeScript)
# Replaced by nexus-control-edge (Wave 3.5). Packaged for the survivable
# legacy tier per decision D-2026-08-15 (dockerize, not decommission).
# Build context is the typescript/ repo root so file:../heartbeat-client
# and file:../tackle-seeds resolve.
FROM node:20-bookworm AS build
WORKDIR /app/tackle-srv
COPY tackle-srv/package.json ./
COPY heartbeat-client ../heartbeat-client
COPY tackle-seeds ../tackle-seeds
# --no-package-lock: the repo lockfiles are out of sync with the file: deps
# (npm bug 'Cannot read properties of undefined (reading extraneous)');
# resolve fresh for the image instead of fighting the stale lock.
RUN npm install --no-package-lock
# Build tackle-seeds file: dep so its dist/ exists at runtime (main -> ./dist/index.js).
# heartbeat-client dist is built further below alongside the tsc workaround.
RUN cd ../tackle-seeds && npm install --no-package-lock && npm run build
COPY tackle-srv/tsconfig.json ./
COPY tackle-srv/src ./src
# Build the file deps' dist first: the root .dockerignore excludes **/dist,
# so without this tsc may type-check heartbeat-client's TS source (ESM
# import.meta under CommonJS -> TS1343).
WORKDIR /app/heartbeat-client
RUN npm install --no-package-lock && npm run build
WORKDIR /app/tackle-srv
RUN npm run build
RUN npm prune --omit=dev

FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app/tackle-srv
COPY --from=build /app/tackle-srv/package.json ./
COPY --from=build /app/tackle-srv/node_modules ./node_modules
COPY --from=build /app/tackle-srv/dist ./dist
COPY --from=build /app/heartbeat-client /app/heartbeat-client
COPY --from=build /app/tackle-seeds /app/tackle-seeds

ENV TACKLE_SRV_PORT=3410
EXPOSE 3410

CMD ["node", "dist/index.js"]
