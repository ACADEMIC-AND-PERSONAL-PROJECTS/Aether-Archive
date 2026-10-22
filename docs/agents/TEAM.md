# Agent team — specification and process

This document defines **who does what** and **how work moves between agents**. It is the portable
specification; the Claude Code implementation lives in `.claude/agents/`, `.claude/skills/` and
`.claude/hooks/`. The same roles map onto any coding agent (OpenCode, Codex, Cursor) because every
handoff is a file, a command or a report — never a private conversation.

## 1. Roles

| Agent | Owns | Tools | Hands off |
| --- | --- | --- | --- |
| **Orchestrator** (main session) | Scope, plan, sequencing, user decisions, final judgement | all | A bounded story to one specialist |
| **backend-engineer** | Spring Boot: entities, services, controllers, storage, Flyway, backend tests | read/write/edit/bash | A compiled, tested diff + evidence |
| **frontend-engineer** | React/Vite/Tailwind: views, design system, motion, drag-and-drop, frontend tests | read/write/edit/bash + web research | A linted, tested, built diff |
| **qa-verifier** | Independent falsification: builds, API probes, browser checks, evidence report | read/bash/write reports only | `reports/verify-*.md` with PASS/FAIL/SKIPPED |
| **code-reviewer** | Read-only review against the Definition of Done, rules and security | read/grep/bash | Findings, severity, merge recommendation |
| **security-auditor** | Adversarial OWASP/threat-model audit at release; dependency CVEs | read/grep/bash/web + write reports | `reports/security-audit-*.md`; High/Critical block release |
| **scrum-master** | Backlog, sprint plans, GitHub issues/milestones, retrospectives | read/write/edit/bash | Updated backlog, sprint doc, issue links |

The orchestrator is the only agent that talks to the user. Specialists never merge.

## 2. Handoff protocol

```
user goal
   │
   ▼
orchestrator ── plan + Definition of Ready ──▶ story issue / branch
   │
   ├── backend-engineer ──┐
   ├── frontend-engineer ─┤  implementation + tests + docs
   │                      ▼
   │                 make verify / project commands
   │                      │
   │                      ▼
   │                 qa-verifier ──▶ reports/verify-*.md (independent)
   │                      │
   │                      ▼
   │                 code-reviewer ──▶ findings (read-only)
   │                      │
   │                      ▼
   └──────────────── merge commit (human-approved) ──▶ sprint record
```

Rules that make the handoff reliable:

1. **A story is a file, not a memory.** The issue (or `docs/scrum/PRODUCT-BACKLOG.md` row) carries the
   acceptance criteria; the branch name carries the story id.
2. **The implementer runs the project's commands**, not a private recipe. `make verify` is the union.
3. **The verifier is independent**: no product edits, only `reports/`. A verifier who can fix is not a
   verifier.
4. **The reviewer has no write tools.** Findings are advisory; the orchestrator decides and records.
5. **No agent merges its own work.** Merge is a separate, human-approved step; history is merge commits.
6. **Every handoff leaves a trace**: commit, PR body, report, issue comment, or sprint row.

## 3. Context management

- `CLAUDE.md` stays **under 200 lines**: project, commands, workflow, invariants, context maps.
- Rules are **path-scoped** (`.claude/rules/backend.md` loads for `backend/**`, etc.), so a backend task
  never pays for frontend rules.
- Skills are **lazy-loaded procedures** (`.claude/skills/*/SKILL.md`); they are invoked when the task
  matches, not pasted into every session.
- Durable decisions live in **`docs/scrum/DECISION-LOG.md`** (ADRs); durable evidence in **`reports/`**.
- The orchestrator uses subagents to protect its context window; a specialist gets the story, the
  relevant files and the acceptance criteria — not the whole repository.
- `AGENTS.md` is the entry point for any agent; `docs/course/FINAL-PROJECT.md` is the submission map.

## 4. How this final project used the team

- **Epic**: public issue #180, milestone `Zoomcamp Final Project` (due 2026-10-26).
- **Branch**: `feature/zoomcamp-final` (one branch for the course slice; the production criteria are
  interlocked and a single reviewable diff is the honest unit here).
- **Implementation**: containerization, deployment, observability, alerting, on-call responder and the
  editorial redesign.
- **Evidence**: commits reference the issue; `reports/` holds verification; `docs/course/FINAL-PROJECT.md`
  maps criteria to evidence.
- **Review**: the `code-reviewer` runs in a fresh session before the PR is merged; the `qa-verifier`
  produces the independent report; the `security-auditor` runs before the release tag.

## 5. What is deliberately not delegated

- Product direction and scope cuts (the user's call).
- Destructive operations (data deletion, volume removal, force-push).
- Secret handling and production credentials.
- The final merge and the release tag.

Those stay with the orchestrator and the human owner. The agents make the work fast; they do not make
the irreversible decisions.
