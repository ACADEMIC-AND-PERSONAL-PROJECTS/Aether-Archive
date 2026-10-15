#!/usr/bin/env bash
# Aether Archive — status line: sprint · branch · working tree.
# Prints one compact line. Never fails the UI.
set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}" 2>/dev/null || true
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { printf 'Aether Archive'; exit 0; }

RESET=$'\033[0m'; DIM=$'\033[2m'; CLAY=$'\033[38;5;173m'; GREEN=$'\033[38;5;114m'; RED=$'\033[38;5;203m'

SPRINT="$(ls -1 docs/scrum/sprints/sprint[0-9][0-9]*.md 2>/dev/null | sort | tail -n1 | xargs -r basename | sed 's/\.md$//')"
BRANCH="$(git branch --show-current 2>/dev/null || true)"
[ -z "$BRANCH" ] && BRANCH="$(git rev-parse --short HEAD 2>/dev/null || echo '?')"
DIRTY="$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
AHEAD="$(git rev-list --count @{upstream}..HEAD 2>/dev/null || echo '')"

case "$BRANCH" in
  main|develop) BR_COLOR="$CLAY" ;;
  *)            BR_COLOR="$GREEN" ;;
esac

printf '%s⛰ %s%s %s·%s %s%s%s' \
  "$CLAY" "${SPRINT:-no-sprint}" "$RESET" \
  "$DIM" "$RESET" \
  "$BR_COLOR" "$BRANCH" "$RESET"

if [ "${DIRTY:-0}" != "0" ]; then
  printf ' %s· %s✎%s' "$DIM" "$RED" "$RESET"
  printf '%s%s%s' "$DIM" "$DIRTY" "$RESET"
fi

if [ -n "${AHEAD:-}" ] && [ "${AHEAD:-0}" != "0" ]; then
  printf ' %s· ↑%s%s' "$DIM" "$AHEAD" "$RESET"
fi

exit 0
