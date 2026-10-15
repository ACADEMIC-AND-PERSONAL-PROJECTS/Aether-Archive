# Decision Log (ADR)

Architecture Decision Records for Aether Archive. **Every choice the specs leave open is recorded here
before it is implemented** — alternatives, decision, consequences. One short record is enough; the point
is that future sessions do not re-litigate settled questions or silently drift.

Statuses: `Proposed` · `Accepted` · `Superseded by ADR-NNN` · `Rejected`.

## Index

| # | Date | Title | Status |
| --- | --- | --- | --- |
| [ADR-001](#adr-001--embedded-sqlite-as-the-database) | 2026-10-15 | Embedded SQLite as the database | Superseded by ADR-009 |
| [ADR-002](#adr-002--merge-commits-only-append-only-history) | 2026-10-15 | Merge commits only, append-only history | Accepted |
| [ADR-003](#adr-003--gitflow-lite-with-protected-main-and-develop) | 2026-10-15 | GitFlow-lite with protected `main` and `develop` | Accepted |
| [ADR-004](#adr-004--tanstack-query-as-the-frontend-data-layer) | 2026-10-15 | TanStack Query as the frontend data layer | Accepted |
| [ADR-005](#adr-005--fontsource-npm-packages-for-typography) | 2026-10-15 | Fontsource NPM packages for typography | Accepted |
| [ADR-006](#adr-006--image-derived-theme-colours-at-runtime) | 2026-10-15 | Image-derived theme colours at runtime | Accepted |
| [ADR-007](#adr-007--scrum-artefacts-in-repository) | 2026-10-15 | Scrum artefacts in-repository | Accepted |
| [ADR-008](#adr-008--no-spring-security-for-v1) | 2026-10-15 | No Spring Security for v1 | Accepted |
| [ADR-009](#adr-009--postgresql-as-the-database) | 2026-10-15 | PostgreSQL as the database | Accepted |
| [ADR-010](#adr-010--containerized-delivery-for-v10) | 2026-10-15 | Containerized delivery for v1.0 | Accepted |
| [ADR-011](#adr-011--api-contract-clarifications-for-sprint-1) | 2026-10-15 | API contract clarifications for Sprint 1 | Accepted |
| [ADR-012](#adr-012--storage-and-cors-constraints) | 2026-10-15 | Storage and CORS constraints | Accepted |
| [ADR-013](#adr-013--the-error-vocabulary-is-a-declared-part-of-the-contract) | 2026-10-15 | The error vocabulary is a declared part of the contract | Accepted |

---

## ADR-001 — Embedded SQLite as the database

**Date**: 2026-10-15 · **Status**: Superseded by [ADR-009](#adr-009--postgresql-as-the-database)

**Context.** The spec mandates an embedded, file-based local database (SQLite or H2). The app is
single-user and runs on one machine; there is no server process to manage and no concurrent writers
beyond the Spring Boot app itself.

**Decision.** Use **SQLite** through the Hibernate community dialect, with the database file at
`${AETHER_DATA_DIR}/aether.db`. Schema is versioned with Flyway. Connection pragmas: `journal_mode=WAL`,
`foreign_keys=ON`, `busy_timeout=5000`.

**Consequences.** The archive is a single portable file, easy to back up. SQLite's type affinity
demands care with `Instant` storage (store ISO-8601 text or epoch millis consistently). If tooling
friction appears, **H2 file mode is the accepted fallback** and requires a new ADR — not a quiet switch.

---

## ADR-002 — Merge commits only, append-only history

**Date**: 2026-10-15 · **Status**: Accepted

**Context.** The project owner requires a lossless history: no information may disappear, and work must
be traceable commit by commit for review.

**Decision.** History is append-only. No `rebase`, no `--force`/`--force-with-lease`, no `filter-branch`,
no amending pushed commits, no squash merges. Feature branches merge into `develop` with **merge commits**;
the sprint release merges `develop` into `main` with a merge commit.

**Consequences.** The history is noisier than a squashed one, and this is deliberate: every intermediate
commit survives. Branches must be kept reasonably small and rebased *by construction* (branch from a
fresh `develop`, merge `develop` in when behind). CI must tolerate merge commits.

---

## ADR-003 — GitFlow-lite with protected `main` and `develop`

**Date**: 2026-10-15 · **Status**: Accepted

**Context.** Work happens in sprints, one story per branch, with PR-based review, but there is a single
human owner (no second approver available for required reviews).

**Decision.** Two long-lived branches: `main` (released, tagged `sprint-NN`) and `develop` (integration).
Both are protected: pull requests required, direct pushes and force-pushes blocked, deletion blocked,
admins included. **No approving review is required**, because the owner merges their own agent's PRs;
the review gate is a process step (`code-reviewer` + `qa-verifier` evidence) rather than a GitHub
approval. Feature branches: `feature/<epic>-<story>-<slug>`.

**Consequences.** The owner (or agent) can self-merge — discipline lives in the DoD and the hooks, not
in GitHub's approval counter. If collaborators join later, adding a required approval is a one-line
change to the protection rule.

---

## ADR-004 — TanStack Query as the frontend data layer

**Date**: 2026-10-15 · **Status**: Accepted

**Context.** The frontend needs caching, retries, and cache invalidation after uploads/publishes. The
spec mandates React + Vite + Tailwind + Framer Motion + `@dnd-kit` but leaves the data layer open.

**Decision.** Use **TanStack Query** with a small typed `api/client.ts` (fetch-based). Query keys are
centralised in `api/queryKeys.ts`. Server state lives only in the query cache; component `useState` is
reserved for ephemeral UI state.

**Consequences.** One dependency for robust data handling; no global store needed (no Redux/Zustand).
The optimistic-publish UX in E4-S5 relies on cache updates and rollback, which the library supports.

---

## ADR-005 — Fontsource NPM packages for typography

**Date**: 2026-10-15 · **Status**: Accepted

**Context.** The owner requires elegant typography installed **strictly locally** so the app makes zero
external network requests. Fontsource publishes open-source fonts as self-hostable NPM packages.

**Decision.** Typography ships as Fontsource packages imported from the frontend entry file (Vite
self-hosts and fingerprints the files). Baseline pair: **Playfair Display** (`@fontsource/playfair-display`)
for display serif (Dump titles, month/year markers) and **Inter variable** (`@fontsource-variable/inter`)
for UI sans (menu, controls). The pair is confirmed or replaced in a dedicated ADR at E2-S5, with the
final choice recorded in `docs/engineering/DESIGN-SYSTEM.md`. Typographic variables (`--font-display`,
`--font-ui`, scale, weights) live in `frontend/src/styles/global.css`.

**Consequences.** No CDN, no `<link>` to Google Fonts, works offline and on the LAN. Payload budget:
under ~200 KB added. Adding a third family or a weight needs a reason in the PR.

---

## ADR-006 — Image-derived theme colours at runtime

**Date**: 2026-10-15 · **Status**: Accepted

**Context.** The owner's mandate: *"conceive a dominant-colour extraction algorithm over uploaded images
and generate a Dark Glassmorphism CSS theme based on those hues"*. Colours must therefore be computed
locally from the user's own images, not hardcoded.

**Decision.** Implement extraction in pure TypeScript under `frontend/src/lib/color/`:
downscale to ≤ 64 px → convert to **OKLCH** → weighted clustering (k-means++ seeding, deterministic) →
score (drop near-black/near-white, weight by coverage and chroma) → 5–8 colours with weights and roles.
`theme.ts` maps the palette to semantic `--aura-*` custom properties applied on `:root`, with contrast
enforcement (≥ 4.5:1) and a neutral fallback palette. Algorithms choices (k-means vs median cut) and
measured timings are recorded as a follow-up ADR during E2-S4.

**Consequences.** The app's identity is generated per user, no assets to maintain, fully offline.
Extraction must be deterministic and fast (< 50 ms for 64 px) and is unit-tested with fixture images.
Dumps additionally store an explicit `backgroundColor` chosen in the workshop, so the river's ambient
colour does not depend on re-running extraction at render time.

---

## ADR-007 — Scrum artefacts in-repository

**Date**: 2026-10-15 · **Status**: Accepted

**Context.** The owner wants a serious, auditable process: sprint planning, backlog, retrospectives,
visible to a human, executed by an agent across many sessions.

**Decision.** Scrum artefacts live **in the repository**, versioned with the code:
`docs/scrum/PRODUCT-BACKLOG.md` (canonical), `docs/scrum/sprints/sprintNN.md`, `retrospectives/sprintNN.md`,
plus the playbook, DoD and DoR. GitHub issues/labels/milestones are a **mirror**, synced by `/backlog-sync`;
the file always wins. Sprint closes produce a retro file the user can read without opening GitHub.

**Consequences.** Process changes are reviewable PRs; the repo is self-contained; GitHub drift is
acceptable as long as the sync skill runs. Issues are never the only home of a requirement.

---

## ADR-008 — No Spring Security for v1

**Date**: 2026-10-15 · **Status**: Accepted

**Context.** Aether Archive is single-user, local-network only, and the spec defines no authentication.
Adding Spring Security would add a login surface to an app whose whole point is frictionless opening.

**Decision.** No authentication/authorization layer in v1. Threat model focuses on **data safety**
(uploads, paths, backups — see `.claude/rules/security.md`) rather than remote attackers. The backend
binds to the LAN; CORS is restricted to the configured origins; actuator exposure is minimal.

**Consequences.** Anyone on the same network can reach the app — accepted for a personal LAN. If the
app is ever exposed beyond the LAN, this ADR must be superseded first (auth + TLS), and the change
recorded. Revisit at E6-S5.

---

## ADR-009 — PostgreSQL as the database

**Date**: 2026-10-15 · **Status**: Accepted (supersedes [ADR-001](#adr-001--embedded-sqlite-as-the-database))

**Context.** The original spec mandated an embedded, file-based database (SQLite or H2). The owner has
since changed the requirement: the database is **PostgreSQL**, decided together with the mandate that the
whole stack ships containerized at v1.0 (ADR-010). Docker is already part of the toolchain (MCP gateway;
the database service below), the app stays single-user and local, and a database *server* is therefore
acceptable as long as it runs on the owner's machine.

**Decision.** Use **PostgreSQL 17** (`postgres:17-alpine`), one server for development and release. Dev
runs it as a Docker Compose service (`docker-compose.dev.yml`, E1-S11); Spring Data JPA (plain
`org.postgresql:postgresql`, no community dialect) reads the connection from env (`POSTGRES_*`,
`AETHER_DB_PORT`). Schema is versioned with Flyway (`ddl-auto=validate`, never `update`). Integration
tests use **Testcontainers** with the same image tag — no test depends on a pre-running database. The
H2/SQLite fallback is dropped; `aether.db` no longer exists.

**Consequences.** No SQLite friction (type affinity, community dialect, pragmas) — Postgres types are
native (`uuid`, `timestamptz`). The database is **not** part of `AETHER_DATA_DIR` anymore: its data lives
in a Docker volume, and backup becomes `pg_dump` + a copy of the images (E6-S7 updated). Docker must be
running for backend work. The spec was updated in the same change, with the owner's explicit approval
(2026-10-15). Embedded databases are no longer an option: any further database change needs a new ADR.

---

## ADR-010 — Containerized delivery for v1.0

**Date**: 2026-10-15 · **Status**: Accepted

**Context.** The owner's requirement: the whole application must be dockerized at the end of the project
("at the end, dockerize everything"). Docker is already present in the toolchain (ADR-009 database
service, MCP gateway). The app is single-user, opened from a phone on the LAN, and v1.0 should start with
one command on a machine without Java or Node installed.

**Decision.** v1.0 ships as a **Docker Compose stack** (`compose.yml`, E6-S11/S12): `db`
(`postgres:17-alpine`), `api` (multi-stage Maven → Temurin 21 JRE running the Spring Boot jar), `web`
(multi-stage Node build → nginx serving the built SPA and reverse-proxying `/api/**` and `/images/**`
to `api`). Single published port: `web` on **3000** (the phone URL from the spec) — one origin, so CORS
is configurable but unused in the containerized runtime. Database data in the named volume
`aether_pgdata`; images in a bind mount of `AETHER_DATA_DIR`. Pinned base tags (never `:latest`),
non-root users, healthchecks, configuration exclusively from `.env`. Development keeps native toolchains
with only the database containerized. Full target spec: `docs/engineering/DEPLOYMENT.md`; verified from
a clean clone in E6-S12.

**Consequences.** The v1.0 runbook becomes `docker compose up`; `./mvnw`/`npm` remain the development
path. Registry publishing, remote deployment, TLS and auth stay out of scope (ADR-008) and would need
new ADRs.

---

## ADR-011 — API contract clarifications for Sprint 1

**Date**: 2026-10-15 · **Status**: Accepted

**Context.** Two canonical documents describe the HTTP contract and they do not agree. `_docs/openapi.yml`
defines `/photos` (GET, POST), `/photos/random` (GET) and `/dumps` (GET, POST); the narrative
`_docs/aether_archive_specs.md` still lists `/api/v1/archives/random`, `/archives/river`, `/archives/dump`
and `/archives/single` — in §4.2 and again in the phase list of §5, which later frontend stories read.
Separately, `DumpCreate.title` is listed as `required` in
`openapi.yml`, while the domain model (`_docs/aether_archive_specs.md` §4.1: "title … nullable"), the
backlog (E1-S7 `title?`, E4-S5 "title (optional)") and the workshop flow all treat it as optional. The
`Photo` schema also exposes `uploadedAt` and `category`, which are not among the entity fields listed in
`.claude/rules/backend.md`. `_docs/` is read-only, so the divergence is resolved here instead of by
editing the specs.

**Decision.**

1. **`_docs/openapi.yml` is the API contract of record.** Sprint 1 implements `/api/v1/photos` (GET, POST),
   `/api/v1/photos/random` (GET) and `/api/v1/dumps` (GET, POST). Every `/api/v1/archives/*` reference in
   the narrative spec (§4.2 and §5) is superseded and is not implemented.
2. **`title` is optional on `DumpCreate`** (null when absent, ≤ 80 characters when present). Accepting a
   request *without* a title is a strict superset of the *accepted request bodies*: OpenAPI's `required`
   list is a constraint on what clients send, and relaxing it server-side cannot break a conforming
   client — every request OpenAPI describes still succeeds.
3. **An upload creates an *unassigned* photo**: `archiveItem` and `displayOrder` are null until the curator
   publishes a dump, which is when the `ArchiveItem` (`MONTHLY_DUMP`) is created and the six photos are
   attached in order. This matches the `Photo` schema of `openapi.yml` and the workshop flow (E4-S1/S5).
   The curation order is **expressed by the position of each photo in `Dump.photos`** — the contract's
   `Photo` schema has no `displayOrder` field, so no such field is added to responses; `displayOrder` is
   persisted server-side and used to build the ordered array.
4. **`Photo` carries `createdAt` (Instant, UTC) and `category`** in addition to the fields listed in
   `.claude/rules/backend.md`, because the contract exposes `uploadedAt` and `category` on every photo
   response. Wire format, stated once so no implementer has to guess:
   - `category` is serialised with the contract's **lowercase** values — `pics | anime | dump |
     uncategorized`; the Java enum constants are `PICS | ANIME | DUMP | UNCATEGORIZED` and map to those
     wire values explicitly (the persistence column stores the enum name).
   - `POST /api/v1/photos` **requires** `category` and accepts all four values (E1-S6 names `pics|anime`
     because those are the two the workshop sends); a missing or unknown value is a 400. The default
     `UNCATEGORIZED` applies only to photos created without an explicit category by later server-side
     flows, never to an upload omitting the field.
   - `createdAt` is serialised as `uploadedAt` (ISO-8601 UTC) on `Photo`, and the dump's item timestamp as
     `createdAt` on `Dump` — the Java field names differ from the JSON names by design.
   - `Photo.url` is the **relative** static path `/images/<uuid>.<ext>` (never an absolute path, never a
     filesystem location). Serving that path is E1-S5, in Sprint 2; Sprint 1 stores and returns the path.

**Consequences.** Sprint 1 has one unambiguous contract to implement and test against, and reviewers have a
written reason for the two readings that could otherwise look like improvisation. `ArchiveItem.type` keeps
all three values (`SINGLE_PIC | ANIME | MONTHLY_DUMP`) even though only `MONTHLY_DUMP` is created in
Sprint 1 — single-photo items arrive with the river feed (E5-S1). Any future change to the paths, to the
`title` requirement, or to the on-upload assignment model re-opens this ADR; the stale `archives/*` text
stays as it is until the owner approves a spec revision.

---

## ADR-012 — Storage and CORS constraints

**Date**: 2026-10-15 · **Status**: Accepted

**Context.** E1-S2 binds and validates the configuration before anything else runs, and the specs name
the keys (`_docs/aether_archive_specs.md`, `.env.example`) without fixing their accepted values: the
upload ceiling, what counts as a valid CORS entry, and how far `AETHER_DATA_DIR` may point. Without a
record, each review round re-argues the same bounds.

**Decision.**

1. **Uploads**: `AETHER_MAX_UPLOAD_MB` is inclusive 1–1024; a value outside stops the boot. The ceiling
   is a sanity bound, not a storage policy.
2. **CORS**: `AETHER_CORS_ALLOWED_ORIGINS` is a comma-separated list of Spring origin *patterns*;
   wildcards inside a host are supported (`http://192.168.*.*:5173`). A bare `*` and a host that is only
   `*` (`https://*`) are rejected at boot — Spring resolves both to "every origin", which would silently
   disable the restriction. An empty value disables cross-origin access entirely; a blank entry next to
   another one (stray comma) is an error, never "disabled".
3. **Data directory**: `AETHER_DATA_DIR` must be absolute, must not be the filesystem root and must not
   be the user's home directory — the boot creates `images/`, `thumbnails/` and `tmp/` there and empties
   `tmp/`. A symlinked data directory (e.g. `~/AetherArchive_Data -> /mnt/archive`) is supported, but
   `tmp/`, whose contents the boot deletes, must be a real directory and not a symlink.

**Consequences.** Boot fails early with an actionable message instead of writing into a location the
operator did not mean. Wildcard CORS patterns stay usable on a LAN with a dynamic IP. A future story
that needs a different upload ceiling, a non-pattern CORS entry or a symlinked staging directory must
supersede this ADR first (e.g. `tmp/` on another volume would need an explicit allow-list, not silence).

**Amendment — 2026-10-15 (E1-S4).** Point 3 covered only `tmp/`, the directory whose contents the boot
deletes. For the *write* path the rule is now uniform: `images/` and `thumbnails/` may be symlinks, but a
link whose **real** path leaves the real data directory is refused whenever the archive writes through it,
because the files would then live outside the tree the backups copy. This is enforced per write in
`StorageService` (every path resolved with `toRealPath()` and proved to start with the data root), not at
boot, so an existing archive keeps starting. The upload ceiling of point 1 is also enforced twice: at the
servlet container (`spring.servlet.multipart.max-file-size`, wired to the same `AETHER_MAX_UPLOAD_MB`) and
in the service while streaming, so a request that under-reports its length still meets the ceiling.

---

## ADR-013 — The error vocabulary is a declared part of the contract

**Date**: 2026-10-15 · **Status**: Accepted

**Context.** E1-S8 gives every failure one RFC 9457 shape, but `_docs/openapi.yml` documents no error schema
at all (a single bare `400` on `POST /dumps`), and the standard leaves two things open that a client
depends on: whether each problem gets a `type` URI of its own, and whether `title` is the status phrase
(§4.2.1 says it *should* be). The codes are what the frontend switches on, so they cannot be left to drift.

**Decision.** The codes are part of the contract, listed in `backend/README.md`: the archive's own
situations have one each — `unsupported-image-type`, `upload-too-large`, `storage-failure`,
`validation-failure`, `invalid-parameter`, `malformed-request`, `missing-request-part`, `not-found`,
`internal-failure`. A refusal Spring MVC raises before a controller runs (405, 406, 415, a missing required
parameter) borrows its code from the status instead: the status name in kebab-case —
`method-not-allowed`, `bad-request`, `unsupported-media-type` — or `request-rejected` when no `HttpStatus`
name describes the status. A refusal the archive raises itself keeps its own `detail` and, when its problem
detail set one, its own `code`.

1. **`type` stays `about:blank` for every problem** — no per-problem type URIs. A type URI promises
   documentation at that URI; the archive has no error-documentation site and is not getting one, and
   sending a client to a URI that answers nothing is worse than the standard's "nothing more to say about
   this problem". Identity lives in `code`: short, stable, in the body, switchable in a frontend.
2. **`title` names the situation, not the status.** RFC 9457 §4.2.1 *recommends* the status phrase; we
   depart from it deliberately, because "Validation failed", "Malformed request" and "Not found" tell a
   reader which failure this is, while the status is already in `status` — and there is more than one 400.
   The borrowed refusals keep the framework's phrase (`Method Not Allowed`), which is all the framework
   says about them.

**Consequences.** Renaming a code, or changing its status, is an API change that needs an ADR — not a
refactor. A new situation adds its code to the README table in the same change; nothing needs a spec
revision until `_docs/openapi.yml` grows an error schema, which is itself a contract change needing the
owner's approval (`_docs/` is read-only, ADR-011). Clients switch on `code`, never on `title` or `detail`,
which the archive may reword.

---

## Template for new ADRs

```markdown
## ADR-NNN — <short title>

**Date**: YYYY-MM-DD · **Status**: Proposed | Accepted | Superseded by ADR-NNN

**Context.** What forces are at play, what the specs say, what is open.

**Decision.** What we will do, precisely.

**Consequences.** What becomes easier, harder, forbidden; what would need a new ADR.
```
