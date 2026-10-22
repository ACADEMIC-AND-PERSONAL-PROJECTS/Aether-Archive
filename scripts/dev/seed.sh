#!/usr/bin/env bash
#
# Post N photos and D dumps to a running backend (E1-S10, extended for the course demo).
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
# By default the pixels are generated locally by `sample-photos.py` (standard library alone, no
# image dependency). `--source-dir DIR` uploads real images from a directory instead — the course
# demo uses `scripts/dev/fetch-demo-photos.sh` to download a licensed set from Lorem Picsum /
# Unsplash, then seeds 36 of them as 3 dumps and 18 singles.
#
# The uploads cycle the four categories. A dump takes six photos from an even spread of the batch;
# `--dumps D` publishes D disjoint dumps, so every photo is in at most one dump and the River keeps
# its singles. Every call asserts its status; the first refusal aborts with the response body,
# because that is a bug, not a seed.
#
# The effective data directory is `${AETHER_DATA_DIR:-$HOME/AetherArchive_Data}` — the same
# semantics the backend binds — and seeding the real archive is refused unless `--force` is
# passed (the `scripts/README.md` convention: nothing here ever touches the real data
# directory by accident). Export the scratch value for the backend and for this script, or
# the guard cannot know the truth.
#
# Requires `curl` and `python3` (standard library only). Safe to run twice: a second run adds a
# fresh batch of photos and its own dumps; nothing is overwritten, moved or deleted.

set -euo pipefail

usage() {
  cat <<'EOF'
usage: seed.sh [--count N] [--dumps D] [--source-dir DIR] [--titles "A|B"] [--aura HEX] [--base-url URL] [--force]

  --count N        photos to upload (default 12; minimum 6 per dump)
  --dumps D        dumps to publish (default 1; every dump holds six photos)
  --source-dir DIR upload the images in DIR (jpg/jpeg/png/webp) instead of generating samples
  --titles "A|B"   dump titles, pipe-separated; missing titles fall back to the seed date
  --aura HEX       the first dump's mat colour (default: the first generated colour, or #7d8a7a)
  --base-url URL   where the backend listens (default http://localhost:8080)
  --force          seed even when the effective data directory is the real archive
EOF
}

COUNT=12
DUMPS=1
SOURCE_DIR=""
TITLES=""
AURA=""
BASE_URL="${AETHER_BASE_URL:-http://localhost:8080}"
FORCE=0

while [ $# -gt 0 ]; do
  case "$1" in
    --count)      COUNT="${2:?seed.sh: --count needs a value}"; shift 2 ;;
    --dumps)      DUMPS="${2:?seed.sh: --dumps needs a value}"; shift 2 ;;
    --source-dir) SOURCE_DIR="${2:?seed.sh: --source-dir needs a value}"; shift 2 ;;
    --titles)     TITLES="${2:?seed.sh: --titles needs a value}"; shift 2 ;;
    --aura)       AURA="${2:?seed.sh: --aura needs a value}"; shift 2 ;;
    --base-url)   BASE_URL="${2:?seed.sh: --base-url needs a value}"; shift 2 ;;
    --force)      FORCE=1; shift ;;
    --help|-h)    usage; exit 0 ;;
    *) echo "seed.sh: unknown option '$1'" >&2; usage >&2; exit 64 ;;
  esac
done
BASE_URL="${BASE_URL%/}"

case "$COUNT" in
  ''|*[!0-9]*) echo "seed.sh: --count must be a positive integer" >&2; exit 64 ;;
esac
case "$DUMPS" in
  ''|*[!0-9]*) echo "seed.sh: --dumps must be a positive integer" >&2; exit 64 ;;
esac
if [ "$COUNT" -lt 6 ]; then
  echo "seed.sh: --count must be at least 6 (a dump holds six photos)" >&2
  exit 64
fi
if [ "$DUMPS" -lt 1 ]; then
  echo "seed.sh: --dumps must be at least 1" >&2
  exit 64
fi
if [ "$COUNT" -lt $((6 * DUMPS)) ]; then
  echo "seed.sh: --count must be at least 6 × --dumps (each dump holds six photos)" >&2
  exit 64
fi
if [ -n "$AURA" ] && ! printf '%s' "$AURA" | grep -Eq '^#[0-9a-fA-F]{6}$'; then
  echo "seed.sh: --aura must be a #rrggbb colour" >&2
  exit 64
fi

DATA_DIR="${AETHER_DATA_DIR:-$HOME/AetherArchive_Data}"
REAL_DIR="${HOME%/}/AetherArchive_Data"
# Canonicalise both sides before comparing: a doubled or trailing slash, `/.`, `..` or a
# symlink must not spell the real archive in a way this guard fails to recognise.
DATA_DIR="$(python3 -c 'import os, sys; print(os.path.realpath(sys.argv[1]))' "$DATA_DIR")"
REAL_DIR="$(python3 -c 'import os, sys; print(os.path.realpath(sys.argv[1]))' "$REAL_DIR")"
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

echo "Seeding $BASE_URL — $COUNT photos, then $DUMPS dump(s) of six."
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

DEFAULT_AURA="${AURA:-#7d8a7a}"

