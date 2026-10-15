# Sprint 01 — The archive can store and serve images and dumps on PostgreSQL through a tested local API

- **Dates**: 2026-10-15 → 2026-10-30 (UTC). Started at the kickoff on 2026-10-15; the playbook row is
  updated to the real dates.
- **Goal**: The archive can store and serve images and dumps on PostgreSQL through a tested local API.
- **Capacity**: 34 points committed — the sprint-1 column of the backlog (all of epic E1 except the two
  stories scheduled in Sprint 2). This is the playbook's ceiling (25–34), chosen deliberately for the
  bootstrap sprint, where every story is tightly specified and the work is mostly mechanical scaffolding;
  the `start-sprint` skill's narrower 25–30 band leaves slack this sprint does not take. **Zero slack is
  accepted with a named consequence**: if a defect or an estimate overrun appears, E1-S9 (the test-suite
  consolidation story, 5 pts) moves to Sprint 2 — the goal is not renegotiated, and no story is quietly
  dropped. The skill text is reconciled with the playbook in the same PR so the two stop disagreeing.
- **Branch base**: `develop`
- **Milestone**: `Sprint 01 — Foundation & Backend` (the 9 issues were already seeded by
  `scripts/github/seed-backlog.py` and attached to it)

## Sprint backlog

| ID | Story | Points | Priority | Status | PR |
| --- | --- | --- | --- | --- | --- |
| E1-S1 | Scaffold the Spring Boot project | 3 | p0 | Done | #60 |
| E1-S11 | Dev PostgreSQL via Docker Compose | 2 | p0 | Done | #61 |
| E1-S2 | Configuration & local data directory | 2 | p0 | Done | #62 |
| E1-S3 | PostgreSQL persistence + Flyway baseline | 5 | p0 | Done | #63 |
| E1-S4 | StorageService — safe local file storage | 5 | p0 | Done | #64 |
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
- 2026-10-15 — Review round 1 on this plan (request changes) → ADR-011 tightened so an implementer cannot
  read it two ways: the curation order is the **array position** in `Dump.photos` (the contract's `Photo`
  schema has no `displayOrder` field), `category` uses the contract's **lowercase** wire values and stays
  **required** on upload, `createdAt`/`uploadedAt` and `url` (`/images/<uuid>.<ext>`, served in E1-S5) are
  named explicitly. The `archives/*` supersession now covers specs §5 as well as §4.2, and the capacity
  band was reconciled with the `start-sprint` skill (which said 25–30 while the playbook says 25–34).
- 2026-10-15 — Five stories delivered (E1-S1, S11, S2, S3, S4 → 17 points), each through the full gate:
  branch → implement → `verify` with raw evidence → PR → independent `code-reviewer` → findings fixed by new
  commits → merge commit → issue closed with the merge sha. Statuses and PR links are in the table above.
- 2026-10-15 — **The review gate is paying for itself.** Findings that would otherwise have shipped:
  a **symlinked `tmp/` made the boot delete the link target's contents** (E1-S2, proven by execution, written
  up in `reports/security-finding-e1s2-symlinked-staging.md` — never merged); the CORS "no wildcard" guard was
  bypassable with `https://*`; `AETHER_DATA_DIR=$HOME` passed every check; the docs claimed a `.env` mechanism
  Spring Boot does not have; **the documented 15 MB upload ceiling was a fiction at the HTTP boundary**
  (Spring's 1 MB multipart default refused first — E1-S4); and AVIF files with the `mif1` major brand were
  refused. Every one was fixed before merge.
- 2026-10-15 — **Process observations for the retrospective**: (a) `Closes #NN` does not register as a closing
  reference on PRs into `develop`, so issues are closed by hand with the merge sha — decide whether that is
  the convention or something to fix; (b) the ~400/500-changed-line guidance does not fit generated files
  (the Maven wrapper added 484 lines in E1-S1) or an atomic 5-point story (E1-S3/S4 crossed 1000) — propose a
  carve-out and a rule that the *hand-written* diff is what is measured; (c) commit granularity improved as
  the sprint went on (E1-S1 was one commit for the whole story; by E1-S4 it was four logical units) and the
  briefs now ask agents to work in stages.
- 2026-10-15 — **Carried forward, not lost**: E1-S7 must add the mutator that attaches photos to a dump, with
  an `@Version` (the backend rules require optimistic locking when a story mutates existing rows) — `Photo`
  has no setter today by design. Soft delete has moved to the backlog's **Icebox**: the architecture mandates
  it, but the contract defines no delete endpoint, so it needs a spec decision first.
