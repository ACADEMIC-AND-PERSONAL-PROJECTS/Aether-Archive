# Aether Archive — Product Backlog

> **Canonical source of truth** for scope, priority and estimates.
> Mirrored to GitHub issues/labels/milestones via the `/backlog-sync` skill.
> Derived from `_docs/aether_archive_specs.md` and `_docs/openapi.yml` (read-only).

## How to read this file

| Field | Meaning |
| --- | --- |
| **ID** | `E<epic>-S<n>` — e.g. `E2-S4`. Stable; never reused. |
| **Priority** | `p0` must ship in its sprint · `p1` should ship soon · `p2` nice to have |
| **Points** | Fibonacci (1, 2, 3, 5, 8). Anything above 8 must be split. |
| **Sprint** | Target sprint. Re-checked at every sprint planning; a move is recorded in the sprint doc. |
| **Status** | `Todo` · `In progress` · `In review` · `Done` · `Dropped` |

Rules: the file wins over GitHub. Scope changes are recorded here first, with a one-line reason.
A story is `Done` only when the Definition of Done (`DEFINITION-OF-DONE.md`) is verified with evidence.

## Epic overview

| Epic | Name | Sprints | Stories | Points | Goal |
| --- | --- | --- | --- | --- | --- |
| **E1** | Foundation & Backend | S1–S2 | 11 | 38 | A local REST API that stores images and dumps durably, with tests. |
| **E2** | Frontend Foundation & Design System | S2 | 6 | 29 | A runnable React shell and the image-derived Dark Glassmorphism design system. |
| **E3** | Immersive Splash & Glass Menu | S3 | 5 | 18 | The signature entry experience: full-bleed random photo + glass menu. |
| **E4** | Curator's Workshop | S3–S4 | 5 | 28 | Upload, order and publish a 6-photo dump with its aura colour. |
| **E5** | The Time River | S5 | 4 | 21 | The chronological feed with ambient per-dump background. |
| **E6** | Quality, Delivery & Release | S4–S6 | 18 | 59 | CI, accessibility, hardening, containerization, documentation and the v1.0 release. |

**Total: 49 stories · 193 points · 6 sprints (~2 weeks each, 25–34 points per sprint).**

> E6-S13…S16 were added after Sprint 1 from the release security audit (`reports/security-audit-sprint01.md`).
> They are **not** Sprint 1 stories and are not counted in its velocity: E6-S15 is `Done` because the reachable
> finding (SEC-03) was fixed before that sprint closed, in PR #70, and the remaining 8 points await Sprint-2
> planning. **Sprint 2 planning has since decided they stay unassigned** (they are E6-S13/E6-S14 and
> do not enter that sprint implicitly), so the sprint map still sums to 181. The 8 points are unscheduled
> work awaiting a deliberate decision, not a backlog error.
>
> **E6-S17** (2 pts, `p1`) was added during Sprint 2 from E1-S5's static-serving probes — behaviours no
> request can reach but that a file placed by hand, a restore, or a sync can widen, so they were routed
> rather than patched inside E1-S5. Its `p1` is argued in the story: the security rule's `p0` assumes a
> request can reach the finding, and none can. It is unscheduled like the rest of E6-S13…S17.
>
> **Sprint 3 planning (2026-10-16) keeps them out by name.** The sprint commits 28 of its 25–34 band to
> the entry experience and the first uploads (E3 + E4-S1/S2) and carries no hardening goal; #71, #72, #73
> and #79/E6-S17 stay unscheduled, awaiting an explicit owner decision (`docs/scrum/sprints/sprint03.md`,
> §Out of scope).

```text
Sprint 1  E1  Foundation & Backend              (34)
Sprint 2  E2 + E1-S5/S10  Frontend Foundation & Design Sys  (33)
Sprint 3  E3 + E4-S1/S2  Splash · Menu · Upload (28)
Sprint 4  E4 + E6-S1/S2  Workshop · CI          (25)
Sprint 5  E5 + E6-S3/S4  Time River · A11y      (27)
Sprint 6  E6  Hardening · Polish · v1.0         (34)
```

---

## E1 — Foundation & Backend

**Goal:** a Spring Boot application that owns the local data directory, persists items in PostgreSQL,
serves images and exposes the `/api/v1` contract from `_docs/openapi.yml` — fully tested, no external calls.

| ID | Story | P | Pts | Sprint | Status |
| --- | --- | --- | --- | --- | --- |
| E1-S1 | Scaffold the Spring Boot project | p0 | 3 | 1 | Done |
| E1-S2 | Configuration & local data directory | p0 | 2 | 1 | Done |
| E1-S3 | PostgreSQL persistence + Flyway baseline | p0 | 5 | 1 | Done |
| E1-S4 | StorageService — safe local file storage | p0 | 5 | 1 | Done |
| E1-S5 | Serve images at `/images/**` | p0 | 2 | 2 | Done |
| E1-S6 | Photo API — upload, list, random | p0 | 5 | 1 | Done |
| E1-S7 | Dump API — create and list 6-photo dumps | p0 | 5 | 1 | Done |
| E1-S8 | Error handling (RFC 9457) & validation | p0 | 2 | 1 | Done |
| E1-S9 | Backend test suite | p0 | 5 | 1 | Done |
| E1-S10 | Dev seed script & curl smoke collection | p2 | 2 | 2 | Done |
| E1-S11 | Dev PostgreSQL via Docker Compose | p0 | 2 | 1 | Done |

### E1-S1 — Scaffold the Spring Boot project · 3 pts · p0

*As a developer, I want a standard Spring Boot skeleton, so that every following story has a home.*

- [ ] Maven project under `backend/` with the Maven wrapper (`./mvnw`), Java 21, Spring Boot 3.
- [ ] Base package `com.aetherarchive`, packages `config/ domain/ repository/ service/ web/ dto/ exception/`.
- [ ] `dev`, `test`, `prod` profiles; `application.yml` reads env vars from `.env.example`.
- [ ] `./mvnw verify` runs and is green (one smoke test included).
- [ ] `CLAUDE.md` §Commands updated with the real commands.

