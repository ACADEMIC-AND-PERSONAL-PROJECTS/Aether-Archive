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
| **E1** | Foundation & Backend | S1 | 10 | 34 | A local REST API that stores images and dumps durably, with tests. |
| **E2** | Frontend Foundation & Design System | S2 | 6 | 29 | A runnable React shell and the image-derived Dark Glassmorphism design system. |
| **E3** | Immersive Splash & Glass Menu | S3 | 5 | 18 | The signature entry experience: full-bleed random photo + glass menu. |
| **E4** | Curator's Workshop | S3–S4 | 5 | 28 | Upload, order and publish a 6-photo dump with its aura colour. |
| **E5** | The Time River | S5 | 4 | 21 | The chronological feed with ambient per-dump background. |
| **E6** | Quality, Delivery & Release | S4–S6 | 10 | 40 | CI, accessibility, hardening, documentation and the v1.0 release. |

**Total: 40 stories · 170 points · 6 sprints (~2 weeks each, 25–34 points per sprint).**

```text
Sprint 1  E1  Foundation & Backend              (34)
Sprint 2  E2  Frontend Foundation & Design Sys  (29)
Sprint 3  E3 + E4-S1/S2  Splash · Menu · Upload (28)
Sprint 4  E4 + E6-S1/S2  Workshop · CI          (25)
Sprint 5  E5 + E6-S3/S4  Time River · A11y      (27)
Sprint 6  E6  Hardening · Polish · v1.0         (26)
```

---

## E1 — Foundation & Backend

**Goal:** a Spring Boot application that owns the local data directory, persists items in SQLite, serves
images and exposes the `/api/v1` contract from `_docs/openapi.yml` — fully tested, no external calls.

| ID | Story | P | Pts | Sprint | Status |
| --- | --- | --- | --- | --- | --- |
| E1-S1 | Scaffold the Spring Boot project | p0 | 3 | 1 | Todo |
| E1-S2 | Configuration & local data directory | p0 | 2 | 1 | Todo |
| E1-S3 | SQLite persistence + Flyway baseline | p0 | 5 | 1 | Todo |
| E1-S4 | StorageService — safe local file storage | p0 | 5 | 1 | Todo |
| E1-S5 | Serve images at `/images/**` | p0 | 2 | 1 | Todo |
| E1-S6 | Photo API — upload, list, random | p0 | 5 | 1 | Todo |
| E1-S7 | Dump API — create and list 6-photo dumps | p0 | 5 | 1 | Todo |
| E1-S8 | Error handling (RFC 9457) & validation | p0 | 2 | 1 | Todo |
| E1-S9 | Backend test suite | p0 | 5 | 1 | Todo |
| E1-S10 | Dev seed script & curl smoke collection | p2 | 2 | 1 | Todo |

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
- [ ] Subfolders `images/`, `thumbnails/`, `tmp/` created idempotently; `aether.db` lives at the root.
- [ ] `AETHER_MAX_UPLOAD_MB` and `AETHER_CORS_ALLOWED_ORIGINS` wired; CORS restricted to configured origins.
- [ ] Boot fails with a clear message if the directory is not writable.
- [ ] Unit test with `@TempDir` covering creation and the failure path.

### E1-S3 — SQLite persistence + Flyway baseline · 5 pts · p0

*As the owner, I want my archive stored in a local database file, so that nothing depends on a server.*

- [ ] SQLite via the Hibernate community dialect; `V1__baseline.sql` creates `archive_item` and `photo`.
- [ ] WAL journal, `foreign_keys=ON`, `busy_timeout` set on every connection.
- [ ] Entities `ArchiveItem` and `Photo` per `.claude/rules/backend.md` (UUID ids, UTC `Instant`, `displayOrder`).
- [ ] Derived-order query returns the river sorted `timestamp DESC, id` (stable).
- [ ] `@DataJpaTest` covering relations, ordering and cascade rules.

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
- [ ] `displayOrder` is assigned 0–5 from the request order and exposed in responses.
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
- [ ] One end-to-end `@SpringBootTest` on a temp data dir: upload 6 photos → create dump → read it back.
- [ ] Deterministic tests (injected `Clock`, no sleeps); suite runs under 60 s.
- [ ] `./mvnw verify` green; evidence in the PR.

### E1-S10 — Dev seed script & curl smoke collection · 2 pts · p2

*As a developer, I want sample data and smoke calls, so that demoing and QA are one command away.*

- [ ] `scripts/dev/seed.sh` posts N sample photos then a dump, against a running local backend.
- [ ] `scripts/dev/smoke.http` (or `.sh`) covers every endpoint including failure paths.
- [ ] `AETHER_DATA_DIR` is honoured; script refuses to run against the real data dir without `--force`.
- [ ] Documented in the backend README.

