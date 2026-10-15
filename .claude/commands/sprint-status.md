---
description: Report where the project stands right now — current sprint, stories done/in progress/todo, open PRs, branch state, and the next recommended action. Read-only.
allowed-tools: Read, Grep, Glob, Bash
---

# Sprint status

Read-only report. Do not modify anything, do not commit.

Gather:

```bash
cat docs/scrum/sprints/sprint[0-9][0-9]*.md 2>/dev/null | tail -40   # latest sprint doc
gh issue list --state all --limit 50
gh pr list --state open --limit 20
git log --oneline -10
git status --short
```

If `gh` is unavailable or unauthenticated, fall back to the local files and say so.

Answer in this shape, nothing longer:

```
## Sprint NN — <goal>
Dates: <start> → <end>   Points: <done>/<committed>

| Story | Title | Status | PR |
| --- | --- | --- | --- |

**Open PRs**: ...
**Blockers**: ...
**Next action**: <one concrete command or skill to run>
```

Status per story: `Done` (merged + DoD verified) · `In review` · `In progress` · `Blocked` · `Todo`.
Never mark a story `Done` without a merged PR or committed evidence.
