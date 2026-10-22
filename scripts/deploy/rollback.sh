#!/usr/bin/env bash
# Roll back to the last successful deployment before the tag that is currently live.
#
# Usage: ./scripts/deploy/rollback.sh
#
# The history is written by scripts/deploy/deploy.sh (one `success` line per live tag) and excluded
# from git. Rolling back calls the same deploy path, so the smoke test runs before the operation is
# recorded as another success: a rollback that does not become healthy fails loudly instead of
# pretending to have fixed the archive.
set -euo pipefail

cd "$(dirname "$0")/../.."

STATE_DIR="state"
current_tag="$(cat "$STATE_DIR/current-image" 2>/dev/null || true)"
if [ -z "$current_tag" ]; then
  echo "rollback: no current deployment is recorded" >&2
  exit 1
fi
if [ ! -f "$STATE_DIR/history.tsv" ]; then
  echo "rollback: no deployment history is recorded" >&2
  exit 1
fi

previous_tag="$(awk -F'\t' -v current="$current_tag" '
  $2 == "success" && $3 != current { tag = $3 }
  END { print tag }
' "$STATE_DIR/history.tsv")"

if [ -z "$previous_tag" ]; then
  echo "rollback: no successful deployment before $current_tag" >&2
  exit 1
fi

echo "rollback: $current_tag -> $previous_tag"
./scripts/deploy/deploy.sh "$previous_tag" --skip-seed