### E1-S2 — Configuration & local data directory · 2 pts · p0

*As the owner, I want the data directory configurable, so that my images live where I decide.*

- [ ] `aether.storage.data-dir` (env `AETHER_DATA_DIR`, default `~/AetherArchive_Data`) resolved at boot.
- [ ] Subfolders `images/`, `thumbnails/`, `tmp/` created idempotently (the database runs in its own container volume — ADR-009).
- [ ] `AETHER_MAX_UPLOAD_MB` and `AETHER_CORS_ALLOWED_ORIGINS` wired; CORS restricted to configured origins.
- [ ] Boot fails with a clear message if the directory is not writable.
- [ ] Unit test with `@TempDir` covering creation and the failure path.

### E1-S3 — PostgreSQL persistence + Flyway baseline · 5 pts · p0

*As the owner, I want my archive stored in a local PostgreSQL database, so that the data layer is robust and standard.*

- [ ] PostgreSQL 17 via Spring Data JPA + `org.postgresql:postgresql`; connection built from env (ADR-009); dev server from E1-S11.
- [ ] Flyway `V1__baseline.sql` creates `archive_item` and `photo`; `hibernate.ddl-auto=validate` (never `update`).
- [ ] Entities `ArchiveItem` and `Photo` per `.claude/rules/backend.md` (UUID ids, UTC `Instant`, `displayOrder`).
- [ ] Derived-order query returns the river sorted `timestamp DESC, id` (stable).
- [ ] `@DataJpaTest` on a real Postgres via Testcontainers (test-only dependency, justified in the PR; no pre-running database needed).

### E1-S4 — StorageService — safe local file storage · 5 pts · p0

*As the owner, I want uploads stored safely, so that no filename or path can hurt my machine.*

- [ ] `store(MultipartFile)` validates MIME type + magic bytes + extension whitelist (`jpg jpeg png webp gif avif`).
- [ ] Size limit enforced (`AETHER_MAX_UPLOAD_MB`), oversized files rejected with a `ProblemDetail`.
- [ ] Files written atomically (temp file in `tmp/` then `ATOMIC_MOVE`), named `<uuid>.<ext>`.
- [ ] Canonical-path check guarantees every write stays under the data root; `../` filenames are inert.
- [ ] Unit tests: valid image, fake extension, oversized, traversal attempt, temp cleanup on failure.

### E1-S5 — Serve images at `/images/**` · 2 pts · p0

*As the frontend, I need to display stored images, so that the app works without a separate file server.*

- [ ] `WebMvcConfigurer` maps `/images/**` to `file:${data-dir}/images/` (thumbnails later).
- [ ] `Cache-Control: public, max-age=31536000, immutable` (UUID names never change).
- [ ] Unknown files return 404 without leaking paths; no directory listing possible.
- [ ] Integration test fetching a stored file and a missing one.
- [ ] Send the `Content-Type` derived from the stored extension (never the client's), add
      `X-Content-Type-Options: nosniff`, and make directory listing impossible (audit SEC-N2).

### E1-S6 — Photo API — upload, list, random · 5 pts · p0

*As the app, I want to upload and read photos, so that the archive can grow and the splash has content.*

- [ ] `POST /api/v1/photos` (multipart, `category=pics|anime`) → 201 with the created `Photo`.
- [ ] `GET /api/v1/photos` → array sorted newest-first, OpenAPI shape respected.
- [ ] `GET /api/v1/photos/random` → one photo; 404 `ProblemDetail` with a stable code when empty.
- [ ] DTOs only in responses (no entity leakage); invalid payloads → 400 with field details.
- [ ] `@WebMvcTest` for success + failure paths; one `@SpringBootTest` covering upload → disk → DB → list.

### E1-S7 — Dump API — create and list 6-photo dumps · 5 pts · p0

*As the curator, I want to publish a 6-photo dump with its aura colour, so that months are preserved.*

- [ ] `POST /api/v1/dumps` accepts `title?`, `backgroundColor` (`^#[0-9a-fA-F]{6}$`), exactly 6 distinct `photoIds`.
- [ ] `displayOrder` is assigned 0–5 from the request order; the order reaches clients as the
      position of each photo in `Dump.photos` — the contract's `Photo` schema has no such field (ADR-011 §3).
- [ ] Rejections: 5 or 7 ids, duplicates, unknown id, bad colour → 400/404 with precise `ProblemDetail`.
- [ ] `GET /api/v1/dumps` returns dumps newest-first with their ordered photos.
- [ ] Service unit tests + `@SpringBootTest` round trip.

### E1-S8 — Error handling (RFC 9457) & validation · 2 pts · p0

*As an API consumer, I want consistent errors, so that the frontend can react programmatically.*

- [ ] `@RestControllerAdvice` maps domain + validation errors to `ProblemDetail` with a stable `code`.
- [ ] No stack traces, SQL, absolute paths or class names in any response body.
- [ ] Validation constraints centralised (title ≤ 80, colour hex, exactly 6 ids, size limit).
- [ ] Tests assert the error shape for each mapped case.

### E1-S9 — Backend test suite · 5 pts · p0

*As a maintainer, I want real coverage, so that refactors stay safe.*

- [ ] Services: unit tests with `@TempDir` (storage, ordering, dump validation).
- [ ] Controllers: `@WebMvcTest` per endpoint family, including the 400/404 paths.
- [ ] One end-to-end `@SpringBootTest` on a temp data dir (Postgres via Testcontainers): upload 6 photos → create dump → read it back.
- [ ] Deterministic tests (injected `Clock`, no sleeps); suite runs under 60 s.
- [ ] `./mvnw verify` green; evidence in the PR.

### E1-S10 — Dev seed script & curl smoke collection · 2 pts · p2

*As a developer, I want sample data and smoke calls, so that demoing and QA are one command away.*

- [ ] `scripts/dev/seed.sh` posts N sample photos then a dump, against a running local backend.
- [ ] `scripts/dev/smoke.http` (or `.sh`) covers every endpoint including failure paths.
- [ ] `AETHER_DATA_DIR` is honoured; script refuses to run against the real data dir without `--force`.
- [ ] Documented in the backend README.

### E1-S11 — Dev PostgreSQL via Docker Compose · 2 pts · p0

*As a developer, I want the database started with one command locally, so that environments match.*

- [ ] `docker-compose.dev.yml` at the repo root: one `db` service, `postgres:17-alpine`, port from `AETHER_DB_PORT` (default 5432), named volume `aether_pgdata`, healthcheck.
- [ ] Credentials and database name from `.env` (`POSTGRES_*`); `.env.example` updated; nothing secret committed.
- [ ] The service pins `postgres:17-alpine` by digest, so a mutable tag cannot change what runs
      (audit SEC-N6).
- [ ] `README.md` quickstart and backend README document `docker compose -f docker-compose.dev.yml up -d`.
- [ ] `./mvnw spring-boot:run` connects to it with the documented `.env` values (smoke-tested).

---

## E2 — Frontend Foundation & Design System

**Goal:** a runnable, linted, tested React shell whose entire visual language — colours extracted from the
user's own images, Dark Glassmorphism tokens, local Fontsource typography — is defined and reusable.

| ID | Story | P | Pts | Sprint | Status |
| --- | --- | --- | --- | --- | --- |
| E2-S1 | Scaffold the frontend toolchain | p0 | 5 | 2 | Done |
| E2-S2 | App shell, routing & typed API client | p0 | 5 | 2 | Done |
| E2-S3 | Global CSS foundation | p0 | 3 | 2 | Done |
| E2-S4 | Dominant-colour extraction algorithm | p0 | 8 | 2 | Done |
| E2-S5 | Fontsource typography system | p0 | 3 | 2 | Done |
| E2-S6 | Dark Glassmorphism theme layer & GlassPanel | p0 | 5 | 2 | Done |

### E2-S1 — Scaffold the frontend toolchain · 5 pts · p0

*As a developer, I want a modern React setup, so that every following story builds on solid tooling.*

- [ ] Vite + React + TypeScript (strict) under `frontend/`; Tailwind CSS configured.
- [ ] ESLint + Prettier with a `lint` script; import order and unused-import rules on.
- [ ] Vitest + React Testing Library wired (`npm run test`), one placeholder test.
- [ ] The **Tailwind major version** is recorded as an ADR with its reason: v3's config file and v4's CSS-first
      theme decide how the next four stories write styles, so leaving it implicit inside a config file would
      make four stories guess (Sprint 2 plan §Risks).
- [ ] The **test environment's capabilities are probed and recorded** (does the runner provide a canvas?
      which DOM implementation, and what it does not support?) and the screenshot mechanism the later UI
      stories need is identified — both are E2-S4/E2-S3's known risks and are cheap to settle here.
