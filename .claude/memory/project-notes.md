# Project notes — Aether Archive

State of the world, kept short. Update it when the state changes; delete what is no longer true.

## Current state (2026-10-15)

- **Bootstrap complete (Sprint 0)**: repository structure, agent artefacts (`.claude/`), SCRUM process
  and the full product backlog are in place. `main` and `develop` are protected; no application code exists yet.
- **Stack update (owner, 2026-10-15)**: database is **PostgreSQL 17** — dev container from Sprint 1
  (E1-S11); v1.0 ships the whole stack containerized (ADR-009/010, `docs/engineering/DEPLOYMENT.md`).
- **Next**: Sprint 1 — Foundation & Backend (`docs/scrum/sprints/sprint01.md`, created by `/start-sprint`).
- `backend/` and `frontend/` contain only their README placeholders — scaffolding is part of Sprint 1/2.

## Known pitfalls / gotchas

- The app must run **without any external network request** — fonts (Fontsource) and icons are local.
- Docker must be running for backend work: the dev database is `postgres:17-alpine` via
  `docker-compose.dev.yml`, and integration tests use Testcontainers (ADR-009).
- Mobile browsers: use `100dvh` (not `100vh`) and safe-area insets; `backdrop-filter` needs a fallback.
- The data directory (`~/AetherArchive_Data`) holds images/thumbnails only, never the database — backup is
  `pg_dump` + the images (E6-S7).
- `_docs/` is read-only: changes require an ADR + user approval (ADR-009 did exactly this for Postgres).

## Open questions

- None blocking. Database choice settled: PostgreSQL in Docker (ADR-009); no embedded-DB fallback anymore.
