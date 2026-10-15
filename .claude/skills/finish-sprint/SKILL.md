---
name: finish-sprint
description: Close a sprint — verify the sprint is complete, write the retrospective, merge develop into main via a release PR, tag sprint-NN, and update the backlog and playbook. Use at the end of every sprint.
argument-hint: [sprint-number]
allowed-tools: Read, Write, Edit, Grep, Glob, Bash
---

# Close a sprint (release + retrospective)

Input: sprint number (default: the sprint marked `In progress` in `docs/scrum/SPRINT-PLAYBOOK.md`).

Order matters: **retro first, release second** — the retrospective is part of the release that reaches `main`.

## 1. Sprint completeness check

```bash
cat docs/scrum/sprints/sprintNN.md
gh pr list --state merged --base develop --limit 50
gh issue list --milestone "Sprint NN — <goal>" --state open
```

- Every selected story is either `Done` (merged + DoD verified) or explicitly moved to the next sprint
  with a one-line reason in the sprint doc. No story disappears silently.
- Run the full verification (see the `verify` skill) on `develop` and record the results.

## 2. Write the retrospective

Create `retrospectives/sprintNN.md` from `retrospectives/TEMPLATE.md`, with **real numbers**:

- Stories delivered vs committed, points, velocity, PRs merged, defects found/fixed.
- What went well / what did not / what we will change (2–3 concrete process changes, each verifiable).
- Decisions taken (link ADRs), surprises, and carry-over.
- A short "how to follow this sprint" note: branch names, PR links, commits of interest —
  so the human can audit the work without reading the whole history.

## 3. Update the artefacts (same docs branch)

```bash
git switch develop && git pull --ff-only
git switch -c docs/sprintNN-retro
# edit: retrospectives/sprintNN.md, docs/scrum/PRODUCT-BACKLOG.md (statuses, new items, re-estimates),
#       docs/scrum/SPRINT-PLAYBOOK.md (status → Released/Done, velocity row),
#       docs/scrum/DECISION-LOG.md (any ADR still missing)
git commit -m "docs(scrum): sprint NN retrospective and backlog update"
git push -u origin docs/sprintNN-retro
gh pr create --base develop --title "docs(scrum): sprint NN retrospective" --body "Retrospective, backlog and playbook updates for sprint NN."
gh pr merge <pr-number> --merge --delete-branch
```

## 4. Release: develop → main

```bash
git switch develop && git pull --ff-only
gh pr create --base main --head develop \
  --title "release: sprint-NN — <goal>" \
  --body-file /tmp/release-body.md
```

Release PR body: sprint goal, delivered stories (with PR links), verification evidence, migrations or
data-format changes, known issues, and the retrospective link.

Then merge **without deleting the branch** (the guard hook blocks otherwise):

```bash
gh pr merge <pr-number> --merge
```

## 5. Tag the release

```bash
git switch main && git pull --ff-only
git tag -a sprint-NN -m "Sprint NN — <goal>"
git push origin sprint-NN
```

## 6. Prepare the next sprint

- Leave the next sprint's stories at the top of `PRODUCT-BACKLOG.md`, groomed and ready.
- Tell the user in 5 lines: goal achieved or not, what shipped, what was deferred, next sprint goal.

## Guardrails

- Never `--delete-branch` on the release PR (its head is `develop`).
- Never merge into `main` with unfinished stories silently included — moving a story must be written down.
- If verification fails, the sprint is not finished: fix on a `fix/*` branch and re-run this skill.