---

## E2 — Frontend Foundation & Design System

**Goal:** a runnable, linted, tested React shell whose entire visual language — colours extracted from the
user's own images, Dark Glassmorphism tokens, local Fontsource typography — is defined and reusable.

| ID | Story | P | Pts | Sprint | Status |
| --- | --- | --- | --- | --- | --- |
| E2-S1 | Scaffold the frontend toolchain | p0 | 5 | 2 | Todo |
| E2-S2 | App shell, routing & typed API client | p0 | 5 | 2 | Todo |
| E2-S3 | Global CSS foundation | p0 | 3 | 2 | Todo |
| E2-S4 | Dominant-colour extraction algorithm | p0 | 8 | 2 | Todo |
| E2-S5 | Fontsource typography system | p0 | 3 | 2 | Todo |
| E2-S6 | Dark Glassmorphism theme layer & GlassPanel | p0 | 5 | 2 | Todo |

### E2-S1 — Scaffold the frontend toolchain · 5 pts · p0

*As a developer, I want a modern React setup, so that every following story builds on solid tooling.*

- [ ] Vite + React + TypeScript (strict) under `frontend/`; Tailwind CSS configured.
- [ ] ESLint + Prettier with a `lint` script; import order and unused-import rules on.
- [ ] Vitest + React Testing Library wired (`npm run test`), one placeholder test.
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
| E3-S1 | Immersive splash view | p0 | 5 | 3 | Todo |
| E3-S2 | Glass menu overlay | p0 | 5 | 3 | Todo |
| E3-S3 | Route transitions & motion system | p0 | 3 | 3 | Todo |
| E3-S4 | Quiet loading / empty / error states | p1 | 2 | 3 | Todo |
| E3-S5 | View tests & accessibility pass | p0 | 3 | 3 | Todo |

### E3-S1 — Immersive splash view · 5 pts · p0

*As the curator, I want to be greeted by one of my photos, so that opening the app feels like entering a sanctuary.*

- [ ] `GET /photos/random` photo rendered full-bleed (`object-fit: cover`), headerless, zero visible UI.
- [ ] Hero image preloaded and decoded before reveal; no flash of empty screen (dominant tone placeholder).
- [ ] Tap anywhere opens the menu; tap again (or Esc) closes it.
- [ ] Fresh random photo per visit; pull-to-refresh re-rolls without reloading the app shell.
- [ ] Empty archive → quiet empty state from E3-S4, never a crash.

### E3-S2 — Glass menu overlay · 5 pts | p0

*As the curator, I want a discreet menu, so that navigation is available but never shouts.*

- [ ] Overlay: dark glass panel, `backdrop-filter: blur(15px)`, fade + 12–16 px translate, 300–600 ms.
- [ ] Entries: **The River**, **Curate**, **Close** — UI sans, comfortable touch targets (≥ 44 px).
- [ ] Focus trapped while open, `role="dialog"` + `aria-modal`, Esc closes, focus returns to the trigger.
- [ ] Tap on the backdrop closes; body scroll locked while open; `prefers-reduced-motion` honoured.
- [ ] Tests: open/close, keyboard path, focus restoration.

### E3-S3 — Route transitions & motion system · 3 pts | p0

*As a mobile user, I want fluid transitions, so that moving between views feels continuous.*

- [ ] A small motion token set (durations, easings, distances) centralised in `lib/motion/`.
- [ ] Route transitions use fade + subtle vertical movement; no layout jump, no double scrollbars.
- [ ] Animations are interruptible; back/forward navigation remains correct.
- [ ] Reduced motion disables transforms (opacity only).
- [ ] Screenshots/recording attached for the review.

### E3-S4 — Quiet loading / empty / error states · 2 pts | p1

*As the curator, I want graceful silence when there is nothing to show, so that the aesthetic is never broken.*

- [ ] Loading = opacity pulse or blurred dominant tone; never a labelled spinner.
- [ ] Empty archive = one quiet sentence in display serif on the dark base.
- [ ] API error = discreet glass notice with a retry affordance; no raw messages, no alerts.
- [ ] All three states rendered in tests.

### E3-S5 — View tests & accessibility pass · 3 pts | p0

*As the team, we want the entry experience verified, so that regressions are caught.*

- [ ] RTL tests for splash (photo rendered, tap opens menu) and menu (a11y roles, Esc, focus return).
- [ ] Axe (or equivalent) run on the splash and menu with no serious violations.
- [ ] Contrast verified for every text style over glass and over images (scrim rule).
- [ ] Manual pass on a 390 px viewport documented in the PR.

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

### E4-S1 — Single photo upload · 5 pts | p0

*As the curator, I want to add one photo at a time, so that my archive grows gradually.*

