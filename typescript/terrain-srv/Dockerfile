# syntax=docker/dockerfile:1
# terrain-srv — TS topology REST service (prebuilt: ships dist/ only).
# Vanadium failover tier per operator scope 2026-08-22 (.directory-marked).
# The checked-in node_modules/heartbeat-client is a dangling file:-style
# symlink without its context — we rebuild the sibling dist in a prep stage
# and graft it into place. Build context is the typescript/ repo root.
FROM node:20-bookworm AS prep
WORKDIR /hb
COPY heartbeat-client/package.json ./
RUN npm install --no-package-lock --include=dev
COPY heartbeat-client/cli.ts heartbeat-client/index.ts ./
RUN npx tsc index.ts cli.ts --outDir dist --module es2020 --moduleResolution node \
      --target es2022 --esModuleInterop --skipLibCheck || \
    npx tsc index.ts --outDir dist --module es2020 --moduleResolution node \
      --target es2022 --esModuleInterop --skipLibCheck

FROM node:20-bookworm-slim
WORKDIR /app
COPY terrain-srv/dist ./dist
COPY terrain-srv/node_modules ./node_modules
COPY --from=prep /hb/package.json ./node_modules/heartbeat-client/package.json
COPY --from=prep /hb/dist ./node_modules/heartbeat-client/dist
ENV NODE_ENV=production
EXPOSE 8084
CMD ["node", "dist/index.js"]
