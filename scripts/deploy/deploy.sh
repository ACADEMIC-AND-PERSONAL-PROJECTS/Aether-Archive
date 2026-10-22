#!/usr/bin/env bash
# Deploy one immutable image tag to a prepared VPS (ADR-029).
#
# Usage (on the VPS, from the repository checkout):
#   ./scripts/deploy/deploy.sh sha-<commit> [--skip-seed]
#   ./scripts/deploy/deploy.sh v1.0.0 [--skip-seed]
#
# GitHub Actions calls exactly this script over SSH after publishing the images to GHCR
# (.github/workflows/release.yml). It is also the manual path, so there is no hidden deploy state:
# the history and the current tag live in `state/` (gitignored), the credentials live in `.env`, and
# the Compose files are the ones in the repository.
#
# A failed health check or smoke test restores the previous tag instead of leaving a half-deployed
# archive online. A failed rollback still exits non-zero and the alerting path takes over.
set -euo pipefail

cd "$(dirname "$0")/../.."

TAG="${1:-}"
SKIP_SEED=0
case "${2:-}" in
  "") ;;
  --skip-seed) SKIP_SEED=1 ;;
  *)
    echo "deploy: unknown option '${2}'" >&2
    echo "usage: $0 <sha-<commit>|v<semver>> [--skip-seed]" >&2
    exit 2
    ;;
esac
if [[ ! "$TAG" =~ ^(sha-[0-9a-f]{7,40}|v[0-9]+\.[0-9]+\.[0-9]+([-.][0-9A-Za-z.]+)?)$ ]]; then
  echo "usage: $0 <sha-<commit>|v<semver>> [--skip-seed]" >&2
  exit 2
fi

if [ ! -f .env ]; then
  echo "deploy: .env is missing; copy .env.example and fill the production values" >&2
  exit 1
fi
set -a
# shellcheck disable=SC1091
. ./.env
set +a

: "${DOMAIN:?deploy: DOMAIN must be set in .env}"
if [ -z "${POSTGRES_PASSWORD:-}" ] || [ "${POSTGRES_PASSWORD}" = "change-me-local" ]; then
  echo "deploy: set a real POSTGRES_PASSWORD in .env" >&2
  exit 1
fi
if [ "${GRAFANA_ADMIN_PASSWORD:-}" = "change-me-grafana" ] || [ -z "${GRAFANA_ADMIN_PASSWORD:-}" ]; then
  echo "deploy: set a real GRAFANA_ADMIN_PASSWORD in .env" >&2
  exit 1
fi
if [ "${ONCALL_WEBHOOK_TOKEN:-}" = "change-me-oncall-token" ] || [ -z "${ONCALL_WEBHOOK_TOKEN:-}" ]; then
  echo "deploy: set a real ONCALL_WEBHOOK_TOKEN in .env (openssl rand -hex 24)" >&2
  exit 1
fi

REGISTRY="${REGISTRY:-ghcr.io}"
IMAGE_OWNER="${IMAGE_OWNER:-academic-and-personal-projects}"
API_IMAGE="${REGISTRY}/${IMAGE_OWNER}/aether-archive-api:${TAG}"
WEB_IMAGE="${REGISTRY}/${IMAGE_OWNER}/aether-archive-web:${TAG}"
export AETHER_API_IMAGE="$API_IMAGE"
export AETHER_WEB_IMAGE="$WEB_IMAGE"

BASE_URL="https://${DOMAIN}"
COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.observability.yml -f docker-compose.prod.yml)
STATE_DIR="state"
mkdir -p "$STATE_DIR"

# Serialise deploys. The release workflow already has a concurrency group; this also protects manual
# runs. /tmp is writable by the deploy user and cleared on reboot.
exec 9>/tmp/aether-deploy.lock
if ! flock -n 9; then
  echo "deploy: another deployment is already running" >&2
  exit 1
fi

