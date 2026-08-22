# syntax=docker/dockerfile:1
# assembly-srv — legacy REST server (plain JS, no build step)
# Replaced-by note per docs; packaged for the vanadium failover tier.
# Build context is the typescript/ repo root so file:../heartbeat-client resolves.
FROM node:20-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app/assembly-srv

COPY assembly-srv/package.json ./
COPY heartbeat-client ../heartbeat-client
RUN npm install --omit=dev --no-package-lock
# Build file: sibling so its dist/ exists at runtime (main -> ./dist/index.js)
RUN cd ../heartbeat-client && npm install --no-package-lock --include=dev && npm run build

COPY assembly-srv/src ./src

ENV ASSEMBLY_SRV_PORT=3107
EXPOSE 3107

CMD ["node", "src/index.js"]