- [ ] Native file picker (accept images only), client-side type/size validation before upload.
- [ ] Upload progress indicator (glass, quiet); cancel supported where feasible.
- [ ] Failures surface a retry; the file stays selected; no silent loss.
- [ ] Success updates the archive without a page reload (query invalidation).
- [ ] Tests: validation rejects, error retry path, success invalidation.

### E4-S2 — Multi-select (≤ 6) & client-side downscale · 5 pts | p0

*As the curator, I want to pick several images at once, so that building a dump is fast.*

- [ ] Multi-select picker; hard cap of 6 with a quiet explanation, extra selections ignored or blocked.
- [ ] Images downscaled/compressed client-side before upload when above a threshold (quality preserved for viewing).
- [ ] Thumbnail grid of the selection with remove affordance and per-file state.
- [ ] Uploads run sequentially or bounded-concurrent; one failure never aborts the others silently.
- [ ] Tests for the cap and for the downscale decision function (pure).

### E4-S3 — Drag-and-drop ordering · 8 pts | p0

*As the curator, I want to reorder my 6 images by touch, so that the dump tells the story I want.*

- [ ] `@dnd-kit` grid: long-press (touch) / drag (mouse) reorder with visual lift, no scroll conflict.
- [ ] Order is a pure reducer in `lib/` (unit-tested) driving `displayOrder` 0–5 in the payload.
- [ ] Keyboard path: focus an item, move it with keys, announced to assistive tech.
- [ ] Auto-scroll while dragging near edges; drop animation feels tactile (≤ 300 ms).
- [ ] Tests: reducer, keyboard move, reorder persistence in the payload.

### E4-S4 — Aura colour picker with palette suggestions · 5 pts | p0

*As the curator, I want to choose the dump's background colour, so that the river reflects its mood.*

- [ ] Hex input with validation (`#RRGGBB`), plus the palette extracted from the selected images as tappable swatches.
- [ ] Live preview of the glass theme against the chosen background (text contrast guaranteed).
- [ ] Suggestions ranked by confidence; a "reset to extracted" action restores the top suggestion.
- [ ] Selection survives reordering and page refresh within the workshop session.
- [ ] Tests for validation, suggestion mapping and preview tokens.

### E4-S5 — Publish dump with optimistic UI · 5 pts | p0

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

### E5-S1 — River feed & timeline markers · 8 pts | p0

*As the curator, I want to scroll my whole archive, so that I can relive it in order.*

- [ ] Infinite vertical feed grouped by month, markers in display serif, generous negative space.
- [ ] Pagination or cursor-based loading (decide with an ADR); no duplicate keys, stable ordering.
- [ ] Dumps render their 6 photos as a section; single photos appear between markers.
- [ ] Scroll position is preserved when navigating back from a detail/menu overlay.
- [ ] Tests: grouping logic (pure function), pagination boundaries, empty archive.

### E5-S2 — Ambient background per dump · 5 pts | p0

*As the curator, I want the background to melt into each dump's colour, so that scrolling feels like a journey.*

- [ ] IntersectionObserver sets `--aura-bg` from the in-view dump's `backgroundColor`.
- [ ] Transition ≥ 600 ms, interruptible, no repaint storms while scrolling fast.
- [ ] Text contrast re-validated for every active colour (automatic lightness adjustment).
- [ ] Observer disconnected on unmount; only one active section at a time (threshold tuned visually).
- [ ] Test the selector logic; recording attached for visual proof.

### E5-S3 — Image loading performance (LQIP, no CLS) · 5 pts | p0

*As a mobile user, I want images to appear smoothly, so that scrolling never janks.*

- [ ] Every image: explicit aspect ratio, `loading="lazy"`, `decoding="async"`, `sizes` correct.
- [ ] Dominant-colour placeholder (from `lib/color/`) painted behind each image until decode completes.
- [ ] No cumulative layout shift on a 390 px viewport (measured, number reported).
- [ ] First viewport budget respected (LCP < 1.5 s over LAN reported in the PR).
- [ ] Fallback for broken images without breaking layout.

### E5-S4 — Virtualisation decision & implementation · 3 pts | p1

*As a maintainer, I want the feed to stay fast with hundreds of items, so that the app ages well.*

- [ ] Measure first: profile a 300-item feed, record numbers in an ADR (window/virtualise yes/no).
- [ ] If yes: windowed rendering with stable scroll restoration and no visual artefacts.
- [ ] If no: document the threshold at which it must be revisited as a backlog item.
- [ ] Numbers (DOM nodes, frame time) reported in the PR either way.

---

## E6 — Quality, Delivery & Release

**Goal:** make the project safe to change and pleasant to own — CI, accessibility, hardening, documentation,
and a clean v1.0.

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

### E6-S1 — CI on every PR · 5 pts | p0

