#!/usr/bin/env bash
# Publish six photos every few seconds, for as long as a drill needs.
#
# The ids are fetched once and reused. If the database is healthy a reused dump (or its photos)
# returns 409, which is a client error and does not pollute the alert. If the database is stopped the
# same request returns 500 before validation, which is exactly the signal the publish alert watches.
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
DURATION="${DURATION:-420}"
INTERVAL="${INTERVAL:-5}"
LOG="${LOG:-/tmp/opencode/publish-load.log}"

mkdir -p "$(dirname "$LOG")"

mapfile -t photo_ids < <(
  curl -fsS "$BASE_URL/api/v1/photos" |
    python3 -c 'import json, sys; print("\n".join(p["id"] for p in json.load(sys.stdin)[:6]))'
)
if [ "${#photo_ids[@]}" -ne 6 ]; then
  echo "need six photos; seed the stack with 'make demo' first" >&2
  exit 1
fi

body="$(
  python3 -c 'import json, sys; print(json.dumps({"title": "Incident drill", "backgroundColor": "#7d8a7a", "photoIds": sys.argv[1:]}))' \
    "${photo_ids[@]}"
)"

echo "publish load: $BASE_URL, every ${INTERVAL}s for ${DURATION}s, log=$LOG" | tee -a "$LOG"
end=$((SECONDS + DURATION))
while [ "$SECONDS" -lt "$end" ]; do
  status="$(
    curl -sS -o /tmp/opencode/publish-load-body.json -w '%{http_code}' \
      -X POST "$BASE_URL/api/v1/dumps" \
      -H 'Content-Type: application/json' \
      -d "$body" || true
  )"
  printf '%s publish status=%s\n' "$(date -Is)" "$status" | tee -a "$LOG"
  sleep "$INTERVAL"
done
