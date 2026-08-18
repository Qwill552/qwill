#!/usr/bin/env bash
set -euo pipefail

SHA="${1:-}"
CHANNEL="${2:-prod}"
test -n "$SHA" || { echo "не передан идентификатор выпуска"; exit 1; }

case "$CHANNEL" in
  prod) ROOT=/var/www/message ;;
  dev) ROOT=/var/www/message-dev ;;
  *) echo "неизвестный контур: $CHANNEL"; exit 1 ;;
esac

RELEASE="$ROOT/releases/$SHA"
ARCHIVE="/tmp/release-$SHA.tar.gz"

test -f "$ARCHIVE" || { echo "нет архива $ARCHIVE"; exit 1; }

rm -rf "$RELEASE"
mkdir -p "$RELEASE"
tar xzf "$ARCHIVE" -C "$RELEASE"
rm -f "$ARCHIVE"

exec bash "$RELEASE/deploy/activate.sh" "$SHA" "$CHANNEL"
