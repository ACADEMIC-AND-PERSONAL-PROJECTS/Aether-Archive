# Sprint 02 — The React shell runs and the design system is defined

- **Dates**: 2026-10-16 → 2026-10-30 (UTC)
- **Goal**: The React shell runs and the design system — colour extraction from the user's own images,
  Fontsource typography, the Dark Glassmorphism layer — is defined.
- **Capacity**: **33 points** committed — 8 stories, inside the 25–34 band, one point below the ceiling.
  That is not enough room for another story, and not enough for a story that overruns. The order of sacrifice
  is named here so it is not improvised at the end: **E1-S10** (2 pts, a developer convenience) is the first
  candidate for Sprint 3; **E1-S5** would be second, and — because moving a `p0` story out of a sprint is a
  scope change the playbook reserves for the owner — that one is confirmed with them rather than decided here.
  The design system itself does not slip.
- **Branch base**: `develop`
- **Milestone**: `Sprint 02 — Design System` (already holds exactly these eight issues: #20–#25, #14, #19)
- **Retrospective of record for the previous sprint**: `retrospectives/sprint01.md`

## Sprint backlog — the delivery order, with reasons

| # | ID | Story | Points | Priority | Status | PR |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | S02-C1 | *chore*: land retro-change #3 (working agreements in `.claude/`) | — | — | Done | #77 |
| 1 | E2-S1 | Scaffold the frontend toolchain | 5 | p0 | Done | #78 |
| 2 | E1-S5 | Serve images at `/images/**` | 2 | p0 | Done | #80 |
| 3 | E2-S2 | App shell, routing & typed API client | 5 | p0 | Done | #81 |
| 4 | E2-S3 | Global CSS foundation | 3 | p0 | Done | #84 |
| 5 | E2-S4 | Dominant-colour extraction algorithm | 8 | p0 | Done | #86 |
| 6 | E2-S5 | Fontsource typography system | 3 | p0 | Done | #88 |
| 7 | E2-S6 | Dark Glassmorphism theme layer & GlassPanel | 5 | p0 | Done | #90 |
| 8 | E1-S10 | Dev seed script & curl smoke collection | 2 | p2 | Done | #92 |

**Total: 8 stories · 33 points** (the row above the eight is a chore, not a story). The order is mostly
the dependency chain, with two deliberate placements — E2-S4 early for risk, E1-S10 last to close:

- **E2-S1 first** — every other frontend story needs the toolchain, and guessing at its shape would cost more
  than doing it once.
- **E1-S5 second** — a 2-point backend story with no frontend dependency, so it costs nothing to clear early.
  It closes the last gap in the Sprint 1 API surface (`Photo.url` exists; nothing serves it yet —
  `reports/verify-e1-s6-20261016.md`, "Not covered / SKIPPED"), and it is what E1-S10's "every endpoint" smoke
  collection needs to cover. No Sprint 2 story renders a served image: the views are Sprint 3+.
- **E2-S2 and E2-S3 next, in that order** — the shell is a deliverable in its own right (a routed, typed
  application that talks to the API), and it is where E2-S6's token check page renders; the CSS foundation is
  the harder dependency, since `global.css` is what E2-S5 and E2-S6 extend.
- **E2-S4 mid-sprint, deliberately not last** — it is the 8-point story and the one with real algorithmic risk
  (clustering, determinism, a 50 ms budget, and a test environment that may not have a canvas). Putting the
  risky work in the middle leaves room to react; putting it last would turn any surprise into a missed sprint.
- **E2-S5 before E2-S6** — the link is the check page: E2-S6 renders type styles alongside the colour tokens
  (`docs/engineering/DESIGN-SYSTEM.md` §10), and the font payload is measured in the same build. Fonts are also
  the smaller, better understood piece.
- **E2-S6 last of the frontend six** — it needs the tokens (S3), the palette (S4) and the fonts (S5).
- **E1-S10 closes the sprint** — it demos the *finished* stack (seed data + a smoke collection over every
  endpoint), which is exactly what a sprint review wants to run.

## Definition of Ready check

All eight pass: each has a value statement and testable criteria, none exceeds 8 points, priorities match the
goal, dependencies are scheduled earlier, the contract exists (`_docs/openapi.yml` for E1-S5/E1-S10;
`docs/engineering/DESIGN-SYSTEM.md` + `.claude/rules/design-language.md` for E2-S3/S4/S5/S6), and every story
is verifiable locally with no external service.

## Process commitments carried from Sprint 1's retrospective

The retrospective's three changes are **success criteria for this sprint**, not advice. Each is written so a
reader can check it afterwards:

1. **Probe, do not reason.** Every brief requires executed evidence for any framework or browser assumption
   (a command, a version, a supported API), pasted into the story's report. A review finding that traces back
   to an assumption nobody executed is recorded in the retrospective as a *process* failure, not as bad luck.
2. **Measured change budgets, and a rule that uses them.** Every story PR records **both** numbers: total
   changed lines and hand-written changed lines (generated files, lockfiles and `npm`-produced artefacts
   excluded and named). The rule the retrospective settled — the ~400/500-line guidance applies to the
   *hand-written* number, and a large atomic story is split into production/tests/docs commits rather than
   into artificial stories — is stated in `.claude/rules/git-workflow.md` — including the atomic-story
   exception, written into that file during this sprint (see the notes) after E2-S2's review found this
   section cited it before it existed. Sprint 1's 1,300 was a **total**
   average, so the baseline is recomputed here from the nine Sprint 1 story PRs (`gh pr view <n> --json
   files`), and this sprint compares like with like:

   | Sprint 1 story PRs | Lines |
   | --- | --- |
   | Total changed (#60–#64, #66–#69) | **11,689** |
   | Generated: `mvnw` 295 · `mvnw.cmd` 189 · `maven-wrapper.properties` 4 | 488 |
   | **Hand-written baseline** | **11,201** |
   | **Hand-written average per story** | **1,245** |

   The per-file exclusion is named so any reader can reproduce the number. Against that baseline, this
   sprint's first story (E2-S1, hand-written **838** at the branch tip) is 67% of the Sprint 1 average —
   below it, while still above the ~400 rule: both statements are true and the retro carries both.
3. **Working agreements live in the repository.** Staged commits, the probe rule and the concurrent-agent
   staging rule go into `.claude/agents/*.md` and `.claude/rules/git-workflow.md` in the first (chore) PR of
   the sprint, so a fresh session can follow them by grep alone — no dependence on a session that has ended.

## Risks & assumptions

- **The test environment may have no canvas.** The colour pipeline decodes images through a canvas, and jsdom
  implements neither `OffscreenCanvas` nor `getImageData`. E2-S4 must **probe** what the chosen test runner
  actually supports and decide accordingly — pure functions over `ImageData`-shaped input tested directly, a
  browser-mode test run, or a documented shim — recording the choice and the evidence in its ADR. Choosing a
  browser-mode runner is a test-only dependency and must be justified in the same PR.
- **Tailwind's major version decides the whole styling approach** (v3's config file versus v4's CSS-first
  theme). The backlog mandates "Tailwind CSS" without a version, so E2-S1 **records the choice as an ADR**
  with the reason, and E2-S3/S5/S6 follow it. Deciding it implicitly inside a config file would leave the next
  four stories guessing.
- **"Zero external requests" is the sprint's hard constraint** and the easiest thing to break by accident: a
  font `<link>`, a Tailwind CDN build, an icon package with a CDN URL, or a source map pointing at a remote.
  The check is part of `verify` (network panel / built-asset inspection), not a promise.
- **Design references are development-time only.** `.claude/rules/design-language.md` asks for 2–3 references
  per UI story; nothing fetched there may be copied into code, added as a dependency, or requested at runtime.
- **`npm install` needs the network at development time** (as Maven did). The shipped application still makes
  zero requests — that distinction must survive the sprint.
- **The font budget (< 200 KB) is measured, not assumed.** E2-S5 reports the actual added payload from the
  build output.
- **Browser assumptions are the frontend's equivalent of Sprint 1's framework beliefs** — `backdrop-filter`
  support, `100dvh`, `env(safe-area-inset-*)`, `OffscreenCanvas`. Each is probed in the story that depends on
  it, and the fallback is built rather than hoped for.
- **Nobody has said how the required screenshots get taken.** E2-S3's acceptance criteria demand captures at
  320/390/430 px and E2-S6's PR needs one, and the DoD asks for a mobile viewport — but no story names the
  mechanism. The environment has browsers and Playwright/Puppeteer caches present, so this is feasible rather
  than hypothetical; **E2-S1 must probe it and E2-S3 must use it**, and if a test-only dependency is needed it
  is justified in that PR like any other. Discovering this mid-story is exactly what the sprint's first
  commitment exists to prevent.

## Out of scope (explicitly)

- **The application's views** — splash, glass menu, river, workshop are Sprints 3–5. This sprint ends with a
  shell that runs, routes and speaks to the API, plus a design system with a visual check page: nothing in it
  pretends to be the finished experience.
- **The backend is frozen** except for **E1-S5** and **E1-S10**. No API shape changes; `_docs/openapi.yml` is
  untouched.
- **The Sprint 1 audit's open Mediums (#71 cross-site state-changing requests, #72 the Spring Boot 3.5.x
  end-of-life decision) stay out** — they are E6-S13/E6-S14, and pulling either in is an explicit decision with
  the owner, never a silent over-commit. The sprint has no spare capacity by construction.
