# Sprint 00 — Bootstrap Retrospective

- **Dates**: 2026-10-15
- **Goal**: Bootstrap the repository, the agent setup, the SCRUM process and the complete product backlog.
- **Outcome**: Achieved
- **Release**: initial setup merged into `main`; `develop` opened for the next sprint.
- **Board**: no milestone (infrastructure sprint).

## Metrics

| Metric | Value |
| --- | --- |
| Stories committed / delivered | 0 / 0 (infrastructure sprint) |
| PRs merged | 1 (bootstrap) |
| Backlog produced | 6 epics · 40 stories · 170 points |
| Sprints planned | 6 (≈ 25–34 points each) |

## What was delivered

- **Repository architecture**: `backend/`, `frontend/`, `_docs/` (read-only specs), `docs/`,
  `retrospectives/`, `reports/`, `.github/`.
- **Git model**: protected `main` and `develop`, merge-commit-only policy, feature branch per story,
  release PR `develop` → `main` at each sprint close, tags `sprint-NN`.
- **Agent setup** (`.claude/`): 6 rules, 8 skills, 2 commands, 5 subagents, 4 hook scripts, settings
  with permissions/hooks/status line. Entry point: `CLAUDE.md`.
- **SCRUM artefacts**: complete product backlog, sprint playbook, Definition of Ready, Definition of
  Done, decision log with 8 ADRs, retrospective template.
- **Engineering docs**: target architecture and the Dark Glassmorphism design system
  (colour extraction mandate, glass tokens, Fontsource typography).

## What went well

- The specs in `_docs/` were complete enough to derive every epic, story and acceptance criterion
  without guessing.
- The git policy (merge commits only, protected branches, hook-enforced) matches the owner's
  "lossless history" requirement exactly.

## What did not

- No application code exists yet, so none of the process (CI, hooks on real commands, verification
  scripts) has been exercised against real work. Expect adjustments.

## What we will change

1. Review the hook scripts against real usage after the first two feature PRs; fix false positives
   immediately (they are the fastest way to lose trust in the guardrails).
2. Add CI (E6-S1) earlier than planned if manual verification starts to hurt — the estimate stands,
   the timing is flexible.
3. Keep the sprint doc updated during the sprint, not at the end; the retrospective quality depends on it.

## Decisions taken

| ADR | Decision |
| --- | --- |
| ADR-001 | Embedded SQLite, H2 file mode as fallback |
| ADR-002 | Merge commits only, append-only history |
| ADR-003 | Protected `main` and `develop`, feature branch per story |
| ADR-004 | TanStack Query as the frontend data layer |
| ADR-005 | Fontsource NPM packages for typography |
| ADR-006 | Image-derived theme colours at runtime |
| ADR-007 | Scrum artefacts in-repository, GitHub as a mirror |
| ADR-008 | No Spring Security in v1 (local single-user threat model) |

## How to audit this sprint

- Bootstrap PR: see the merged pull request on `main` (branch `chore/repo-bootstrap`).
- Artefacts: `CLAUDE.md`, `.claude/README.md`, `docs/scrum/PRODUCT-BACKLOG.md`.
- Branch protections: GitHub → Settings → Branches (rules on `main` and `develop`).

## Next sprint preview

- **Sprint 1 — Foundation & Backend** (34 points): a tested Spring Boot API that stores images and
  dumps in SQLite and serves them locally.
- First action: `Read docs/scrum/PRODUCT-BACKLOG.md`, then `/start-sprint 1` and `/start-feature E1-S1`.
