#!/usr/bin/env bash
# Restore a plain-SQL PostgreSQL dump into the running database, replacing its contents.
#
# Usage (on the deployment host, from the repository checkout):
#   ./scripts/deploy/restore.sh backups/db-20261022T120000Z.sql.gz --yes
#
# A plain `pg_dump | psql` on top of the live schema fails on the first existing table. This script
# stops the API, drops and recreates the public schema, restores with ON_ERROR_STOP, then starts the
# API again and waits for its healthcheck. It is destructive and requires --yes.
set -euo pipefail

cd "$(dirname "$0")/../.."

DUMP="${1:-}"
CONFIRM="${2:-}"
if [ -z "$DUMP" ] || [ ! -f "$DUMP" ]; then
  echo "usage: $0 <backups/db-*.sql.gz> --yes" >&2
  exit 2
fi
if [ "$CONFIRM" != "--yes" ]; then
  echo "restore: this replaces the live database; re-run with --yes" >&2
  exit 2
fi
if [ ! -f .env ]; then
  echo "restore: .env is missing" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
. ./.env
set +a

: "${POSTGRES_PASSWORD:?restore: POSTGRES_PASSWORD must be set}"
COMPOSE=(docker compose -f docker-compose.yml)
if ! "${COMPOSE[@]}" ps -q db 2>/dev/null | grep -q .; then
  echo "restore: database container is not running" >&2
  exit 1
fi

restore_api() {
  if [ -n "${api_id:-}" ]; then
    "${COMPOSE[@]}" start api >/dev/null 2>&1 || true
  fi
}
trap restore_api EXIT

echo "restore: stopping the API to block writes"
api_id="$("${COMPOSE[@]}" ps -q api 2>/dev/null || true)"
"${COMPOSE[@]}" stop api >/dev/null 2>&1 || true

echo "restore: dropping and recreating the public schema"
"${COMPOSE[@]}" exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" db \
  psql -h 127.0.0.1 -U "${POSTGRES_USER:-aether}" -d "${POSTGRES_DB:-aether}" \
  -v ON_ERROR_STOP=1 -c 'DROP SCHEMA public CASCADE' -c 'CREATE SCHEMA public'

echo "restore: applying $DUMP"
gzip -dc "$DUMP" | "${COMPOSE[@]}" exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" db \
  psql -h 127.0.0.1 -U "${POSTGRES_USER:-aether}" -d "${POSTGRES_DB:-aether}" \
  -v ON_ERROR_STOP=1 --quiet

if [ -n "$api_id" ]; then
  "${COMPOSE[@]}" start api >/dev/null
  echo "restore: waiting for the API healthcheck"
  for _ in $(seq 1 90); do
    status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$api_id" 2>/dev/null || true)"
    if [ "$status" = "healthy" ]; then
      trap - EXIT
      echo "restore: API healthy"
      exit 0
    fi
    sleep 2
  done
  echo "restore: API did not become healthy" >&2
  exit 1
fi

trap - EXIT
echo "restore: database restored (API was not running)"