- **Thumbnails (E5-S3) and feed virtualisation (E5-S4)**: both have frontend surface area and both belong to
  the stories that need them.
- **CI (E6-S1)**: still Sprint 4. Every check in this sprint is a local `verify` run, recorded in `reports/`.

## Notes / decisions during the sprint

- 2026-10-16 — Sprint opened. The milestone already held exactly these eight issues, so no issue churn was
  needed; the plan, the playbook row and the process-commitments section are new.
- 2026-10-16 — The sprint runs 2026-10-16 → 2026-10-30, which leaves a gap before Sprint 3's planned start
  (2026-11-16). Later rows of the playbook schedule are indicative and are re-planned at their own planning;
  the gap is deliberate slack after a sprint that closed in two days, not an oversight.
- 2026-10-16 — **E2-S1's review found the useful thing, and it is a scope transfer rather than a defect**:
  Tailwind v4's default content detection reaches `frontend/README.md`, so documentation prose emits
  utilities and the built CSS hash changes when a doc is edited. `styles/global.css` belongs to E2-S3, so the
  fix is written into **that story's acceptance criteria** (backlog first, then issue #22) instead of being
  patched here where it would be re-derived by the next person. ADR-014 gained the reproducible size reading
  (6.14 kB / 2.01 kB gzip) and a clause naming the default scan scope.
