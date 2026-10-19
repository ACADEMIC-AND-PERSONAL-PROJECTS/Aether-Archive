# Sprint 05 — The Time River scrolls and the background follows each dump's aura

- **Dates**: 2026-10-19 → 2026-11-01 (UTC). The playbook row carried an indicative
  2026-12-14 → 2026-12-25 window; as at Sprint 3's and 4's planning, a later row is re-planned at its
  own planning. This sprint opens the day Sprint 4 was released (`sprint-04`, `125944b7`).
- **Goal**: The Time River scrolls and the background follows each dump's aura.
- **Capacity**: **27 points** committed — 6 stories, mid-band. E5-S1 is the sprint's only eight-pointer
  (the feed and its data layer); E5-S4 is measurement-first by design and may legitimately end in a
  recorded "not yet"; the two E6 stories audit and exercise the river in place — they are not a second
  theme.
- **Branch base**: `develop`

## Sprint backlog

| # | ID | Story | Points | Priority | Status | PR |
| --- | --- | --- | --- | --- | --- | --- |
| 1a | E5-S1A | The feed's data layer — `GET /photos` + `GET /dumps` as queries, ADR-025 | 2 | p0 | Done | #160 |
| 1b | E5-S1B | The feed model — `buildFeed`: months, dumps as sections, singles between | 2 | p0 | Done | #162 |
| 1c | E5-S1C | The river view — markers in display serif, dump sections, quiet states | 2 | p0 | Done | #164 |
| 1d | E5-S1D | Scroll memory — back restores, a fresh visit starts at the top | 2 | p0 | Done | #166 |
| 2 | E5-S2 | Ambient background per dump — `--aura-bg` follows the section in view | 5 | p0 | Done | #168 |
| 3 | E5-S3 | Image loading performance — LQIP, no CLS, the first-viewport budget | 5 | p0 | Done | #170 |
| 4 | E6-S4 | Real-device verification pass (LAN) | 3 | p0 | Todo | — |
| 5 | E5-S4 | Virtualisation decision & implementation — measure first, then decide | 3 | p1 | Todo | — |
| 6 | E6-S3 | Accessibility audit (WCAG 2.2 AA) | 3 | p1 | Todo | — |

**Total: 27 points.** The order is deliberate:

- **The feed first.** Everything else in the sprint stands on it: the aura flips per rendered section
  (S2), the images only load once the feed exists to lay them out (S3), the device pass exercises four
  real views (E6-S4), virtualisation needs a feed worth profiling (E5-S4), and the audit walks the app
  the river has just completed (E6-S3).
- **E5-S1 is a single row, and will likely be re-cut.** It is the sprint's eight-pointer; if its first
  measure exceeds the ~500 hand-written trigger it is re-cut at review into slices — E4-S3's precedent,
  never a defended exception.
- **The backend is frozen again, with one named exception.** E5-S3 may need a derivative-image
  directory; whoever creates derivatives names their own directory and adds its own mapping — it never
  widens E1-S5's `images/` mapping — and the change is explicit in the story's PR.

## Process commitments (from Sprint 4's retrospective — success criteria, not advice)

1. **The branch is printed before the first edit.** Every editing session starts with
   `git branch --show-current`; success is zero misrouted-commit re-cuts.
2. **Closing a story includes the issue sweep.** Every record closes the story's issue (and its parent
   at epic close) with a closing comment; success is a sprint-close completeness check that returns
   zero stale Done issues.
3. **A probe ships its script.** Probe-backed evidence commits the probe script beside its captures
   (e.g. `reports/probes/`), re-runnable from the repository alone; success is the next probe-bearing
   PR carrying its script.

## Risks & assumptions

- **The feed's data layer is entirely new.** Only the random-photo path exists today; E5-S1 adds the
  `GET /photos` / `GET /dumps` fetchers and hooks through `api/queryKeys.ts` (ADR-004), and the
  grouping is a pure, unit-tested function. The loading decision is an in-story ADR backed by numbers —
  the API returns everything today, so a recorded "no pagination yet, revisit with virtualisation" is
  a complete outcome, not a failure.
- **E5-S2 must keep the contrast guarantee.** `--aura-bg` flips from the section in view with the
  automatic lightness adjustment; the transition budget (≥ 600 ms, interruptible, no repaint storms
  under fast scrolling) is measured, and the capture script ships with the evidence (commitment 3).
