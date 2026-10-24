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
| [ADR-019](#adr-019--typography-playfair-display--inter-variable-latin-subsets-1482-kb) | 2026-10-16 | Typography: Playfair Display + Inter Variable, latin subsets, 148.2 kB | Accepted |
| [ADR-020](#adr-020--the-theme-layer-role-mapping-in-oklch-contrast-by-construction-one-glass-fallback) | 2026-10-16 | The theme layer: role mapping in OKLCh, contrast by construction, one glass fallback | Accepted |
| [ADR-021](#adr-021--the-splash-hero-a-photo-per-visit-read-once-and-what-the-placeholder-can-be) | 2026-10-16 | The splash hero: a photo per visit, read once, and what the placeholder can be | Accepted |
| [ADR-022](#adr-022--route-transitions-and-the-motion-vocabulary-css-keyframes-no-animation-library) | 2026-10-17 | Route transitions and the motion vocabulary: CSS keyframes, no animation library | Accepted |
| [ADR-023](#adr-023--the-aura-picker-the-chosen-page-colour-is-kept-the-glass-flips-suggestions-merge-by-pixel-share) | 2026-10-17 | The aura picker: the chosen page colour is kept, the glass flips, suggestions merge by pixel share | Accepted |
| [ADR-024](#adr-024--the-draft-survives-its-upload-the-workshop-keeps-the-six-it-stored-and-the-publish-reads-them-in-order) | 2026-10-18 | The draft survives its upload: the workshop keeps the six it stored, and the publish reads them in order | Accepted |
| [ADR-025](#adr-025--the-feed-reads-the-archive-whole-two-queries-no-pagination-yet-and-the-numbers-that-would-revisit-it) | 2026-10-19 | The feed reads the archive whole: two queries, no pagination yet, and the numbers that would revisit it | Accepted |
| [ADR-026](#adr-026--no-derivative-images-yet-originals-with-lazy-loading-colour-placeholders-revisit-with-e5-s4) | 2026-10-19 | No derivative images yet: originals with lazy loading, colour placeholders, revisit with E5-S4 | Accepted |
| [ADR-027](#adr-027--no-virtualisation-yet-300-item-dom-is-593-nodes-revisit-at-1-000-items) | 2026-10-19 | No virtualisation yet: 300-item DOM is 593 nodes, revisit at 1 000 items | Accepted |
| [ADR-028](#adr-028--editorial-redesign-image-first-responsive-layouts-and-cormorant-garamond--manrope) | 2026-10-19 | Editorial redesign: image-first responsive layouts and Cormorant Garamond + Manrope | Accepted |

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

**Amendment — 2026-10-16 (S03-C1).** The E1-S4 amendment above describes that enforcement as "every path
resolved with `toRealPath()` and proved to start with the data root", which is not what the write site does
and cannot be: an upload destination does not exist yet, and `toRealPath()` on it throws
`NoSuchFileException` (measured, S03-C1's review). What `StorageService.requireInside` actually does is
normalise the candidate lexically, resolve the *existing* directory chain through
`realDirectory`/`toRealPath()`, and refuse a candidate that normalises outside the root — which refuses `..`
and an `images/` or `tmp/` directory that is itself a link resolving outside the root, and accepts a leaf
that is itself a link. A link anywhere *else* in the candidate path is not resolved at all, so the guard
neither follows nor refuses it. That acceptance is deliberate: `Files.move` with `ATOMIC_MOVE` replaces the
link rather than following it (an `open`-style write such as `Files.writeString` would follow it instead),
and a delete removes the link rather than its target. The
invariant in `.claude/rules/security.md` is stated as the invariant for this reason; this line records what
the code does rather than what one description of it says.

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

## ADR-019 — Typography: Playfair Display + Inter Variable, latin subsets, 148.2 kB

**Date**: 2026-10-16 · **Status**: Accepted

**Context.** ADR-005 chose the baseline pair and deferred final confirmation to E2-S5, with two hard
constraints: everything self-hosted (no CDN, no runtime request), and added font payload under
~200 KB. DESIGN-SYSTEM §4.4 fixes the rest: display weights 400/500 only; UI weights 300/400/500;
no raw `font-family` in components; **latin subsets only**. The §4.2 import snippet predated the
packages, so E2-S5 measured every candidate reading before adopting one (full numbers in the
report).

**Decision.**

1. **The pair stands: Playfair Display (display) + Inter Variable (UI).** The consulted references
   (DESIGN-REFERENCES §6) back both halves: Typewolf notes Playfair's delicate, high-contrast
   strokes hinder readability at small sizes — it is a titles-only face by nature; Inter's neutral
   grotesque is the text face. Butterick: bold/italic as little as possible — hence two display
   weights, no italics shipped.
2. **Playfair ships as its packaged latin entrypoints** — `latin-400.css` + `latin-500.css`,
   imported from `main.tsx` before `global.css`. Each face brings a woff2 and a legacy woff:
   21,856 + 26,900 B (400) and 23,048 + 28,100 B (500) = 99,904 B.
3. **Inter Variable ships as its packaged latin woff2 behind one hand-written `@font-face`**
   (`global.css`, block 2): the package exposes no per-subset CSS (all seven subsets ride in every
   entrypoint; `wght.css` alone weighs 218,512 B of woff2), and one 48,256 B variable file carries
   the entire 100–900 axis — every UI weight §4.4 allows, including 300, in a single download. The
   static alternative (Inter latin faces) costs 109,916 B for two weights and 164,844 B for three,
   in as many files.
4. **Measured payload, shipped**: 148,160 B (148.2 kB) of font assets in `dist/` — 74% of the
   budget; the stylesheet grew 480 B (8,697 → 9,177 B) — the three `@font-face` rules, the
   `.font-display` utility, the theme variables and the `body` declarations; the entry chunk keeps
   its 283.41 kB (its hash moves once versus E2-S4 with the renamed lazy chunks). Rejected
   readings: §4.2-literal all-subsets = 453,384 B
   (453.4 kB); variable Inter all-subsets + Playfair latin = 318,416 B (318.4 kB); all-static latin
   = 209,820 B (209.8 kB — over budget read either as 200 kB or 200 KiB).
5. **Wiring.** The families are declared once in `@theme static` in `global.css` — values are
   static, so they live in the theme layer where the utilities compile from the same declaration;
   `static` makes emission unconditional by construction (measured in review: byte-identical
   output with and without the keyword on the pinned Tailwind — it stays as intent). `body` reads
   `var(--font-ui)` + `--tracking-ui`; the three placeholder `h1`s carry `font-display`. No
   component declares a raw `font-family`.
6. **Probe-verified on the built app** (offline Chromium, `--dump-dom`): the `h1` computes
   `"Playfair Display", Georgia, "Times New Roman", serif` at weight 400 with −0.015em tracking;
   body and UI paragraphs compute the Inter Variable stack with +0.01em; every declared face loads
   (Playfair 400/500; Inter Variable answers both 300 and 700 from the one file); zero external
   requests, zero console errors.

**Consequences.** The legacy `woff` twins (55,000 B) ride inside the packaged Playfair entrypoints
— accepted, because hand-writing those `@font-face`s would buy 55.0 kB but cost the upstream
import; the budget does not require it. The Inter `@font-face` points at a packaged, hashed path,
so a package update that renames files breaks the build loudly, never at runtime. Adding a display
weight or an italic is one import + a line here; adding a non-latin subset breaks §4.4 and needs a
new ADR. Two headless-probe discoveries are recorded in the report for reuse: `--dump-dom` snapshots
the app at `load`, and it never paints — so probe pages must land on a routable URL and trigger
faces with `document.fonts.load()`.

**Evidence.** `reports/verify-e2-s5-20261016.md` — payload measurements, build output, the Chromium
probe JSON, the gate log, and the probe-technique findings.

---

## ADR-020 — The theme layer: role mapping in OKLCh, contrast by construction, one glass fallback

**Date**: 2026-10-16 · **Status**: Accepted

**Context.** DESIGN-SYSTEM §2.1/§2.2 fix the role vocabulary (`background`, `surface`, `glass`,
`hairline`, `text`, `muted`, `accent`, `accentContrast`) and the hard rule: text ≥ 4.5:1 on the
background *and* on glass-over-background, neutral fallback on extraction failure, no colour literal
outside the theme layer. E2-S4 ships scored palettes (hex + OKLCh + weight); E2-S3 shipped the
neutral stylesheet with five measured contrast pairs. What was open: the exact palette→token
mapping, how contrast is *guaranteed* rather than spot-checked, how a theme reaches the DOM, and
what "the theme layer" means for the hex-literal rule. §2.3 (per-view application) is deferred to
E3+ by the backlog, so E2-S6 ships the layer, its fallback, the material and the visual check page —
one slice each.

**Decision.**

1. **Roles from OKLCh with a fixed adjustment policy.** Background: the darkest colour, l clamped
   to [0.10, 0.18], C ≤ 0.05, hue kept (never pure black, never a washed grey). Surface: background
   l + 0.032 capped at 0.24, C ≤ 0.06. Text: the lightest colour, C ≤ 0.02, l starts in
   [0.86, 0.93] and rises in 0.01 steps (ceiling 0.97) until it clears **4.5:1 against the
   background, the surface and the glass composite**. Muted: text at alpha 0.62, +0.02 steps until
   4.5:1 on the background. Accent: max `weight × C`, ties broken lexicographically on hex.
2. **Accent contrast is derived, not assumed.** `fitAccent` measures the accent against a neutral
   dark base (`#0b0b0d`) and a neutral light base (`#e8e6e3`); the stronger pair wins, and when
   neither passes the accent's lightness is stepped ±0.02 (band 0.05–0.97) toward the stronger base
   until it does. Every accent ships as a passing pair, and `--aura-accent-contrast` is a token the
   generator derived.
3. **Contrast arithmetic is float sRGB, WebAIM's formulas.** `contrast.ts` composites alpha over the
   background without byte-rounding: the math reproduces E2-S3's measured pairs exactly (text on
   glass **16.20:1**; rounding first gives 16.17:1). All five pairs are asserted in tests.
4. **Runtime application is nine inline custom properties on `documentElement`.** `applyTheme` /
   `applyFallbackTheme` / `clearTheme`; `FALLBACK_THEME` mirrors the stylesheet's `:root` set value
   for value, and a drift-guard test reads `global.css` and fails on divergence. Extraction failure
   calls `applyFallbackTheme` (the measured E2-S3 neutral set) — an invented theme is never applied;
   `paletteToTheme` throws on an empty palette.
5. **The glass material gets a token fallback, not a second material.** `.glass` (`glass.css`) keeps
   §3's recipe; `--aura-glass-solid` (`rgba(0, 0, 0, 0.72)`) is its no-`backdrop-filter` twin, swapped
   by `@supports`. Build finding: Lightning CSS deduplicates the `-webkit-`/standard pair keeping the
   **last** declaration — the file lists the prefix first so both survive into `dist/`.
6. **"The theme layer" is `theme.ts` + the stylesheet's `:root` block.** That is where colour
   literals may live; everywhere else reads `--aura-*` tokens or `text-aura-*` utilities. The audit
   command and its empty result are recorded in DESIGN-SYSTEM §13.
7. **A Storybook-free check page is the sitting evidence.** `/check` renders the nine tokens with
   live values, the type styles, the glass over a palette stand-in and over the page background, and
   the five contrast rows; `?theme=demo` applies a derived theme so the headless probe screenshots it
   without a click (the demo palette is built through `oklchToHex` — the page itself contains no hex
   literal).

**Consequences.** §2.3 still governs where a theme is applied per view (E3+); today the layer exists,
the fallback path works, and the check page proves both. The `:root` block and `FALLBACK_THEME` are
two copies of one set, bridged by an automated drift guard rather than by discipline. Adding a role
means touching `THEME_PROPERTIES`, `global.css`, the §2.2 table and the check page — the drift guard
only covers the tokens it enumerates. The vitest runner is configured `css: true` so `?raw` imports
return source text (the drift guard's read); that is a test-harness setting, not a build change.

**Evidence.** `reports/verify-e2-s6-20261016.md` — contrast numbers, both Chromium probe JSONs
(fallback + derived), the built-CSS inspection (`@supports` branch, both `backdrop-filter` forms),
screenshots, and the hex-literal audit.

---

## ADR-021 — The splash hero: a photo per visit, read once, and what the placeholder can be

**Date**: 2026-10-16 · **Status**: Accepted

**Context.** E3-S1 is the entry screen: one random photo, full-bleed, decoded before it is revealed, with
the archive's own tone standing in until then. The specs fix the endpoint (`GET /photos/random`, `Photo`),
the material (ADR-020's tokens) and the rule that a theme is applied per view (DESIGN-SYSTEM §2.3). What
they leave open is what this screen does about four things: the cache policy of an endpoint whose whole
point is a different answer each time, whether the photo crosses the network once or twice, what the
placeholder can be *before* the bytes exist, and whether the pull gesture may move. The app-wide 30 s
`staleTime` (ADR-004's client) is right for the feed and wrong here, so this is a decision about one
query, not about the policy.

**Decision.**

1. **`/photos/random` is per-visit state, not cached state.** `staleTime: 0` **and** `gcTime: 0`, set on
   this query alone (`api/photos.ts`). Measured across an unmount and a remount inside one client:
   defaults → 1 request, the policy → 2. `staleTime` alone is not enough: a stale entry is still painted
   first, so a returning visit would show the previous photo and swap it — the wrong photo, visibly, on
   the one screen whose promise is a new one. Cost: dev's `StrictMode` double-mounts, so a dev visit
   issues two requests; the built bundle was measured at exactly one per visit.
2. **The photo is read once per visit.** `fetch` the bytes → `Blob` → object URL for the `<img>`, with the
   palette derived from *those* bytes; `decode()` resolves before `src` is handed to the view, and the
   URL's release is a hand-off the view calls after the swap or on unmount. The alternative was measured
   before rejecting it: `/images/**` answers `immutable` for a year, so an `<img src>` plus a second
   extraction fetch would be answered from the browser cache. The reason to keep one read is that a tone
   derived from the bytes on screen cannot describe a different file, and that there is never a window
   with two reads of the same photo in flight — not round-trip cost.
3. **The placeholder is the photo's own tone, and its window is the decode.** Nothing can know a photo's
   colour before its bytes exist, so the tone lands when they do (~0.3 s before `ready` in the probe) and
   the stylesheet's neutral set covers the transfer. Two options were considered for covering the
   transfer as well — (a) remember the last tone and start the next visit in it, (b) a stored per-photo
   tone from the API — and both are deferred: (a) needs a persisted value and a story that owns "the
   archive's ambient colour across visits", (b) needs a field `_docs/openapi.yml` does not have
   (`Photo` is id, url, category, uploadedAt) and therefore a spec change *and* an ADR of its own.
   The neutral `#0b0b0d` is the answer until one of them exists.
4. **The pull gesture is silent, and its motion belongs to E3-S3.** Pulling down past a threshold asks for
   another photo; nothing moves and nothing is drawn. The finger-following transform and the cross-fade
   are motion, motion tokens and the `prefers-reduced-motion` switch are E3-S3's story, and `matchMedia`
   does not exist in the test environment — a transform shipped there would be the one part of the gesture
   nothing verifies. The gesture surface carries `touch-pan-x touch-pinch-zoom`: measured in Chromium with
   a synthesised touch drag on the built bundle, the default `touch-action: auto` made the browser claim
   the drag as a scroll and cancel the pointer stream (`pointerdown → pointermove → pointercancel`, no
   re-roll) — a dead gesture on a phone with a green unit suite, since jsdom never claims a gesture. The
   narrower `touch-action: none` would also work and was rejected because it takes pinch-zoom away. The
   tap target the gesture has to coexist with — and its open intent, `aria-expanded` and `Escape` — are
   this story's; the glass menu it opens, its overlay, focus trap and backdrop tap are **E3-S2**'s.
5. **The browser's edges are an injected seam, and the browser's own guarantee is probed in a browser.**
   `lib/image/hero.ts` takes `HeroEnvironment` (bytes, decode, tone); jsdom 30.1.3 has no
   `HTMLImageElement.decode`, no image events and no canvas, so `prepareHero`'s ordering and error policy
   run for real against three fakes. `app/App.test.tsx` holds the real environment to two tests of its
   own: one answers the photo's bytes with a **string** body, so the failure really happens at the missing
   `decode` — a jsdom `Blob` as a `Response` body rejects earlier, at `Response.blob()` — and one installs
   a decoder the test controls, which is the only place in the suite where the awaited `decode()` runs.
   "Decoded before reveal" is a browser fact and is measured there: `state=ready` with a `blob:` src and
   `naturalWidth` 1200 at the first sampled frame.

**Consequences.** The splash is the only query that ignores the app-wide cache policy; a second one that
wants per-visit semantics should say so the same way, in `api/`, with the measurement beside it. The
`gcTime: 0` means a visit always starts from an empty cache — a spinner-free screen that is *never* instant
on a return, which is the intended trade. `--aura-bg` is invisible whenever a photo covers the viewport, so
the tone's visible lifetime is the loading window only; a future story that wants ambient colour behind a
partly-visible photo (the River, E4+) inherits that finding. The injected seam means the pipeline's ordering
is testable without a decoder, while the one guarantee jsdom cannot make — that the pixels really are
decoded before the reveal — is only ever claimed from a browser probe; the gesture's `touch-action` is the
second such fact, pinned in jsdom as a class and proven as an effect only in Chromium. The gesture gets no
visual feedback until E3-S3: a user who pulls and sees nothing move has only the new photo as confirmation.
The forward references this story leaves open are named in the view's own doc comment: the glass overlay,
focus trap and backdrop tap are **E3-S2**, the quiet states' words are **E3-S4**, motion is **E3-S3**.

**Evidence.** `reports/e3s1-splash-390.png` (the built bundle, 390×844); `reports/verify-e3-s1a-20261016.md`
(the slice that landed the photo) and `reports/verify-e3-s1b-20261016.md` (the slice that landed the intent
and the gesture); `frontend/README.md`, "The splash hero — measured (E3-S1)" (the freshness counts, the
cache headers behind the single read, the held-request timeline, the `touch-action` trace, the production
resource list) and its "Test environment" table (the jsdom probes, including what a `Response` body does
and how the missing `decode` is installed by hand).

---

## ADR-022 — Route transitions and the motion vocabulary: CSS keyframes, no animation library

**Date**: 2026-10-17 · **Status**: Accepted

**Context.** E3-S3 is the motion story: a token set, route transitions with fade + subtle vertical
movement, interruptibility, reduced motion. **This ADR is a spec divergence, not merely a stack
preference.** `_docs/aether_archive_specs.md` names Framer Motion three times — line 11 (the mandated
frontend stack, "for fluid, tactile animations **and route transitions**"), line 30 (the menu's animation,
"(Framer Motion)"), and line 95 ("Polish Framer Motion transitions between all routes", which is this
story's criterion 2). `CLAUDE.md` §1 says a spec change requires an ADR *plus explicit user approval*, so
this record carries both: **the owner approved the divergence on 2026-10-17**, on the measurements below,
with the intent of the spec lines — fluid, tactile animations and route transitions — met by the CSS layer
rather than by the library named for it. The earlier reading of this as a stale `CLAUDE.md` line was
wrong, and a review found it. `CLAUDE.md` §2 is amended to match, so the two documents agree.
Three further options are open and each needs a measurement rather than a preference: the library's real
cost on a mobile-first bundle, the **View Transitions API** that React Router 8.4.0 already drives
(`viewTransition` on a router update, `useViewTransitionState` for the styles), and where the
reduced-motion switch lives, given that E2-S3's global freeze rule kills every animation and that
`matchMedia` does not exist in the test environment (measured: jsdom 30.1.3 has no `matchMedia`, no
`getAnimations` and no `startViewTransition`). What the story may not choose freely is the vocabulary:
DESIGN-SYSTEM §5 is the source, so the work is to make the code say what §5 says rather than to invent a
second language beside it.

**Decision.**

1. **No animation library. The transition is CSS, and the measurement is why.** Four variants of the same
   App shell, built in one tree (`motion` 14.3.0, `npm run build`, the shared chunk every route loads):
   no library **286.20 kB / 90.22 kB gzip**; `<motion.div>` keyed on the path **417.98 / 133.31**
   (+131.78 raw, +43.09 gzip); the same inside `<AnimatePresence>` **422.13 / 134.91** (+135.93, +44.69);
   `m` inside `<LazyMotion features={domAnimation}>` **370.12 / 119.44** (+83.92, +29.22) — the smallest
   tree-shaken form still costs a third of the shared chunk. The hand-written layer is the difference
   between two builds run the same day: **286.69 / 90.37** on this branch against that 286.20 baseline,
   i.e. **+0.49 kB raw / +0.15 kB gzip** (stylesheet: 17.10 / 4.52 → 18.08 / 4.65, net of the
   `motion-safe:` utilities it replaced). The library's headline capability also points the wrong way
   here: `AnimatePresence` exists to keep the **outgoing** view mounted and animate it out, which is
   precisely the two-full-height-views state the acceptance criterion forbids.
2. **The mechanism is an entry animation on a keyed wrapper.** `app/RouteTransition.tsx` renders one div
   keyed on the view's identity; React replaces the view and the keyframe replays on the new element,
   because a CSS animation runs when its element first exists. Nothing animates out. The key is
   `viewIdentity(pathname)` (`lib/motion/route.ts`, pure, unit-tested): a trailing slash and a query
   string are not a new view — a naive `key={pathname}` would remount and re-animate on both.
3. **`Suspense` stays outside the wrapper**, so the entry animates the real view rather than the
   fallback. Measured over a cold navigation into a lazy chunk: the fallback never paints —
   `[role=status]` count **0** in all 74 sampled frames — because React Router's `startTransition` keeps
   the outgoing view on screen until the chunk resolves.
4. **`prefers-reduced-motion: reduce` collapses the distance, not the fade.** The criterion says
   opacity-only, so the entry has to survive; the global freeze rule (§11, E2-S3) would have made it
   instant instead. The distance is now a custom property (`--motion-distance-enter: 0px` inside the
   media query) and the freeze rule gains one named exception: `*:not(.motion-enter)`. Measured under
   emulation, both readings: under `reduce` the entry still runs with **37 distinct opacity values**
   while every computed transform is `matrix(1,0,0,1,0,0)` or `none` and `maxScrollHeight` **844 =
   clientHeight**; under `no-preference` the offsets run 16 px → 0 and the scrollable overflow reaches
   860 = 844 + 16. The menu's entry inherits the same switch — its sheet's `top` is a single value (642)
   throughout under `reduce`.
5. **No fill mode, and `transform: none` at the end — the rule is the containing block, not tidiness.**
   `fill-mode: both` would leave `translateY(0)` behind, and a non-`none` transform makes the element the
   containing block for its `position: fixed` descendants. The glass menu is one (measured:
   `wrapper.contains(sheet) === true`): opened while an entry runs, its veil is positioned against the
   wrapper (`y 3, bottom 847` in an 844 px viewport) and the sheet's own 16 px drift adds to the
   wrapper's current offset (settled `top` 642 against 658 during the run). Both are bounded by the
   entry's length and by the drift distance and vanish when it ends. A portal would remove the coupling
   entirely; that is a finding for **E3-S4** (whose glass notice is the next thing that renders over the
   menu), not a silent change to E3-S2's structure.
6. **View Transitions are recorded as the future, on the same tokens.** The API is real here —
   `document.startViewTransition` is a function in the probe's Chromium 152 — and React Router 8.4.0
   wraps its updates in it (`dist/development/lib/components.js`: `typeof
   router.window.document.startViewTransition === "function"`, with a `warnOnce` and *no* transition when
   the API is missing). It is not used now, for three measured reasons: it animates *both* snapshots
   (the double-view question again); it does **not** respect reduced motion on its own — under
   `prefers-reduced-motion: reduce` the probe still counted **5 UA pseudo-element animations at 250 ms
   each**, identical to `no-preference`, so the author must cancel `::view-transition-*` by hand; and
   its default 250 ms is not one of §5's durations. A later story may adopt it *on top of* the same
   `--motion-*` values; it would not replace them.
7. **The vocabulary is data, and a test holds the data to the CSS.** `lib/motion/tokens.ts` exports the
   durations, the curve, the distance and three literal class strings — Tailwind scans that file as text,
   so a class built from a template literal would compile to nothing. `global.css` declares the
   `--motion-*` properties once. A drift-guard test reads `global.css?raw` and fails on an undeclared
   `var(--motion-*)`, an `animate-[…]` naming no keyframe, or a keyframe that stopped matching §5. That
   guard exists because of the failure a green unit suite cannot see: a misspelt `var()` inside
   `animate-[…]` makes the whole declaration invalid at computed-value time — an animation that silently
   never runs.

**Consequences.** `CLAUDE.md` §2 no longer lists Framer Motion as installed: the line now carries this ADR
and its number, because a mandate and a lockfile that disagree is how a stack list stops being read. The
divergence from `_docs/aether_archive_specs.md` is recorded above with the owner's approval, and **the
trigger for revisiting it is explicit rather than a matter of taste**: a story that needs **exit
animations, shared-layout transitions, springs or gesture-driven orchestration** brings the dependency in
with that story's own measurements. Nothing in Sprints 3–6 as planned does — E4's drag-and-drop is
`@dnd-kit` and does not need it — so the revisit point is the polish pass (E6-S9) unless a story arrives
with the need first. The motion
layer is one tokens file, one keyframe pair and one media query, so a second entry pattern must be a
token and not a literal: the three class strings are the only place a duration or a curve is written
outside `global.css`, and both consumers (`app/RouteTransition.tsx`, `features/menu/GlassMenu.tsx`) read
them. Interruptibility is "restart from the `from` frame", not "resume from the current value": measured
with a second navigation 90 ms into a run, the first entry was at opacity 0.523 / 7.63 px when it was
replaced, and the new one ran 0 → 1 while exactly one `<main>` stayed in the DOM. Scroll restoration
between two scrollable views is still nobody's: leaving a scrolled page lands at 0 because the new view
is shorter, not because anything reset it — the River (E5-S1) owns that.

**Evidence.** `reports/e3s3-transition-strip-390.png` (six frames of one transition, each labelled with
the opacity and offset measured at that instant) and `reports/e3s3-transition-mid-390.png`;
`reports/verify-e3-s3-20261017.md` (every probe, its command and its raw output);
`docs/engineering/DESIGN-SYSTEM.md` §5 and §14.

---

## ADR-023 — The aura picker: the chosen page colour is kept, the glass flips, suggestions merge by pixel share

**Date**: 2026-10-17 · **Status**: Accepted

**Context.** E4-S4 lets the curator choose the dump's background colour (the spec's "aura") with a live
preview, plus palette suggestions from the selected photos, a reset and persistence across refresh.
`paletteToTheme` derives a page colour from a palette and would move a chosen colour into the dark band.
The design system also mandates one dark glass tint and one text token; on a light page a black glass
composite is darker than any text that passes, so one text colour cannot clear 4.5:1 on both. Options:
refuse light backgrounds, per-surface text tokens, or flip the glass tint with the text.

**Decision.**

1. **`themeFromBackground(hex)` keeps the page exactly the colour the user picked.** Each text
   direction steps the surface away from the text (darker under light text, lighter under dark text)
   and the text from its neutral base toward its extreme until text-on-page, text-on-surface and
   text-on-glass all clear 4.5:1; the surface **flips its step at the cube's edge** rather than
   rendering pure black or white (`#010101`/`#fefefe` accepted, with a non-pure surface). **Both
   directions are tried** before a page is refused, and the search never returns pure black or white
   text. Pure **pages** are refused by policy (the brief's bases stop at `#0B0B0D`/`#121215`):
   measured on a 16³ sRGB cube, **4,094/4,096 accepted, only `#000000` and `#ffffff` refused**. (The
   single-direction 90-colour band was an artifact; the other direction carries all of them.)
2. **The glass tint flips with the text.** Black tint and white hairline under light text; white tint
   and black hairline under dark text. With black glass on every page and both directions tried,
   **1,803 of 4,096 backgrounds (44.0%)** could not carry one text colour across the page, surface and
   glass; the token layer already owns the tint tokens per theme, so the flip is data, not a component.
3. **Suggestions merge across the selected photos.** Each palette is extracted (E2-S4, 64 px edge);
   colours are pooled, deduped by normalised hex and ranked by summed weight — confidence is the
   colour's mean share across the photos, per-photo shares averaged (a `Palette` carries no pixel
   counts; this is the closest computable reading of "share of the selected pixels", and the two
   differ only when the photos' working areas do). The top eight are offered; a failed extraction is
   skipped, and if all fail there are no swatches (the hex input remains).
4. **The aura persists for the browsing session, nothing else.** It lives in `sessionStorage` under
   one key and is restored on refresh; the picked `File`s never persist. The preview applies the theme
   on the workshop's root and clears it on unmount, as the splash does.

**Consequences.** A chosen colour is never modified behind the user's back, and every accepted page has
a legible text colour. The light-glass variant makes "dark glassmorphism" "contrast-directed
glassmorphism" for user-chosen pages; `.claude/rules/design-language.md` and `DESIGN-SYSTEM.md` §3 point
at this ADR. Further divergence (per-surface text tokens, pure pages/text, dark glass on light pages,
cross-session persistence) needs a new ADR.

---

## ADR-024 — The draft survives its upload: the workshop keeps the six it stored, and the publish reads them in order

**Date**: 2026-10-18 · **Status**: Accepted

**Context.** E4-S5 publishes a dump. `POST /api/v1/dumps` takes a title (optional), a `#RRGGBB`
background and **exactly six distinct, uncurated photo ids in display order**; ADR-011 §3 settled that
an upload creates an *unassigned* photo and publishing attaches six of them. The spec's workshop flow —
Selection, Canvas, Aura, Publish — was written against the narrative's one-shot multipart endpoint, but
the contract of record splits it into `POST /photos` (one file per request) and `POST /dumps` (ids
only), so the client must hold the six stored photos at the moment it publishes. E4-S2A2 shipped the
opposite: a successful upload removed the tile — and the frontend README (E4-S3A) named that as E4-S5's
work ("a successful upload removes the tile, so E4-S5 must keep the returned `Photo.id` on the item […]
before `orderedIds` can produce a valid `DumpCreate.photoIds`"). Open: where the ids live, what the
client mirrors before sending, and what the optimistic write means for a cache with no consumer yet.

**Decision.**

1. **A successful upload keeps its tile.** The queue marks the tile `added` and keeps the returned
   `Photo` on it; its preview lives until the tile is removed or the view unmounts. The tiles **are**
   the draft and their display order **is** the publish order: the payload is `orderedIds` over the six
   stored photos — each tile's `photo.id`, since `orderedIds` maps the item's `id` field — with
   `displayOrder` 0–5 being the index. E4-S2A2's "the success is the tile leaving the grid" is retired;
   an uploaded photo the curator abandons stays in the archive as an unassigned photo, which is what it
   was.
2. **The publish is a second, explicit action.** "Upload" stays the store action the single-photo flow
   uses; "Save archive" (the spec's step 4) publishes the draft. The publish group appears once the
   draft holds six tiles — the dump's shape — and a refused click is answered with one sentence, not a
   disabled button: a photo still un-stored, an aura not yet chosen.
3. **The client mirrors the server's checks before the request.** Exactly six tiles, every one stored,
   the six photos distinct, and a chosen aura (the spec's aura step is the publish's precondition,
   mirroring `@NotBlank` + `@Pattern`); the title is optional — blank reads as `null`, ≤ 80 characters
   (ADR-011 §2). A blocked plan sends nothing.
4. **The optimistic insert is scoped to `queryKeys.dumps` and is reversible.** The publish inserts a
   draft `Dump` at the head of the list (newest first, the server's order) before the request; a
   failure restores the previous value — removing the entry entirely when there was none — and the
   panel carries one discreet sentence. Success replaces the optimistic entry with the server's dump;
   nothing is invalidated, because the response is canonical.
5. **Publishing locks the draft and returns where the workshop was entered from.** While the request is
   in flight the grid and the button are disabled ("Saving…"), so a double submit is impossible; on
   success the view navigates back (`navigate(-1)` — the workshop is reached from the splash's menu),
   on failure it stays — the draft intact, the sentence visible — so a retry costs one press and never
   a re-upload.

**Consequences.** The canvas is the draft: after a batch, adding more photos counts the stored tiles
against the six-photo cap, and the draft is cleared by removing tiles or by leaving the view. The
publish's failure modes are all recoverable client-side: the six photos exist server-side before the
publish ever runs, so no rollback ever needs to un-store a file. The e2e evidence is jsdom-level (the
criterion names a mocked API); the narrative spec's one-shot multipart publish stays unimplemented
(ADR-011 §1). Further divergence — publishing fewer than six photos, editing a published dump's title,
a server idempotency key for retried uploads — needs a new ADR.

## ADR-025 — The feed reads the archive whole: two queries, no pagination yet, and the numbers that would revisit it

**Date**: 2026-10-19 · **Status**: Accepted

**Context.** E5-S1 builds the River, the archive's chronological feed. `_docs/openapi.yml` publishes
`GET /photos` (every photo, newest first) and `GET /dumps` (every dump with its six photos, newest
first) with **no pagination parameters anywhere in the contract**. The story's criterion says
"Pagination or cursor-based loading (decide with an ADR); no duplicate keys, stable ordering", and the
wire payload is metadata only — ids, urls, categories, instants; image bytes are separate requests per
`<img>`. The archive is single-user, local or on a LAN, so the number that matters is the JSON the two
responses carry, not a CDN-shaped bandwidth bill.

**Decision.**

1. **The feed reads both collections whole, in two parallel queries** — `fetchPhotos`/`usePhotos` on
   `["photos"]` and `fetchDumps`/`useDumps` on `["dumps"]` (E5-S1A; the keys are ADR-004's). No server
   pagination and no cursor: the endpoints do not take one, and nothing measured needs one. Measured: a
   mature archive — 300 photos and 60 dumps embedding their six photos each — is **114.1 kB of JSON
   (8.1 kB gzipped)** for both responses together; the probe is committed at
   `reports/probes/e5-s1a-feed-payload.mjs` and re-runs from the repository alone.
2. **The queries carry no policy of their own.** The app-wide 30 s `staleTime` is the feed's rule as
   written (`app/queryClient.ts`), and freshness both ways already flows through the cache: an upload
   invalidates the `photos` prefix, and the publish lands its dump itself (ADR-024 §4).
3. **"No duplicate keys, stable ordering" is the feed model's contract, not the wire's** (E5-S1B): a
   total order over dated entries, with singles excluding the photos dumps hold. The queries return the
   order as served and do not re-sort.
4. **The threshold that would revisit this.** E5-S4 profiles a 300-item feed and records DOM nodes and
   frame time; if windowing is needed, **cursor pagination and windowed rendering land together as one
   backlog item** — windowing what has not been fetched is not something this client can decide alone.
   Until then, a filter or a second consumer adds a segment to an existing key, never a new root.

**Consequences.** The River renders from two cached lists and builds its whole model client-side; a
cold load spends two requests of a few kB and no more. The client holds the archive's metadata in
memory while the tab lives — acceptable for a single-user archive, and the same lifetime the query
cache already had. The escape hatch is precise: server pagination is a contract change
(`_docs/openapi.yml` is a frozen spec), and it supersedes this ADR rather than bending it.

---

## ADR-026 — No derivative images yet: originals with lazy loading, colour placeholders, revisit with E5-S4

**Date**: 2026-10-19 · **Status**: Accepted

**Context.** E5-S3 asks whether images in the River need thumbnails or derivative sizes. The
archive is local-only, served over LAN to one device. E1-S5 maps `/images/**` to the data directory;
the contract reserves no thumbnail namespace. Generating derivatives would require a backend change
(a new directory + mapping), an image-processing dependency, and storage duplication — cost that is
justified only by measured latency.

**Decision.** The River serves originals. CLS prevention uses explicit `aspect-ratio` (`aspect-square`
for dump photos, `aspect-[3/4]` for singles) and `sizes` so the browser can choose when `srcset` is
added later. Each image carries a dominant-colour placeholder (`dump.backgroundColor` for dump photos,
`bg-aura-surface` for singles) visible until decode completes. `loading="lazy"` and
`decoding="async"` keep the main thread free. Broken images are hidden (`display: none`) so layout
holds.

The revisit threshold belongs to E5-S4's profile: if the 300-item feed's LCP exceeds the 1.5 s
budget over LAN, derivative images are the next lever, and they supersede this ADR with their own
directory, mapping and build step. Until that measurement lands, originals are the correct default.

**Consequences.** No backend change; no new dependency; no storage duplication. `sizes` is set now so
a future `srcset` addition is additive. The escape hatch: E5-S4's profile numbers, or a
real-device pass (E6-S4) finding slow images, triggers a new ADR.

---

## ADR-027 — No virtualisation yet: 300-item DOM is 593 nodes, revisit at 1 000 items

**Date**: 2026-10-19 · **Status**: Accepted

**Context.** E5-S4 asks whether the River feed needs windowed/virtualised rendering. The archive is
personal and local-only; the realistic ceiling is ~300 photos + ~50 dumps. The frontend rule
(`frontend.md`) says "window/virtualise once a view exceeds ~200 nodes; measure before optimising."
That ~200 refers to *simultaneously visible* interactive nodes; the River's nodes are inert `<img>`
elements with `loading="lazy"` — only the viewport slice decodes.

**Measurement.** A jsdom-based probe (`reports/probes/e5-s4-virtualisation-profile.test.tsx`)
rendered the River with synthetic datasets:

| Feed size | Total DOM nodes | img elements | Nodes per photo |
|-----------|-----------------|-------------|-----------------|
| 300 items (240 singles + 10 dumps) | 593 | 300 | ~2.0 |
| 600 items (540 singles + 10 dumps) | 1,193 | 600 | ~2.0 |

The structure is flat: each single photo is 2 nodes (`div` + `img`); each dump is ~9 nodes
(`article` + optional `h3` + `div` + 6 `img`); each month section is 2 nodes (`section` + `h2`).
The node-per-photo ratio is ~2.0 regardless of scale. jsdom render times (333 ms / 251 ms) are not
real browser paint, but show linear scaling with no super-linear blowup.

**Why not virtualise now.** (1) 593 nodes is well below the point where a real browser struggles —
modern mobile Chrome handles 1–2k static nodes without jank when images are lazy-loaded. (2) The
archive is local, so network latency is negligible; image decode is the bottleneck, and
`loading="lazy"` + `decoding="async"` already defer it. (3) Adding `@tanstack/react-virtual` or
`react-window` introduces a dependency, forces fixed row heights (dumps and singles differ), and
breaks the natural scroll position the `useScrollMemory` hook relies on — cost with no measured
benefit. (4) The LCP budget (< 1.5 s over LAN) is met by the current structure; E6-S4's real-device
pass will confirm or challenge this.

**Decision.** The River renders its full DOM. No virtualisation library is added.

**Revisit threshold.** Virtualisation becomes the next story when *any* of:
- The archive exceeds **1,000 photos** (est. ~2,000 DOM nodes), or
- A real-device measurement (E6-S4 or later) shows frame drops during scroll at 300+ items, or
- A new feature adds heavier per-item DOM (e.g., inline metadata, interactive controls).

When that story opens, it supersedes this ADR and names its own library, row-height strategy, and
scroll-restoration approach.

**Consequences.** No new dependency; `useScrollMemory` continues to work with native scroll. The
probe script is committed and re-runnable. The escape hatch is named above — three concrete triggers,
not a vague "when it gets slow."

---

## ADR-028 — Editorial redesign: image-first responsive layouts and Cormorant Garamond + Manrope

**Date**: 2026-10-19 · **Status**: Accepted

**Context.** The canonical product specification calls for a moody, high-end editorial photo sanctuary
with glassmorphism, an immersive zero-chrome splash, a chronological river and a photo-ordering
workshop. It does not specify desktop composition. The delivered views technically follow the mobile
flows, but their typography, composition and desktop use of space do not deliver that high-end intent.
The redesign must not turn the archive into a conventional dashboard or break its mobile-first
interaction.

**Decision.**

1. The art direction is **cinematic editorial luxury**, not generic "glass everywhere": rich,
   photo-derived atmosphere; expressive display typography; intentional negative space; and carefully
   composed images. Glass remains the shared material for controls and navigation over imagery, where
   translucency has a real backdrop and does not compete with photos.
2. The splash remains full-bleed and free of visible navigation chrome until the curator taps. The
   River and Workshop adapt their composition to available width rather than stretching a phone layout;
   the River remains a bounded scroll surface. There is no persistent header, footer or navbar.
3. Replace the E2 baseline pair with **Cormorant Garamond** for display and **Manrope Variable** for UI.
   Both ship as local Fontsource NPM assets with latin subsets only; no external font request is
   permitted. Cormorant's fine editorial contrast gives titles more character, while Manrope remains
   legible at compact mobile control sizes. Font payload is measured from the production build against
   the existing ~200 KB budget.
4. Responsive implementation uses fluid bounds and content-aware CSS Grid rather than fixed phone
   widths. It must be evaluated at 390 px and 1440 px, preserve ≥44 px touch targets and keyboard paths,
   and honor `prefers-reduced-motion`.
5. The visual refresh does not alter `_docs/`, API payloads, file storage, or the archive's local-only
   boundary. It uses the existing palette/theme generator and glass primitive; it adds no runtime
   network requests.

**Research.** Apple HIG's [Layout](https://developer.apple.com/design/human-interface-guidelines/layout)
guidance informed adapting hierarchy to display sizes rather than scaling one layout. MDN's
[`backdrop-filter`](https://developer.mozilla.org/en-US/docs/Web/CSS/backdrop-filter) documentation
informed keeping translucent glass over actual background pixels. web.dev's
[min(), max(), clamp()](https://web.dev/articles/min-max-clamp) informed fluid sizing with readable
width limits. Photography portfolio references from
[Site Builder Report](https://www.sitebuilderreport.com/inspiration/photography-portfolios) reinforced
image hierarchy and breathing room; no layouts or assets were copied.

**Consequences.** The former Playfair Display + Inter Variable choice (ADR-019) is superseded for
product UI. The rendering contract, zero-external-request rule, local-font discipline, colour contrast
guarantees and motion vocabulary remain. The production build emits five font files totaling
**133,376 bytes (133.4 kB decimal)**, within the ~200 KB budget.

---

## ADR-029 — Public demo deployment and the observability profile

**Date**: 2026-10-22 · **Status**: Accepted

**Context.** The canonical product is single-user and local-first: no cloud, no external request at
runtime, no telemetry. The Zoomcamp final project requires the same application to be deployed at a
public URL, with tests, containers, CI/CD and a rollback path, observable metrics/traces/logs, an alert
on user impact, and an agent that responds to it. Deploying the owner's real archive — or adding
third-party analytics to the product — would violate the local-first stance.

**Decision.**

1. **The default stays local-first.** `docker compose up` runs db + api + web on the owner's machine;
   the default profile exports no telemetry and makes no external runtime request. The canonical spec
   continues to describe this product.
2. **A demo/production profile is added** for the course and for self-hosting: the same images behind
   Caddy with TLS, PostgreSQL 17, a local media volume, OTLP export, Prometheus metrics, JSON logs and
   Grafana. It runs on **seeded/demo data**; the owner's real archive is never deployed.
3. **Telemetry is operational only**: HTTP/JVM metrics, traces, and structured logs with
   `traceId`/`spanId`. No PII, no image bytes, no file names, no credentials, no third-party analytics.
   Sampling is configurable; the local profile keeps the export off.
4. **The public demo is best-effort**, documented in `README.md` and `docs/course/FINAL-PROJECT.md`;
   it is not a hosted service and carries no availability promise beyond the course window.
5. **Delivery**: CI tests every pull request and push. A `v*` tag triggers `.github/workflows/release.yml`,
   which builds the API and web images and pushes them to GHCR under both the human tag and the
   immutable `sha-<full commit>` tag. The deploy job then SSHes to the VPS and runs
   `scripts/deploy/deploy.sh sha-<full commit>`; branches are never deployed automatically. The script
   pulls the images, waits for Docker health, runs the public smoke test, seeds the demo once, records
   the tag in `state/`, and restores the previous tag if any gate fails. `scripts/deploy/rollback.sh`
   reuses the same path. The VPS only pulls; it never builds a release.
6. **Observability is self-hosted**, not Grafana Cloud: Prometheus scrapes the API, an OpenTelemetry
   Collector forwards traces to Jaeger, Promtail ships JSON logs to Loki, and Alertmanager routes two
   user-impact alerts on the publish journey. Grafana is published read-only under `/grafana/` for the
   jury; Prometheus, Alertmanager and Jaeger stay bound to `127.0.0.1` behind an SSH tunnel. The
   local-first stack remains telemetry-free; only the observability overlay enables tracing.
7. **The on-call responder runs on the host**, as a systemd service, and receives Alertmanager
   webhooks through a bearer token. It diagnoses Docker health for the API and the database, then
   performs one safe action: restart the database, restart the API, or roll the API back to
   `state/last-good-image`. It records an incident JSON, optionally opens one GitHub issue, and closes
   the record when Alertmanager sends `resolved`. It never runs SQL, deletes data or calls an LLM; the
   deterministic path needs no API key.
8. **One origin** remains: Caddy terminates TLS, nginx serves the SPA and proxies `/api/**` and
   `/images/**`, and `/grafana/*` goes to Grafana with `serve_from_sub_path`. The browser's CORS
   allow-list contains the public origin only.

**Consequences.** "No telemetry" is now scoped to the local-first default, not to the demo profile;
`CLAUDE.md`, `ARCHITECTURE.md` and the README say so explicitly. The older deployment sketch that named
Grafana Cloud, a synthetic failure flag and a containerised on-call agent is superseded by the
implementation described in `docs/engineering/DEPLOYMENT.md` and
`docs/engineering/OBSERVABILITY.md`: the on-call path is a deterministic host process, and the failure
drill is a real PostgreSQL stop. The deployment introduces a domain, TLS certificates, a VPS firewall
rule and host secrets. The Alertmanager token is a mounted file with mode 0644 because its container
runs unprivileged; the host is single-user and `.env` holds the same value. The archive's storage model
does not change: media stays on a local volume, and the database stays PostgreSQL. The public instance
went live on 2026-10-22 at `https://168.138.70.166.nip.io`; the 1 GB host profile is recorded in
ADR-031.

---

## ADR-030 — Private GHCR images, run-scoped pull credential

**Date**: 2026-10-22 · **Status**: Accepted

**Context.** The release workflow pushes `sha-<commit>` images to GHCR. The packages are owned by the
organization and private; the organization's API rejects the documented visibility change (404 even
for an org admin), and storing a long-lived `read:packages` token on the VPS would widen the blast
radius if the host were compromised. The deploy job still has to pull the exact tag it just built.

**Decision.** Keep the packages private. The deploy job passes the workflow's short-lived
`GITHUB_TOKEN` — scoped on that job to `packages: read` — over the SSH stdin; `deploy.sh` logs in to
`ghcr.io` with `GHCR_USER` and a `DOCKER_CONFIG` created by `mktemp -d`, runs the deploy, and removes
that directory through an `EXIT` trap. A manual deploy may export `GHCR_TOKEN`/`GHCR_USER` for the
command (not in `.env`) or run `docker login`. The login necessarily writes a mode-700 temporary
Docker config for the duration of the run; no token is written to the repository, `.env`, logs, or the
host's default Docker config.

**Consequences.** The VPS can pull private images without a persistent registry credential; a leaked
workflow token expires with the job. The deploy depends on the token being passed over SSH; a manual
`deploy.sh` without `GHCR_TOKEN` needs an operator login or public packages. The credential exists in
a mode-700 temporary Docker config and the deploy process environment for the run, not as a persistent
credential; a `SIGKILL` can leave the directory until reboot. Revisit if the organization API gains
visibility control or a pull-through mirror is introduced.

---

## ADR-031 — Public 1 GB host: core observability profile

**Date**: 2026-10-24 · **Status**: Accepted

**Context.** The v1.0.0 release published both immutable images. Two different failures were
initially described as one “cold-start timeout”:

1. The first manual deploy used the old 240-second health gate. The API container started at
   `2026-10-22T22:39:00Z` and Spring Boot logged `Started AetherArchiveApplication in 1093.293
   seconds` at `22:58:23Z`; the deploy had already recorded `failed` at `22:43:28Z`.
2. The release deploy job started at `22:59:48Z` with that API container already warm. Its
   healthcheck was green at `23:09:03Z`, but the public smoke's API reads failed and the
   Jaeger UI was unreachable; the job ended `failure` at `23:22:32Z` with the full trace/log stack
   running on the 1 GB host.

**Decision.** The public deploy starts the **core profile** by default: PostgreSQL, API, web, Caddy,
Prometheus, Grafana, Alertmanager and Loki. Loki stays because it backs Grafana's log datasource;
Promtail (the shipper), Jaeger and the OTel Collector are full-profile only. The full trace/log stack
remains defined in `docker-compose.observability.yml` and runs locally (`make observe-up`) or on a
larger host with `AETHER_FULL_OBSERVABILITY=1`. `deploy.sh` waits up to `AETHER_WAIT_TIMEOUT` seconds
(default 1800, measured from the 1093-second start) and the release deploy job timeout is 50 minutes.
`smoke.sh` reports absent shipper/trace containers as `SKIP` with `SMOKE_PUBLIC_PROFILE=1`, which the
deploy script sets for the core profile. Grafana no longer has a startup `depends_on` for Loki; the
datasource connects when Loki is ready.

**Consequences.** The public demo fits 1 GB, the public smoke is stable, and the metrics/alerting path
the rubric measures is live. The public log datasource is healthy but empty because the shipper is
full-profile; traces and logs are demonstrated locally and documented. The first v1.0.0 deploy job
remains recorded as failed — the fix is the default for later releases, not a rewrite of history.
Revisit if the VPS is resized or the trace/log stack becomes a hard public requirement.

---

## Template for new ADRs

```markdown
## ADR-NNN — <short title>

**Date**: YYYY-MM-DD · **Status**: Proposed | Accepted | Superseded by ADR-NNN

**Context.** What forces are at play, what the specs say, what is open.

**Decision.** What we will do, precisely.

**Consequences.** What becomes easier, harder, forbidden; what would need a new ADR.
```
