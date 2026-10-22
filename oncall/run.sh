#!/usr/bin/env bash
# Start the host-side on-call responder.
#
# It needs:
#   - ONCALL_WEBHOOK_TOKEN in .env (shared with Alertmanager through oncall/webhook-token)
#   - access to the Docker CLI as the user running compose
#
# The compose arguments default to the local stack with observability. On the VPS, systemd sets
# AETHER_COMPOSE_ARGS to include the production overlay as well; see oncall/aether-oncall.service.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

: "${ONCALL_WEBHOOK_TOKEN:?ONCALL_WEBHOOK_TOKEN must be set in .env}"

if [ -z "${AETHER_COMPOSE_ARGS:-}" ]; then
  AETHER_COMPOSE_ARGS="-f docker-compose.yml -f docker-compose.override.yml -f docker-compose.observability.yml"
fi
export AETHER_COMPOSE_ARGS

umask 022
printf '%s\n' "$ONCALL_WEBHOOK_TOKEN" > oncall/webhook-token
chmod 644 oncall/webhook-token

exec python3 oncall/responder.py
