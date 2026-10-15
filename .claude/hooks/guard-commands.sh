#!/usr/bin/env bash
# Aether Archive — PreToolUse guard.
# Registered for Bash(git *), Bash(gh *) and Bash(rm *) in .claude/settings.json.
# Exit code 2 blocks the command and returns the message to the agent as feedback.
# Policy: .claude/rules/git-workflow.md — never bypass or edit this script silently.
set -uo pipefail

INPUT="$(cat 2>/dev/null || true)"
CMD="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null || true)"
[ -z "${CMD:-}" ] && exit 0

# Normalise whitespace for matching, keep a readable rendering for messages.
FLAT="$(printf '%s' "$CMD" | tr '\n\t' '  ' | tr -s '[:space:]' ' ')"

deny() {
  printf 'BLOCKED by .claude/hooks/guard-commands.sh: %s\n' "$1" >&2
  printf 'Policy: .claude/rules/git-workflow.md. If you believe the command is legitimate, stop and ask the user — do not work around the guard.\n' >&2
  exit 2
}

matches_protected_branch() {
  printf '%s' "$FLAT" | grep -Eq '(^| )(main|develop)( |$|:)'
}

# ── 1. History rewriting ──────────────────────────────────────────────────────
case "$FLAT" in
  *"git rebase"*)
    deny "git rebase is forbidden — history in this repository is append-only. To pick up new commits from develop inside your feature branch, run: git merge develop" ;;
  *"git filter-branch"*|*"git filter-repo"*)
    deny "history rewriting (filter-branch/filter-repo) is forbidden." ;;
esac

# ── 2. Force pushes and direct pushes to protected branches ───────────────────
case "$FLAT" in
  *"git push"*)
    case "$FLAT" in
      *"--force"*|*" --force-with-lease"*|*" -f "*|*" -f")
        deny "force-push is forbidden: published history is never rewritten." ;;
    esac
    if matches_protected_branch; then
      deny "direct pushes to main/develop are forbidden. Push your feature branch and open a PR: gh pr create --base develop --fill"
    fi
    ;;
esac

# ── 3. Committing on a protected branch ───────────────────────────────────────
case "$FLAT" in
  *"git commit"*)
    BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
    case "$BRANCH" in
      main|develop)
        deny "you are on the protected branch '$BRANCH'. Work always happens on a feature branch: git switch develop && git pull --ff-only && git switch -c feature/<epic>-<story>-<slug>" ;;
    esac
    case "$FLAT" in
      *"--amend"*)
        if [ -n "$(git branch -r --contains HEAD 2>/dev/null)" ]; then
          deny "HEAD is already published on a remote; amending would rewrite published history. Create a new commit instead."
      fi
    esac
    ;;
esac

# ── 4. Squash / rebase merges ─────────────────────────────────────────────────
case "$FLAT" in
  *"gh pr merge"*)
    case "$FLAT" in
      *"--squash"*|*"--rebase"*|*" -s "*|*" -r "*)
        deny "only merge commits are allowed: gh pr merge <number> --merge" ;;
    esac
    case "$FLAT" in
      *"--delete-branch"*)
        PR_NUM="$(printf '%s' "$FLAT" | grep -oE 'gh pr merge +[0-9]+' | grep -oE '[0-9]+' | head -n1 || true)"
        if [ -n "${PR_NUM:-}" ]; then
          HEAD_REF="$(timeout 5 gh pr view "$PR_NUM" --json headRefName --jq '.headRefName' 2>/dev/null || true)"
          case "$HEAD_REF" in
            develop|main)
              deny "this PR's head branch is '$HEAD_REF': never delete it. Merge without --delete-branch." ;;
          esac
        fi
        ;;
    esac
    ;;
esac

# ── 5. Deleting protected branches ────────────────────────────────────────────
case "$FLAT" in
  *"--delete"*|*"git branch -D"*|*"git push origin :"*)
    if matches_protected_branch; then
      deny "deleting or force-updating main/develop is forbidden."
    fi
    ;;
esac

# ── 6. Destructive operations on the archive data ─────────────────────────────
case "$FLAT" in
  *"rm -rf"*|*"rm -fr"*|*"rm -r"*)
    case "$FLAT" in
      *"AetherArchive_Data"*|*"aether_pgdata"*|*"images/"*|*"thumbnails/"*)
        deny "this would delete local archive data (images or database volume). Ask the user for explicit approval first." ;;
    esac
    ;;
esac
case "$FLAT" in
  *"docker volume rm"*|*"docker compose down -v"*|*"docker compose down --volumes"*)
    deny "this would delete the PostgreSQL data volume (the archive database). Ask the user for explicit approval first." ;;
esac
if printf '%s' "$FLAT" | grep -Eqi '(drop +(table|database))|(delete +from +(photo|archive_item))|(truncate +table)'; then
  deny "destructive SQL is forbidden. Data loss must be an explicit, user-approved migration."
fi

exit 0
