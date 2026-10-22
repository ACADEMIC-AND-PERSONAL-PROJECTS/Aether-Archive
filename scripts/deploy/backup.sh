#!/usr/bin/env bash
# Back up the two things a redeploy cannot recreate: PostgreSQL and the media volume.
#
# Usage: ./scripts/deploy/backup.sh
#
# Files land in `backups/` (gitignored) as `db-<utc>.sql.gz` and `media-<utc>.tar.gz`; anything older
# than RETENTION_DAYS (7 by default) is deleted. The deploy script calls this before replacing the
# API image, so a migration that goes wrong has a same-minute dump. Restore steps are in
# docs/engineering/DEPLOYMENT.md.
set -euo pipefail

cd "$(dirname "$0")/../.."

if [ ! -f .env ]; then
  echo "backup: .env is missing" >&2
  exit 1
fi
set -a
# shellcheck disable=SC1091
. ./.env
set +a

BACKUP_DIR="${BACKUP_DIR:-backups}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
mkdir -p "$BACKUP_DIR"
BACKUP_ABS="$(cd "$BACKUP_DIR" && pwd)"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"

# The database and media services do not depend on the production overlay, so the backup also works
# on a local stack. It only needs the base file to address the `db` container.
COMPOSE=(docker compose -f docker-compose.yml)

if "${COMPOSE[@]}" ps -q db 2>/dev/null | grep -q .; then
  "${COMPOSE[@]}" exec -T -e PGPASSWORD="${POSTGRES_PASSWORD:-change-me-local}" db \
    pg_dump -h 127.0.0.1 -U "${POSTGRES_USER:-aether}" -d "${POSTGRES_DB:-aether}" |
    gzip >"$BACKUP_DIR/db-$stamp.sql.gz"
  echo "backup: db-$stamp.sql.gz"
else
  echo "backup: database container is not running; skipped the dump" >&2
fi

if docker volume inspect aether_stack_media >/dev/null 2>&1; then
  docker run --rm \
    -v aether_stack_media:/media:ro \
    -v "${BACKUP_ABS}:/backup" \
    alpine:3.21 tar czf "/backup/media-$stamp.tar.gz" -C /media .
  echo "backup: media-$stamp.tar.gz"
else
  echo "backup: media volume not found; skipped the archive tarball" >&2
fi

find "$BACKUP_DIR" -type f -mtime "+${RETENTION_DAYS}" -delete
echo "backup: retention ${RETENTION_DAYS}d in $BACKUP_ABS"
