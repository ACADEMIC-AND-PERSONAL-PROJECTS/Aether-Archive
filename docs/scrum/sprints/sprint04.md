# Sprint 04 — Dumps can be curated end to end (upload, order, colour, publish) with CI guarding merges

- **Dates**: 2026-10-17 → 2026-10-31 (UTC). The playbook row carried an indicative
  2026-11-30 → 2026-12-11 window; as at Sprint 3's planning, a later row is re-planned at its own
  planning. This sprint opens the day Sprint 3 was released.
- **Goal**: Dumps can be curated end to end (upload, order, colour, publish) with CI guarding merges.
- **Capacity**: **25 points** committed — 5 stories, the floor of the 25–34 band. The sprint starts at
  the floor on purpose: the three E4 stories are the product's last curation surface, and the two CI
  stories are the first time anything runs outside this machine — headroom is for their surprises.
- **Branch base**: `develop`

## Sprint backlog

| # | ID | Story | Points | Priority | Status | PR |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | E6-S1 | CI on every PR — backend and frontend jobs, cached, under 8 minutes | 5 | p0 | Done | #123 |
| 2a | E4-S3A | The order reducer — `moveItem`/`orderedIds`, pure and tested | 1 | p0 | Done | #125 |
| 2b | E4-S3B | The gesture core — mouse/touch sensors, sortable grid, overlay | 4 | p0 | Done | #126 |
| 2c | E4-S3C | Motion: drop ≤ 300 ms, auto-scroll, reduced motion (criterion 4) — two PRs | 1 | p0 | Done | #127 + #128 |
| 2d | E4-S3D | Keyboard path and cancel, with dnd-kit's default announcements (criterion 3) | 1 | p0 | Done | #131 |
| 2e | E4-S3D1 | Position-based announcement copy and instructions (criterion 3) | 1 | p0 | Done | #132 |
| 3a | E4-S4A | The chosen-background theme engine — hex validation, contrast by construction | 1 | p0 | Done | #133 |
| 3b | E4-S4B | Palette suggestions from the selected photos, merged and ranked | 2 | p0 | Done | #135 |
| 3c | E4-S4C | The Aura picker UI, live preview, reset and session persistence | 2 | p0 | Todo | — |
| 4 | E4-S5 | Publish dump — `POST /dumps`, optimistic insert, rollback | 5 | p0 | Todo | — |
| 5 | E6-S2 | Required status checks on `main` and `develop` | 2 | p0 | Todo | — |

