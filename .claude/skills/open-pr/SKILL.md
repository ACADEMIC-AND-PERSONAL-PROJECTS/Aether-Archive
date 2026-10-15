---
name: open-pr
description: Finish a story branch — run verification, sync with develop, push, and open the pull request with evidence and the story link. Use when the work on a feature branch is ready for review.
argument-hint: [story-id]
allowed-tools: Read, Write, Edit, Grep, Glob, Bash
---

# Open a pull request into develop

Input: story id (default: infer from the branch name).

## 1. Pre-flight

```bash
git status --porcelain                                  # nothing uncommitted
git log --oneline origin/develop..HEAD                  # what the PR contains
```

- Run the `verify` skill and keep the raw evidence (commands + output tails).
- Sync with `develop` **by merging, never rebasing**:

```bash
git fetch origin
git merge origin/develop        # resolve conflicts in the merge commit if any
```

- Re-run the tests that touch the merge result. A merged branch is only green if it was verified after the merge.

## 2. Push and open the PR

```bash
git push -u origin "$(git branch --show-current)"

gh pr create --base develop \
  --title "<type>(<scope>): <summary> [E1-S1]" \
  --body-file /tmp/pr-body.md
```

Build `/tmp/pr-body.md` from `.github/PULL_REQUEST_TEMPLATE.md`, filled with:

- **Story**: id + link (`Closes #12`)
- **What changed**: 2–5 bullets, reviewer-oriented (why, not which files)
- **Acceptance criteria**: copied from the story, each checked or honestly marked
- **Verification evidence**: the exact commands and results from the `verify` skill —
  never write "tests pass" without the command and its output tail
- **Risk / rollout**: what could break, what was NOT tested, data/migration impact
- **Decisions**: ADR links if any
- **Screenshots / recordings**: for UI stories (mobile viewport)

## 3. Self-review before asking for review

- Read your own diff: `gh pr diff <number>`. Look for leftover debug code, TODOs, commented-out blocks,
  inconsistent naming, unused imports.
- Confirm the PR stays small (one story, ideally < 400 changed lines). If it is much larger, consider
  splitting it with a follow-up story rather than merging a monster.

## Guardrails

- Base is always `develop` (only `/finish-sprint` opens PRs against `main`).
- Never squash or rebase this branch to "clean it up" — the history is the record of the work.
- Never mark a check as passed that you did not run.