- [ ] `npm run build` outputs a static bundle; dev server reachable from the LAN (`--host`).
- [ ] `CLAUDE.md` §Commands updated; `.editorconfig` respected.

### E2-S2 — App shell, routing & typed API client · 5 pts · p0

*As the app, I need routes and a data layer, so that views talk to the local API safely.*

- [ ] React Router with routes `/` (splash), `/river`, `/curate`; lazy-loaded views.
- [ ] TanStack Query provider; `api/client.ts` with base URL from `VITE_API_BASE_URL`, typed errors.
- [ ] TypeScript types mirroring `_docs/openapi.yml` (`ArchiveItem`, `Photo`, `ProblemDetail`).
- [ ] Query keys centralised in `api/queryKeys.ts`; retry/backoff policy documented.
- [ ] Tests for the client error mapping (4xx/5xx/network) and a route smoke test.

### E2-S3 — Global CSS foundation · 3 pts · p0

*As a mobile user, I want the app to fill the screen cleanly, so that browsing feels native.*

- [ ] `styles/global.css`: reset, dark base, hidden scrollbars, `100dvh`, safe-area insets, overscroll behaviour.
- [ ] **Tailwind's content scan is scoped explicitly** (`@source`) so the built CSS depends on `src/` alone:
      found in E2-S1's review, the default scan reaches `frontend/README.md` prose — a doc edit currently
      changes the CSS hash, and `w-[43px]` written in a document ships a rule.
- [ ] Typographic scale variables (`--text-*`) and spacing scale defined once.
- [ ] `prefers-reduced-motion` guard available globally.
- [ ] No horizontal overflow at 320/390/430 px widths; verified with screenshots.
- [ ] Documented in `docs/engineering/DESIGN-SYSTEM.md`.

### E2-S4 — Dominant-colour extraction algorithm · 8 pts · p0

*As the curator, I want the app to read the colours of my images, so that the interface takes on their mood.*

- [ ] `lib/color/` implements downscale (≤ 64 px) → OKLCH clustering → scoring → palette of 5–8 colours.
- [ ] Deterministic for identical input; < 50 ms on a 64 px downscale; no network, no heavy dependency.
- [ ] Near-black/near-white clusters filtered; merge threshold ΔE < 0.02; weights returned.
- [ ] Fixture-based unit tests: dominant hue, low saturation, grayscale, transparent PNG, corrupted file.
- [ ] Algorithm choice recorded as an ADR with measured numbers.

### E2-S5 — Fontsource typography system · 3 pts · p0

*As the curator, I want elegant, offline typography, so that titles feel editorial and the menu feels clean.*

- [ ] Display serif + UI sans installed **only** as Fontsource NPM packages (`@fontsource*`).
- [ ] Imports in the entry file; Vite self-hosts the font files (no `<link>`, no CDN, no runtime request).
- [ ] `--font-display` and `--font-ui` plus weights/tracking declared in `styles/global.css`.
- [ ] Dump titles/markers use display; every UI/menu text uses UI; no raw `font-family` in components.
- [ ] Added font payload < 200 KB; build output contains the fonts; ADR records the chosen pair.