- [ ] GitHub Actions: backend job (`./mvnw -B verify`) and frontend job (`npm ci && lint && test && build`).
- [ ] Jobs cache Maven/NPM; total wall time < 8 min; failures are actionable (artefacts/upload logs).
- [ ] Runs on PRs into `develop` and `main`, and on pushes to `develop`.
- [ ] Workflow file reviewed for supply-chain safety (pinned actions, minimal permissions).

### E6-S2 — Required status checks · 2 pts | p0

- [ ] Branch protection on `main` and `develop` requires the CI jobs before merging.
- [ ] A deliberately failing test on a scratch PR is blocked (proof captured in the PR).
- [ ] Documented in `docs/scrum/SPRINT-PLAYBOOK.md`.

### E6-S3 — Accessibility audit (WCAG 2.2 AA) · 3 pts | p1

- [ ] Axe/pa11y run on every view; zero serious violations.
- [ ] Keyboard-only walkthrough of the whole app documented (including drag-and-drop alternative).
- [ ] Contrast, focus visibility, motion preferences, touch targets audited and fixed.
- [ ] Screen-reader pass on the splash, menu and workshop (VoiceOver or TalkBack) summarised.

### E6-S4 — Real-device verification pass · 3 pts | p0

- [ ] App opened from a phone on the LAN; all four views exercised; issues logged with repro.
- [ ] iOS Safari + Android Chrome quirks captured (dvh, backdrop-filter, scroll, gesture conflicts).
- [ ] Results written in `reports/` and converted into backlog items with priorities.
- [ ] LAN setup documented in the README (host exposure, firewall note).

### E6-S5 — Security & robustness pass · 5 pts | p0

- [ ] Upload fuzzing: malformed images, wrong magic bytes, zip bombs, 0-byte, unicode filenames.
- [ ] Path traversal attempts on `photoId`, filenames and static serving — all inert (tests added).
- [ ] SQLite file permissions reviewed; no secrets or absolute paths in responses; CORS verified.
- [ ] Dependency audit (`npm audit`, `./mvnw dependency:tree`) with findings fixed or justified.
- [ ] Report in `reports/security-*.md` with residual risk.

### E6-S6 — Documentation & runbook · 3 pts | p1

- [ ] README: what/why, quickstart, phone access, troubleshooting, backup instructions.
- [ ] `docs/engineering/ARCHITECTURE.md` updated to the shipped reality (components, data flow, files).
- [ ] Runbook: restore from backup, migrate data directory, rotate/repair DB.
- [ ] A new contributor can run the stack from a clean clone following only the README (verified).

### E6-S7 — Backup / export utility · 5 pts | p2

- [ ] `scripts/backup.sh` produces a timestamped archive of the data dir (DB checkpointed) with a manifest.
- [ ] `scripts/restore.sh` restores safely (refuses to overwrite a non-empty target without `--force`).
- [ ] Restore verified in CI or a documented manual test on a temp directory.
- [ ] Documented in the runbook.

### E6-S8 — Performance budget pass · 5 pts | p1

- [ ] Budgets defined (bundle size, LCP, memory, upload time) and measured on a mid-range profile.
- [ ] Violations fixed or recorded with a decision; numbers in an ADR.
- [ ] Bundle analysed (`rollup-plugin-visualizer` or equivalent), unused weight removed.
- [ ] Regression guard: size/measurement check in CI where practical.

### E6-S9 — Polish pass · 5 pts | p1

- [ ] Motion audit against `docs/engineering/DESIGN-SYSTEM.md` (durations, easings, distances consistent).
- [ ] Gesture conflicts resolved (pull-to-refresh vs scroll, drag vs scroll, double-tap zoom).
- [ ] iOS Safari + Android Chrome visual pass: glass rendering, safe areas, font smoothing.
- [ ] Before/after capture attached to the PR.

### E6-S10 — v1.0 release · 3 pts | p0

- [ ] All p0/p1 stories of E1–E6 are `Done` or explicitly deferred with a reason.
- [ ] `README` reflects reality; screenshots or a short recording embedded.
- [ ] Release PR `develop` → `main`, merged, tagged `v1.0.0` (annotated) on top of `sprint-06`.
- [ ] Retrospective for sprint 6 written; backlog groomed for post-v1 ideas.

---

## Icebox (unscheduled, not committed)

| Idea | Why parked |
| --- | --- |
| HEIC/AVIF upload support | Depends on browser support; revisit after v1.0 (E6-S5 findings). |
| Video clips in dumps | Breaks the 6-photo model; needs a product decision. |
| Search / tags / favourites | Out of the personal-sanctuary scope for v1. |
| Multi-user access | Explicitly a single-user local app; would change the security model. |
| Automatic monthly dump suggestion | Nice, but the curation act is the point; revisit post-v1. |
