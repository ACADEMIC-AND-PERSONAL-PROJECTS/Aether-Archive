---
name: backlog-sync
description: Mirror docs/scrum/PRODUCT-BACKLOG.md to GitHub — create or update labels, milestones and one issue per story/epic, idempotently. Use after backlog changes or when GitHub drifts from the file.
argument-hint: [--dry-run]
allowed-tools: Read, Write, Edit, Grep, Glob, Bash
---

# Backlog ⇄ GitHub sync

`docs/scrum/PRODUCT-BACKLOG.md` is **canonical**. GitHub issues are a mirror for tracking and linking.
Never edit the backlog only on GitHub: change the file, then re-run this skill.

**Fast path** — a reference implementation of everything below lives in
`scripts/github/seed-backlog.py` (idempotent: it parses the backlog file, ensures labels, milestones
and one issue per epic/story, and never deletes anything):

```bash
python3 scripts/github/seed-backlog.py --dry-run   # inspect the plan
python3 scripts/github/seed-backlog.py             # apply it
```

Use the manual commands below when the script does not cover a one-off change.

## Label taxonomy (create or update, idempotent)

```bash
gh label create "type:epic"        --color 6E2FA6 --description "Epic (parent of stories)"   --force
gh label create "type:story"       --color 1D76DB --description "User story"                 --force
gh label create "type:bug"         --color B60205 --description "Defect"                     --force
gh label create "type:chore"       --color C5DEF5 --description "Tooling / maintenance"      --force
gh label create "type:docs"        --color 0E8A16 --description "Documentation"              --force
gh label create "type:test"        --color 5319E7 --description "Tests / quality"            --force
gh label create "area:backend"     --color 006B75 --description "Spring Boot backend"        --force
gh label create "area:frontend"    --color 1D76DB --description "React frontend"             --force
gh label create "area:design"      --color D4C5F9 --description "Visual design / UX"         --force
gh label create "area:data"        --color BFDADC --description "Storage / database"         --force
gh label create "area:devops"      --color F9D0C4 --description "CI, repo, release"          --force
gh label create "priority:p0"      --color B60205 --description "Must ship this sprint"      --force
gh label create "priority:p1"      --color D93F0B --description "Should ship soon"           --force
gh label create "priority:p2"      --color FBCA04 --description "Nice to have"               --force
gh label create "status:in-progress" --color FBCA04 --description "Work in progress"          --force
gh label create "status:blocked"     --color E11D21 --description "Blocked — see issue"        --force
```

## Milestones

One per sprint, from `SPRINT-PLAYBOOK.md`:

```bash
REPO="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"
gh api "repos/$REPO/milestones" --paginate --jq '.[].title'     # existing titles
gh api "repos/$REPO/milestones" \
  -f title="Sprint 01 — Foundation & Backend" \
  -f description="Sprint 01 plan: docs/scrum/sprints/sprint01.md" \
  -f due_on="2026-10-30T23:59:59Z"                              # skip if it already exists
```

## Issues

For each epic: one issue labelled `type:epic`, titled `[E1] Foundation & Backend`, body = goal + story index.
For each story: one issue, title `[E1-S1] Scaffold the Spring Boot project`, body:

```markdown
**Story** — <the story text from the backlog>

**Acceptance criteria**
- [ ] ...

**Estimate** — 3 points · **Priority** — p0 · **Epic** — #<epic issue number>
**Backlog** — docs/scrum/PRODUCT-BACKLOG.md

_Part of #<epic issue number>_
```

Idempotency — always search before creating, and update instead of duplicating:

```bash
gh issue list --search "[E1-S1] in:title" --state all --json number,title,state
gh issue create --title "[E1-S1] ..." --body-file /tmp/issue-body.md \
  --label "type:story,area:backend,priority:p0" --milestone "Sprint 01 — Foundation & Backend"
gh issue edit <number> --body-file /tmp/issue-body.md --milestone "Sprint 01 — Foundation & Backend"
```

In `--dry-run` mode: print the planned creates/updates and change nothing.

## Verify

```bash
gh issue list --limit 100 --json number,title,milestone,labels \
  --jq '.[] | "\(.number)\t\(.milestone.title // "no-milestone")\t\(.title)"' | sort -k2
```

Report: created / updated / unchanged counts, and any story in the file that has no issue.

## Guardrails

- Never delete issues to "re-sync" — close them with a comment (`gh issue close <n> --comment "Superseded by ..."`).
- Never rename labels that are already used without a migration note.
- The backlog file always wins; if the file and GitHub disagree, fix GitHub.
