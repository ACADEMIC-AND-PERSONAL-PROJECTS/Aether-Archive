#!/usr/bin/env bash
#
# Walk every Aether Archive endpoint of a running local backend (E1-S10): the reads, the
# refusals, and a full write round-trip — six uploads, a dump of them, the read-back and the
# stored image's bytes compared with the file that was sent. Every check asserts the status
# and, on refusals, the machine-readable `code` and the `application/problem+json` media
# type; any failed check exits non-zero.
#
#   AETHER_DATA_DIR=/tmp/aether-dev scripts/dev/smoke.sh
#
# Covers every endpoint the API has, success and failure:
#
#   GET  /api/v1/photos        200, on an empty archive as well as a seeded one
#   GET  /api/v1/photos/random 200 when the feed holds a photo, `404 empty-archive` when not
#   POST /api/v1/photos        201 for six samples cycling the four categories — and nine
#                              upload refusals: no file part; a missing, invalid or file-part
#                              category; text bytes (declared text/plain and declared
#                              image/png); an empty file; a declared type contradicting the
#                              bytes; a JSON content type
#   POST /api/v1/dumps         201 for the six uploads, its photos echoing the requested
#                              order — and the five refusals: malformed JSON, a colour that is
#                              not #RRGGBB, five ids, a repeated id, ids that do not exist
#   GET  /api/v1/dumps         200, listing the dump just published
#   GET  /images/<file>        200 image/png byte-identical to the upload; 404 for a ghost
#   (refusals)                 unknown path → 404 not-found; DELETE on a photo collection →
#                              405 method-not-allowed with Allow naming GET and POST
#
# The write path is deliberate: a smoke script that never posts cannot prove the uploads
# work. Six photos and a dump are added per run (all refused calls change nothing).
#
# Like `seed.sh`, the effective data directory is `${AETHER_DATA_DIR:-$HOME/AetherArchive_Data}`
# — the backend's own semantics — and the real archive is refused unless `--force` is passed.
# Requires `curl` and `python3` (standard library only).

set -euo pipefail

usage() {
  cat <<'EOF'
usage: smoke.sh [--base-url URL] [--force]

  --base-url URL   where the backend listens (default http://localhost:8080)
  --force          run even when the effective data directory is the real archive
EOF
}

BASE_URL="${AETHER_BASE_URL:-http://localhost:8080}"
FORCE=0

while [ $# -gt 0 ]; do
  case "$1" in
    --base-url) BASE_URL="${2:?smoke.sh: --base-url needs a value}"; shift 2 ;;
    --force)    FORCE=1; shift ;;
    --help|-h)  usage; exit 0 ;;
    *) echo "smoke.sh: unknown option '$1'" >&2; usage >&2; exit 64 ;;
  esac
done
BASE_URL="${BASE_URL%/}"

DATA_DIR="${AETHER_DATA_DIR:-$HOME/AetherArchive_Data}"
REAL_DIR="${HOME%/}/AetherArchive_Data"
# Canonicalise both sides before comparing: a doubled or trailing slash, `/.`, `..` or a
# symlink must not spell the real archive in a way this guard fails to recognise.
DATA_DIR="$(python3 -c 'import os, sys; print(os.path.realpath(sys.argv[1]))' "$DATA_DIR")"
REAL_DIR="$(python3 -c 'import os, sys; print(os.path.realpath(sys.argv[1]))' "$REAL_DIR")"
if [ "$DATA_DIR" = "$REAL_DIR" ] && [ "$FORCE" -ne 1 ]; then
  cat >&2 <<EOF
smoke.sh: refusing to run against the real data directory ($DATA_DIR) — this run uploads.
  Start the backend with AETHER_DATA_DIR pointing at a scratch directory, export the
  same value here, or pass --force to seed the real archive deliberately.
EOF
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PHOTOS_URL="$BASE_URL/api/v1/photos"
RANDOM_URL="$BASE_URL/api/v1/photos/random"
DUMPS_URL="$BASE_URL/api/v1/dumps"
IMAGES_URL="$BASE_URL/images"