if [ -n "$SOURCE_DIR" ]; then
  if [ ! -d "$SOURCE_DIR" ]; then
    echo "seed.sh: --source-dir '$SOURCE_DIR' is not a directory." >&2
    exit 64
  fi
  find "$SOURCE_DIR" -maxdepth 1 -type f \
    \( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' -o -iname '*.webp' \) \
    -print | sort > "$WORKDIR/all.txt"
  head -n "$COUNT" "$WORKDIR/all.txt" > "$WORKDIR/paths.txt"
  available="$(wc -l < "$WORKDIR/paths.txt" | tr -d '[:space:]')"
  if [ "$available" -lt 6 ]; then
    echo "seed.sh: --source-dir contains $available usable image(s); a dump needs six." >&2
    exit 64
  fi
  if [ "$available" -lt "$COUNT" ]; then
    COUNT="$available"
  fi
  echo "  source: $SOURCE_DIR ($COUNT image(s))"
else
  python3 "$SCRIPT_DIR/sample-photos.py" --count "$COUNT" --out "$WORKDIR" > "$WORKDIR/manifest.json"
  python3 -c 'import json,sys; [print(entry["path"]) for entry in json.load(open(sys.argv[1]))]' \
    "$WORKDIR/manifest.json" > "$WORKDIR/paths.txt"
  if [ -z "$AURA" ]; then
    DEFAULT_AURA="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))[0]["hex"])' "$WORKDIR/manifest.json")"
  fi
fi

if [ "$COUNT" -lt $((6 * DUMPS)) ]; then
  echo "seed.sh: only $COUNT photo(s) available; $DUMPS dump(s) need $((6 * DUMPS))." >&2
  exit 64
fi

ids_file="$WORKDIR/ids.txt"
: > "$ids_file"
categories=(pics anime dump uncategorized)
index=0
while IFS= read -r path; do
  ext="$(printf '%s' "${path##*.}" | tr '[:upper:]' '[:lower:]')"
  case "$ext" in
    jpg|jpeg) mime="image/jpeg" ;;
    png)      mime="image/png" ;;
    webp)     mime="image/webp" ;;
    *) echo "seed.sh: skipping unsupported image '$path'." >&2; exit 64 ;;
  esac
  category="${categories[$((index % ${#categories[@]}))]}"
  response="$WORKDIR/upload-$index.json"
  if ! status="$(curl -sS -o "$response" -w '%{http_code}' \
      -F "file=@$path;type=$mime" -F "category=$category" "$PHOTOS_URL")"; then
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

python3 - "$ids_file" "$COUNT" "$DUMPS" "$TITLES" "$DEFAULT_AURA" "$WORKDIR" <<'PY'
import datetime
import json
import os
import sys

ids_path, count_raw, dumps_raw, titles_raw, default_aura, outdir = sys.argv[1:7]
ids = [line.strip() for line in open(ids_path) if line.strip()]
count = int(count_raw)
dumps = int(dumps_raw)
titles = [title.strip() for title in titles_raw.split("|") if title.strip()]
palette = ["#b26a5c", "#5f6f8a", "#b5965e", "#6f7d6a"]
today = datetime.date.today().isoformat()

for dump_index in range(dumps):
    start = dump_index * count // dumps
    end = (dump_index + 1) * count // dumps
    segment = ids[start:end]
    if len(segment) < 6:
        raise SystemExit(f"not enough photos for dump {dump_index + 1}: {len(segment)}")
    six = [segment[position * len(segment) // 6] for position in range(6)]
    aura = default_aura if dump_index == 0 else palette[(dump_index - 1) % len(palette)]
    if dump_index < len(titles):
        title = titles[dump_index]
    else:
        title = f"Seed dump {today}" + (f" ({dump_index + 1})" if dumps > 1 else "")
    with open(os.path.join(outdir, f"dump-{dump_index}.json"), "w", encoding="utf-8") as handle:
        json.dump({"title": title, "backgroundColor": aura, "photoIds": six}, handle)
PY

for ((dump_index = 0; dump_index < DUMPS; dump_index++)); do
  dump_file="$WORKDIR/dump-$dump_index.json"
  title="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["title"])' "$dump_file")"
  aura="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["backgroundColor"])' "$dump_file")"
  echo "Publishing dump $((dump_index + 1))/$DUMPS — $title (aura $aura)."
  if ! status="$(curl -sS -o "$WORKDIR/dump-response-$dump_index.json" -w '%{http_code}' \
      -H 'Content-Type: application/json' --data @"$dump_file" "$DUMPS_URL")"; then
    echo "seed.sh: lost the backend while publishing dump $((dump_index + 1))." >&2
    exit 1
  fi
  if [ "$status" != "201" ]; then
    echo "seed.sh: dump $((dump_index + 1)) answered $status:" >&2
    cat "$WORKDIR/dump-response-$dump_index.json" >&2
    exit 1
  fi
  dump_id="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["id"])' "$WORKDIR/dump-response-$dump_index.json")"
  printf '  dump %d: %s\n' "$((dump_index + 1))" "$dump_id"
done

echo "Seeded $COUNT photos and $DUMPS dump(s)."
echo "  feed:  $PHOTOS_URL"
echo "  dumps: $DUMPS_URL"
