# Project notes — Aether Archive

State of the world, kept short. Update it when the state changes; delete what is no longer true.

## Current state (2026-10-15)

- **Bootstrap complete (Sprint 0)**: repository structure, agent artefacts (`.claude/`), SCRUM process
  and the full product backlog are in place. `main` and `develop` are protected; no application code exists yet.
- **Next**: Sprint 1 — Foundation & Backend (`docs/scrum/sprints/sprint01.md`, created by `/start-sprint`).
- `backend/` and `frontend/` contain only their README placeholders — scaffolding is part of Sprint 1/2.

## Known pitfalls / gotchas

- The app must run **without any external network request** — fonts (Fontsource) and icons are local.
- SQLite + Hibernate needs the community dialect; check the pragma setup (`WAL`, `foreign_keys=ON`) early.
- Mobile browsers: use `100dvh` (not `100vh`) and safe-area insets; `backdrop-filter` needs a fallback.
- The data directory (`~/AetherArchive_Data`) is never committed and never deleted by the agent.
- `_docs/` is read-only: changes require an ADR + user approval.

## Open questions

- None blocking. H2 file mode is the accepted fallback if SQLite tooling causes friction (see ADR-001).
