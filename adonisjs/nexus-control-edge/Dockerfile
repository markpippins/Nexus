# nexus-control-edge — adonisjs v6 REST edge (candidate stack)
FROM node:24-slim AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN node ace build

FROM node:24-slim
WORKDIR /app
COPY --from=build /src/build .
RUN npm ci --omit=dev

ENV NODE_ENV=production HOST=0.0.0.0 PORT=8082
EXPOSE 8082
CMD ["node", "bin/server.js"]
