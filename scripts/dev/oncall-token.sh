#!/usr/bin/env bash
# Materialise the Alertmanager webhook token from .env into a root-only file.
#
# Alertmanager 0.28 does not expand environment variables in its configuration; mounting a file is
# both simpler and safer than embedding the token in a YAML file. The responder reads the same value
# from .env, so the two sides always agree.
set -euo pipefail

cd "$(dirname "$0")/../.."

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

: "${ONCALL_WEBHOOK_TOKEN:?ONCALL_WEBHOOK_TOKEN must be set in .env}"

umask 022
printf '%s\n' "$ONCALL_WEBHOOK_TOKEN" > oncall/webhook-token
chmod 644 oncall/webhook-token
echo "wrote oncall/webhook-token (mode 644)"