- **E5-S3 decides about derivatives with a measurement.** Aspect ratios, `loading="lazy"`,
  `decoding="async"` and `sizes` are cheap; the placeholder colour comes from `lib/color/`; CLS is
  reported as a number at 390 px and first-viewport LCP over LAN (< 1.5 s) is reported in the PR
  either way.
- **E5-S4 may end "not yet".** The story's first commitment is the profile of a 300-item feed, recorded
  in an ADR; windowing is implemented only if the numbers ask for it — otherwise the revisit threshold
  is written down as a backlog item.
- **E6-S3's screen-reader element has an environment limit.** There is no VoiceOver/TalkBack here; the
  audit runs the axe gate on every view, the keyboard walkthrough, and the Chromium accessibility-tree
  inspection, and names the residue — a real-device SR pass rides with E6-S4's owner session.
- **E6-S4 needs the owner and their phone on the LAN.** The agent owns the setup first (host exposure,
  firewall note, README, a checklist and a findings log); the pass itself is scheduled with the owner,
  never claimed.
- **Zero external requests stays the hard constraint.** The archive is local and LAN-only.

## Out of scope (explicitly)

- **The carried hardening and review items stay out by name** — #71 / E6-S13, #72 / E6-S14,
  #79 / E6-S17, #73 / E6-S16, #103 / E6-S18, E6-S19, E6-S20, E6-S21, E6-S22, E6-S23. Pulling one in is
  an explicit owner decision, never a silent over-commit.
- **Sprint 6's delivery work stays out** — E6-S5…E6-S12 (security pass, runbook, backup, performance
  budget, polish, container images, one-command stack, v1.0).
- **Spec changes** — `_docs/` stays read-only; a divergence is an ADR plus explicit owner approval.

## Notes / decisions during the sprint

- 2026-10-19 — Sprint opened the day Sprint 4 was released (`sprint-04`, `125944b7`). Mid-band
  capacity (27) with the feed first; the playbook's indicative window is superseded and the reason is
  recorded above.
- 2026-10-19 — **E5-S1 was pre-cut before implementation into 1a–1d (2/2/2/2), points unchanged.** The
  scoped estimate measured ~1,600 hand-written lines against the ~500 branch trigger, so the cut was
  decided before the first line rather than at review (E4-S4/S5's precedent; the plan bullet's
  "re-cut at review" reading is superseded by this entry). Slices: the data layer + ADR-025 (1a), the
  pure feed model (1b), the view (1c), scroll memory (1d — DESIGN-SYSTEM §14 routes it to the River).
- 2026-10-19 — **E5-S1A merged (`9d9c342`, PR #160)** at APPROVE after three review rounds: the feed's
  data layer — `fetchPhotos`/`usePhotos` on `["photos"]` and `fetchDumps`/`useDumps` on `["dumps"]`,
  with the app-wide policy and nothing on top, and the reader E4-S5C prepared (the `useQuery` stand-in
  in `dumps.test.tsx` replaced by the real hook, so the publish's optimistic draft is now observed by
  its actual consumer). **ADR-025**: the feed reads both collections whole, no pagination yet, and the
  revisit threshold is E5-S4's profile (cursor pagination and windowed rendering would land together);
  measured 114.1 kB of JSON (8.1 kB gzipped) for 300 photos + 60 dumps, probe committed at
  `reports/probes/e5-s1a-feed-payload.mjs` — the sprint's first probe to ship its script (retro
  commitment 3). Final size at the tip `689ac60`: **395 hand-written = 365 + 30** (production 67 /
  tests 185 / docs 68 / probe 75) — under the ~400 budget, no claim. Round 1 (blocking): README's
  E4-S5C passage still described the deleted stand-in and counted 8 tests — reworded and re-measured
  (12 + 6), plus ADR-025's index row; round 2 (blocking, description-only): the PR body's size was not
  re-measured after the docs commit (386 → 395); R3 APPROVE. Frontend suite 450 → **460 tests** (+10).
  Row 1a flips to **Done** (`#160`).
