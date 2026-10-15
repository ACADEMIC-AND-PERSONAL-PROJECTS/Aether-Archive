# Decision Log (ADR)

Architecture Decision Records for Aether Archive. **Every choice the specs leave open is recorded here
before it is implemented** — alternatives, decision, consequences. One short record is enough; the point
is that future sessions do not re-litigate settled questions or silently drift.

Statuses: `Proposed` · `Accepted` · `Superseded by ADR-NNN` · `Rejected`.

## Index

| # | Date | Title | Status |
| --- | --- | --- | --- |
| [ADR-001](#adr-001--embedded-sqlite-as-the-database) | 2026-10-15 | Embedded SQLite as the database | Accepted |
| [ADR-002](#adr-002--merge-commits-only-append-only-history) | 2026-10-15 | Merge commits only, append-only history | Accepted |
| [ADR-003](#adr-003--gitflow-lite-with-protected-main-and-develop) | 2026-10-15 | GitFlow-lite with protected `main` and `develop` | Accepted |
| [ADR-004](#adr-004--tanstack-query-as-the-frontend-data-layer) | 2026-10-15 | TanStack Query as the frontend data layer | Accepted |
| [ADR-005](#adr-005--fontsource-npm-packages-for-typography) | 2026-10-15 | Fontsource NPM packages for typography | Accepted |
| [ADR-006](#adr-006--image-derived-theme-colours-at-runtime) | 2026-10-15 | Image-derived theme colours at runtime | Accepted |
| [ADR-007](#adr-007--scrum-artefacts-in-repository) | 2026-10-15 | Scrum artefacts in-repository | Accepted |
| [ADR-008](#adr-008--no-spring-security-for-v1) | 2026-10-15 | No Spring Security for v1 | Accepted |

---

## ADR-001 — Embedded SQLite as the database

**Date**: 2026-10-15 · **Status**: Accepted

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

## Template for new ADRs

```markdown
## ADR-NNN — <short title>

**Date**: YYYY-MM-DD · **Status**: Proposed | Accepted | Superseded by ADR-NNN

**Context.** What forces are at play, what the specs say, what is open.

**Decision.** What we will do, precisely.

**Consequences.** What becomes easier, harder, forbidden; what would need a new ADR.
```