echo "Smoke-checking $BASE_URL — every endpoint, success and refusal paths."
if [ "$FORCE" -eq 1 ]; then
  echo "  effective data directory: $DATA_DIR  [--force: the real-directory guard is off]"
else
  echo "  effective data directory: $DATA_DIR"
fi

if ! status="$(curl -sS -o /dev/null -w '%{http_code}' "$PHOTOS_URL")"; then
  echo "smoke.sh: the backend is not reachable at $PHOTOS_URL — start it first (see backend/README.md)." >&2
  exit 1
fi
if [ "$status" != "200" ]; then
  echo "smoke.sh: GET $PHOTOS_URL answered $status; is this really the Aether Archive API?" >&2
  exit 1
fi

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

CHECKS=0
FAILURES=0

pass() {
  CHECKS=$((CHECKS + 1))
  printf '  PASS  %s\n' "$1"
}

fail() {
  CHECKS=$((CHECKS + 1))
  FAILURES=$((FAILURES + 1))
  printf '  FAIL  %s — %s\n' "$1" "$2"
  if [ -s "$WORKDIR/response.json" ]; then
    head -c 240 "$WORKDIR/response.json" | sed 's/^/        /'
    echo
  fi
}

# request <curl args…> — the body lands in response.json, the status in $STATUS, the headers
# in headers.txt; a transport failure aborts (the run is meaningless from there on).
request() {
  if ! STATUS="$(curl -sS -D "$WORKDIR/headers.txt" -o "$WORKDIR/response.json" \
      -w '%{http_code}' "$@")"; then
    echo "smoke.sh: the backend became unreachable mid-run — is it still running?" >&2
    exit 1
  fi
}

# problem_code — the `code` property of the last response ("" when there is none).
problem_code() {
  python3 -c 'import json,sys
try:
    body = json.load(open(sys.argv[1]))
except Exception:
    print("")
else:
    print(body.get("code", "") if isinstance(body, dict) else "")' "$WORKDIR/response.json" \
    2>/dev/null || true
}

# check <label> <expected status> <expected code|-> <curl args…>
# Status, `code`, and the media type the contract names: application/json on success,
# application/problem+json on refusals.
check() {
  local label="$1" expected_status="$2" expected_code="$3" expected_type
  shift 3
  request "$@"
  local code
  code="$(problem_code)"
  case "$expected_status" in
    2*) expected_type="application/json" ;;
    *)  expected_type="application/problem+json" ;;
  esac
  CHECKS=$((CHECKS + 1))
  if [ "$STATUS" = "$expected_status" ] \
      && { [ "$expected_code" = "-" ] || [ "$code" = "$expected_code" ]; } \
      && grep -qi "^content-type: $expected_type" "$WORKDIR/headers.txt"; then
    printf '  PASS  %s → %s%s\n' "$label" "$STATUS" "${code:+ ($code)}"
  else
    FAILURES=$((FAILURES + 1))
    printf '  FAIL  %s — expected %s%s, got %s%s\n' \
      "$label" "$expected_status" "${expected_code:+ ($expected_code)}" "$STATUS" "${code:+ ($code)}"
    if [ -s "$WORKDIR/response.json" ]; then
      head -c 240 "$WORKDIR/response.json" | sed 's/^/        /'
      echo
    fi
  fi
}

python3 "$SCRIPT_DIR/sample-photos.py" --count 6 --out "$WORKDIR" > "$WORKDIR/manifest.json"
python3 -c 'import json,sys; [print(entry["path"]) for entry in json.load(open(sys.argv[1]))]' \
  "$WORKDIR/manifest.json" > "$WORKDIR/paths.txt"
aura="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))[0]["hex"])' "$WORKDIR/manifest.json")"
printf 'not an image\n' > "$WORKDIR/notes.txt"
: > "$WORKDIR/empty.png"

echo
echo "Reads:"
if ! status="$(curl -sS -o "$WORKDIR/feed.json" -w '%{http_code}' "$PHOTOS_URL")"; then
  echo "smoke.sh: the backend became unreachable mid-run — is it still running?" >&2
  exit 1
