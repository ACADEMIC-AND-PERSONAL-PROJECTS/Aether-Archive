#!/usr/bin/env bash
# End-to-end incident drill for the observability and on-call criteria.
#
#   1. start the host-side responder if it is not already running;
#   2. start a publish load in the background;
#   3. stop PostgreSQL, which makes the publish journey return 500;
#   4. wait for Alertmanager to fire AetherPublish5xxRate;
#   5. wait for the responder to restart the database and for the alert to resolve;
#   6. print the incident record.
#
# It deliberately uses the real stack: no synthetic alert is posted to the responder. The evidence is
# the Prometheus alert state, the Alertmanager notification and oncall/incidents/<id>.json.
set -euo pipefail

cd "$(dirname "$0")/../.."

COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.observability.yml)
BASE_URL="${BASE_URL:-http://localhost:3000}"
DURATION="${DURATION:-420}"
INTERVAL="${INTERVAL:-5}"
RESPONDER_LOG="${RESPONDER_LOG:-/tmp/opencode/oncall.log}"
LOAD_LOG="${LOAD_LOG:-/tmp/opencode/publish-load.log}"
STARTED_RESPONDER=0

cleanup() {
  if [ -n "${LOAD_PID:-}" ] && kill -0 "$LOAD_PID" 2>/dev/null; then
    kill "$LOAD_PID" 2>/dev/null || true
    wait "$LOAD_PID" 2>/dev/null || true
  fi
  if [ "$STARTED_RESPONDER" -eq 1 ] && [ -n "${RESPONDER_PID:-}" ]; then
    echo "responder left running as pid $RESPONDER_PID (log: $RESPONDER_LOG)"
  fi
}
trap cleanup EXIT

curl -fsS "$BASE_URL/api/v1/photos" >/dev/null || {
  echo "the app is not reachable at $BASE_URL; run 'make observe-up' first" >&2
  exit 1
}

if ! curl -fsS http://127.0.0.1:9099/healthz >/dev/null 2>&1; then
  echo "starting the on-call responder (log: $RESPONDER_LOG)"
  nohup ./oncall/run.sh >"$RESPONDER_LOG" 2>&1 &
  RESPONDER_PID=$!
  STARTED_RESPONDER=1
  for _ in $(seq 1 20); do
    if curl -fsS http://127.0.0.1:9099/healthz >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
fi
curl -fsS http://127.0.0.1:9099/healthz >/dev/null || {
  echo "the on-call responder did not start; see $RESPONDER_LOG" >&2
  exit 1
}

mkdir -p oncall/incidents
BEFORE="$(ls oncall/incidents/*.json 2>/dev/null || true)"

echo "starting publish load (log: $LOAD_LOG)"
DURATION="$DURATION" INTERVAL="$INTERVAL" LOG="$LOAD_LOG" ./scripts/demo/publish-load.sh >/dev/null 2>&1 &
LOAD_PID=$!

sleep 5
echo "stopping PostgreSQL; the publish journey should start returning 500"
"${COMPOSE[@]}" stop db >/dev/null
STARTED_AT="$(date -Is)"

incident_file=""
for _ in $(seq 1 100); do
  for candidate in oncall/incidents/*.json; do
    [ -e "$candidate" ] || continue
    case "$BEFORE" in
      *"$candidate"*) continue ;;
    esac
    if python3 - "$candidate" <<'PY'
import json
import sys

data = json.load(open(sys.argv[1]))
if data.get("status") in {"remediated", "resolved"}:
    raise SystemExit(0)
raise SystemExit(1)
PY
    then
      incident_file="$candidate"
      break 2
    fi
  done
  sleep 5
done

if [ -z "$incident_file" ]; then
  echo "no remediated incident appeared within the drill budget" >&2
  echo "alert state:" >&2
  curl -sS http://127.0.0.1:9090/api/v1/alerts >&2 || true
  exit 1
fi

echo "incident recorded: $incident_file"
echo "waiting for the alert to resolve so the record is closed..."
for _ in $(seq 1 100); do
  if python3 - "$incident_file" <<'PY'
import json
import sys

data = json.load(open(sys.argv[1]))
raise SystemExit(0 if data.get("resolvedAt") else 1)
PY
  then
    break
  fi
  sleep 5
done

echo
echo "drill started at: $STARTED_AT"
echo "incident: $incident_file"
python3 - "$incident_file" <<'PY'
import json
import sys

data = json.load(open(sys.argv[1]))
print(f"  status:   {data.get('status')}")
print(f"  alert:    {data.get('alert', {}).get('name')}")
print(f"  action:   {data.get('action', {}).get('kind')}")
print(f"  resolved: {data.get('resolvedAt')}")
print(f"  history:  {[h.get('event') for h in data.get('history', [])]}")
PY
echo
echo "alert state now:"
curl -sS http://127.0.0.1:9090/api/v1/alerts | python3 -c 'import json,sys; d=json.load(sys.stdin); print(json.dumps(d.get("data",{}).get("alerts",[]), indent=2))' || true