- 2026-10-19 — **E5-S1B merged (`f480b7d`, PR #162)** at APPROVE (two independent reviewer runs, both
  APPROVE, no blocking findings): the pure feed model — `buildFeed` groups month sections, dumps keep
  their six photos in display order, singles exclude dump-held photos, the order is total and stable
  (`Date.parse` for fractional seconds, pinned by adversarial mutation). Final size at the tip
  `2e4ad55`: **302 hand-written** (production 139 / tests 163) — under the ~400 budget, no claim.
  Frontend suite 460 → **470 tests** (+10). Row 1b flips to **Done** (`#162`).
- 2026-10-19 — **E5-S1C merged (`4a40200`, PR #164)** at APPROVE WITH NITS (one round): the river
  view — `RiverView` consumes `usePhotos`/`useDumps`, builds the feed with `buildFeed`, renders month
  markers in display serif (`font-display text-2xl tracking-display`), dump sections as titled articles
  with a 2-col grid, single photos full-width, and the three quiet states from `QuietState.tsx`. One nit
  fixed in-branch: `useCallback` deps stabilised to the destructured `refetch` functions instead of
  the full query objects. `SinglePhoto` layout-shift prevention deferred to E5-S3 (named in the PR).
  Final size at tip `2255108`: **439 hand-written** (production 110 / tests 329) — over the ~400 ideal,
  under the ~500 split trigger. Adversarial mutation confirmed: removing `dumps.refetch()` fails the
  retry test. Frontend suite 470 → **482 tests** (+12). Row 1c flips to **Done** (`#164`).
- 2026-10-19 — **E5-S1D merged (`2f25bc8`, PR #166)** at APPROVE WITH NITS (one round): scroll memory —
  `useScrollMemory` hook stores scroll position in a module-level Map (survives remounts, lost on refresh),
  restores on `ready=true`, debounces save via rAF, and guards saves with a `readyRef` so loading state
  doesn't overwrite a saved non-zero position. Two nits fixed in-branch: the `readyRef` guard on scroll
  saves (review finding), and moving `readyRef.current = ready` into a `useEffect` to satisfy the
  `react-hooks/refs` lint rule (CI finding). Final size at tip `9693308`: **237 hand-written**
  (production 73 / tests 164) — under the ~400 budget. Frontend suite 482 → **493 tests** (+11).
  Row 1d flips to **Done** (`#166`). **E5-S1 (8 pts) is now complete** — all four slices merged; issue
  #36 closed.
- 2026-10-19 — **E5-S2 merged (`d482d87`, PR #168)** at APPROVE WITH NITS (one round): ambient
  background per dump — `useRiverAura` hook observes dump sections via IntersectionObserver with
  center-biased `rootMargin: -35%` (one active at a time), applies `themeFromBackground` themes on
  the River's `<main>`. Eight colour tokens registered with `@property` so CSS transitions interpolate
  them; `[data-aura-transition]` drives a 600 ms soft ease matching the motion vocabulary. Contrast
  guaranteed by `themeFromBackground`'s §2.2 validation. One nit (stale cache) accepted — unlikely in
  practice. Final size at tip `b32c20f`: **378 hand-written** (production 193 / tests 185) — under the
  ~400 budget. Frontend suite 493 → **504 tests** (+11). Row 2 flips to **Done** (`#168`).
- 2026-10-19 — **E5-S3 merged (`5ae7171`, PR #170)** at APPROVE WITH NITS (one round): image loading
  performance — explicit `sizes` on all River images (dump 2-col grid calc, singles container-width),
  dump photos painted with `backgroundColor` as colour placeholder, single photos given `aspect-[3/4]`
  for CLS prevention, broken images hidden on error (`display: none`). Three nits accepted: sizes
  formula omits grid gap (no srcset yet, forward-prep only), no symmetric aspect-square test for dumps,
  direct DOM mutation in hideOnError (pragmatic, avoids re-render). ADR-026: no derivative images yet —
  originals with lazy loading and colour placeholders; revisit threshold is E5-S4. CLS number and LCP
  measurement deferred to E6-S4 (real-device verification pass). Final size at tip `05ed548`:
  **110 hand-written** (production 19 / tests 66 / docs 28) — well under the ~400 budget. Frontend
  suite 504 → **508 tests** (+4). Row 3 flips to **Done** (`#170`).