### E2-S6 — Dark Glassmorphism theme layer & GlassPanel · 5 pts · p0

*As the curator, I want a coherent glass theme, so that the UI disappears behind my images.*

- [ ] `lib/color/theme.ts` maps a palette to `--aura-*` tokens and applies them to `:root` at runtime.
- [ ] Neutral fallback palette when extraction fails; contrast ≥ 4.5:1 enforced by construction.
- [ ] `GlassPanel` primitive: `rgba(0,0,0,0.4)` + `backdrop-filter: blur(15px)` + hairline; solid-tint fallback.
- [ ] No hex literal outside the theme layer; audited with grep and documented in the design system doc.
- [ ] Storybook-free visual check page or test rendering all tokens; screenshot in the PR.

---

## E3 — Immersive Splash & Glass Menu

**Goal:** the signature first contact — a full-bleed random photo, zero chrome, and a dark glass menu that
opens on tap, feels tactile, and gets out of the way.

| ID | Story | P | Pts | Sprint | Status |
| --- | --- | --- | --- | --- | --- |
| E3-S1 | Immersive splash view | p0 | 5 | 3 | Done |
| E3-S2 | Glass menu overlay | p0 | 5 | 3 | Done |
| E3-S3 | Route transitions & motion system | p0 | 3 | 3 | Done |
| E3-S4 | Quiet loading / empty / error states | p1 | 2 | 3 | Todo |
| E3-S5 | View tests & accessibility pass | p0 | 3 | 3 | Todo |

### E3-S1 — Immersive splash view · 5 pts · p0

*As the curator, I want to be greeted by one of my photos, so that opening the app feels like entering a sanctuary.*

- [ ] `GET /photos/random` photo rendered full-bleed (`object-fit: cover`), headerless, zero visible UI.
- [ ] Hero image preloaded and decoded before reveal; no flash of empty screen (dominant tone placeholder).
- [ ] Tap anywhere opens the menu; tap again (or Esc) closes it.
- [ ] Fresh random photo per visit; pull-to-refresh re-rolls without reloading the app shell.
- [ ] Empty archive → quiet empty state from E3-S4, never a crash.

> **Delivered in two slices (Sprint 3), both merged — with two halves still owned by later stories:**
> criterion 3's overlay and focus trap are **E3-S2**'s, and criterion 5's visible empty state is
> **E3-S4**'s. **E3-S1A** (3 pts, PR #100, merge `2d8af90`) carries criteria 1, 2 and 5 — the photo, its
> tone, the quiet states; **E3-S1B** (2 pts, PR #101, merge `79859c4`) carries criteria 3 and 4 — the tap
> intent, the pull, the per-visit photo, cut from an updated `develop` after A merged. Changed lines:
> 1,367 + 929 = **2,296**, against **1,516** for the unsliced branch — **the split cost 51%, and 73% of
> that cost is re-stated prose** (194 → 766 lines), each slice writing its own verify report, README rows
> and ADR pass. The story was first delivered
> whole at 1,516 hand-written lines claiming the atomic-story exception; the claim did not survive review
> (it argued a slice would leave the view non-interactive while the overlay is E3-S2 and the whole story
> does not open a menu either), so it was withdrawn and the story re-cut. Points unchanged.
> Details: `docs/scrum/sprints/sprint03.md`, "E3-S1 was split at review".

### E3-S2 — Glass menu overlay · 5 pts · p0

*As the curator, I want a discreet menu, so that navigation is available but never shouts.*

- [ ] Overlay: dark glass panel, `backdrop-filter: blur(15px)`, fade + 12–16 px translate, 300–600 ms.
- [ ] Entries: **The River**, **Curate**, **Close** — UI sans, comfortable touch targets (≥ 44 px).
- [ ] Focus trapped while open, `role="dialog"` + `aria-modal`, Esc closes, focus returns to the trigger.
- [ ] Tap on the backdrop closes; body scroll locked while open; `prefers-reduced-motion` honoured.
- [ ] Tests: open/close, keyboard path, focus restoration.

> **Delivered in one PR (Sprint 3)**: #104, merged `e7a50d6`, **1,085 hand-written changed lines** — over both
> budgets, so the atomic-story exception was claimed and judged, and it held against four counter-cuts. The
> decisive measurement is that **production code alone is 425 lines**: no arrangement of tests and
> documentation reaches the budget while the criteria stand, which makes this a sizing question rather than a
> slicing one (`docs/scrum/sprints/sprint03.md`). Four findings were routed instead of absorbed: muted-over-
> glass → E3-S4, the sheet-over-veil pattern → E3-S3, `GlassPanel`'s missing `ref` → E4-S3, and tokens
> serialised as 4-/8-digit hex → E6-S18 / #103.

### E3-S3 — Route transitions & motion system · 3 pts · p0

*As a mobile user, I want fluid transitions, so that moving between views feels continuous.*

- [ ] A small motion token set (durations, easings, distances) centralised in `lib/motion/`.
- [ ] Route transitions use fade + subtle vertical movement; no layout jump, no double scrollbars.
- [ ] Animations are interruptible; back/forward navigation remains correct.
- [ ] Reduced motion disables transforms (opacity only).
- [ ] Screenshots/recording attached for the review.

> **Delivered in one PR (Sprint 3)**: #106, merged `f84063a`, **1,224 hand-written changed lines** (1,190 at
> review → 1,224 merged), 663 of them product against 561 of record. Over both budgets; the exception claim
> was restated after review — a third cut existed and met every criterion, so the claim rests on the budget
> arithmetic rather than on inseparability. ADR-022 declines **Framer Motion** (measured +83.92 kB raw /
> +29.22 kB gzip for the smallest tree-shaken import against +0.49 / +0.15 for the CSS layer) — a divergence
> from `_docs/aether_archive_specs.md`, **approved by the owner on 2026-10-17** and recorded with a named
> revisit trigger. Two findings were routed rather than absorbed: scroll restoration between scrollable
> views → **E5-S1**; a `position: fixed` overlay coupling to the transformed wrapper → **E3-S4**.

