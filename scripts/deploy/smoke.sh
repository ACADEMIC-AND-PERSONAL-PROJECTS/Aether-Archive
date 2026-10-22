#!/usr/bin/env bash
# Walk a deployed Aether Archive origin the way a reader and the jury will.
#
# Usage:
#   ./scripts/deploy/smoke.sh https://your.domain
#   make deploy-smoke BASE_URL=https://your.domain
#
# It checks the public surface only (HTML, assets, API reads, Grafana health) plus the local
# observability containers when the command runs on the host that runs the stack. The on-call
# responder is a host process, not a container: its absence is a warning with the runbook, never a
# silent pass. Exit code 1 means at least one public check failed.
set -euo pipefail

BASE_URL="${1:-${BASE_URL:-}}"
if [ -z "$BASE_URL" ]; then
  echo "usage: $0 https://your.domain" >&2
  exit 2
fi
BASE_URL="${BASE_URL%/}"

failures=0
warnings=0
pass() { printf 'PASS  %s\n' "$*"; }
fail() { printf 'FAIL  %s\n' "$*"; failures=$((failures + 1)); }
warn() { printf 'WARN  %s\n' "$*"; warnings=$((warnings + 1)); }
skip() { printf 'SKIP  %s\n' "$*"; }

CURL=(curl -fsS --retry 8 --retry-delay 3 --retry-all-errors --max-time 20)
PLAIN=(curl -sS --max-time 20)
# The production origin has a public certificate. A local rehearsal (Caddy's internal CA for
# `localhost`) needs -k; it is opt-in so the production run can never silently accept a bad cert.
if [ "${SMOKE_INSECURE:-0}" = "1" ]; then
  CURL+=(-k)
  PLAIN+=(-k)
fi

echo "smoke: $BASE_URL"

# ── TLS, headers and the SPA shell ───────────────────────────────────────────
headers="$("${CURL[@]}" -D - -o /dev/null "$BASE_URL/" 2>/dev/null || true)"
if grep -qi '^strict-transport-security:.*max-age=' <<<"$headers"; then
  pass "tls: Strict-Transport-Security present"
else
  fail "tls: Strict-Transport-Security missing"
fi
if grep -qi '^content-security-policy:' <<<"$headers"; then
  pass "headers: Content-Security-Policy present"
else
  fail "headers: Content-Security-Policy missing"
fi
if grep -qi '^x-content-type-options: *nosniff' <<<"$headers"; then
  pass "headers: X-Content-Type-Options nosniff"
else
  fail "headers: X-Content-Type-Options missing"
fi

if home="$("${CURL[@]}" "$BASE_URL/")"; then
  if grep -q '<div id="root"></div>' <<<"$home"; then
    pass "home: SPA root"
  else
    fail "home: SPA root missing"
  fi
  if grep -q '<title>Aether Archive</title>' <<<"$home"; then
    pass "home: title"
  else
    fail "home: title missing"
  fi
  asset="$(grep -oE '/assets/[^"[:space:]]+\.js' <<<"$home" | head -n 1)"
  if [ -n "$asset" ] && "${CURL[@]}" -o /dev/null "$BASE_URL$asset"; then
    pass "assets: $asset"
  else
    fail "assets: hashed JavaScript entry missing"
  fi
else
  fail "home: $BASE_URL/ did not answer"
fi

# ── Read-only API ────────────────────────────────────────────────────────────
photo_count=""
if photos="$("${CURL[@]}" "$BASE_URL/api/v1/photos")"; then
  photo_count="$(printf '%s' "$photos" | python3 -c 'import json, sys; data = json.load(sys.stdin); assert isinstance(data, list); print(len(data))' 2>/dev/null || true)"
  if [ -n "$photo_count" ]; then
    pass "api: GET /api/v1/photos → 200, $photo_count photos"
  else
    fail "api: GET /api/v1/photos returned invalid JSON"
  fi
else
  fail "api: GET /api/v1/photos failed"
fi

if dumps="$("${CURL[@]}" "$BASE_URL/api/v1/dumps")"; then
  dump_count="$(printf '%s' "$dumps" | python3 -c 'import json, sys; data = json.load(sys.stdin); assert isinstance(data, list); print(len(data))' 2>/dev/null || true)"
  if [ -n "$dump_count" ]; then
    pass "api: GET /api/v1/dumps → 200, $dump_count dumps"
  else
    fail "api: GET /api/v1/dumps returned invalid JSON"
  fi
else
  fail "api: GET /api/v1/dumps failed"
fi

if [ -n "$photo_count" ] && [ "$photo_count" -gt 0 ]; then
  random_code="$("${PLAIN[@]}" -o /dev/null -w '%{http_code}' "$BASE_URL/api/v1/photos/random" || true)"
  if [ "$random_code" = "200" ]; then
    pass "api: GET /api/v1/photos/random → 200"
  else
    fail "api: GET /api/v1/photos/random → $random_code"
  fi
else
  skip "api: random photo skipped (archive is empty)"
fi

not_found_headers="$("${PLAIN[@]}" -D - -o /dev/null "$BASE_URL/api/v1/nowhere" 2>/dev/null || true)"
not_found_code="$(awk 'NR == 1 { print $2 }' <<<"$not_found_headers")"
if [ "$not_found_code" = "404" ] && grep -qi '^content-type: *application/problem+json' <<<"$not_found_headers"; then
  pass "api: unknown route → 404 application/problem+json"
else
  fail "api: unknown route did not return a problem detail"
fi

# ── Grafana, published read-only under /grafana/ ─────────────────────────────
if grafana="$("${CURL[@]}" "$BASE_URL/grafana/api/health")"; then
  version="$(printf '%s' "$grafana" | python3 -c 'import json, sys; data = json.load(sys.stdin); assert data.get("database") == "ok"; print(data.get("version", ""))' 2>/dev/null || true)"
  if [ -n "$version" ]; then
    pass "grafana: /grafana/api/health → database ok ($version)"
  else
    fail "grafana: health payload is not ok"
  fi
else
  fail "grafana: /grafana/api/health failed"
fi

# ── Local stack (production host only) ───────────────────────────────────────
if command -v docker >/dev/null 2>&1 &&
  docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^aether-archive-'; then
  for service in db api web caddy prometheus grafana alertmanager jaeger loki promtail otel-collector; do
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^aether-archive-${service}-"; then
      pass "container: $service running"
    else
      fail "container: $service not running"
    fi
  done

  if curl -fsS --max-time 5 http://127.0.0.1:9090/-/healthy >/dev/null 2>&1; then
    pass "prometheus: /-/healthy"
  else
    fail "prometheus: local health endpoint unreachable"
  fi
  if curl -fsS --max-time 5 http://127.0.0.1:9093/-/healthy >/dev/null 2>&1; then
    pass "alertmanager: /-/healthy"
  else
    fail "alertmanager: local health endpoint unreachable"
  fi
  if curl -fsS --max-time 5 -o /dev/null http://127.0.0.1:16686/; then
    pass "jaeger: UI reachable"
  else
    fail "jaeger: UI unreachable"
  fi

  if curl -fsS --max-time 5 http://127.0.0.1:9099/healthz >/dev/null 2>&1; then
    pass "on-call: responder healthz"
  else
    warn "on-call: responder not reachable on 127.0.0.1:9099 (enable oncall/aether-oncall.service)"
  fi
else
  skip "local observability: no aether-archive containers on this host"
fi

echo
if [ "$failures" -ne 0 ]; then
  echo "deploy smoke: $failures failed, $warnings warnings"
  exit 1
fi
echo "deploy smoke: all checks passed, $warnings warnings"
