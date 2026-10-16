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
| [ADR-014](#adr-014--tailwind-css-v4-configured-css-first) | 2026-10-16 | Tailwind CSS v4, configured CSS-first | Accepted |
| [ADR-015](#adr-015--typescript-603-while-the-lint-stack-cannot-parse-7) | 2026-10-16 | TypeScript 6.0.3 while the lint stack cannot parse 7 | Accepted |
| [ADR-016](#adr-016--the-frontend-reaches-the-api-on-its-own-origin) | 2026-10-16 | The frontend reaches the API on its own origin | Accepted |
| [ADR-017](#adr-017--the-css-foundation-declared-inputs-runtime-only-colour-one-definition-per-scale) | 2026-10-16 | The CSS foundation: declared inputs, runtime-only colour, one definition per scale | Accepted |
| [ADR-018](#adr-018--the-clustering-algorithm-and-the-pipelines-open-readings) | 2026-10-16 | The clustering algorithm and the pipeline's open readings | Accepted |

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
`empty-archive`, `internal-failure`. A refusal Spring MVC raises before a controller runs (405, 406, 415, a
missing required parameter) borrows its code from the status instead: the status name in kebab-case —
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

**Amendment — 2026-10-16 (E1-S6).** `empty-archive` joins the vocabulary as the first code an endpoint
raises for a *legitimate* request that has no answer: `GET /photos/random` on an archive with no photos. It
is deliberately distinct from `not-found`, which means the client asked for something that does not exist —
the splash screen has an empty state for one and a bug for the other. It is carried by
`EmptyArchiveException`, which extends `ErrorResponseException` so the archive's own sentence survives the
refusal path unchanged.

**Amendment — 2026-10-16 (E1-S7).** `concurrent-modification` joins the vocabulary as its first *conflict*
code, answered with **409**. `DumpService.create` attaches six photos in one transaction, and `Photo`
carries a `@Version` (E1-S7) precisely because a publish and another write can want the same row: Spring's
`ConcurrencyFailureException` family — `ObjectOptimisticLockingFailureException` when the row's version
moved on, `PessimisticLockingFailureException` when a lock could not be taken — is raised while the
transaction is still open, so the write that lost the race rolls back whole and **the archive is intact**.
That is what decides the status: a `500` would report a server that is fine and send the owner looking for a
bug, and a `400` would blame a request that was perfectly valid — it was merely overtaken. The client's
repair is neither "fix the body" nor "report a bug" but "read the row again and retry", which is what 409
means and what the `detail` says. One code covers both mechanisms, because the client cannot tell them
apart and has nothing different to do about either; the framework's own message names the entity and the
row, so it is logged for the operator and never answered. It is the vocabulary's first code of its status;
should a future conflict ever demand a different answer from the client, it gets its own code and its own
amendment rather than a widened meaning for this one.

---

## ADR-014 — Tailwind CSS v4, configured CSS-first

**Date**: 2026-10-16 · **Status**: Accepted

**Context.** The stack table mandates "Tailwind CSS" without a version ([`CLAUDE.md`](../../CLAUDE.md) §2),
and the Sprint 2 plan names the gap: v3's `tailwind.config.js` and v4's CSS-first `@theme` decide how
E2-S3, E2-S5 and E2-S6 write every style, so an implicit choice inside a config file would make four
stories guess (`docs/scrum/sprints/sprint02.md`, Risks). The design system constrains the answer: all
colour is read from CSS custom properties applied at runtime (`--aura-*`, DESIGN-SYSTEM §2.2), typography
from `--font-*` (§4.3), and "a hex literal outside the theme layer is a review blocker" (§2.2). Two facts
were measured, not assumed: `tailwindcss@4.3.3` is current and `@tailwindcss/vite@4.3.3` declares
`peerDependencies: { vite: "^5.2.0 || ^6 || ^7 || ^8" }`, so the plugin fits the Vite 8.3.4 the same story
pins; and **6.14 kB of CSS (2.01 kB gzip)** is what the placeholder page ships, i.e. the plugin only emits
utilities it finds in use.

**Decision.** Tailwind **v4.3.3** as a **CSS-first** install: the `@tailwindcss/vite` plugin in
`frontend/vite.config.ts`, `@import "tailwindcss";` at the top of `frontend/src/styles/global.css`, and
**no `tailwind.config.js` anywhere in the repository**. Design tokens are declared in CSS:

- Colour and type values that change at runtime stay plain CSS custom properties on `:root`
  (`--aura-bg`, `--aura-text`, `--font-display`, …), because the River rewrites them per view
  (DESIGN-SYSTEM §2.3) and a theme variable declared inside `@theme` is not meant to be rewritten.
- Tailwind utilities are generated for them through `@theme inline { --color-aura-bg: var(--aura-bg); … }`,
  which is the v4 pattern for a token whose value is itself a variable. This is the shape E2-S3 follows for
  the `--aura-*` set and E2-S5 for `--font-*`; the exact token names and the namespace mapping are E2-S3's
  to fix, and it may supersede this ADR if the runtime-theming requirement is better met another way.

**Consequences.** To add a utility one declares a theme variable — no JS config file exists to edit, and a
token invented inside a component is a review failure by construction. `@theme` must stay top-level (not
nested in a selector or media query), and only *used* theme variables reach the bundle unless a block is
marked `@theme static`. **v4's source detection has no scope by default:** it scans the whole project root
(ignoring only what `.gitignore` excludes), and that includes documentation — the word "static" in a
sentence in `frontend/README.md` emitted `.static{position:static}` into the stylesheet, confirmed by
removing the word and rebuilding (0 occurrences, then 1 again). Documentation prose therefore ships
utilities: a documentation-only edit that adds or removes such a word changes the stylesheet and its content
hash with no component change, so a rebuilt CSS hash after a README edit is expected rather than a bug.
Scoping the scan (`@source` / `source(none)`) is E2-S3's. Two
further questions this ADR deliberately leaves open for E2-S3: whether to wipe Tailwind's default palette
(`@theme { --color-*: initial; }`) so a raw palette colour like `bg-red-500` cannot compile at all, and
whether to add `prettier-plugin-tailwindcss` for class sorting (a dependency needs a story that asks for
it). The scaffold's placeholder in `src/app/App.tsx` uses default palette utilities precisely because the
token layer does not exist yet; E2-S3 replaces them.

**Evidence (E2-S1).** Final `npm run build` before the story was closed → `dist/index.html 0.59 kB`,
`dist/assets/index-*.css 6.14 kB │ gzip: 2.01 kB`, `index-*.js 219.96 kB │ gzip: 68.80 kB`; `npm run lint`,
`npm run test` (2 tests), `npm run format:check` and `tsc -b` green with the v4 setup in place, and
`npm ci` audits **0 vulnerabilities** across 270 packages.

---

## ADR-015 — TypeScript 6.0.3 while the lint stack cannot parse 7

**Date**: 2026-10-16 · **Status**: Accepted

**Context.** E2-S1 requires linting with unused-import and import-order rules, which in this repository
means `typescript-eslint` (no v9 line is published; `8.71.2` is `latest`). The registry's `typescript`
`latest` is **7.0.2**, but `typescript-eslint@8.71.2`, `@typescript-eslint/parser@8.71.2` and
`@typescript-eslint/utils@8.71.2` all declare `peerDependencies: { typescript: ">=4.8.4 <6.1.0" }`.
Measured, not reasoned — a clean install of the pair fails:

```text
$ npm install --dry-run typescript@7.0.2 typescript-eslint@8.71.2 eslint@10.12.0
npm error code ERESOLVE
npm error While resolving: probe@0.0.0
npm error Found: typescript@7.0.2
npm error Could not resolve dependency:
npm error peer typescript@">=4.8.4 <6.1.0" from typescript-eslint@8.71.2
```

`--legacy-peer-deps` would install a combination the linter does not support, and the security rules put
dependency discipline above convenience.

**Decision.** Pin **TypeScript 6.0.3** — the newest stable version inside the peer range — and keep the
lint stack. Every other package in the story is at its current major (Vite 8.3.4, React 19.3.1, Vitest
5.0.5, ESLint 10.12.0, jsdom 30.1.3).

**Consequences.** The strict flags the story requires are available and proven to bite on this version
(`noUncheckedIndexedAccess` → `TS18048: 'first' is possibly 'undefined'`; `exactOptionalPropertyTypes` →
`TS2375`), so nothing the project needs is missing today. Upgrading to TypeScript 7 means waiting for a
`typescript-eslint` release whose peer range accepts it, then a one-line version bump plus a fresh
`npm run lint` / `tsc -b` / `npm run test` / `npm run build` — a story that does it records that evidence,
and does not silently use `--legacy-peer-deps`.

---

## ADR-016 — The frontend reaches the API on its own origin

**Date**: 2026-10-16 · **Status**: Accepted

**Context.** E2-S2 gives the app its data layer, and the API base URL has three candidate shapes: a
relative path resolved against whatever served the SPA, an absolute URL configured per environment, or
cross-origin calls with CORS (bounded by ADR-012). Two constraints decide between them: `Photo.url` is
a **path** (`/images/<uuid>.<ext>`, ADR-011 and `_docs/openapi.yml`), so an app on a different origin
than the API cannot render photos without a second rewrite; and the product is used from a phone on
the LAN, where "localhost" means the phone.

**Decision.** The base URL is **empty** by default. The client requests relative paths under `/api/v1`,
and the SPA is served on the same origin as the API in every environment: the Vite dev server proxies
`/api/v1` and `/images` to `VITE_API_PROXY_TARGET` (default `http://localhost:8080`), and the
container's nginx proxies the same prefixes to the `api` service (ADR-010). `VITE_API_BASE_URL` —
declared in `frontend/src/vite-env.d.ts`, documented in `.env.example` — remains as an escape hatch for
a client that must call an API elsewhere: it takes an **absolute origin, no `/api/v1` suffix**, because
the client adds the prefix itself. The key is read from the repository-root `.env`: Vite's `envDir`
points there, the same file compose and the backend read. E2-S2's review probe found the escape hatch
had been a silent no-op while Vite read only `frontend/`; the wiring was corrected, and the probe then
measured both the client value and the dev proxy arriving from that file (review response in
`reports/verify-e2-s2-20261016.md`).

**Measured (E2-S2).** Through the dev server with a backend on `:8099`: `GET /api/v1/photos` → `200`
and `GET /images/<uuid>.png` → `200 image/png`. With the suffixed form (`…:8099/api/v1`) the app
requested `…/api/v1/api/v1/photos` → `404` — the probe caught it before any test did, `.env.example`
was corrected, and a test now pins the composition (`api/client.test.ts`).

**Consequences.** No CORS is needed on the default path, no per-device URL configuration exists for the
phone, and photos render from the origin that served the page. A deployment that genuinely serves the
SPA and the API on different origins must also rewrite `Photo.url` and open CORS — that is a new ADR,
not a config tweak. `npm run preview` serves the built bundle without the dev proxy; previewing against
a real API is the container's job.

---

## ADR-017 — The CSS foundation: declared inputs, runtime-only colour, one definition per scale

**Date**: 2026-10-16 · **Status**: Accepted

**Context.** ADR-014 chose Tailwind v4 CSS-first and deliberately left three questions to E2-S3: the
scan scope (`@source` / `source(none)`), whether to empty the default palette, and the shape of the
`--aura-*` token layer. The first answer was forced by a measurement: with automatic detection,
`frontend/README.md` was a build input — a sentence containing `w-[43px]` shipped a rule and moved the
CSS hash (`index-p6vokHjt.css`, 6.38 kB → `index-B7cX_O_f.css`, 6.40 kB; E2-S1 review, reproduced in
`reports/verify-e2-s3-20261016.md` before the fix).

**Decision.** `frontend/src/styles/global.css` is the foundation, in four blocks:

1. **Scan scope, declared.** `@import "tailwindcss" source(none);` turns discovery off; explicit
   `@source` globs — `src/**/*.ts`, `src/**/*.tsx`, `index.html` — are the entire candidate set. The
   entry HTML is kept because it is a build input that can carry class names, and dropping it would be
   a silent failure waiting to happen; even markdown inside `src/` is excluded, because a document is
   not an input. A new top-level input that can carry classes must be registered in `global.css` (the
   frontend rule names it).
2. **Theme.** `--color-*: initial` empties the default palette, so a raw palette colour cannot compile
   (probe: `bg-red-500` → 0 occurrences); the `--aura-*` runtime palette is mapped with `@theme inline`
   so utilities resolve `var(--aura-*)` at use — ADR-014's shape. The fluid `--text-*` scale (§4.3) and
   the `--tracking-*` tokens live in `@theme` too, defined once for utilities and raw CSS alike, and
   the default scale is emptied so an off-scale size cannot compile either (probe: `text-3xl` → 0).
3. **Runtime tokens.** The neutral fallback palette values, the `--safe-*` insets (`env(…, 0px)`) and
   the 4 px `--space-*` rhythm are plain custom properties on `:root`. Contrast measured (WCAG 2.x):
   text/bg 15.79:1, muted/bg 6.40:1, accent-contrast/accent 8.46:1.
4. **Base.** `html` carries the page colour and `overscroll-behavior: none`; `body` is a flex column
   padded once by the safe insets with `min-height: 100dvh`; `#root` and the views fill what the insets
   leave (`flex-1`), so no view repeats `100dvh` and insets never add scroll. Every scrollbar is
   hidden; the reduced-motion guard freezes animations at their end state and leaves movement
   transitions to the `motion-safe:` / `motion-reduce:` variants at the component level.

**Consequences.** A document edit no longer moves the CSS hash and the build's inputs are finite and
reviewable; colour in components can only come from the runtime palette; each scale has one definition
serving utilities and variables. Tailwind emits `@theme` variables lazily — only used steps ship, and
a `var(--token)` reference anywhere in compiled CSS counts as a use (probe), which is what keeps raw
consumers like the future `glass.css` working. `prettier-plugin-tailwindcss` is **not** added: no
story asks for the dependency, and the pin policy needs one (ADR-014's left-open question, answered).

**Evidence.** `reports/verify-e2-s3-20261016.md` — scan sentinels (README/TS/HTML), palette-wipe and
emission probes, the reduced-motion probe under `--force-prefers-reduced-motion`, and the 9-cell
overflow measurement with screenshots at 320/390/430.

---

## ADR-018 — The clustering algorithm and the pipeline's open readings

**Date**: 2026-10-16 · **Status**: Accepted

**Context.** `DESIGN-SYSTEM.md` §2.1 fixes the extraction pipeline's shape — decode → downscale ≤ 64 px
→ OKLab/OKLCH → weighted clustering → score & filter → 5–8 colours — and leaves three readings open:
which clustering algorithm ships as the default ("decided with measured numbers in an ADR during
E2-S4"), the exact curve of `midLightnessBonus(L)`, and the edge between "near-black/near-white" and
kept tones. The environment constrains the tests: jsdom implements no canvas at all (`OffscreenCanvas`,
`ImageData`, `createImageBitmap` undefined; `getContext("2d")` null — probe in the E2-S4 report), and
vitest 5.0.5 exports no `bench` API. So the pure pipeline is unit-tested in jsdom, `decode.ts` sits
behind an injectable dependency interface, the real decode path is proven by an offline Chromium probe,
and the measurements come from a probe test over the shipped modules.

**Decision.** All three readings, implemented in `frontend/src/lib/color/`:

1. **k-means++ is the default** (`DEFAULT_ALGORITHM = "kmeans"`); median cut ships beside it,
   selectable via `extractPalette(image, { algorithm: "median-cut" })` and held to the same suite.
   On the measured runs (synthetic jittered photo, 45% rust / 30% teal / 15% sand / 10% near-black;
   Node 22.23.3; full JSON in the report):
   - **time** — everything inside §2.1's 50 ms budget with room: clustering of 4,096 px in 7.6 ms
     (median cut 6.6 ms), full pipeline 8.2 ms for 64 px / 10.7 ms for a 512 px input downscaled
     (median cut 10.5 ms / 15.6 ms — k-means++ ahead on the pipeline, where it matters);
   - **region fidelity** — k-means++ centroids are means of real pixel subsets, so every returned hex
     exists in its source region; median cut can blend a mixed box into a colour absent from the image
     (measured: `#cf855c`, between rust and sand). A theme built on invented blends misrepresents the
     photo's masses;
   - **dominant mass survives splitting** — k-means++ describes the textured rust region as three real
     tones whose weights sum to its true 0.45 (pinned by a unit test at ≥ 0.40). Median cut's better
     top-1 metric on the same probe (ΔE 0.003 vs 0.24 to the rust centre) is the flip side of that
     blending: it folds a heterogeneous region into one centroid. If a later story judges top-1
     dominance the more valuable property, the switch is one line plus the suite.
2. **`midLightnessBonus(L) = 1 − |L − 0.5|`** — 1.0 at mid lightness, 0.62 at the darkest permitted
   tone (L = 0.12), 0.55 at the brightest (L = 0.95). §2.1 names the bonus without its curve; this
   curve stays within [0.55, 1] and so never outvotes a difference in mass.
3. **Near-black/near-white are §2.1's lightness bounds, exactly**: `L < 0.12` and `L > 0.95` in
   OKLab. A tone inside a bound is kept by design — a test pins `#08080a` (L ≈ 0.135) as kept.
4. **Adaptivity.** Without an explicit `k`, the pipeline starts at k = 8 and retries twice (k = 10,
   then 12, never above the pixel count) when filters and merges leave fewer than five colours.
   Degenerate inputs — a solid bitmap, one hue, a fully transparent image — return their few real
   colours rather than invented ones; the palette is honest, not padded to five.
5. **Decode.** `decodeToPixels` uses `createImageBitmap` + `OffscreenCanvas`, pre-sizes in one
   aspect-preserving draw (never upscales) and funnels every failure into `PaletteExtractionError`:
   `"decode-failed"` for bytes no browser decoder accepts, `"unsupported"` for an environment without
   the APIs. No image library, no network, and no dependency added (`package.json` and lock are
   untouched from `bf12bb0`).

**Consequences.** The suite runs pure in jsdom with no browser-runner dependency; the browser edge is
proven by the offline Chromium probe with real canvas-rendered PNGs (dominant hue, grayscale,
transparent, corrupted, 512² pre-size). Roles and contrast stay with `theme.ts` in E2-S6 — E2-S4 ships
the scored palette only, as recorded on issue #23. Changing the default algorithm or the bonus curve
later is a new ADR, not a silent edit.

**Evidence.** `reports/verify-e2-s4-20261016.md` — environment probe, the 44-test colour suite
(100 repo-wide), the timing/quality JSON, and the Chromium probe JSON.

---

## Template for new ADRs

```markdown
## ADR-NNN — <short title>

**Date**: YYYY-MM-DD · **Status**: Proposed | Accepted | Superseded by ADR-NNN

**Context.** What forces are at play, what the specs say, what is open.

**Decision.** What we will do, precisely.

**Consequences.** What becomes easier, harder, forbidden; what would need a new ADR.
```
