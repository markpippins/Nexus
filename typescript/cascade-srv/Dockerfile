# syntax=docker/dockerfile:1
# cascade-srv — legacy REST server (TypeScript)
# Replaced by nexus-control-edge (Wave 3.8). Packaged for the survivable
# legacy tier per decision D-2026-08-15 (dockerize, not decommission).
# Build context is the typescript/ repo root.
FROM node:20-bookworm AS build
WORKDIR /app/cascade-srv
COPY cascade-srv/package.json ./
RUN npm install --no-package-lock
COPY cascade-srv/tsconfig.json ./
COPY cascade-srv/src ./src
RUN npm run build
RUN npm prune --omit=dev

FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app/cascade-srv
COPY --from=build /app/cascade-srv/package.json ./
COPY --from=build /app/cascade-srv/node_modules ./node_modules
COPY --from=build /app/cascade-srv/dist ./dist

ENV PORT=3106
EXPOSE 3106

CMD ["node", "dist/index.js"]
