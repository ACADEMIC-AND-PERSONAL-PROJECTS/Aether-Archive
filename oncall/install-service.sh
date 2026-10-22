#!/usr/bin/env bash
# Install the host-side on-call responder as a systemd service.
#
# Usage (on the deployment host, from the repository checkout):
#   sudo ./oncall/install-service.sh <deploy-user>
#
# The unit template uses `User=deploy` and `/opt/aether` as documentation defaults; this installer
# substitutes the real deploy user and the checkout path, then allows Docker's private ranges to
# reach port 9099. The responder itself binds loopback plus the Docker bridge gateway, never 0.0.0.0.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "run as root: sudo $0 <deploy-user>" >&2
  exit 1
fi

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY_USER="${1:-${SUDO_USER:-}}"
if [ -z "$DEPLOY_USER" ] || [ "$DEPLOY_USER" = "root" ]; then
  echo "usage: sudo $0 <deploy-user>   (the user that owns ${REPO_DIR} and runs Docker)" >&2
  exit 2
fi
if ! id -u "$DEPLOY_USER" >/dev/null 2>&1; then
  echo "install-oncall: user '$DEPLOY_USER' does not exist" >&2
  exit 2
fi
if ! id -nG "$DEPLOY_USER" | tr ' ' '\n' | grep -qx docker; then
  echo "install-oncall: warning: '$DEPLOY_USER' is not in the docker group" >&2
fi

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
sed -e "s|/opt/aether|${REPO_DIR}|g" -e "s|^User=.*|User=${DEPLOY_USER}|" \
  oncall/aether-oncall.service >"$tmp"
install -m 0644 "$tmp" /etc/systemd/system/aether-oncall.service

# Alertmanager connects from a Docker bridge to the host gateway. Limit the rule to Docker's
# private ranges; 9099 is never published by Compose or Caddy.
if command -v iptables >/dev/null 2>&1; then
  if ! iptables -C INPUT -s 172.16.0.0/12 -p tcp --dport 9099 -j ACCEPT 2>/dev/null; then
    iptables -I INPUT -s 172.16.0.0/12 -p tcp --dport 9099 -j ACCEPT
  fi
  if command -v netfilter-persistent >/dev/null 2>&1; then
    netfilter-persistent save >/dev/null
  fi
fi

systemctl daemon-reload
systemctl enable --now aether-oncall.service
systemctl --no-pager --lines=0 status aether-oncall.service || true
