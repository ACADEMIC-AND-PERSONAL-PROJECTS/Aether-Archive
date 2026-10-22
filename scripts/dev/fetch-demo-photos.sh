#!/usr/bin/env bash
#
# Download a licensed, deterministic set of real photographs for the course demo.
#
# The images come from Lorem Picsum (https://picsum.photos), which serves photographs from
# Unsplash. They are free to use; the photographers are recorded in `ATTRIBUTION.tsv` / `README.md`
# beside the files. Nothing is committed to the repository: this is seed data, downloaded on the
# machine that runs the demo.
#
# Usage:
#   scripts/dev/fetch-demo-photos.sh
#   AETHER_DEMO_PHOTOS=/tmp/my-photos AETHER_DEMO_PHOTO_COUNT=24 scripts/dev/fetch-demo-photos.sh
#
# Then:
#   scripts/dev/seed.sh --source-dir "$AETHER_DEMO_PHOTOS" --count 36 --dumps 3 \
#     --titles "Low tide|Green hours|After the rain"

set -euo pipefail

OUT="${AETHER_DEMO_PHOTOS:-/tmp/opencode/aether-demo-photos}"
COUNT="${AETHER_DEMO_PHOTO_COUNT:-36}"
LIST="$OUT/picsum-list.json"
SELECTED="$OUT/selected.tsv"

case "$COUNT" in
  ''|*[!0-9]*) echo "fetch-demo-photos.sh: AETHER_DEMO_PHOTO_COUNT must be a positive integer." >&2; exit 64 ;;
esac
if [ "$COUNT" -lt 18 ]; then
  echo "fetch-demo-photos.sh: ask for at least 18 photos (three dumps of six)." >&2
  exit 64
fi

mkdir -p "$OUT"
echo "Fetching the Lorem Picsum catalogue…"
curl -fsSL --max-time 30 'https://picsum.photos/v2/list?page=1&limit=100' -o "$LIST"

# Prefer landscape originals: the archive's 3:2 mats show them whole. The selection is spread
# evenly across the catalogue rather than taking the first N, so the demo has range.
python3 - "$LIST" "$COUNT" <<'PY' > "$SELECTED"
import json
import sys

catalogue_path, count_raw = sys.argv[1], sys.argv[2]
count = int(count_raw)
with open(catalogue_path, encoding="utf-8") as handle:
    catalogue = json.load(handle)

landscape = [
    photo
    for photo in catalogue
    if photo.get("id") and int(photo.get("width", 0)) >= int(photo.get("height", 1)) * 1.2
]
if len(landscape) < count:
    landscape = [photo for photo in catalogue if photo.get("id")]
if len(landscape) < count:
    raise SystemExit(f"only {len(landscape)} usable photos in the catalogue, need {count}")

step = len(landscape) / count
chosen = [landscape[min(int(index * step), len(landscape) - 1)] for index in range(count)]
for photo in chosen:
    author = str(photo.get("author", "Unknown")).replace("\t", " ")
    source = str(photo.get("url", "")).replace("\t", " ")
    print(f"{photo['id']}\t{author}\t{source}")
PY

available="$(wc -l < "$SELECTED" | tr -d '[:space:]')"
if [ "$available" -lt 18 ]; then
  echo "fetch-demo-photos.sh: the catalogue yielded only $available photos." >&2
  exit 1
fi

: > "$OUT/ATTRIBUTION.tsv"
index=0
while IFS=$'\t' read -r id author source; do
  index=$((index + 1))
  destination="$OUT/demo-$(printf '%02d' "$index").jpg"
  if [ ! -s "$destination" ]; then
    printf '  %2d/%d  %-28s %s\n' "$index" "$available" "$author" "demo-$(printf '%02d' "$index").jpg"
    curl -fsSL --max-time 60 "https://picsum.photos/id/$id/1600/1200" -o "$destination"
  fi
  printf '%s\t%s\t%s\n' "$(basename "$destination")" "$author" "$source" >> "$OUT/ATTRIBUTION.tsv"
done < "$SELECTED"

{
  cat <<'EOF'
# Demo photography

These photographs are downloaded from [Lorem Picsum](https://picsum.photos), which serves
photographs from [Unsplash](https://unsplash.com). They are free to use under the Unsplash
license; the photographers are listed below. This directory is seed data, not part of the
Aether Archive repository.
EOF
  printf '\n| File | Photographer | Source |\n| --- | --- | --- |\n'
  while IFS=$'\t' read -r file author source; do
    printf '| %s | %s | %s |\n' "$file" "$author" "$source"
  done < "$OUT/ATTRIBUTION.tsv"
} > "$OUT/README.md"

echo "Demo photography ready: $OUT ($index files)."
echo "  attribution: $OUT/README.md"
