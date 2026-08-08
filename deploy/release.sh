#!/usr/bin/env bash
set -euo pipefail

SHA="$1"
ROOT=/var/www/message
RELEASE="$ROOT/releases/$SHA"

test -d "$RELEASE" || { echo "нет выпуска $RELEASE"; exit 1; }

ln -sfn "$ROOT/shared/.env" "$RELEASE/.env"
ln -sfn "$ROOT/shared/storage" "$RELEASE/storage"

cd "$RELEASE"
npm ci
npx prisma migrate deploy --schema server/prisma/schema.prisma

chown -R qwill:qwill "$RELEASE"

ln -sfn "$RELEASE" "$ROOT/current"
systemctl restart qwill

ls -1dt "$ROOT"/releases/*/ | tail -n +6 | xargs -r rm -rf
