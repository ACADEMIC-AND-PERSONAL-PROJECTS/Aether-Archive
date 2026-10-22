# AGENTS.md — Aether Archive

Entry point for any coding agent working in this repository. This file is intentionally short: it
maps the context, it does not repeat it. The full engineering guidance lives in `CLAUDE.md`, and the
course submission evidence lives in `docs/course/FINAL-PROJECT.md`.

## Read first

1. **`CLAUDE.md`** — project invariants, commands, branch/merge rules, context maps.
2. **`docs/course/FINAL-PROJECT.md`** — the 12-criterion rubric and where each piece of evidence is.
3. **`.claude/rules/`** — path-scoped rules: `backend.md`, `frontend.md`, `testing.md`, `security.md`,
   `git-workflow.md`, `design-language.md`.
4. **`docs/engineering/ARCHITECTURE.md`** and **`docs/engineering/DESIGN-SYSTEM.md`** — the contracts.
5. **`docs/scrum/PRODUCT-BACKLOG.md`** — product scope and acceptance criteria.

## Agent team

The team and its handoffs are specified in **`docs/agents/TEAM.md`** and implemented as Claude Code
subagents in **`.claude/agents/`** (`backend-engineer`, `frontend-engineer`, `code-reviewer`,
`qa-verifier`, `security-auditor`, `scrum-master`). Skills live in `.claude/skills/`, deterministic
guardrails in `.claude/hooks/`.

The short version: one story per branch; implement; verify with the project's own commands; independent
review; merge commit only; record the outcome in the sprint doc and `reports/`.

## Commands

| Goal | Command |
| --- | --- |
| Whole stack, one command | `docker compose up -d --build` → `http://localhost:3000` |
| Seed the demo | `make seed` |
| Every gate the CI runs | `make verify` |
| Backend only | `cd backend && ./mvnw verify` |
| Frontend only | `cd frontend && npm run lint && npm run test -- --run && npm run typecheck && npm run build` |
| Production overlay | `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build` |

## Invariants

- **English** for code, comments, commits, issues, PRs and documentation; the UI copy is English too.
- **Never** commit or push directly to `main` or `develop`; never rewrite history; merge commits only.
- **No secrets** in git, logs, traces or screenshots. `.env` stays local; `.env.example` is the template.
- **No PII and no image content** in telemetry. The public demo is a deployment profile: operational
  signals only, and the data is seeded for evaluation. The local-first default remains telemetry-free.
- **Verify before claiming.** A test that cannot run is reported `SKIPPED`, never `PASS`.
- **The UI is the product**: photography first, chrome second; accessibility, reduced motion and the
  safe areas are not optional.

## Course context

This repository is the final project for the **DataTalksClub AI Dev Tools Zoomcamp**. The grader checks
12 criteria (24 points, 10 to pass): problem description, product specification, agent team, context
management, application, tests, containers, deployment, CI/CD, observability, alerting and an on-call
agent. `docs/course/FINAL-PROJECT.md` maps each one to files, URLs and commands — keep it current.