### E3-S4 — Quiet loading / empty / error states · 2 pts · p1

*As the curator, I want graceful silence when there is nothing to show, so that the aesthetic is never broken.*

- [ ] Loading = opacity pulse or blurred dominant tone; never a labelled spinner.
- [ ] Empty archive = one quiet sentence in display serif on the dark base.
- [ ] API error = discreet glass notice with a retry affordance; no raw messages, no alerts.
- [ ] All three states rendered in tests.
- [ ] **`error` does not always mean an empty screen.** Since E3-S1A, `data-state="error"` is also what a
      *failed replacement* reports while the previous photo stays painted (deliberately: unmounting a
      good picture for a placeholder would break the splash's own promise). So the notice needs its own
      scrim over the photo, or a separate signal, rather than the assumption that error implies bare
      background — found by E3-S1A's review.
- [ ] **Text on the notice uses `--aura-text`, never `--aura-muted`.** Measured by E3-S2 over a white photo:
      the theme's muted token paints **4.14:1** on the glass where the text token paints **8.07:1**. The
      generator raises `muted` until it clears 4.5:1 *on the page background*, which is not where a glass
      notice puts it. A one-line rule for DESIGN-SYSTEM §2.2 belongs with whichever story next edits it.

### E3-S5 — View tests & accessibility pass · 3 pts · p0

*As the team, we want the entry experience verified, so that regressions are caught.*

- [ ] RTL tests for splash (photo rendered, tap opens menu) and menu (a11y roles, Esc, focus return).
- [ ] Axe (or equivalent) run on the splash and menu with no serious violations.
- [ ] Contrast verified for every text style over glass and over images (scrim rule).
- [ ] **Decide `inert` on what the dialog covers.** E3-S2 ships a modal that a keyboard and a pointer
      cannot reach past, but an assistive-technology virtual cursor still can: `inert` — shipped in the
      browsers this app targets — is what closes that, and jsdom does not implement it (`el.inert = true`
      writes no attribute, measured), so it needs a browser check rather than a unit test. The component
      comment records the trade; this is where it gets an owner.
- [ ] Manual pass on a 390 px viewport documented in the PR.

> **Delivered in two slices (Sprint 3), both merged** — the E3 epic is complete. **E3-S5A** (PR #110, merge
> `97d258b`; 237 hand-written) carries criteria 1-2 — the axe gate: `axe-core` 4.14.0 dev-only, **six runs**
> at zero violations of every impact, with the two buckets axe cannot judge in jsdom (`incomplete`,
> `inapplicable`) pinned rather than tolerated, and the gate's subtree scope stated. **E3-S5B** (PR #111,
> merge `ed5cd94`; 496 hand-written) carries criteria 3-5 — painted contrast at 320/390/430, the `inert`
> decision with its failure mode documented, the persistent status region as a **sibling** of `<main>`, and
> the manual pass. The story was first delivered whole at 551 hand-written lines claiming the atomic-story
> exception; the review found **the cut I had not tested, by criterion rather than by surface**. Final cost:
> **733 lines against 551 unsplit (+33%)** — recorded for the retrospective, because the split was the
> review's decision and the overhead belongs to the process, not to the story.

---

## E4 — Curator's Workshop

**Goal:** the creative core — select up to 6 images, order them by touch, choose the aura colour, publish a dump.

| ID | Story | P | Pts | Sprint | Status |
| --- | --- | --- | --- | --- | --- |
| E4-S1 | Single photo upload | p0 | 5 | 3 | Todo |
| E4-S2 | Multi-select (≤ 6) & client-side downscale | p0 | 5 | 3 | Todo |
| E4-S3 | Drag-and-drop ordering | p0 | 8 | 4 | Todo |
| E4-S4 | Aura colour picker with palette suggestions | p0 | 5 | 4 | Todo |
| E4-S5 | Publish dump with optimistic UI | p0 | 5 | 4 | Todo |

### E4-S1 — Single photo upload · 5 pts · p0

*As the curator, I want to add one photo at a time, so that my archive grows gradually.*

- [ ] Native file picker (accept images only), client-side type/size validation before upload.
- [ ] Upload progress indicator (glass, quiet); cancel supported where feasible.
- [ ] Failures surface a retry; the file stays selected; no silent loss.
- [ ] Success updates the archive without a page reload (query invalidation).
- [ ] Tests: validation rejects, error retry path, success invalidation.

### E4-S2 — Multi-select (≤ 6) & client-side downscale · 5 pts · p0

*As the curator, I want to pick several images at once, so that building a dump is fast.*

- [ ] Multi-select picker; hard cap of 6 with a quiet explanation, extra selections ignored or blocked.
- [ ] Images downscaled/compressed client-side before upload when above a threshold (quality preserved for viewing).
- [ ] Thumbnail grid of the selection with remove affordance and per-file state.
- [ ] Uploads run sequentially or bounded-concurrent; one failure never aborts the others silently.
- [ ] Tests for the cap and for the downscale decision function (pure).

### E4-S3 — Drag-and-drop ordering · 8 pts · p0

*As the curator, I want to reorder my 6 images by touch, so that the dump tells the story I want.*

- [ ] `@dnd-kit` grid: long-press (touch) / drag (mouse) reorder with visual lift, no scroll conflict.
- [ ] Order is a pure reducer in `lib/` (unit-tested) driving `displayOrder` 0–5 in the payload.
- [ ] Keyboard path: focus an item, move it with keys, announced to assistive tech.
- [ ] Auto-scroll while dragging near edges; drop animation feels tactile (≤ 300 ms).
- [ ] Tests: reducer, keyboard move, reorder persistence in the payload.

### E4-S4 — Aura colour picker with palette suggestions · 5 pts · p0

*As the curator, I want to choose the dump's background colour, so that the river reflects its mood.*