fi
if [ "$status" = "200" ]; then
  photo_count="$(python3 -c 'import json,sys; print(len(json.load(open(sys.argv[1]))))' "$WORKDIR/feed.json")"
  pass "GET /api/v1/photos → 200 ($photo_count photos in the feed)"
else
  photo_count=0
  fail "GET /api/v1/photos" "expected 200, got $status"
fi

if [ "$photo_count" -eq 0 ]; then
  check "GET /api/v1/photos/random (empty archive)" 404 empty-archive "$RANDOM_URL"
else
  check "GET /api/v1/photos/random (feed holds $photo_count)" 200 - "$RANDOM_URL"
fi
check "GET /api/v1/dumps" 200 - "$DUMPS_URL"

echo
echo "Refusals (no state changes):"
check "POST /api/v1/photos without a file part" 400 missing-request-part \
  -F "category=pics" "$PHOTOS_URL"

request -F "file=@$WORKDIR/sample-01.png;type=image/png" "$PHOTOS_URL"
if [ "$STATUS" = "400" ] && python3 -c 'import json,sys
body = json.load(open(sys.argv[1]))
ok = body.get("code") == "validation-failure" and any(e.get("field") == "category" for e in body.get("errors", []))
sys.exit(0 if ok else 1)' "$WORKDIR/response.json"; then
  pass "POST /api/v1/photos without a category → 400 validation-failure, errors name 'category'"
else
  fail "POST /api/v1/photos without a category" "expected 400 validation-failure naming category, got $STATUS"
fi

check "POST /api/v1/photos, category not one of the four" 400 validation-failure \
  -F "file=@$WORKDIR/sample-01.png;type=image/png" -F "category=nope" "$PHOTOS_URL"
check "POST /api/v1/photos, text bytes declared text/plain" 415 unsupported-image-type \
  -F "file=@$WORKDIR/notes.txt;type=text/plain" -F "category=pics" "$PHOTOS_URL"
check "POST /api/v1/photos, text bytes declared image/png" 415 unsupported-image-type \
  -F "file=@$WORKDIR/notes.txt;type=image/png" -F "category=pics" "$PHOTOS_URL"

request -F "file=@$WORKDIR/sample-01.png;type=image/jpeg" -F "category=pics" "$PHOTOS_URL"
if [ "$STATUS" = "415" ] && python3 -c 'import json,sys
body = json.load(open(sys.argv[1]))
ok = body.get("code") == "unsupported-image-type" and "image/jpeg" in body.get("detail", "")
sys.exit(0 if ok else 1)' "$WORKDIR/response.json"; then
  pass "POST /api/v1/photos, PNG bytes declared image/jpeg → 415 unsupported-image-type (names image/jpeg)"
else
  fail "POST /api/v1/photos, PNG bytes declared image/jpeg" "expected 415 unsupported-image-type naming image/jpeg, got $STATUS"
fi

check "POST /api/v1/photos, empty file declared image/png" 415 unsupported-image-type \
  -F "file=@$WORKDIR/empty.png;type=image/png" -F "category=pics" "$PHOTOS_URL"
check "POST /api/v1/photos, category sent as a file part" 400 invalid-parameter \
  -F "file=@$WORKDIR/sample-01.png;type=image/png" -F "category=@$WORKDIR/notes.txt" "$PHOTOS_URL"
check "POST /api/v1/photos with a JSON content type" 415 unsupported-media-type \
  -H 'Content-Type: application/json' --data '{}' "$PHOTOS_URL"

