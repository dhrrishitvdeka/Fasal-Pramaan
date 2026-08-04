#!/usr/bin/env sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"

PUBLIC_HOST=${1:-localhost}
export PUBLIC_HOST

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed or is not available on PATH." >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "Docker Engine/Desktop is not running." >&2
  exit 1
fi

[ -f .env ] || cp .env.example .env
docker compose up -d --build

echo "Waiting for the stack..."
attempt=0
until curl -fsS http://localhost:8000/health >/dev/null \
  && curl -fsS http://localhost:8001/health >/dev/null \
  && curl -fsS http://localhost:3000 >/dev/null \
  && curl -fsS http://localhost:8085/healthz >/dev/null; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 45 ]; then
    echo "Stack did not become ready. Run: docker compose logs --tail=100" >&2
    exit 1
  fi
  sleep 2
done

for container in fp-worker fp-beat; do
  if [ "$(docker inspect --format '{{.State.Running}}' "$container" 2>/dev/null || true)" != "true" ]; then
    echo "$container is not running. Run: docker logs --tail=100 $container" >&2
    exit 1
  fi
done

for container in fp-migrate fp-seed; do
  if [ "$(docker inspect --format '{{.State.ExitCode}}' "$container" 2>/dev/null || true)" != "0" ]; then
    echo "$container did not finish successfully. Run: docker logs $container" >&2
    exit 1
  fi
done

echo "Reviewer dashboard: http://${PUBLIC_HOST}:3000"
echo "Farmer/field app:   http://${PUBLIC_HOST}:8085"
echo "Reviewer login: reviewer@fasalpramaan.local / Demo@12345"
echo "Farmer login:   farmer@fasalpramaan.local / Demo@12345"
