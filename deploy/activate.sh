#!/usr/bin/env bash
set -euo pipefail

SHA="${1:-}"
CHANNEL="${2:-prod}"
test -n "$SHA" || { echo "не передан идентификатор выпуска"; exit 1; }

case "$CHANNEL" in
  prod) ROOT=/var/www/message; UNIT=qwill; PORT=3000 ;;
  dev) ROOT=/var/www/message-dev; UNIT=qwill-dev; PORT=3001 ;;
  *) echo "неизвестный контур: $CHANNEL"; exit 1 ;;
esac

RELEASE="$ROOT/releases/$SHA"

test -d "$RELEASE" || { echo "нет выпуска $RELEASE"; exit 1; }

PREVIOUS=$(readlink -f "$ROOT/current" 2>/dev/null || true)

mkdir -p "$ROOT/shared/app-releases"

ln -sfn "$ROOT/shared/.env" "$RELEASE/.env"
ln -sfn "$ROOT/shared/storage" "$RELEASE/storage"
ln -sfn "$ROOT/shared/app-releases" "$RELEASE/app-releases"

cd "$RELEASE"
npm ci
npm run db:deploy -w @messenger/server

chown -R qwill:qwill "$RELEASE"
chmod o+x "$RELEASE"
chmod -R o+rX "$RELEASE/client/dist"

ln -sfn "$RELEASE" "$ROOT/current"
systemctl restart "$UNIT"

for _ in $(seq 1 20); do
  if curl -fsS "http://127.0.0.1:$PORT/api/health" > /dev/null 2>&1; then
    echo "выпуск $SHA ($CHANNEL) поднялся"
    ls -1dt "$ROOT"/releases/*/ | tail -n +6 | xargs -r rm -rf
    exit 0
  fi
  sleep 2
done

echo "выпуск $SHA ($CHANNEL) не отвечает за 40 секунд"

if [ -n "$PREVIOUS" ] && [ -d "$PREVIOUS" ] && [ "$PREVIOUS" != "$RELEASE" ]; then
  echo "откат на $PREVIOUS"
  ln -sfn "$PREVIOUS" "$ROOT/current"
  systemctl restart "$UNIT"
fi

exit 1
