# CLAUDE.md — Aether Archive

Guidance for Claude Code in this repository. Keep this file under 200 lines: detail belongs in
`.claude/rules/`, `.claude/skills/`, and `docs/`. When a repeated mistake happens, encode the fix in a rule.

## 1. Project

**Aether Archive** — a local-first, mobile-first web app: a personal digital sanctuary for curating
aesthetic photos (nature, anime) and monthly 6-photo "dumps" in an immersive, minimal interface.
Images are the product; the UI must be almost invisible.

| What | Where |
| --- | --- |
| Canonical specs (read-only) | `_docs/aether_archive_specs.md`, `_docs/openapi.yml` |
| Product backlog | `docs/scrum/PRODUCT-BACKLOG.md` |
| Process / sprint playbook | `docs/scrum/SPRINT-PLAYBOOK.md` |
| Definition of Done / Ready | `docs/scrum/DEFINITION-OF-DONE.md`, `docs/scrum/DEFINITION-OF-READY.md` |
| Architecture | `docs/engineering/ARCHITECTURE.md` |
| Design system (color, glass, type) | `docs/engineering/DESIGN-SYSTEM.md` |
| Design references (soft & modern brief, inspiration) | `docs/engineering/DESIGN-REFERENCES.md` |
| Deployment & containers | `docs/engineering/DEPLOYMENT.md` |
| Decision log (ADRs) | `docs/scrum/DECISION-LOG.md` |
| Sprint plans / retrospectives | `docs/scrum/sprints/`, `retrospectives/` |

Never edit `_docs/` in place. A spec change requires an ADR in `docs/scrum/DECISION-LOG.md` plus explicit
user approval; the specs are the contract the backlog is built from.

## 2. Stack (mandated — substitution requires an ADR)

- **Backend**: Java 21 + Spring Boot 3, Maven (`./mvnw`), REST under `/api/v1`, RFC 9457 errors.
- **Database**: PostgreSQL 17, run locally as a Docker container. Dev uses `docker-compose.dev.yml`;
  v1.0 ships the whole stack containerized (`docs/engineering/DEPLOYMENT.md`, ADR-009/010).
- **Storage**: local filesystem only. Database + images never leave this machine.
- **Frontend**: React + Vite + TypeScript, Tailwind CSS, Framer Motion, `@dnd-kit`, TanStack Query.
- **Typography**: Fontsource NPM packages only. Zero external network requests at runtime.
- **Serving images**: Spring maps `/images/**` to the local data directory (no external CDN, ever).

## 3. Repository layout

```
backend/     Spring Boot app (src/main/java/com/aetherarchive/...)
frontend/    React + Vite app (src/features, src/lib, src/styles)
_docs/       Canonical specs — read-only
docs/        scrum/ (backlog, playbook, DoD) and engineering/ (architecture, design system)
retrospectives/  sprintNN.md written after every sprint
reports/     Generated verification / analysis reports
.claude/     Agent configuration: rules, skills, commands, agents, hooks, settings
```

## 4. Commands

Backend (from `backend/`): `./mvnw spring-boot:run` · `./mvnw test` · `./mvnw verify` · `./mvnw package` (jar in `backend/target/`)
Frontend (from `frontend/`, Node 22.22.2 / 24.15 / 26+ — see `frontend/package.json` `engines`):
`npm install` · `npm run dev` (dev server on :5173, LAN-bound) · `npm run test` · `npm run lint` · `npm run typecheck` ·
`npm run format:check` · `npm run build` (static bundle in `frontend/dist/`) · `npm run preview` (serves `dist/` on :4173)
Dev database (once scaffolded): `docker compose -f docker-compose.dev.yml up -d` · v1.0 stack: `docker compose up`
Full check before a commit: the `verify` skill (`.claude/skills/verify/SKILL.md`).
**Keep this section accurate** — every story that adds or renames a command updates it here.

## 5. Workflow (SCRUM — non-negotiable)

Branch model: `main` (released) ← `develop` (integration) ← `feature/*` (one story per branch).

- Start from an up-to-date `develop`: `git switch develop && git pull --ff-only`.
- One branch per user story: `feature/<EPIC>-<STORY>-<slug>` (e.g. `feature/e2-s7-immersive-splash`).
  Variants: `fix/...` for bugs, `chore/...` for tooling, `docs/...` for documentation-only.
- **Commit often.** One logical unit = one commit; aim for a commit at least every 30–60 minutes of work.
  WIP commits on a feature branch are fine and encouraged — never hoard a large diff.
- Before opening a PR: run `/verify` and paste the evidence into the PR.
- Open the PR into `develop` with `gh pr create --base develop`, then review it (`/review-pr` or the
  `code-reviewer` subagent) and merge with **`gh pr merge <n> --merge`** (merge commit).
- At the end of a sprint: `/finish-sprint` → security audit gate, retrospective, release PR
  `develop` → `main`, tag `sprint-NN` (see `retrospectives/TEMPLATE.md`).

### Hard rules (hooks enforce several of these — do not try to bypass them)

1. **Never commit or push directly to `main` or `develop`.** Feature branches + PRs only.
2. **Never rewrite history**: no `rebase`, no `--force`/`--force-with-lease`, no `filter-branch`,
   no amending a commit that is already pushed, no squash merges. Merge commits only.
3. **Never delete** `main`, `develop`, or a merged release tag.
4. Keep PRs small and single-story. If a branch grows past ~500 changed lines, split it.
5. Never fake verification. If a test or a build cannot run, say so and report it as `SKIPPED`.
6. Never commit secrets, `.env`, or local data. No telemetry, no analytics, no external requests.
7. Ask before anything destructive: deleting the data directory, dropping tables, `rm -rf`, migrations
   that lose data.

## 6. Working style

- **Plan before multi-file work**: use plan mode, then implement. One story = one plan = one branch.
- **Use subagents to protect the main context** (`backend-engineer`, `frontend-engineer`, `qa-verifier`,
  `security-auditor`, `scrum-master`) for exploration, implementation, verification or security
  auditing that would flood the conversation.
- **Keep context healthy**: `/clear` between unrelated tasks, `/compact` when a long task must continue;
  prefer `/rewind` over piling corrections on a failed attempt.
- **Tests and docs are part of the story**, not a follow-up: a story is done only when the DoD checklist
  passes (`docs/scrum/DEFINITION-OF-DONE.md`).
- **Record decisions** in `docs/scrum/DECISION-LOG.md` (ADR format) when choosing between options the
  specs leave open — do not silently improvise.
- **Update the backlog** (`docs/scrum/PRODUCT-BACKLOG.md`) whenever scope, priority, or an estimate changes.
- Write everything in **English**: code, comments, commit messages, PRs, docs, issues.

## 7. Context maps (load on demand)

- Backend rules: `.claude/rules/backend.md` · Frontend rules: `.claude/rules/frontend.md`
- Design language: `.claude/rules/design-language.md` · Testing: `.claude/rules/testing.md`
- Security: `.claude/rules/security.md` · Git workflow: `.claude/rules/git-workflow.md`
