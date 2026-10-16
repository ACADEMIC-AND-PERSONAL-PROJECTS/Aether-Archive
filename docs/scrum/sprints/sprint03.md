# Sprint 03 — The signature entry experience exists: immersive splash, glass menu, first uploads

- **Dates**: 2026-10-16 → 2026-10-30 (UTC). The playbook row had carried an indicative
  2026-11-16 → 2026-11-27 window — set at Sprint 2 planning, whose note said later rows are indicative and
  are re-planned at their own planning. This is that planning: the sprint opens the day Sprint 2 closed and
  the row, the milestone's `due_on` and this file now carry the real window.
- **Goal**: The signature entry experience exists: immersive splash, glass menu, first uploads.
- **Capacity**: **28 points** committed — 7 stories, inside the 25–34 band, six points below the ceiling.
  Six points is room for one small unplanned pull, not for absorbing an overrunning 5-pointer. The order of
  sacrifice is named here so it is not improvised at the end: **E4-S2** (5 pts, p0, last in the order) is
  the first candidate to slip to Sprint 4 — it is a `p0`, so that move is confirmed with the owner rather
  than decided here; **E3-S4** (2 pts, `p1`, the only `p1`) is second, and decided here: the entry
  experience itself does not slip.
- **Branch base**: `develop`
- **Milestone**: `Sprint 03 — Splash & Workshop` (already holds exactly these seven issues: #26–#32)
- **Retrospective of record for the previous sprint**: `retrospectives/sprint02.md`

## Sprint backlog — the delivery order, with reasons

| # | ID | Story | Points | Priority | Status | PR |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | S03-C1 | *chore*: land the Sprint-2 working changes in `.claude/` (number provenance, guard canonicalisation, adversarial review control) | — | — | Todo | — |
| 1 | E3-S1 | Immersive splash view | 5 | p0 | Todo | — |
| 2 | E3-S2 | Glass menu overlay | 5 | p0 | Todo | — |
| 3 | E3-S3 | Route transitions & motion system | 3 | p0 | Todo | — |
| 4 | E3-S4 | Quiet loading / empty / error states | 2 | p1 | Todo | — |
| 5 | E3-S5 | View tests & accessibility pass | 3 | p0 | Todo | — |
| 6 | E4-S1 | Single photo upload | 5 | p0 | Todo | — |
| 7 | E4-S2 | Multi-select (≤ 6) & client-side downscale | 5 | p0 | Todo | — |

**Total: 7 stories · 28 points** (the row above the seven is a chore, not a story). The order is the
dependency chain, with the placements worth a sentence:

- **E3-S1 first** — the sprint's goal made visible: the app opens on a full-bleed random photo and nothing
  else. It needs only the shell (E2-S2) and `GET /photos/random` (E1-S6; in the contract at
  `_docs/openapi.yml` — checked at planning). Two forward references are named rather than hidden: its
  "tap anywhere opens the menu" criterion completes when **E3-S2** lands, with the integrated path tested
  in **E3-S5**; its empty-archive criterion completes with **E3-S4**.
- **E3-S2 next** — the menu is the tap-target the splash's first criterion names, and it is self-contained:
  glass overlay, focus trap, keyboard path. `backdrop-filter` and the glass fallback are already proven
  (E2-S6) — reused, not re-litigated.
- **E3-S3 third, before the remaining animation surfaces** — S1 and S2 carry hardcoded durations by their
  criteria; E3-S3 centralises the motion tokens before the upload flows add more, and route transitions
  span every view.
- **E3-S4 fourth** — the quiet states are cross-cutting (loading/empty/error); they close E3-S1's
  empty-archive criterion, and the upload flows consume their feedback patterns.
- **E3-S5 fifth** — by definition it tests the real S1–S4 code; running it earlier would test placeholders.
- **E4-S1 then E4-S2** — the upload pipeline lands once (picker → validate → upload → invalidate);
  the multi-select story builds directly on it. The cap and the downscale decision are pure functions,
  which is also how they are tested (jsdom has no canvas — ADR-018).

## Definition of Ready check

All seven pass: each has a value statement and testable criteria, none exceeds 8 points, priorities match
the goal, dependencies are `Done` or named in the order above, the contract exists (`/photos/random` and
the upload path in `_docs/openapi.yml`; `docs/engineering/DESIGN-SYSTEM.md` + `.claude/rules/design-language.md`
cover the visuals), and every story is verifiable locally (browser probes + screenshots; no external
service).

## Process commitments carried from Sprint 2's retrospective

The retrospective's three changes are **success criteria for this sprint**, not advice. Their text lands
in `.claude/` in S03-C1; the practice is checked in every story:

1. **Numbers are pasted from the producing command — or re-measured at the branch tip.** A count, size or
   ledger in a report, README or PR body is copied from the output that produced it; a number written
   before the last commit is re-measured after it. Every story PR still carries **both** size numbers
   (total and hand-written, generated files named and excluded). A review finding of the
   stale-or-miscounted-number class counts as this change failing.
2. **Guards canonicalise before comparing — and ship with their adversarial matrix.** Any new path guard
   canonicalises both sides (`os.path.realpath` or equivalent) and its test includes the matrix: doubled
   slash, `/.`, `..`, symlinks, environment variants.
3. **Every review posts at least one adversarial control, with its result** — a mutation, a brute force,
   or a boundary falsification, run and reported; not only prose findings.

## Risks & assumptions

- **Pull-to-refresh is a touch gesture.** The splash claims it, and the Chromium probe mechanism
  (established in E2-S3/S6) has not driven a pull gesture yet. E3-S1 probes it; if device emulation cannot
  produce the gesture, the criterion is proven by the manual 390 px pass that E3-S5 documents anyway.
- **E3-S3's criterion asks for screenshots/recording, and only screenshots exist as a mechanism so far**
  (E2-S3/S6 captures). E3-S3 probes video capture in the same Playwright/Chromium setup; if it cannot,
  the review gets the screenshots plus an explicit note — never a silent substitution.
- **Axe is not in the dependency set.** E3-S5's criterion says "Axe (or equivalent)". If a checker is
  added, it is a test-only dependency, justified in that PR like any other (the E2-S4 browser-mode
  precedent).
- **The canvas is absent in jsdom (ADR-018), and E4-S2 downscales through a canvas.** The tests target the
  pure decision function; the downscale itself is browser code, verified by probe.
- **Zero external requests remains the sprint's hard constraint** — new views, motion and the upload flows
  must not break it; the built-asset check stays part of `verify`.
- **The 404 `empty-archive` on `/photos/random` is a state, not an error** — E3-S4 owns its rendering;
  until then E3-S1 renders its tone placeholder and never a crash.
- **Design references remain development-time only.** Nothing fetched during a UI story's research may be
  copied into code, added as a dependency, or requested at runtime.

## Out of scope (explicitly)

- **E4-S3 and later** — touch ordering (8 pts), the aura picker, publishing: Sprint 4, where the sprint
  map already places them.
- **The backend is frozen.** No Java change is in any story; if a contract gap appears mid-story, it stops
  and asks — it is never patched silently inside a frontend story.
- **Carried open security items stay out by name** — #71 (cross-site state-changing requests, p1),
  #72 (Spring Boot EOL decision, p1), #73 (Low-severity hardening, p2), #79 / E6-S17 (static-serving
  hardening, p1). This sprint has no hardening goal and no spare capacity beyond the sacrifice order;
  pulling one in is an explicit owner decision, never a silent over-commit. The decision is recorded in
  the backlog at this planning.
- **CI (E6-S1)** stays Sprint 4. Every check in this sprint is a local `verify` run, recorded in
  `reports/`.
- **A second visual language** — the design system is fixed; a new pattern is either described in
  `docs/engineering/DESIGN-SYSTEM.md` or explicitly deferred.

## Notes / decisions during the sprint

- 2026-10-16 — Sprint opened. Dates re-planned from the indicative November window to
  2026-10-16 → 2026-10-30 (Sprint 2's plan said later rows are re-planned at their own planning; the owner
  opened this sprint the day Sprint 2 closed). The playbook row and the milestone `due_on` are updated.
  The milestone already held exactly these seven issues, so no issue churn was needed.
- 2026-10-16 — Planning checks, executed: `/photos/random` is in the contract (E1-S6) and implemented;
  `@tanstack/react-query` is already a dependency, so E4-S1's query invalidation adds no package; the
  carried security items (#71, #72, #73, #79) are kept out by name, with the decision recorded in
  `docs/scrum/PRODUCT-BACKLOG.md`.
