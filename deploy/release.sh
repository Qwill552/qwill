#!/usr/bin/env bash
set -euo pipefail

SHA="${1:-}"
test -n "$SHA" || { echo "не передан идентификатор выпуска"; exit 1; }

ROOT=/var/www/message
RELEASE="$ROOT/releases/$SHA"
ARCHIVE="/tmp/release-$SHA.tar.gz"

test -f "$ARCHIVE" || { echo "нет архива $ARCHIVE"; exit 1; }

rm -rf "$RELEASE"
mkdir -p "$RELEASE"
tar xzf "$ARCHIVE" -C "$RELEASE"
rm -f "$ARCHIVE"

exec bash "$RELEASE/deploy/activate.sh" "$SHA"
