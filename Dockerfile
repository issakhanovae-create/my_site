# syntax=docker/dockerfile:1
# Node >= 22.5 нужен для встроенного node:sqlite
FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html vite.config.js ./
COPY public ./public
COPY src ./src
COPY img ./img

RUN npm run build

# --- runtime: только сервер + собранный фронт ---
FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    PORT=8765 \
    BIND_HOST=0.0.0.0

COPY package.json ./
COPY server.cjs ./
COPY ai ./ai
COPY --from=build /app/dist ./dist
COPY img ./img
# seed каталога — копируется в volume при первом старте
COPY data/products.json /app/seed/products.json
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN mkdir -p /app/data/backups /app/img/shop \
 && chmod +x /usr/local/bin/docker-entrypoint.sh \
 && chown -R node:node /app

# Entrypoint стартует от root (chown volume), затем переключается на node
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.cjs"]

EXPOSE 8765

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8765)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