cat > "$WORKDIR/dump-bad-color.json" <<'JSON'
{"title": "smoke", "backgroundColor": "gold", "photoIds": ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002", "00000000-0000-4000-8000-000000000003", "00000000-0000-4000-8000-000000000004", "00000000-0000-4000-8000-000000000005", "00000000-0000-4000-8000-000000000006"]}
JSON
cat > "$WORKDIR/dump-five-ids.json" <<'JSON'
{"backgroundColor": "#3a3a44", "photoIds": ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002", "00000000-0000-4000-8000-000000000003", "00000000-0000-4000-8000-000000000004", "00000000-0000-4000-8000-000000000005"]}
JSON
cat > "$WORKDIR/dump-duplicate-ids.json" <<'JSON'
{"backgroundColor": "#3a3a44", "photoIds": ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000003", "00000000-0000-4000-8000-000000000004", "00000000-0000-4000-8000-000000000005", "00000000-0000-4000-8000-000000000006"]}
JSON
cat > "$WORKDIR/dump-unknown-ids.json" <<'JSON'
{"backgroundColor": "#3a3a44", "photoIds": ["10000000-0000-4000-8000-000000000001", "10000000-0000-4000-8000-000000000002", "10000000-0000-4000-8000-000000000003", "10000000-0000-4000-8000-000000000004", "10000000-0000-4000-8000-000000000005", "10000000-0000-4000-8000-000000000006"]}
JSON

check "POST /api/v1/dumps, malformed JSON" 400 malformed-request \
  -H 'Content-Type: application/json' --data 'not json' "$DUMPS_URL"
check "POST /api/v1/dumps, colour not #RRGGBB" 400 validation-failure \
  -H 'Content-Type: application/json' --data @"$WORKDIR/dump-bad-color.json" "$DUMPS_URL"
check "POST /api/v1/dumps, five ids" 400 validation-failure \
  -H 'Content-Type: application/json' --data @"$WORKDIR/dump-five-ids.json" "$DUMPS_URL"
check "POST /api/v1/dumps, the same id twice" 400 validation-failure \
  -H 'Content-Type: application/json' --data @"$WORKDIR/dump-duplicate-ids.json" "$DUMPS_URL"

request -H 'Content-Type: application/json' --data @"$WORKDIR/dump-unknown-ids.json" "$DUMPS_URL"
if [ "$STATUS" = "400" ] && python3 -c 'import json,sys
body = json.load(open(sys.argv[1]))
ok = body.get("code") == "validation-failure" and any(str(e.get("field", "")).startswith("photoIds") for e in body.get("errors", []))
sys.exit(0 if ok else 1)' "$WORKDIR/response.json"; then
  pass "POST /api/v1/dumps, six unknown ids → 400 validation-failure, errors name 'photoIds'"
else
  fail "POST /api/v1/dumps, six unknown ids" "expected 400 validation-failure naming photoIds, got $STATUS"
fi

check "GET /api/v1/nowhere" 404 not-found "$BASE_URL/api/v1/nowhere"

request -X DELETE "$PHOTOS_URL"
if [ "$STATUS" = "405" ] && [ "$(problem_code)" = "method-not-allowed" ] \
    && grep -qi '^allow: .*GET' "$WORKDIR/headers.txt" \
    && grep -qi '^allow: .*POST' "$WORKDIR/headers.txt"; then
  pass "DELETE /api/v1/photos → 405 method-not-allowed (Allow names GET and POST)"
else
  fail "DELETE /api/v1/photos" "expected 405 method-not-allowed with Allow naming GET and POST, got $STATUS"
fi

if ! status="$(curl -sS -D "$WORKDIR/headers.txt" -o "$WORKDIR/response.json" -w '%{http_code}' "$IMAGES_URL/ghost.png")"; then
  echo "smoke.sh: the backend became unreachable mid-run — is it still running?" >&2
  exit 1
fi
if [ "$status" = "404" ] && [ "$(problem_code)" = "not-found" ] \
    && grep -qi '^x-content-type-options: nosniff' "$WORKDIR/headers.txt"; then
  pass "GET /images/ghost.png → 404 not-found, the refusal carries nosniff"
else
  fail "GET /images/ghost.png" "expected 404 not-found with nosniff, got $status"
fi

echo
echo "Write path:"
write_failures_before=$FAILURES
index=0
: > "$WORKDIR/ids.txt"
categories=(pics anime dump uncategorized)
while IFS= read -r path; do
  category="${categories[$((index % ${#categories[@]}))]}"
  request -F "file=@$path;type=image/png" -F "category=$category" "$PHOTOS_URL"
  if [ "$STATUS" = "201" ] && python3 -c 'import json,sys
photo = json.load(open(sys.argv[1]))
ok = isinstance(photo.get("id"), str) and photo.get("url", "").startswith("/images/") and photo.get("category") and photo.get("uploadedAt")
sys.exit(0 if ok else 1)' "$WORKDIR/response.json"; then
    cp "$WORKDIR/response.json" "$WORKDIR/upload-$index.json"
    python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["id"])' "$WORKDIR/response.json" \
      >> "$WORKDIR/ids.txt"
    pass "POST /api/v1/photos ($category, sample-$((index + 1))) → 201 with the four Photo fields"
  else
    fail "POST /api/v1/photos ($category, sample-$((index + 1)))" \
      "expected 201 with the four Photo fields, got $STATUS"
  fi
  index=$((index + 1))
done < "$WORKDIR/paths.txt"

if [ "$FAILURES" -eq "$write_failures_before" ]; then
  python3 -c 'import json,sys; print(json.dumps([line.strip() for line in open(sys.argv[1]) if line.strip()]))' \
    "$WORKDIR/ids.txt" > "$WORKDIR/ids.json"
  python3 - "$WORKDIR/ids.json" "$aura" > "$WORKDIR/dump.json" <<'PY'
import json
import sys

print(json.dumps({
    "title": "Smoke dump",
    "backgroundColor": sys.argv[2],
    "photoIds": json.load(open(sys.argv[1])),
}))
PY

  request -H 'Content-Type: application/json' --data @"$WORKDIR/dump.json" "$DUMPS_URL"
  dump_id=""
  if [ "$STATUS" = "201" ] && python3 -c 'import json,sys
body = json.load(open(sys.argv[1])); ids = json.load(open(sys.argv[2]))
ok = isinstance(body.get("id"), str) and [photo.get("id") for photo in body.get("photos", [])] == ids
sys.exit(0 if ok else 1)' "$WORKDIR/response.json" "$WORKDIR/ids.json"; then
    dump_id="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["id"])' "$WORKDIR/response.json")"
    pass "POST /api/v1/dumps (six photos, aura $aura) → 201, its photos echo the requested order"
  else
    fail "POST /api/v1/dumps (six photos, aura $aura)" "expected 201 echoing the six requested photos, got $STATUS"
  fi

  if [ -n "$dump_id" ]; then
    request "$DUMPS_URL"
    if [ "$STATUS" = "200" ] && python3 -c 'import json,sys
dumps = json.load(open(sys.argv[1]))
sys.exit(0 if any(dump.get("id") == sys.argv[2] for dump in dumps) else 1)' \
        "$WORKDIR/response.json" "$dump_id"; then
      pass "GET /api/v1/dumps → 200 and lists the dump just published"
    else
      fail "GET /api/v1/dumps after publishing" "expected 200 listing $dump_id, got $STATUS"
    fi

    first_url="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["url"])' "$WORKDIR/upload-0.json")"
    if ! status="$(curl -sS -D "$WORKDIR/headers.txt" -o "$WORKDIR/served.png" -w '%{http_code}' "$BASE_URL$first_url")"; then
      echo "smoke.sh: the backend became unreachable mid-run — is it still running?" >&2
      exit 1
    fi
    if [ "$status" = "200" ] && grep -qi '^content-type: image/png' "$WORKDIR/headers.txt" \
        && grep -qi '^x-content-type-options: nosniff' "$WORKDIR/headers.txt" \
        && cmp -s "$WORKDIR/served.png" "$WORKDIR/sample-01.png"; then
      pass "GET $first_url → 200 image/png, nosniff, bytes identical to the upload"
    else
      fail "GET $first_url" "expected 200 image/png serving the uploaded bytes, got $status"
    fi
  fi
else
  echo "  (skipping the dump and image round-trip: an upload above failed)"
fi

echo
printf 'smoke: %d checks, %d failed.\n' "$CHECKS" "$FAILURES"
if [ "$FAILURES" -ne 0 ]; then
  exit 1
fi
echo "smoke: every endpoint answered as the contract names it."
