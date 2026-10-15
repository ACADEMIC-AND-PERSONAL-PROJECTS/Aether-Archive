---
name: start-feature
description: Begin a user story — check the Definition of Ready, create the feature branch from an up-to-date develop, and create or link the GitHub issue. Use when starting work on a story, bug or chore.
argument-hint: [story-id, e.g. E1-S1]
allowed-tools: Read, Write, Edit, Grep, Glob, Bash
---

# Start a feature branch

Input: story id (e.g. `E1-S1`). If missing, ask which story, or use `/sprint-status` to pick the next one.

## 1. Check readiness

- Find the story in `docs/scrum/PRODUCT-BACKLOG.md`; read its acceptance criteria.
- Verify the **Definition of Ready** (`docs/scrum/DEFINITION-OF-READY.md`). If it fails, refine the story
  with the `scrum-master` subagent first — do not start coding on an unready story.
- Confirm the story belongs to the current sprint (`docs/scrum/sprints/sprintNN.md`). Work on
  out-of-sprint stories only with explicit user approval.

## 2. Branch

```bash
git status --porcelain           # must be clean; commit or stash first
git switch develop
git pull --ff-only
git switch -c feature/<epic>-<story>-<slug>   # e.g. feature/e1-s1-spring-boot-scaffold
```

Naming: lowercase, hyphenated slug, ≤ 40 chars. Bugs use `fix/...`, tooling `chore/...`,
documentation `docs/...`.

## 3. Issue

```bash
gh issue list --search "[E1-S1]" --json number,title,state
# if missing → create it with the story text from the backlog (see the backlog-sync skill)
gh issue edit <number> --add-label "status:in-progress"
# if the label does not exist yet, create it once:
# gh label create "status:in-progress" --color FBCA04 --description "Work in progress"
```

## 4. Announce the plan

Post a 3-line plan before coding (in the issue or in your reply): objective, files/areas touched,
how it will be verified. Then implement with **frequent commits** — one logical unit per commit,
`<type>(<scope>): <summary> [E1-S1]` (see `.claude/rules/git-workflow.md`).

## Guardrails

- One story per branch. If you discover extra work, create a new backlog entry — do not widen the branch.
- Never branch from `main`, never commit on `develop`, never mix two stories in one PR.
- Commit before switching branches; the session-start context will warn about a dirty tree.
- If the story turns out to be bigger than 8 points, stop and split it (scrum-master) rather than
  delivering a giant PR.
