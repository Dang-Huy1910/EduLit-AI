#!/bin/sh
set -eu

if [ "${RUN_MIGRATIONS:-1}" = "1" ]; then
  echo "api-entrypoint: prisma migrate deploy"
  npx prisma migrate deploy
fi

# Seed chạy từ máy host: cd backend && npm run prisma:seed
# (image production không kèm tsx/devDependencies).

exec node dist/main.js
