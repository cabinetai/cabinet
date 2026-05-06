# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS deps

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates make g++ python3 \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY scripts/postinstall.mjs ./scripts/postinstall.mjs
RUN npm ci

FROM deps AS build

WORKDIR /app

COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=8080
ENV CABINET_APP_PORT=8080
ENV CABINET_DATA_DIR=/data
# Internal-dev runs behind Azure Container Apps ingress. This keeps the
# password cookie usable before custom-domain/TLS-aware session logic lands.
ENV KB_ALLOW_HTTP=1

RUN mkdir -p /data \
  && chown -R node:node /data

COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public

USER node

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 8080) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]
