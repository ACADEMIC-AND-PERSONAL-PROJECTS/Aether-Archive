#!/usr/bin/env bash
# Aether Archive — PostToolUse(Edit|Write) formatter.
# Uses LOCAL tooling only (never npx-downloads). Always exits 0, never fails a tool call.
set -uo pipefail

INPUT="$(cat 2>/dev/null || true)"
FILE="$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null || true)"
[ -z "${FILE:-}" ] && exit 0
[ -f "$FILE" ] || exit 0

ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"

abs_path() { printf '%s' "$1" | sed "s|^${ROOT}/||"; }
REL="$(abs_path "$FILE")"

case "$REL" in
  frontend/*)
    PRETTIER="$ROOT/frontend/node_modules/.bin/prettier"
    case "$REL" in
      *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs|*.json|*.css|*.scss|*.html|*.md)
        if [ -x "$PRETTIER" ]; then
          (cd "$ROOT/frontend" && "$PRETTIER" --write "$FILE" >/dev/null 2>&1) || true
        fi
        ;;
    esac
    ESLINT="$ROOT/frontend/node_modules/.bin/eslint"
    case "$REL" in
      *.ts|*.tsx)
        if [ -x "$ESLINT" ]; then
          (cd "$ROOT/frontend" && "$ESLINT" --fix "$FILE" >/dev/null 2>&1) || true
        fi
        ;;
    esac
    ;;
  *.java)
    if command -v google-java-format >/dev/null 2>&1; then
      google-java-format --replace "$FILE" >/dev/null 2>&1 || true
    fi
    ;;
esac

exit 0
