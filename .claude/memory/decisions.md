# Decisions index

One line per decision. Full records live in `docs/scrum/DECISION-LOG.md`.

| # | Date | Decision | Status |
| --- | --- | --- | --- |
| ADR-001 | 2026-10-15 | Embedded **SQLite** as the database; H2 file mode is the fallback if SQLite friction appears | Superseded by ADR-009 |
| ADR-002 | 2026-10-15 | **Merge commits only** (no rebase, no squash): history is append-only and lossless | Accepted |
| ADR-003 | 2026-10-15 | GitFlow-lite: `main` (released) ← `develop` (integration) ← one feature branch per story | Accepted |
| ADR-004 | 2026-10-15 | TypeScript + **TanStack Query** as the frontend data layer (server state), local state stays local | Accepted |
| ADR-005 | 2026-10-15 | Typography via **Fontsource** NPM packages; display serif + UI sans; zero external requests | Accepted |
| ADR-006 | 2026-10-15 | Theme colours are **derived from the user's images** at runtime via a local extraction algorithm | Accepted |
| ADR-007 | 2026-10-15 | Agent process: SCRUM artefacts in-repo, GitHub issues mirrored from the backlog, retro per sprint | Accepted |
| ADR-008 | 2026-10-15 | No Spring Security for v1 — single-user LAN app; data-safety threat model only | Accepted |
| ADR-009 | 2026-10-15 | **PostgreSQL 17** (Docker container) replaces embedded SQLite; dev service via Compose, tests via Testcontainers | Accepted |
| ADR-010 | 2026-10-15 | v1.0 ships as a **Docker Compose** stack (db + api + web, single LAN origin :3000); dev containerizes only the database | Accepted |
