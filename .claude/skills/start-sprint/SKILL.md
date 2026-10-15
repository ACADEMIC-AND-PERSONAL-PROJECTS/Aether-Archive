---
name: start-sprint
description: Open a new sprint — pick stories from the product backlog, write the sprint plan file, create the GitHub milestone and sprint labels, and set one clear sprint goal. Use when the user says "start sprint", "sprint planning", or starts a new iteration.
argument-hint: [sprint-number]
allowed-tools: Read, Write, Edit, Grep, Glob, Bash
---

# Open a sprint

Input: sprint number (default: next number in `docs/scrum/sprints/`). Read
`docs/scrum/PRODUCT-BACKLOG.md`, `docs/scrum/SPRINT-PLAYBOOK.md` and
`docs/scrum/DEFINITION-OF-READY.md` first.

## 1. Select the work

- Take stories in priority order (`priority:p0` → `priority:p1` → `priority:p2`), respecting
  dependencies and the sprint order in the backlog.
- Capacity: **25–34 points** per 2-week sprint — the band in `docs/scrum/SPRINT-PLAYBOOK.md`, and never
  above 34. Do not over-commit; leave slack for defects.
- Every selected story must satisfy the **Definition of Ready**. If one does not, refine it first
  (or push it to the next sprint with a one-line reason).

## 2. Write the sprint plan

Create `docs/scrum/sprints/sprintNN.md` (two-digit number, e.g. `sprint01.md`) from this shape:

```markdown
# Sprint NN — <goal in one line>

- **Dates**: <start> → <end> (UTC)
- **Goal**: <one sentence, outcome-shaped>
- **Capacity**: <points committed> points
- **Branch base**: `develop`

## Sprint backlog

| ID | Story | Points | Priority | Status | PR |
| --- | --- | --- | --- | --- | --- |
| E1-S1 | ... | 3 | p0 | Todo | — |

## Risks & assumptions

- ...

## Out of scope (explicitly)

- ...

## Notes / decisions during the sprint

- <append entries as the sprint progresses — this section becomes retrospective input>
```

## 3. Mirror it on GitHub

```bash
REPO="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"
gh api "repos/$REPO/milestones" \
  -f title="Sprint NN — <goal>" \
  -f description="Sprint NN plan: docs/scrum/sprints/sprintNN.md" \
  -f due_on="<end-date>T23:59:59Z"
```

Ensure the sprint's issues exist and are attached (see the `backlog-sync` skill), then set each
selected story's milestone to the new one:

```bash
gh issue edit <number> --milestone "Sprint NN — <goal>"
```

## 4. Publish the plan

The plan is a documentation change and follows the normal flow:

```bash
git switch develop && git pull --ff-only
git switch -c docs/sprintNN-plan
git add docs/scrum/sprints/sprintNN.md docs/scrum/PRODUCT-BACKLOG.md docs/scrum/SPRINT-PLAYBOOK.md
git commit -m "docs(scrum): sprint NN plan — <goal>"
git push -u origin docs/sprintNN-plan
gh pr create --base develop --title "docs(scrum): sprint NN plan — <goal>" --body "Sprint plan and backlog updates. See docs/scrum/sprints/sprintNN.md." 
gh pr merge <pr-number> --merge --delete-branch
```

## 5. Update the playbook

Set the sprint's row in the `SPRINT-PLAYBOOK.md` schedule table to `In progress` and announce the goal
in one line. Then the first feature branch starts from `develop` (`/start-feature`).

## Guardrails

- One goal per sprint; a second "theme" means the sprint is over-committed.
- Never start a sprint with unresolved blockers on a `p0` story.
- Do not change story estimates during planning to make the sprint fit — cut scope instead.
