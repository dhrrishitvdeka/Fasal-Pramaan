#!/bin/sh
set -e
ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if [ -f "$ROOT/local/.env" ]; then
  cp "$ROOT/local/.env" "$ROOT/.env"
elif [ ! -f "$ROOT/.env" ]; then
  cp "$ROOT/.env.example" "$ROOT/.env"
fi
echo "Starting local Docker stack from $ROOT"
sh "$ROOT/scripts/start-portable.sh"
