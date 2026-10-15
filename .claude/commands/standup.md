---
description: Quick stand-up summary — what was done, what is next, what is blocked. Read-only.
allowed-tools: Read, Grep, Glob, Bash
---

# Stand-up

Read-only. Base the report on real history, not on memory:

```bash
git log --since="24 hours ago" --pretty='%h %s' --no-merges
git log --since="24 hours ago" --merges --pretty='%h %s'
git status --short
gh pr list --state open --json number,title,headRefName --limit 20
```

Report in three short sections, maximum 12 lines total:

```
**Done (last 24h)** — commits/PRs merged, with story ids.
**Next** — the single next unit of work, with the branch name and the skill to run.
**Blocked** — anything waiting on the user, a decision, or an external factor (or "nothing").
```

If the working tree is dirty and the last commit is older than the dirty files, say so: uncommitted
work is the first thing to fix (`.claude/rules/git-workflow.md` requires frequent commits).
