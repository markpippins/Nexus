# nexus-broker — moleculer worker tier (candidate stack)
# transporter: null → fully in-process; no NATS/Redis needed for the broker itself.
FROM node:24-slim
WORKDIR /app

# node-pty builds natively — needs the toolchain on slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json moleculer.config.ts ./
COPY services ./services
RUN npx tsc

ENV NODE_ENV=production SERVICE_PORT=4080
EXPOSE 4080
CMD ["npx", "moleculer-runner", "--mask", "**/*.js", "dist/services"]
