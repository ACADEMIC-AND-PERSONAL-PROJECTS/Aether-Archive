# Sprint Playbook — Aether Archive

How this project is run. Short, explicit, and meant to be obeyed by both the human and the agent.

## Roles

| Role | Who | Owns |
| --- | --- | --- |
| Product Owner | **The user** | Vision, priority calls, acceptance, access to the machine |
| Scrum Master | Agent (`scrum-master` subagent) | Backlog, sprint docs, milestones, retrospectives |
| Dev team | Agent (`backend-engineer`, `frontend-engineer` subagents) | Implementation, tests, PRs |
| Reviewers | Agent (`code-reviewer`, `qa-verifier` subagents) | Independent review, verification evidence |

## Cadence

- **Sprint length**: 2 weeks (adjustable; recorded in the sprint doc).
- **Capacity**: ~25–30 points per sprint for agent-driven work. Never plan above 30 to protect against defects and interruptions.
- **Sprint goal**: exactly one sentence, outcome-shaped ("The archive can store and serve images"), never a list.
- **Cadence of commits**: many, per logical unit (`.claude/rules/git-workflow.md`).

## Ceremonies (mapped to commands)

| Ceremony | When | How |
| --- | --- | --- |
| Backlog refinement | Before planning, continuously | `scrum-master` subagent + `backlog-sync` |
| Sprint planning | Start of sprint | `/start-sprint` |
| Daily stand-up | On request | `/standup` (read-only digest) |
| Sprint review | End of sprint | Release PR description + summary to the user |
| Retrospective | End of sprint | `/finish-sprint` → `retrospectives/sprintNN.md` |
| Backlog sync | Whenever the file changes | `/backlog-sync` |

## Branch & release policy

```
main     ← released code; protected; PR-only; tagged sprint-NN at each sprint close
  └ develop ← integration; protected; PR-only; every feature branch lands here
      └ feature/<epic>-<story>-<slug>  ← one user story; deleted after merge
```

- Every feature branch starts from an up-to-date `develop` and merges back through a PR.
- Merge commits only — **no squash, no rebase, no force-push, no history rewriting**. History is append-only so nothing is ever lost.
- The sprint release is a PR `develop` → `main`, merged at sprint close, then tagged `sprint-NN`.
- After a release, `develop` continues from `main`; the next sprint's branches come from `develop`.

## Definition of Ready

A story may enter a sprint only when it satisfies `DEFINITION-OF-READY.md`.

## Definition of Done

A story is `Done` only when `DEFINITION-OF-DONE.md` is fully checked with evidence in the PR.

## What the agent must never do

- Commit or push directly to `main` or `develop` (enforced by `.claude/hooks/guard-commands.sh`).
- Rewrite published history (rebase, force-push, amend of a pushed commit, squash merge).
- Mark a story done without verification evidence, or invent test results.
- Delete the data directory, drop tables, or run destructive migrations without explicit user approval.
- Add a dependency without a one-line justification in the PR.
- Edit `_docs/` (specs are read-only) or bypass a hook.

## Sprint schedule

| Sprint | Goal | Dates | Milestone | Status |
| --- | --- | --- | --- | --- |
| 0 | Bootstrap the repository, agent setup, process and backlog | 2026-10-15 | — | Done |
| 1 | The archive can store and serve images and dumps through a tested local API | TBD | Sprint 01 — Foundation & Backend | Planned |
| 2 | The React shell runs and the design system (colour extraction, typography, glass) is defined | TBD | Sprint 02 — Design System | Planned |
| 3 | The signature entry experience exists: immersive splash, glass menu, first uploads | TBD | Sprint 03 — Splash & Workshop | Planned |
| 4 | Dumps can be curated end to end (upload, order, colour, publish) with CI guarding merges | TBD | Sprint 04 — Workshop & CI | Planned |
| 5 | The Time River scrolls and the background follows each dump's aura | TBD | Sprint 05 — Time River | Planned |
| 6 | The app is polished, documented and released as v1.0 | TBD | Sprint 06 — Hardening & v1.0 | Planned |

## Velocity log

| Sprint | Committed (pts) | Delivered (pts) | Velocity | Notes |
| --- | --- | --- | --- | --- |
| 0 | — | — | — | Bootstrap |
| 1 | TBD | TBD | TBD | |

## Escalation

Stop and ask the user when:

- a spec in `_docs/` is ambiguous or would need to change,
- a hook blocks a command that seems legitimate,
- a story grows beyond its estimate by more than 50 %,
- anything could destroy local data,
- scope needs to change mid-sprint.
