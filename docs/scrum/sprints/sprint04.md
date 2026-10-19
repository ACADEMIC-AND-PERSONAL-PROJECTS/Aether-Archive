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
| 3c | E4-S4C | The Aura picker UI, live preview, reset and session persistence | 2 | p0 | Done | #137 + #139 + #141 |
| 4a | E4-S5A | The draft survives its upload — the tile keeps its stored photo | 1 | p0 | Done | #143 |
| 4b | E4-S5B | The publish plan — six stored distinct photos, aura, optional title, pure | 1 | p0 | Done | #145 |
| 4c | E4-S5C | The dump wire — `createDump`, optimistic insert, rollback | 1 | p0 | Done | #147 |
| 4d | E4-S5D | "Save archive" — the publish group, pending state, return, e2e | 2 | p0 | Done | #148 |
| 5 | E6-S2 | Required status checks on `main` and `develop` | 2 | p0 | Done | #41 |

**Total: 25 points across 14 slices** (E4-S3 was re-cut at #124's review into 2a/2b/2c, and 2c was
pre-cut after measuring 928 hand-written lines into motion (2c, 1 pt) and keyboard (2d, 2 pts) — points
unchanged; 2d was split again at #131's review into the keyboard path (2d, 1 pt) and the custom
announcement copy (2e, 1 pt), the cut the reviewer built and measured green at 260 lines — points
unchanged; E4-S4 was pre-cut before implementation into the theme engine (3a, 1 pt), suggestions (3b,
2 pts) and the picker UI (3c, 2 pts) — points unchanged; E4-S5 was pre-cut before implementation into
the draft (4a, 1 pt), the publish plan (4b, 1 pt), the wire (4c, 1 pt) and Save archive (4d, 2 pts) —
points unchanged). E4-S3C's motion is itself delivered in two
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
- 2026-10-18 — **E4-S4C · 1/2 merged (`1ca606f`, PR #137)** at APPROVE WITH NITS after two review
  rounds. The picker offers the ranked suggestions, live-applies complete hexes, commits on Enter or
  blur with a quiet refusal, and holds a persistent status paragraph; nothing is persisted yet. The
  story had been **pre-cut before implementation** into S4C1 (this PR) and S4C2 (session), and the
  branch was cut further **at this PR's round-1 review**: the blocking finding was the size
  accounting, and the branch gave up real scope rather than re-labelling it — the **extraction gate**
  left whole to **S4C1b** and the two E4-S4A glass nits to **PR #138** (the E4-S3C/auto-scroll
  precedent, #128). Final size, re-measured at the tip `be4270e`: **499 hand-written = 489 + 10**
  (production 322 / tests 173 / docs 4) — **under the ~500 trigger, no exception claimed**; over the
  ~400 PR ideal with the claim surviving review as exactly that arithmetic (**504 → 499: −13 the
  gate, −8 the nits, +16 the review's own tests = −5**). Round 2 closed all seven nits: the
  refused-filter test (fails under the reviewer's round-1 mutation), blur witnessed, the StrictMode
  extraction-count test with its comment reworded to what it measures, and the run-counter race
  deferred to S4C1b. Captures (390 × 844 @ DPR 3, Chrome 153, committed at `10762b2`) are
  **pixel-identical at the tip** — capture PNG bytes are encoder-nondeterministic; pixels are the
  provenance — and the probe transcript reproduces word for word.
- 2026-10-18 — **PR #138 merged (`a078332`)**: the two glass nits carried from E4-S4A's review — the
  `.claude/rules/frontend.md` glass clause and `DESIGN-SYSTEM.md`'s fallback qualifier — **8
  hand-written** lines (5 + 3). Their content was verified twice inside #137's rounds (checked
  against `theme.ts:356-358` and `glass.css`'s `@supports` branch, then re-read as "exactly the two
  statements round 1 verified"); no separate scope remained for a third pass.
- 2026-10-18 — **E4-S4C · 1b merged (`6e79ed0`, PR #139)** at APPROVE WITH NITS: the extraction gate
  re-lands on top of the merged picker **exactly as it stood at `10762b2`**, with the transfer
  commitments closed — **N2** (the reopen pinned on a non-empty selection: b fails 413, the second
  answer replaces the held one; the reviewer's vacuity counterexample fails the test) and **N3**
  (the reopen's re-decode recorded as accepted: O(n), invisible beside the queue that just ended) —
  plus **M4** from #137's round 2 (removing the cleanup's `runRef.current += 1` now fails exactly
  the new race test; round 2 measured the whole suite green under it). Size **91 hand-written =
  87 + 4** (production 22 / tests 69 / docs 0). The optional membership-trigger variant is recorded
  as not owed (both entrances invalidate a pending answer; an equivalent mutant).
- 2026-10-18 — **E4-S4C · 2/2 merged (`13208ab`, PR #141)** — the story completes and **issue #34
  closes** (manually: closing keywords fire only on the default branch `main`, and this repository
  merges into `develop`). The aura survives a refresh through one `sessionStorage` value,
  re-validated on read (`normalizeHex` + the engine's refusal) and guarded end to end — a blocked
  Storage loses the session, not the workshop. Final size at the tip `f99fc56`: **113 hand-written =
  106 + 7** (production 51 / tests 58 / docs 4). The review (APPROVE WITH NITS, no blocking)
  confirmed all five criteria against the merged slices and found three unpinned mutants — the reset
  write, the read's `normalizeHex`, and an unmount that clears the session — all closed in place
  (each mutation now fails exactly one test), plus the blocked `removeItem` path spied and exercised
  through the neutral reset. Row 3c flips to **Done** (`#137 + #139 + #141`).
- 2026-10-18 — **E4-S5A merged (`14e814f`, PR #143)** at APPROVE WITH NITS, no blocking findings:
  the draft survives its upload — a successful tile stays, marked `added`, carrying the archive's
  `Photo` (its id on `data-photo-id`), and its preview is revoked only by removal or unmount; the
  queue button renders only while something is still to send, and a settled batch falls through to
  the panel's picker. Final size **329 hand-written = 250 + 79** (production 125 / tests 98 / docs
  106) — under the ~400 budget, no claim. Round 1 closed all seven nits in place: the settled-draft
  capture (`reports/e4s5a-settled-390.png`, Chromium 153, 390 × 844 @ DPR 3), the template-complete
  body, the `data-photo-id` fallback killed (its own mutant now fails one test), the mixed-cancel
  branch pinned, the retired success-path-revoke mutant row, the `orderedIds` → `photo.id` step
  named in the README and ADR-024, and the settled-draft axe sweep. Row 4a flips to **Done**
  (`#143`).
- 2026-10-18 — **E4-S5B merged (`ee094d6`, PR #145)** at APPROVE WITH NITS after two review rounds:
  `planPublish` turns the draft into the `DumpCreate` body or refuses it in one sentence — exactly six
  tiles, every one stored, the six distinct, a `#RRGGBB` aura, and a title trimmed then ≤ 80 (blank
  reads as `null`, counted in UTF-16 units like the server's `@Size`). The ids are the stored photos'
  ids in display order — `orderedIds`' production caller — and the ready plan returns the six photos
  for S5C's optimistic insert. Final size, re-measured at the tip `6a8859d`: **411 hand-written =
  397 + 14** (production 134 / tests 221 / docs 56) — 11 over the ~400 target, claimed under the
  **atomic-story exception** and judged in review; under the ~500 trigger. Round 1 closed the
  order/UTF-16/NBSP/newline-hex pins and the constant coupling; **round 2 refused the branch** because
  the count's position relative to stored/distinct was still unpinned (two reorder mutants green),
  closed by two count-failure cases. Seven mutants, each failing one test; positive control
  `>` → `>=` fails two. Row 4b flips to **Done** (`#145`).
- 2026-10-19 — **E4-S5C merged (`4d9633e`, PR #147)** at APPROVE WITH NITS after two review rounds:
  `createDump` posts the plan's body and `usePublishDump` owns the optimistic write — the draft
  prepended under `optimistic-<first photo id>` (no `crypto.randomUUID` on plain-HTTP LAN origins),
  the snapshot restored on failure or the query **reset** when there was none, and the server's dump
  **prepended and filtered in exactly once** on success — id and any copy a read raced in — with
  nothing invalidated and no `AbortSignal` (a landed write must reach the cache). Round 1 refused the
  branch: probe A caught `onSuccess` dropping the dump on a mid-flight repopulation; the `photoIds`
  sentence contradicted ADR-024 decision 5, so the whole error→sentence map **moves to S5D (#148)**,
  whose scope names the draft-preserving wording; and the budget claim failed, its named cut (the
  sentence map and its tests) taken. Round 2: APPROVE WITH NITS — probe A re-run passes at the tip,
  ten mutants each fail the test that pins them (no insert 6 / no rollback 3 / no success write 3 /
  random id 4 / `dump.id` filter 1 / old map-replace 1 / `removeQueries` 1 / empty-as-absent 1 / no
  cancel 1 / added invalidate 1), the nits closed in the PR body (probes B/D/F recorded, the reader
  test's scope stated exactly, the claim's arithmetic stated). Final size, re-measured at the tip
  `c18b608`: **495 hand-written = 495 + 0** (production 109 / tests 364 / docs 22) — 95 over the
  ~400 target, under the ~500 trigger, the atomic story claimed and judged as surviving in substance
  (`createDump` alone would leave ~405). Row 4c flips to **Done** (`#147`); S5D (#148) follows.
- 2026-10-19 — **E4-S5D merged (`de3ca13`, PR #150)** at APPROVE WITH NITS, no blocking findings, and
  **E4-S5 completes: issue #35 closes** with this slice. The panel: with the sixth stored tile the
  workshop grows the optional title and "Save archive" (ADR-024 decision 2) — a draft that cannot
  leave is answered with `planPublish`'s one sentence and sends nothing (no disabled action); a ready
  plan runs `usePublishDump` under the flight lock (grid, title, picker and button disabled — "Saving…",
  `aria-busy`; the live region says "Saving the dump."; the aura stays live, its change unable to
  reach a body already on the wire), returns where the workshop was entered from (`navigate(-1)`), and
  on failure stays with the draft intact and one sentence from `lib/publish/sentence.ts` — the map
  #147's round 1 moved here, its `photoIds` wording deliberately draft-preserving. Round 1: APPROVE
  WITH NITS, no blocking — ten mutants each killed their test (group visibility 1 / blocked notice 1 /
  no disabled 1 / `navigate(0)` 1 / no sentence 1 / swapped sentences 3 / "Reload and try again." 2 /
  leaked `detail` 1 / dropped title 1 / grid unlocked 1), the Chromium probe reproduced every logged
  value and the three captures byte-identically; the nits: a labelled probe hero for the return
  capture and the typed title pinned across the refusal (both landed), the `errors[0]` switch and the
  handler-level `busy` guard closed by decision (mixed-field refusals unreachable from this surface;
  the guard is "one publish at a time"'s handler half, kept as defence-in-depth). Round 2: APPROVE
  WITH NITS, nothing blocking at the tip. Final size, re-measured at `923ac70`: **495 hand-written =
  470 + 25** (production 165 / tests 297 / docs 33) — 95 over the ~400 target, under the ~500 trigger,
  the atomic story claimed and judged as surviving (`sentence.ts` + its tests is the only cut, and it
  recreates #147's round-1 finding; doc/comment tightening took the branch from 535 to 495). Evidence
  ships in-repo: `reports/verify-e4-s5d-20261019.md` and three captures. Row 4d flips to **Done**
  (`#148`); **E4-S5 (#35) closes** — E6-S2 (required status checks) is what remains on the sprint.
- 2026-10-19 — **E6-S2 merged (`cd50eac`, PR #153)** at APPROVE (round 1 APPROVE WITH NITS). `develop`
  and `main` now **require the two CI job contexts before any merge** — `Backend — ./mvnw verify` and
  `Frontend — lint, format, typecheck, test, build` — applied through the branch-protection API with
  the previous settings preserved (PRs required, `enforce_admins: true`, no force-push, no deletions;
  before/after states read back and diffed on both branches). The proof is a drill, not a claim:
  scratch PR #152 (one deliberately failing frontend test) read `mergeStateStatus: BLOCKED` and
  `gh pr merge` exited 1 ("the base branch policy prohibits the merge"), then was closed unmerged and
  its branch deleted — and PR #153 was the gate's first green traversal. The invariant also sits at
  the edit site (a comment above each required job's `name:` in `ci.yml`), the playbook carries the
  rule and forbids bypasses (`--admin`, disabling a check, weakening the protection), and round 2
  proved the comment delta gate-inert (parsed-tree equality across both revisions; the required
  strings byte-identical across the protection, the workflow and the registered check runs). Size 14
  hand-written. One accident on the way, recorded rather than hidden: the `ci.yml` comment first
  landed on the E4-S5 flip branch (#154), moved by cherry-pick — no rebase — and #154 was closed
  unmerged and re-cut clean as #155 (`22af0ae`). Row 5 flips to **Done** (`#41`): all 25 committed
  points are delivered.
