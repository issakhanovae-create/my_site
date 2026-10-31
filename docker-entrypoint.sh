#!/bin/sh
set -e

mkdir -p /app/data/backups /app/img/shop

# Первый запуск named volume: подложить seed каталога
if [ ! -f /app/data/products.json ] && [ -f /app/seed/products.json ]; then
  cp /app/seed/products.json /app/data/products.json
fi

# Named volume часто создаётся от root — отдаём node.
# Важно: PID приложения должен быть прямым потомком init (не runuser),
# иначе docker stop не доставляет SIGTERM в Node и SQLite WAL может
# остаться грязным.
if [ "$(id -u)" = "0" ]; then
  chown -R node:node /app/data 2>/dev/null || true
  chown -R node:node /app/img 2>/dev/null || true
  if command -v setpriv >/dev/null 2>&1; then
    exec setpriv --reuid=node --regid=node --init-groups -- "$@"
  fi
  # fallback (хуже по сигналам, но лучше чем root)
  exec runuser -u node -- "$@"
fi

exec "$@"