- [ ] Hex input with validation (`#RRGGBB`), plus the palette extracted from the selected images as tappable swatches.
- [ ] Live preview of the glass theme against the chosen background (text contrast guaranteed).
- [ ] Suggestions ranked by confidence; a "reset to extracted" action restores the top suggestion.
- [ ] Selection survives reordering and page refresh within the workshop session.
- [ ] Tests for validation, suggestion mapping and preview tokens.

### E4-S5 — Publish dump with optimistic UI · 5 pts · p0

*As the curator, I want to publish my dump, so that it joins the river.*

- [ ] `POST /dumps` with title (optional), colour, 6 ordered ids; server errors mapped to precise messages.
- [ ] Optimistic insert into the river feed; rollback with a discreet notice on failure.
- [ ] Double-submit prevented; button shows progress; success returns to the previous view.
- [ ] Duplicate/insufficient selection blocked before the request (mirrors server validation).
- [ ] End-to-end test (mocked API) of publish success and rollback.

---

## E5 — The Time River

**Goal:** scroll through everything ever archived, with the page itself taking on the colour of each dump.

| ID | Story | P | Pts | Sprint | Status |
| --- | --- | --- | --- | --- | --- |
| E5-S1 | River feed & timeline markers | p0 | 8 | 5 | Todo |
| E5-S2 | Ambient background per dump | p0 | 5 | 5 | Todo |
| E5-S3 | Image loading performance (LQIP, no CLS) | p0 | 5 | 5 | Todo |
| E5-S4 | Virtualisation decision & implementation | p1 | 3 | 5 | Todo |

### E5-S1 — River feed & timeline markers · 8 pts · p0

*As the curator, I want to scroll my whole archive, so that I can relive it in order.*

- [ ] Infinite vertical feed grouped by month, markers in display serif, generous negative space.
- [ ] Pagination or cursor-based loading (decide with an ADR); no duplicate keys, stable ordering.
- [ ] Dumps render their 6 photos as a section; single photos appear between markers.
- [ ] Scroll position is preserved when navigating back from a detail/menu overlay.
- [ ] Tests: grouping logic (pure function), pagination boundaries, empty archive.

### E5-S2 — Ambient background per dump · 5 pts · p0

*As the curator, I want the background to melt into each dump's colour, so that scrolling feels like a journey.*

- [ ] IntersectionObserver sets `--aura-bg` from the in-view dump's `backgroundColor`.
- [ ] Transition ≥ 600 ms, interruptible, no repaint storms while scrolling fast.
- [ ] Text contrast re-validated for every active colour (automatic lightness adjustment).
- [ ] Observer disconnected on unmount; only one active section at a time (threshold tuned visually).
- [ ] Test the selector logic; recording attached for visual proof.

### E5-S3 — Image loading performance (LQIP, no CLS) · 5 pts · p0

*As a mobile user, I want images to appear smoothly, so that scrolling never janks.*

- [ ] Every image: explicit aspect ratio, `loading="lazy"`, `decoding="async"`, `sizes` correct.
- [ ] Dominant-colour placeholder (from `lib/color/`) painted behind each image until decode completes.
- [ ] No cumulative layout shift on a 390 px viewport (measured, number reported).
- [ ] First viewport budget respected (LCP < 1.5 s over LAN reported in the PR).
- [ ] Fallback for broken images without breaking layout.
- [ ] The thumbnail URL space is decided and mapped before anything is served from it: E1-S5 maps
      `images/` alone, so `/images/thumbnails/**` resolves *inside* the originals directory today. Whoever
      generates derivatives names their own directory and adds its mapping rather than widening E1-S5's.

### E5-S4 — Virtualisation decision & implementation · 3 pts · p1

*As a maintainer, I want the feed to stay fast with hundreds of items, so that the app ages well.*

- [ ] Measure first: profile a 300-item feed, record numbers in an ADR (window/virtualise yes/no).
- [ ] If yes: windowed rendering with stable scroll restoration and no visual artefacts.
- [ ] If no: document the threshold at which it must be revisited as a backlog item.
- [ ] Numbers (DOM nodes, frame time) reported in the PR either way.

---

## E6 — Quality, Delivery & Release

**Goal:** make the project safe to change and pleasant to own — CI, accessibility, hardening, containerized
delivery, documentation, and a clean v1.0.

