#!/usr/bin/env bash
#
# Post N sample photos and one dump to a running local backend (E1-S10).
#
# The demo flow, in two commands (from the repository root):
#
#   # Terminal 1 — the backend, on a scratch data directory (never the real archive):
#   (cd backend && AETHER_DATA_DIR=/tmp/aether-dev ./mvnw spring-boot:run)
#
#   # Terminal 2 — twelve sample photos and a dump:
#   AETHER_DATA_DIR=/tmp/aether-dev scripts/dev/seed.sh
#   AETHER_DATA_DIR=/tmp/aether-dev scripts/dev/smoke.sh   # …then walk the whole API
#
# The uploads cycle the four categories, then one dump is published from six photos evenly
# spaced over the batch (their pixels are generated locally by `sample-photos.py` — the
# standard library alone, no image dependency). Every call asserts its status; the first
# refusal aborts with the response body, because that is a bug, not a seed.
#
# The effective data directory is `${AETHER_DATA_DIR:-$HOME/AetherArchive_Data}` — the same
# semantics the backend binds — and seeding the real archive is refused unless `--force` is
# passed (the `scripts/README.md` convention: nothing here ever touches the real data
# directory by accident). Export the scratch value for the backend and for this script, or
# the guard cannot know the truth.
#
# Requires `curl` and `python3` (standard library only). Safe to run twice: a second run
# adds a fresh batch of photos and its own dump; nothing is overwritten, moved or deleted.

set -euo pipefail

usage() {
  cat <<'EOF'
usage: seed.sh [--count N] [--base-url URL] [--force]

  --count N        sample photos to upload (default 12; minimum 6 — a dump holds six)
  --base-url URL   where the backend listens (default http://localhost:8080)
  --force          seed even when the effective data directory is the real archive
EOF
}

COUNT=12
BASE_URL="${AETHER_BASE_URL:-http://localhost:8080}"
FORCE=0

while [ $# -gt 0 ]; do
  case "$1" in
    --count)    COUNT="${2:?seed.sh: --count needs a value}"; shift 2 ;;
    --base-url) BASE_URL="${2:?seed.sh: --base-url needs a value}"; shift 2 ;;
    --force)    FORCE=1; shift ;;
    --help|-h)  usage; exit 0 ;;
    *) echo "seed.sh: unknown option '$1'" >&2; usage >&2; exit 64 ;;
  esac
done
BASE_URL="${BASE_URL%/}"

case "$COUNT" in
  ''|*[!0-9]*) echo "seed.sh: --count must be a positive integer" >&2; exit 64 ;;
esac
if [ "$COUNT" -lt 6 ]; then
  echo "seed.sh: --count must be at least 6 (a dump holds six photos)" >&2
  exit 64
fi

DATA_DIR="${AETHER_DATA_DIR:-$HOME/AetherArchive_Data}"
DATA_DIR="${DATA_DIR%/}"
REAL_DIR="${HOME%/}/AetherArchive_Data"
if [ "$DATA_DIR" = "$REAL_DIR" ] && [ "$FORCE" -ne 1 ]; then
  cat >&2 <<EOF
seed.sh: refusing to seed the real data directory ($DATA_DIR).
  Start the backend with AETHER_DATA_DIR pointing at a scratch directory, export the
  same value here, or pass --force to seed the real archive deliberately.
EOF
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PHOTOS_URL="$BASE_URL/api/v1/photos"
DUMPS_URL="$BASE_URL/api/v1/dumps"

echo "Seeding $BASE_URL — $COUNT sample photos, then a dump of six."
if [ "$FORCE" -eq 1 ]; then
  echo "  effective data directory: $DATA_DIR  [--force: the real-directory guard is off]"
else
  echo "  effective data directory: $DATA_DIR"
fi

if ! status="$(curl -sS -o /dev/null -w '%{http_code}' "$PHOTOS_URL")"; then
  echo "seed.sh: the backend is not reachable at $PHOTOS_URL — start it first (see backend/README.md)." >&2
  exit 1
fi
if [ "$status" != "200" ]; then
  echo "seed.sh: GET $PHOTOS_URL answered $status; is this really the Aether Archive API?" >&2
  exit 1
fi

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

python3 "$SCRIPT_DIR/sample-photos.py" --count "$COUNT" --out "$WORKDIR" > "$WORKDIR/manifest.json"
python3 -c 'import json,sys; [print(entry["path"]) for entry in json.load(open(sys.argv[1]))]' \
  "$WORKDIR/manifest.json" > "$WORKDIR/paths.txt"

ids_file="$WORKDIR/ids.txt"
: > "$ids_file"
categories=(pics anime dump uncategorized)
index=0
while IFS= read -r path; do
  category="${categories[$((index % ${#categories[@]}))]}"
  response="$WORKDIR/upload-$index.json"
  if ! status="$(curl -sS -o "$response" -w '%{http_code}' \
      -F "file=@$path;type=image/png" -F "category=$category" "$PHOTOS_URL")"; then
    echo "seed.sh: lost the backend while uploading (photo $((index + 1)))." >&2
    exit 1
  fi
  if [ "$status" != "201" ]; then
    echo "seed.sh: the upload of $path answered $status:" >&2
    cat "$response" >&2
    exit 1
  fi
  id="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["id"])' "$response")"
  printf '%s\n' "$id" >> "$ids_file"
  printf '  %2d/%d  %-13s %s\n' "$((index + 1))" "$COUNT" "$category" "$(basename "$path")"
  index=$((index + 1))
done < "$WORKDIR/paths.txt"

aura="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))[0]["hex"])' "$WORKDIR/manifest.json")"
python3 - "$ids_file" "$COUNT" "$aura" > "$WORKDIR/dump.json" <<'PY'
import datetime
import json
import sys

ids = [line.strip() for line in open(sys.argv[1]) if line.strip()]
count = int(sys.argv[2])
# Six photos evenly spaced over the batch: all distinct, and a varied palette for the dump.
six = [ids[index * count // 6] for index in range(6)]
print(json.dumps({
    "title": "Seed dump " + datetime.date.today().isoformat(),
    "backgroundColor": sys.argv[3],
    "photoIds": six,
}))
PY

echo "Publishing a dump of six of them (aura $aura)."
if ! status="$(curl -sS -o "$WORKDIR/dump-response.json" -w '%{http_code}' \
    -H 'Content-Type: application/json' --data @"$WORKDIR/dump.json" "$DUMPS_URL")"; then
  echo "seed.sh: lost the backend while publishing the dump." >&2
  exit 1
fi
if [ "$status" != "201" ]; then
  echo "seed.sh: the dump publish answered $status:" >&2
  cat "$WORKDIR/dump-response.json" >&2
  exit 1
fi
dump_id="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["id"])' "$WORKDIR/dump-response.json")"

echo "Seeded $COUNT photos and dump $dump_id."
echo "  feed:  $PHOTOS_URL"
echo "  dumps: $DUMPS_URL"
