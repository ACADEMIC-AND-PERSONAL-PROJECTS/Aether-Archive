# Sprint Playbook — Aether Archive

How this project is run. Short, explicit, and meant to be obeyed by both the human and the agent.

## Roles

| Role | Who | Owns |
| --- | --- | --- |
| Product Owner | **The user** | Vision, priority calls, acceptance, access to the machine |
| Scrum Master | Agent (`scrum-master` subagent) | Backlog, sprint docs, milestones, retrospectives |
| Dev team | Agent (`backend-engineer`, `frontend-engineer` subagents) | Implementation and tests; the session that owns the branch creates the commits, the branch and the PR |
| Reviewers | Agent (`code-reviewer`, `qa-verifier`, `security-auditor` subagents) | Independent review, verification evidence, sprint security audit |

## Cadence

- **Sprint length**: 2 weeks (adjustable; recorded in the sprint doc).
- **Capacity**: ~25–34 points per sprint for agent-driven work (see the sprint map in the backlog).
  Never plan above 34; excess p2 stories roll to the next sprint.
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
| Security audit | End of sprint, before the release PR | `security-auditor` subagent → `reports/security-audit-sprintNN.md`; Critical/High blocks the release |
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
| 1 | The archive can store and serve images and dumps on PostgreSQL through a tested local API | 2026-10-15 → 2026-10-16 | Sprint 01 — Foundation & Backend | **Released** (`sprint-01`) |
| 2 | The React shell runs and the design system (colour extraction, typography, glass) is defined | 2026-10-16 → 2026-10-30 | Sprint 02 — Design System | **Released** (`sprint-02`) |
| 3 | The signature entry experience exists: immersive splash, glass menu, first uploads | 2026-10-16 → 2026-10-17 | Sprint 03 — Splash & Workshop | **Released** (`sprint-03`) |
| 4 | Dumps can be curated end to end (upload, order, colour, publish) with CI guarding merges | 2026-11-30 → 2026-12-11 | Sprint 04 — Workshop & CI | Planned |
| 5 | The Time River scrolls and the background follows each dump's aura | 2026-12-14 → 2026-12-25 | Sprint 05 — Time River | Planned |
| 6 | The app is polished, containerized, documented and released as v1.0 | 2026-12-28 → 2027-01-08 | Sprint 06 — Hardening & v1.0 | Planned |

## Velocity log

| Sprint | Committed (pts) | Delivered (pts) | Velocity | Notes |
| --- | --- | --- | --- | --- |
| 0 | — | — | — | Bootstrap |
| 1 | 34 | 34 | 34 | 9/9 stories; 280 backend tests, suite 45 s; security audit found no Critical/High. **+1 unplanned** delivered point: the audit's reachable SEC-03 (`jackson-core` DoS, PR #70, backlog E6-S15). Deliberately kept out of the velocity figure — a series that mixes planned and unplanned work cannot be compared across sprints — and recorded here so the throughput is still visible. |
| 2 | 33 | 33 | 33 | 8/8 stories, 0 carry-over; 302 backend + 136 frontend tests at the close; security audit found no Critical/High/Medium (1 Low, pre-tracked as E6-S17). Hand-written size average 1,067/story — below Sprint 1's 1,245 baseline, still above the ~400 guidance. No unplanned points landed. |
| 3 | 28 | 28 | 28 | 7/7 stories, 0 carry-over, delivered in two days against a two-week window; 307 backend + 344 frontend tests at the close; security audit **CLEAR**, 0 blocking. Average story-PR size 949 changed lines (range 248–1,787) — still well above the ~400 guidance. Five stories were split (12 slices), four PRs were closed unmerged and re-cut; six "cannot be split" claims were withdrawn against measured cuts. |

## Escalation

Stop and ask the user when:

- a spec in `_docs/` is ambiguous or would need to change,
- a hook blocks a command that seems legitimate,
- a story grows beyond its estimate by more than 50 %,
- anything could destroy local data,
- scope needs to change mid-sprint.
