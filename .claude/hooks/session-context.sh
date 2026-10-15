#!/usr/bin/env bash
# Aether Archive — SessionStart hook.
# stdout is injected into the session context, so keep it short and useful.
set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}" 2>/dev/null || exit 0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
DIRTY="$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
SPRINT_FILE="$(ls -1 docs/scrum/sprints/sprint[0-9][0-9]*.md 2>/dev/null | sort | tail -n1 || true)"

printf '## Aether Archive — session context\n'
printf -- '- Branch: %s' "$BRANCH"
case "$BRANCH" in
  main|develop) printf ' (protected: never commit here — create a feature branch)' ;;
esac
printf '\n'
if [ "${DIRTY:-0}" != "0" ]; then
  printf -- '- Working tree: %s uncommitted file(s)\n' "$DIRTY"
else
  printf -- '- Working tree: clean\n'
fi

printf -- '- Last commits: '
git log --oneline -5 2>/dev/null | tr '\n' '|' | sed 's/|$//' | sed 's/|/ · /g'
printf '\n'

if [ -n "${SPRINT_FILE:-}" ]; then
  printf -- '- Sprint doc: %s\n' "$SPRINT_FILE"
  sed -n '1,12p' "$SPRINT_FILE" 2>/dev/null | sed 's/^/    /'
fi

printf -- '- Reminder: /verify before commits, PR into develop, `gh pr merge <n> --merge`.\n'
exit 0
