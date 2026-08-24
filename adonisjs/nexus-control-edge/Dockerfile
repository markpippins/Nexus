# nexus-control-edge — adonisjs v6 REST edge (candidate stack)
#
# NOTE: this app declares its framework packages (@adonisjs/*) under
# devDependencies, so the runtime stage must run a FULL `npm ci` from the
# root lockfile — `npm ci --omit=dev` inside build/ strips the framework.
FROM node:24-slim AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN node ace build

FROM node:24-slim
WORKDIR /app
COPY --from=build /src/package.json /src/package-lock.json ./
RUN npm ci
COPY --from=build /src/build ./build

ENV NODE_ENV=production HOST=0.0.0.0 PORT=8082
EXPOSE 8082
CMD ["node", "build/bin/server.js"]