current_tag="$(cat "$STATE_DIR/current-image" 2>/dev/null || true)"
current_api_image="$(cat "$STATE_DIR/last-good-image" 2>/dev/null || true)"
if [ -n "$current_tag" ] && [ -z "$current_api_image" ]; then
  current_api_image="${REGISTRY}/${IMAGE_OWNER}/aether-archive-api:${current_tag}"
fi
current_web_image=""
if [ -n "$current_tag" ]; then
  current_web_image="${REGISTRY}/${IMAGE_OWNER}/aether-archive-web:${current_tag}"
fi

record() {
  local status="$1"
  printf '%s\t%s\t%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$status" "$TAG" \
    >>"$STATE_DIR/history.tsv"
}

restore_previous() {
  if [ -z "$current_tag" ]; then
    echo "deploy: no previous deployment to restore" >&2
    return 1
  fi
  echo "deploy: restoring $current_tag"
  AETHER_API_IMAGE="$current_api_image" AETHER_WEB_IMAGE="$current_web_image" \
    "${COMPOSE[@]}" up -d --no-deps --wait --wait-timeout 240 api web
  ./scripts/deploy/smoke.sh "$BASE_URL"
}

echo "deploy: tag=$TAG api=$API_IMAGE"
echo "deploy: url=$BASE_URL"

# 1. The token is a mounted file for Alertmanager; regenerate it before the stack starts.
./scripts/dev/oncall-token.sh

# 2. Database and media before the new API can run a migration.
if "${COMPOSE[@]}" ps -q db 2>/dev/null | grep -q .; then
  ./scripts/deploy/backup.sh
else
  echo "deploy: first deployment (no database yet), skipping the backup"
fi

# 3. Pull and start. --wait makes Compose the first health gate; the smoke test is the second.
if ! "${COMPOSE[@]}" pull api web; then
  echo "deploy: could not pull $TAG from $REGISTRY." >&2
  echo "deploy: make the GHCR packages public, or run 'docker login $REGISTRY' on the VPS." >&2
  record failed
  exit 1
fi

if ! "${COMPOSE[@]}" up -d --wait --wait-timeout 240; then
  echo "deploy: the stack did not become healthy" >&2
  restore_previous || true
  record failed
  exit 1
fi

if ! ./scripts/deploy/smoke.sh "$BASE_URL"; then
  echo "deploy: smoke test failed on $BASE_URL" >&2
  restore_previous || true
  record failed
  exit 1
fi

# 4. Seed the public demo exactly once. A redeploy with data never touches it.
if [ "$SKIP_SEED" -eq 0 ]; then
  if ! photo_count="$(curl -fsS --retry 5 --retry-delay 3 --retry-all-errors --max-time 20 \
      "$BASE_URL/api/v1/photos" |
      python3 -c 'import json, sys; data = json.load(sys.stdin); assert isinstance(data, list); print(len(data))')"; then
    echo "deploy: could not read /api/v1/photos before seeding" >&2
    restore_previous || true
    record failed
    exit 1
  fi
  if [ "$photo_count" -eq 0 ]; then
    echo "deploy: seeding the public demo (36 photos, 3 dumps)"
    if ! make demo BASE_URL="$BASE_URL"; then
      echo "deploy: demo seeding failed" >&2
      restore_previous || true
      record failed
      exit 1
    fi
  else
    echo "deploy: archive already has $photo_count photos; not reseeding"
  fi
fi

if ! ./scripts/deploy/smoke.sh "$BASE_URL"; then
  echo "deploy: final smoke test failed on $BASE_URL" >&2
  restore_previous || true
  record failed
  exit 1
fi

# 5. Record what is live: the tag for the next deploy, the full API reference for the on-call
# responder's rollback path, and the append-only history for scripts/deploy/rollback.sh.
printf '%s\n' "$TAG" >"$STATE_DIR/current-image"
printf '%s\n' "$API_IMAGE" >"$STATE_DIR/last-good-image"
record success
echo "deploy: $TAG is live at $BASE_URL"
echo "deploy: rollback with ./scripts/deploy/rollback.sh"