- 2026-10-16 — The same review caught a **stale number in E2-S1's own report and PR body**: the size figures
  described the tree one commit early (5,715 total / 691 hand-written, not 5,595 / 571); the tip measures 5,862 / 838. Fixed in the
  PR body and the report. The lesson is smaller than the mistake: a size is a measurement of the final commit,
  and taking it before the last commit lands is the same class of error as an unexecuted assumption.
- 2026-10-16 — **E2-S2's review found the size commitment one step ahead of the repository**: the citation
  above named `.claude/rules/git-workflow.md` for the atomic-story exception before that file contained it —
  Sprint 1's retrospective had settled the practice, the rule did not yet carry it. The clause is now written
  there (condition: production/tests/docs split, claimed by name in the PR, judged in review), and E2-S1 and
  E2-S2 claim it under that clause rather than under an unwritten understanding.
- 2026-10-16 — **E2-S2's size claim was judged in review: sustained.** Under the atomic-story clause, the
  claim by name — both numbers and the slice-failure argument, in the PR body and
  `reports/verify-e2-s2-20261016.md` §7 — was re-checked against the diff, mutations included, and held;
  the branch merges whole. This line is the clause's last step for E2-S2: the sprint notes record the
  outcome.
- 2026-10-16 — **E2-S3's review: no blocking findings, and the size is noted and accepted.** The reviewer
  re-ran every probe in a throwaway copy — the scan sentinels including the pre-fix `p6vokHjt` → `B7cX_O_f`
  baseline, the palette wipe, reduced motion under the forced preference, the nine overflow cells and the
  contrast values — and sustained `index-DYfMmtpW.css` / `424+ 18- 442`. The 442 hand-written is ~10% over
  the DoD's soft guideline and under the branch-split trigger, so the claim clause is not triggered; both
  numbers are stated in the PR and `reports/verify-e2-s3-20261016.md` §8.