**Total: 25 points across 11 slices** (E4-S3 was re-cut at #124's review into 2a/2b/2c, and 2c was
pre-cut after measuring 928 hand-written lines into motion (2c, 1 pt) and keyboard (2d, 2 pts) — points
unchanged; 2d was split again at #131's review into the keyboard path (2d, 1 pt) and the custom
announcement copy (2e, 1 pt), the cut the reviewer built and measured green at 260 lines — points
unchanged; E4-S4 was pre-cut before implementation into the theme engine (3a, 1 pt), suggestions (3b,
2 pts) and the picker UI (3c, 2 pts) — points unchanged). E4-S3C's motion is itself delivered in two
PRs at review: auto-scroll on its own branch (#128) and the drop animation plus reduced motion on #127.
Slice ids and their points are unchanged, so the sprint total does not move for splits that add no
scope.
The order is deliberate:

- **CI first, not last.** The Sprint 3 retrospective's preview named E4-S3 as the first story; this
  plan changes it. CI built at the start guards every PR the sprint itself opens, and the workflows are
  easiest to get right on the tree they will first run on. E6-S2 waits for the end because it needs the
  workflows green and a deliberately failing scratch PR as proof.
- **E4-S3 before E4-S5.** Publishing sends six photos in their display order; the ordering reducer is
  what produces that order. E4-S4 is independent of both and sits in the middle.
- **The backend is frozen again.** No Java change is planned; if a contract gap appears mid-story, it
  stops and asks — it is never patched silently inside a frontend story.

## Process commitments (from Sprint 3's retrospective — success criteria, not advice)

1. **A visible-behaviour claim ships with the measurement that can falsify it.** Every UI claim in a
   PR names the command or observation (geometry, capture, probe) and the tip it was taken at; the
   reviewer re-runs one claim.
2. **Size numbers are generated, never typed, and re-run after the last commit.** Every PR pastes a
   `git diff --numstat`-derived table (production / tests / docs / records separately) from a command
   run at the tip.
3. **Lifecycle and state-machine changes get a dev-mode probe as well as a built-bundle one.** Any
   change to effects, refs, routing or app lifecycle is exercised under `StrictMode` in addition to the
   built bundle.

## Risks & assumptions

- **`@dnd-kit` is a new dependency and the sprint's largest risk.** `CLAUDE.md` §2 mandates it, so no
  ADR is needed for the package itself; its size and behaviour are measured in the story. jsdom has no
  pointer capture and no layout, so the reducer and the keyboard path are unit-tested while touch and
  mouse are proven in Chromium; auto-scroll near edges is the first thing to probe.
- **GitHub Actions is the first execution outside this machine.** The backend job needs Docker for
  Testcontainers on the runner; action versions are pinned by commit SHA; permissions are minimal;
  logs are uploaded on failure. If the runner cannot run the suite as this machine does, the failure is
  reported, not worked around.
- **E6-S2 needs repository admin and a proof.** Requiring checks means changing branch protection via
  the API and demonstrating a deliberately failing PR is blocked; if the token lacks admin, the story
  stops and asks rather than claiming a setting it did not make.
- **The aura preview is a browser calculation.** The palette extraction and theme generator already
  exist and are measured (ADR-018, ADR-020); the picker's live preview must keep the text-contrast
  guarantee and is proven by painted-pixel measurement, not token arithmetic.
- **Publish is the first write beyond uploads.** The optimistic insert must roll back on any failure;
  the double-submit guard and the six-photo precondition mirror the server's validation and are tested
  before the request.
- **Zero external requests remains the app's hard constraint.** CI is a build-time service, not a
  runtime request; the built bundle's origin scan stays part of `verify`.

## Out of scope (explicitly)

- **The carried hardening and review items stay out by name** — #71 / E6-S13, #72 / E6-S14,
  #79 / E6-S17, #73 / E6-S16, #103 / E6-S18, E6-S19, E6-S20, E6-S21. This sprint's goal is curation and
  CI; pulling one in is an explicit owner decision, never a silent over-commit.
- **E5 (the Time River), E6-S3 and later** — Sprint 5+ where the sprint map places them.
- **v1.0 packaging and deployment** — Sprint 6.
- **Spec changes** — `_docs/` stays read-only; a divergence is an ADR plus explicit owner approval.

## Notes / decisions during the sprint

- 2026-10-17 — Sprint opened the day Sprint 3 was released (`sprint-03`, `bb2d4c0`). Capacity at the
  floor (25) with the CI stories first; the Sprint 3 retro's preview is superseded and the reason is
  recorded above.
- 2026-10-17 — **E6-S1 (PR #123): the first CI run is green.** Run
  [39032047180](https://github.com/ACADEMIC-AND-PERSONAL-PROJECTS/Aether-Archive/actions/runs/39032047180):
  **50 s wall**, both
  jobs on the same runner minute — frontend 42 s (install 4 s, lint 4, format 2, typecheck 3, test 13,
  build 3), backend 47 s (`./mvnw -B verify`, the step itself 38 s). Well inside the 8-minute budget on
  a cold cache. The failure path (artefacts) is exercised by E6-S2's deliberately failing scratch PR.
  Merged as `648ea16`; the merge exercised the **push trigger on `develop`** (run
  [39032754120](https://github.com/ACADEMIC-AND-PERSONAL-PROJECTS/Aether-Archive/actions/runs/39032754120),
  green in 61 s).
- 2026-10-17 — **E4-S3 was re-cut at PR #124's review, not defended.** The whole story measured **1,343
  hand-written** (production 659, tests 600, docs 84) and claimed the exception on block-attributed
  halves (≈891 / ≈449). The review constructed the cut the PR named (gesture core, 903, green) **and a
  reducer-only slice at 238, green and under budget** — so "no arrangement reaches the budget" was
  false. The story is now **E4-S3A** (the reducer, 1 pt), **E4-S3B** (the gesture core, 4 pts, its own
  measured exception), **E4-S3C** (keyboard/announcements/auto-scroll/motion, 3 pts). The same review
  found a real defect the author's runs missed: **the shuffled suite is flaky** — 3/5 shuffled full
  runs failed at the tip against 4/4 at the base — because dnd-kit removes its capture-phase document
  listener on a 50 ms timer, so an activated drag that ends without a drop leaks into the next test.
  **The fix belongs to S3B/C, where the drag code and its tests land**: every activated drag will end
  with a drop/Escape and await the listener release, and the shuffled suite will be run repeatedly,
  not once. #124 was closed unmerged.
- 2026-10-17 — **E4-S3A merged (`415b4c3`, PR #125)** after APPROVE WITH NITS: the reducer slice at
  **238 hand-written**; the review brute-forced it against `arrayMove` (204/204 in-range, 1149/1149
  clamped out-of-range, 0 divergences) and its nits — the wire-shape test, E4-S5's id-provenance work,
  the fix's ownership, the 299-line total — are fixed. S3B is In progress.
- 2026-10-17 — **E4-S3C was re-cut again at #127's review, and the earlier note's "S3C, 3 pts" is
  superseded by this entry and the S3D row.** The pre-cut estimated the motion slice at 496, but at the
  review tip it measured **521 hand-written including 25 record lines** (production 174, tests 206,
  docs 116, records 25) — 21 past the ~500 branch trigger, with no atomic-story exception claimed. The
  review offered an exception claim or reverting the records; the branch instead gives up real scope:
  **auto-scroll moves to its own branch and PR #128** (constant, one `DndContext` prop, an exact-value
  test, its own probe), and #127 keeps the drop animation, the overlay scrim and reduced motion. The
  slice id and its 1 point stay unchanged (sprint total still 25); keyboard is **S3D** (2 pts).
  #127 merges `develop` after #128 and is re-measured at its tip; no exception is claimed.
- 2026-10-17 — **E4-S3C merged, both halves** (`#128` auto-scroll, `#127` drop + scrim + reduced
  motion; merge commits `30d9cb9` and `35b0dca`). Final sizes, re-measured at each tip: **107**
  hand-written for #128 and **498** for #127 (production 156 / tests 222 / docs 120 / records 0) —
  both under the ~500 trigger, no exception claimed. The review's recorded nits (scrim contrast
  8.57/7.45, E6-S23, listener lifecycle, mid-session preference change) are all closed.
- 2026-10-18 — **E4-S4A merged (`b30a532`, PR #133)** at APPROVE, size **399 hand-written** at the
  tip (production 187 / tests 126 / docs 86, `git diff develop --numstat`), both CI jobs green on the
  tip run
  [39159095128](https://github.com/ACADEMIC-AND-PERSONAL-PROJECTS/Aether-Archive/actions/runs/39159095128).
  The engine changed only where the review proved it wrong — the single-direction refusal band and
  pure-text returns (`d05eccd`: both directions tried, never pure text) and the near-endpoint pure
  surfaces (`5c5054c`: the step flips at the cube's edge) — and the record's black-glass
  counterfactual was re-measured with the tint forced in the shipped search: **1,803 of 4,096
  refused (44.0%)**, not the 1,799 first recorded (ADR-023 updated; the pushed messages keep the
  miscount, noted on the PR). The review's two consistency nits (`.claude/rules/frontend.md`'s glass
  clause and `DESIGN-SYSTEM.md`'s fallback qualifier) and the optional
  `glassSolid`-in-`ContrastReport` hardening are deferred to S4C, recorded here per the review.
- 2026-10-18 — **E4-S4B merged (`b9cccee`, PR #135)** at APPROVE after one fix round (round 1:
  APPROVE WITH NITS, no blocking; all five findings closed at `9c55919`), size **385 hand-written**
  at the tip (production 101 / tests 271 / docs 13, `git diff develop --numstat`), both CI jobs green
  on the tip run
  [39163288149](https://github.com/ACADEMIC-AND-PERSONAL-PROJECTS/Aether-Archive/actions/runs/39163288149).
  The pipeline pools the picked photos' palettes — deduped by normalised hex, confidence the mean
  photo share, top eight — and a refused extraction is a skip (a synchronously thrown one included:
  the review's control falsified the skip claim for that shape and the wrapper followed). The record
  gained two precision fixes: ADR-023's decision 3 now says "mean share across the photos" (`Palette`
  carries no pixel counts; the review measured 0.5/0.5 emitted where pixel areas give 0.64/0.36) and
  the module states its trusted-input contract. The probe (real PNGs, Chrome 153 headless)
  reproduces at the tip and its bundle is byte-identically rebuildable.
