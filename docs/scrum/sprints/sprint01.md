# Sprint 01 — The archive can store and serve images and dumps on PostgreSQL through a tested local API

- **Dates**: 2026-10-15 → 2026-10-30 (UTC). Started at the kickoff on 2026-10-15; the playbook row is
  updated to the real dates.
- **Goal**: The archive can store and serve images and dumps on PostgreSQL through a tested local API.
- **Capacity**: 34 points committed — the sprint-1 column of the backlog (all of epic E1 except the two
  stories scheduled in Sprint 2). Playbook capacity band: 25–34.
- **Branch base**: `develop`
- **Milestone**: `Sprint 01 — Foundation & Backend` (the 9 issues were already seeded by
  `scripts/github/seed-backlog.py` and attached to it)

## Sprint backlog

| ID | Story | Points | Priority | Status | PR |
| --- | --- | --- | --- | --- | --- |
| E1-S1 | Scaffold the Spring Boot project | 3 | p0 | Todo | — |
| E1-S11 | Dev PostgreSQL via Docker Compose | 2 | p0 | Todo | — |
| E1-S2 | Configuration & local data directory | 2 | p0 | Todo | — |
| E1-S3 | PostgreSQL persistence + Flyway baseline | 5 | p0 | Todo | — |
| E1-S4 | StorageService — safe local file storage | 5 | p0 | Todo | — |
| E1-S8 | Error handling (RFC 9457) & validation | 2 | p0 | Todo | — |
| E1-S6 | Photo API — upload, list, random | 5 | p0 | Todo | — |
| E1-S7 | Dump API — create and list 6-photo dumps | 5 | p0 | Todo | — |
| E1-S9 | Backend test suite | 5 | p0 | Todo | — |

**Total: 9 stories · 34 points.** Order above is the delivery order: it follows the dependency chain
(scaffold → database → configuration → persistence → storage → errors → photos → dumps → suite), so every
story can be verified on the day it lands.

## Definition of Ready check

All 9 stories pass the DoR: user-story form with a value statement, testable acceptance criteria, ≤ 8
points, `p0` and aligned with the goal, dependencies scheduled earlier, contract present in
`_docs/openapi.yml`, verification feasible locally (Docker is installed on this machine). E1-S9 is a
consolidation story and is treated as a technical enabler.

## Risks & assumptions

- **Docker must run** for `docker-compose.dev.yml` (E1-S11) and for Testcontainers (E1-S3/S9). If the
  daemon is unavailable, those checks are reported `SKIPPED` and the story is *not* Done.
- **Development-time network use is expected**: Maven Central for dependencies and the
  `postgres:17-alpine` image for Testcontainers. The shipped application makes **zero** external
  requests at runtime (`.claude/rules/security.md`); this does not weaken that rule.
- **First build cost**: the initial `./mvnw verify` downloads the Spring Boot dependency tree; later runs
  are cached. Suite runtime budget (< 60 s) is measured from the first fully-warm run.
- **Contract reading**: `_docs/openapi.yml` is the API contract of record. The endpoint list in
  `_docs/aether_archive_specs.md` §4.2 (`/api/v1/archives/*`) predates it and is not implemented — see
  ADR-011, recorded at planning time so implementation does not improvise.
- **`.env.example` is covered by the `Read(./.env.*)` deny rule** in `.claude/settings.json`; it must be
  narrowed before E1-S2/E1-S11 can update the file. Handled as a separate `chore/` PR (not a spec change).
- **Testcontainers is a test-scoped dependency** added in E1-S3 — justified in that PR (backend rules and
  ADR-009 mandate a real Postgres for `@DataJpaTest`).

## Out of scope (explicitly)

- **E1-S5** (`/images/**` static serving) and **E1-S10** (seed script + smoke collection) — both scheduled
  in Sprint 2 by the backlog; they are not silently pulled into this sprint even though they are adjacent.
- **Everything frontend** — no file under `frontend/` is touched in Sprint 1.
- Authentication/authorization (ADR-008) and the v1.0 container images (ADR-010, E6-S11/S12).

## Notes / decisions during the sprint

- 2026-10-15 — Sprint opened at the owner's kickoff. Milestone already held exactly the 9 stories below, so
  no issue churn was needed; only the sprint doc, the playbook row and ADR-011 are new.
- 2026-10-15 — ADR-011 recorded (contract clarifications: `openapi.yml` wins over the stale spec §4.2,
  `title` optional on `DumpCreate` as a superset of both readings, uploads create unassigned photos).