- 2026-10-16 — **E2-S4's review: one procedural blocking finding — the missing size numbers and the
  atomic-story claim — resolved in the PR description, plus three accuracy findings fixed in
  `1c45a9c`/`fafdc1f`.** The reviewer rebuilt both trees, proved the lint refactor behaviour-neutral
  (old implementation × new tests, new implementation × old tests, green both ways; built assets
  `cmp`-identical before and after), reproduced the timing matrix from the shipped modules, and made the
  cited boundary test real (`#08080a`, L ≈ 0.1354). The atomic-story claim — **1,828 total / 1,828
  hand-written**, nothing generated — was re-checked against the diff and sustained; final gates on the
  merge tip: 100/100 tests. The merge is `2ad0c17`.
- 2026-10-16 — **E2-S5's review: APPROVE WITH NITS on the first pass, plain APPROVE on
  re-verification — all three nits wording-only, fixed in `f08ddba`.** The reviewer rebuilt the branch
  (all ten assets plus `index.html` `cmp`-identical to the shipped `dist/`), re-derived every payload
  figure from the packages, re-ran the offline Chromium probe (h1 Playfair 400 at −0.642 px; body Inter
  +0.16 px; three faces `loaded`; zero external requests) and re-ran the gates (100/100 tests). Two
  counter-experiments reshaped the docs: the entry-chunk hash moves once versus E2-S4 (renamed lazy
  chunks) while its size holds at 283.41 kB, and `@theme static` is byte-identical to the default on the
  pinned Tailwind 4.3.3 — recorded as intent, not as a fix. The merge is `eae5f2d`.
- 2026-10-16 — **E2-S6's review: APPROVE WITH NOTES — the two code notes fixed in `c0f6573` /
  `aee1812` (the third, `Closes #25`, applied to the PR body).** The reviewer rebuilt the branch
  byte-for-byte (the probed assets `cmp`-identical), re-measured the contrast pairs at full precision
  (15.787 / 15.012 / 16.201 / 6.398 / 8.462 → the published 15.79 / 15.01 / 16.20 / 6.40 / 8.46;
  byte-rounding 16.165 → the documented 16.17) and brute-forced the by-construction guarantee over
  ~136k palettes without a failure. The notes: the accent band-edge comment claimed ≈ 15–17:1 where
  the measured worst is 5.93:1, and the drift guard read the first regex match anywhere in
  `global.css` — now `:root`-scoped. The atomic-story claim — **1,366 total / 1,366 hand-written**,
  nothing generated — was re-checked against the diff and sustained; gates on the merge tip:
  136/136 tests. The merge is `aa7a96a`.
- 2026-10-16 — **E1-S10's review: APPROVE WITH NOTES — the guard note (N1) fixed in `a0dbf55`
  and re-proven; the count, ledger and size notes (N2–N4) corrected in `124f91c`.** The reviewer
  reproduced the whole mechanism on its own throwaway pair (PostgreSQL 5434 + backend 8082):
  29/29 checks on both archive states, every seed and dump reconciled — and found the guard's
  string compare bypassed by `//`, `/.`, `..` and a symlinked spelling of the real directory,
  with `HOME` trailing-slash spellings never matching the default. Both sides are now
  canonicalised with `os.path.realpath`; a dead-port matrix (every spelling → exit 2, before
  any HTTP call) and a fresh full re-run (29/29; 18 photos / 2 dumps / 18 files) are §10 of the
  report. The atomic-story claim — **1,027 total / 1,027 hand-written** — was re-checked
  against the diff and sustained; no suite gate applies (no Java or frontend file in the diff —
  the executed scripts are the gate). The merge is `1b948c9`.
