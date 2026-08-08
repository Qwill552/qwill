#!/usr/bin/env bash
set -euo pipefail

SHA="${1:-}"
test -n "$SHA" || { echo "не передан идентификатор выпуска"; exit 1; }

ROOT=/var/www/message
RELEASE="$ROOT/releases/$SHA"
ARCHIVE="/tmp/release-$SHA.tar.gz"

test -f "$ARCHIVE" || { echo "нет архива $ARCHIVE"; exit 1; }

PREVIOUS=$(readlink -f "$ROOT/current" 2>/dev/null || true)

rm -rf "$RELEASE"
mkdir -p "$RELEASE"
tar xzf "$ARCHIVE" -C "$RELEASE"
rm -f "$ARCHIVE"

ln -sfn "$ROOT/shared/.env" "$RELEASE/.env"
ln -sfn "$ROOT/shared/storage" "$RELEASE/storage"

cd "$RELEASE"
npm ci
npm run db:deploy -w @messenger/server

chown -R qwill:qwill "$RELEASE"
chmod o+x "$RELEASE"
chmod -R o+rX "$RELEASE/client/dist"

ln -sfn "$RELEASE" "$ROOT/current"
systemctl restart qwill

for _ in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:3000/api/health > /dev/null 2>&1; then
    echo "выпуск $SHA поднялся"
    ls -1dt "$ROOT"/releases/*/ | tail -n +6 | xargs -r rm -rf
    exit 0
  fi
  sleep 2
done

echo "выпуск $SHA не отвечает за 40 секунд"

if [ -n "$PREVIOUS" ] && [ -d "$PREVIOUS" ] && [ "$PREVIOUS" != "$RELEASE" ]; then
  echo "откат на $PREVIOUS"
  ln -sfn "$PREVIOUS" "$ROOT/current"
  systemctl restart qwill
fi

exit 1
