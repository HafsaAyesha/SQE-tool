# syntax=docker/dockerfile:1
FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY worker/package*.json ./
RUN --mount=type=secret,id=proxy_ca NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca npm ci --strict-ssl=true
COPY worker/src ./worker/src
COPY worker/tsconfig.json ./worker/tsconfig.json
COPY shared ./shared
RUN ./node_modules/.bin/tsc -p worker/tsconfig.json
FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production PORT=3001
COPY worker/package*.json ./
RUN --mount=type=secret,id=proxy_ca NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca npm ci --omit=dev --strict-ssl=true
COPY --from=build /app/worker/dist ./dist
USER node
EXPOSE 3001
CMD ["node","dist/worker/src/server.js"]