| ID | Story | P | Pts | Sprint | Status |
| --- | --- | --- | --- | --- | --- |
| E6-S1 | CI — backend + frontend on every PR | p0 | 5 | 4 | Todo |
| E6-S2 | Required status checks on `main`/`develop` | p0 | 2 | 4 | Todo |
| E6-S3 | Accessibility audit (WCAG 2.2 AA) | p1 | 3 | 5 | Todo |
| E6-S4 | Real-device verification pass (LAN) | p0 | 3 | 5 | Todo |
| E6-S5 | Security & robustness pass | p0 | 5 | 6 | Todo |
| E6-S6 | Documentation & runbook | p1 | 3 | 6 | Todo |
| E6-S7 | Backup / export utility | p2 | 5 | 6 | Todo |
| E6-S8 | Performance budget pass | p1 | 5 | 6 | Todo |
| E6-S9 | Polish pass — motion, gestures, iOS quirks | p1 | 5 | 6 | Todo |
| E6-S10 | v1.0 release | p0 | 3 | 6 | Todo |
| E6-S11 | Container images (`api`, `web`) | p0 | 3 | 6 | Todo |
| E6-S12 | One-command stack & clean-clone verification | p0 | 5 | 6 | Todo |
| E6-S13 | Cross-site write protection (Sprint 1 audit SEC-01, issue #71) | p1 | 2 | — | Todo |
| E6-S14 | Framework end-of-life decision & migration plan (audit SEC-02, issue #72) | p1 | 2 | — | Todo |
| E6-S15 | Dependency patch level from the Sprint 1 audit (SEC-03, PR #70) | p1 | 1 | — | Done |
| E6-S16 | Low-severity hardening from the Sprint 1 audit (SEC-04…10, issue #73) | p2 | 3 | — | Todo |
| E6-S17 | Static-serving hardening found by E1-S5's probes (issue #79) | p1 | 2 | — | Todo |
| E6-S18 | Colour-token parsing robustness (issue #103) | p2 | 2 | — | Todo |

### E6-S1 — CI on every PR · 5 pts · p0

- [ ] GitHub Actions: backend job (`./mvnw -B verify`) and frontend job (`npm ci && lint && test && build`).
- [ ] Jobs cache Maven/NPM; total wall time < 8 min; failures are actionable (artefacts/upload logs).
- [ ] Runs on PRs into `develop` and `main`, and on pushes to `develop`.
- [ ] Workflow file reviewed for supply-chain safety (pinned actions, minimal permissions).

### E6-S2 — Required status checks · 2 pts · p0

- [ ] Branch protection on `main` and `develop` requires the CI jobs before merging.
- [ ] A deliberately failing test on a scratch PR is blocked (proof captured in the PR).
- [ ] Documented in `docs/scrum/SPRINT-PLAYBOOK.md`.

### E6-S3 — Accessibility audit (WCAG 2.2 AA) · 3 pts · p1

- [ ] Axe/pa11y run on every view; zero serious violations.
- [ ] Keyboard-only walkthrough of the whole app documented (including drag-and-drop alternative).
- [ ] Contrast, focus visibility, motion preferences, touch targets audited and fixed.
- [ ] Screen-reader pass on the splash, menu and workshop (VoiceOver or TalkBack) summarised.

### E6-S4 — Real-device verification pass · 3 pts · p0

- [ ] App opened from a phone on the LAN; all four views exercised; issues logged with repro.
- [ ] iOS Safari + Android Chrome quirks captured (dvh, backdrop-filter, scroll, gesture conflicts).
- [ ] Results written in `reports/` and converted into backlog items with priorities.
- [ ] LAN setup documented in the README (host exposure, firewall note).

### E6-S5 — Security & robustness pass · 5 pts · p0

- [ ] Upload fuzzing: malformed images, wrong magic bytes, zip bombs, 0-byte, unicode filenames.
- [ ] Path traversal attempts on `photoId`, filenames and static serving — all inert (tests added).
- [ ] PostgreSQL exposure reviewed (container bindings, volume and dump permissions); no secrets or absolute paths in responses; CORS verified.
- [ ] Dependency audit (`npm audit`, `./mvnw dependency:tree`) with findings fixed or justified.
- [ ] Report in `reports/security-*.md` with residual risk.

### E6-S6 — Documentation & runbook · 3 pts · p1

- [ ] README: what/why, quickstart (dev and containers), phone access, troubleshooting, backup instructions.
- [ ] `docs/engineering/ARCHITECTURE.md` updated to the shipped reality (components, data flow, files).
- [ ] Runbook: restore from backup (`pg_dump`/`psql` or scripts), migrate the data directory, rebuild containers, rotate DB credentials.
- [ ] A new contributor can run the stack from a clean clone following only the README (verified).

### E6-S7 — Backup / export utility · 5 pts · p2

- [ ] `scripts/backup.sh` produces a timestamped archive: `pg_dump` of the database + `images/` (and thumbnails) with a manifest.
- [ ] `scripts/restore.sh` restores safely (`psql` + files; refuses to overwrite a non-empty target without `--force`).
- [ ] Restore verified in CI or a documented manual test on a temp directory.
- [ ] Documented in the runbook.
- [ ] The runbook states that a backup must include `AETHER_DATA_DIR` as well as the database
      (audit SEC-N5).

### E6-S8 — Performance budget pass · 5 pts · p1

- [ ] Budgets defined (bundle size, LCP, memory, upload time) and measured on a mid-range profile.
- [ ] Violations fixed or recorded with a decision; numbers in an ADR.
- [ ] Bundle analysed (`rollup-plugin-visualizer` or equivalent), unused weight removed.
- [ ] Regression guard: size/measurement check in CI where practical.

### E6-S9 — Polish pass · 5 pts · p1

- [ ] Motion audit against `docs/engineering/DESIGN-SYSTEM.md` (durations, easings, distances consistent).
- [ ] Gesture conflicts resolved (pull-to-refresh vs scroll, drag vs scroll, double-tap zoom).
- [ ] iOS Safari + Android Chrome visual pass: glass rendering, safe areas, font smoothing.
- [ ] Before/after capture attached to the PR.

### E6-S10 — v1.0 release · 3 pts · p0

- [ ] All p0/p1 stories of E1–E6 are `Done` or explicitly deferred with a reason.
- [ ] `README` reflects reality; screenshots or a short recording embedded.
- [ ] Release PR `develop` → `main`, merged, tagged `v1.0.0` (annotated) on top of `sprint-06`.
- [ ] Retrospective for sprint 6 written; backlog groomed for post-v1 ideas.

### E6-S11 — Container images (`api`, `web`) · 3 pts · p0

*As the owner, I want the application packaged as containers, so that the machine runs it without toolchains installed.*

- [ ] `backend/Dockerfile`: multi-stage (Maven build → Temurin 21 JRE), non-root user, pinned base tags, `.dockerignore`.
- [ ] `frontend/Dockerfile`: multi-stage (Node build → nginx serving the SPA and reverse-proxying `/api/**` + `/images/**` to `api`), pinned tags, `.dockerignore`.
- [ ] Runtime makes zero external requests; no secrets baked into any image layer.
- [ ] Healthchecks defined for `db` and `api` (consumed by E6-S12).

### E6-S12 — One-command stack & clean-clone verification · 5 pts · p0

*As the owner, I want `docker compose up` to run the whole stack, so that v1.0 is one command on any machine.*

- [ ] `compose.yml`: `db` + `api` + `web`, named volume `aether_pgdata`, data-directory bind mount, env from `.env`, `web` on port 3000 (single LAN origin — no CORS at runtime).
- [ ] From a clean clone: `cp .env.example .env && docker compose up` serves the app to the phone (evidence in the PR).
- [ ] Backup/restore scripts (E6-S7) verified against the containerized stack.
- [ ] `docs/engineering/DEPLOYMENT.md` moved from TARGET to shipped reality; README updated.

### E6-S17 — Static-serving hardening found by E1-S5's probes · 2 pts · p1

*As the owner, I want `/images/**` to serve only what the archive wrote, so that a file placed by hand cannot
widen what the URL space exposes.*

Found by E1-S5's hostile-path battery (its report) and widened by that PR's review, which measured the layout
the first report had not: **with `images/` itself a symlink to a directory outside the data directory, the boot
succeeds, its write-probe is written through the link, reads follow it — and uploads are refused.** The actor
there is an operator, not an attacker: a `cp -a`/`rsync -a`/tarball restore, or a manual link into a synced
folder. Nothing here is reachable by a request — 46 hostile paths, a hostile client filename and encoded
separators were all refused — so it stays hardening rather than a defect. The Sprint-2 release audit
re-confirmed exactly this classification (SEC2-01, Low, not release-blocking —
`reports/security-audit-sprint02.md`).

**Priority is `p1`, not `p2`, and not the `p0` that `.claude/rules/security.md` reserves for
"something looks exploitable":** the rule's p0 assumes a request can reach it, and none can. `p1` records that
the precondition is *ordinary operator behaviour* (a restore or a sync), not malice, which is more than can be
said for most hardening. It is not fixed in E1-S5 because closing it changes serving semantics — that needs
the ADR below, not a patch inside a serving story.

- [ ] **Symlinks inside `images/` are followed, including out of the data directory.** A link to a file
      outside answers 200 with that file's bytes, and so does a link to a *directory* outside
      (`/images/<link>/x.txt`); Spring's containment check reads the URL, so a link that resolves elsewhere
      passes it. Cover both layouts: a link planted at a name inside `images/`, and **`images/` itself a link**
      (boot succeeds, write-probe written through it, reads follow it, uploads refused). Decide and record
      (ADR) whether serving re-checks `Path.toRealPath()` under `data-dir/images` — the hook is a
      `PathResourceResolver` subclass on `setResourceChain(true)` — or whether the guarantee is "the write
      path never creates a link", which ADR-012's own rule only half-covers: uploads are refused, the boot is
      silent. Whichever way it goes, the boot should say something about a data directory whose `images/`
      resolves outside it.
- [ ] **A hand-placed file whose extension the archive never writes is served under the platform's media type**
      — measured: `.html` as `text/html`, `.svg` as `image/svg+xml`, `.txt` as `text/plain`,
      `.jpeg.exe` as `application/x-msdownload`, no extension as `application/octet-stream` — and
      `nosniff` does not stop a browser rendering those. Deciding means choosing between the current
      behaviour (documented), `application/octet-stream`, and `Content-Disposition: attachment` for names
      outside the upload whitelist.
- [ ] **Tomcat's own 400 refusals are HTML and carry no `nosniff`** (the traversal strings that never reach
      Spring). An error-page mapping to `problem+json` would close the shape mismatch; decide whether it is
      worth it or whether the 400 is acceptable as-is.
- [ ] **Pin the write site's accepted cell.** `StorageService.requireInside` accepts a leaf that *is* a link
      (`Files.move` with `ATOMIC_MOVE` replaces it rather than following it; a delete removes the link, not
      its target — both measured by S03-C1's review), and no test plants one: every `createSymbolicLink` in
      the suite is directory-level. The rule that names the acceptance is honest about this, so the cell gets
      its test and its written reason here. The same pass should cover a link used as a *path component*
      inside the candidate, which the guard does not resolve at all.
- [ ] Re-run E1-S5's path battery afterwards and record the statuses that changed.

### E6-S18 — Colour-token parsing robustness · 2 pts | p2

*As a maintainer, I want the colour helpers to accept what browsers actually produce, so that measuring a
rendered theme does not crash on the browser's own formatting.*

Found by E3-S2 (issue #103): the built bundle serialises the `--aura-*` tokens as 4- and 8-digit hex —
Lightning CSS rewrites `rgba(232, 230, 227, 0.62)` to `#e8e6e39e` and `rgba(0, 0, 0, 0.4)` to `#0006` — while
`parseColor` in `lib/color/contrast.ts` accepts only `#rrggbb` or `rgba(...)`. Nothing reads a token back at
runtime today (the check page uses them in CSS only), so this is latent rather than broken — and jsdom cannot
catch it, because jsdom never runs the minifier. Any story that measures contrast at runtime hits it first.

- [ ] `parseColor` accepts the forms `getComputedStyle` returns in this stack: `#rgb`/`#rrggbb`,
      `#rgba`/`#rrggbbaa`, `rgb()`/`rgba()` (both comma and space syntax), and `oklab()`/`oklch()` if the
      browser returns them — or the function says which it does not support instead of throwing on a token
      the app itself generated.
- [ ] Fixture tests built from strings a real browser emitted (the two above are in the report), not from
      strings the helper already knew.
- [ ] The check page or a future runtime check that reads a computed token has a test proving it survives
      the minified form.

---

## Icebox (unscheduled, not committed)

| Idea | Why parked |
| --- | --- |
| HEIC/AVIF upload support | Depends on browser support; revisit after v1.0 (E6-S5 findings). |
| Video clips in dumps | Breaks the 6-photo model; needs a product decision. |
| Search / tags / favourites | Out of the personal-sanctuary scope for v1. |
| Multi-user access | Explicitly a single-user local app; would change the security model. |
| Automatic monthly dump suggestion | Nice, but the curation act is the point; revisit post-v1. |
| Soft delete + explicit purge (photos, dumps) | `docs/engineering/ARCHITECTURE.md` §3 and `.claude/rules/backend.md` mandate soft deletion with a separate purge action, but `_docs/openapi.yml` defines **no delete endpoint**, so nothing in v1 can trigger it and the baseline has no deletion columns. Surfaced by the E1-S3 review; needs a spec decision (and probably an ADR) before it becomes a story — parked deliberately rather than quietly dropped. |
