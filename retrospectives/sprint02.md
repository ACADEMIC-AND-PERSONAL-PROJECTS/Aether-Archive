# Sprint 02 — Retrospective

- **Dates**: 2026-10-16 → 2026-10-30 (the two-week box was not needed again; the sprint opened and closed on one working day)
- **Goal**: The React shell runs and the design system — colour extraction from the user's own images,
  Fontsource typography, the Dark Glassmorphism layer — is defined.
- **Outcome**: **Achieved** — 8/8 stories, 33/33 points, 0 carry-over; every story merged with executed
  evidence and an independent review, and the release gate found no blocking issue
- **Sprint plan**: `docs/scrum/sprints/sprint02.md`
- **Release**: release PR `develop` → `main`, tagged `sprint-02`
- **Board**: milestone "Sprint 02 — Design System" (8 closed / 0 open)
- **Security audit (release gate)**: `reports/security-audit-sprint02.md` — **ISSUES (1): no Critical,
  High or Medium finding**; the single Low (SEC2-01, links inside `images/` followed by `/images/**`) is
  the pre-tracked E6-S17 (#79). All 29 direct frontend dependencies clean at their pins (OSV +
  registry integrity 29/29), `npm audit` 0/339, zero XSS primitives, zero committed secrets, zero
  external requests in the built bundle.

## Metrics

| Metric | Value |
| --- | --- |
| Stories committed / delivered | 8 / 8 (+ the S02-C1 chore) |
| Points committed / delivered | 33 / 33 |
| Velocity (delivered points) | 33 |
| PRs merged | 17 — 9 delivery (8 stories + the chore), 2 process (sprint plan #76, the size rule #82), 6 status flips |
| Test suites at the close | backend 302 tests / 27 classes / 0 failures (280 at Sprint 1's close; ~49 s summed test time); frontend 136 tests / 15 files / 0 failures |
| Average story PR size (changed lines) | 1,706 (8 PRs, 13,644 lines) |
| Average hand-written size | 1,067 per story (8,534 total) — below Sprint 1's 1,245 baseline, still above the ~400 guidance |
| Independent reviews | every delivery PR (9) and the sprint plan; verdicts posted as comments. 3 blocking findings + 20 notes/nits, all fixed on their branches |
| Carry-over stories | 0 |
| New decisions | ADR-014 … ADR-020 (7) |

## What was delivered

| Story | Title | PR | Notes |
| --- | --- | --- | --- |
| E2-S1 | Scaffold the frontend toolchain | #78 | 5,862 changed / 838 hand-written; Tailwind v4 and the TypeScript pin decided (ADR-014/015) |
| E1-S5 | Serve images at `/images/**` | #80 | closes the last Sprint-1 API gap; one review mutant falsified a claim and changed the PR |
| E2-S2 | App shell, routing & typed API client | #81 | 1,917 hand-written; the size exception's first adjudicated claim; the review found two production fixes (Vite root `.env`, unreadable-body mapping) |
| E2-S3 | Global CSS foundation | #84 | 442; scan-sentinel proof (the Tailwind content scope); captures at 320/390/430 px |
| E2-S4 | Dominant-colour extraction algorithm | #86 | 1,828; the environment probe (no canvas in jsdom) decided the test strategy — ADR-018 |
| E2-S5 | Fontsource typography system | #88 | 383/363; 148.2 kB of self-hosted fonts against the < 200 kB budget, offline probe |
| E2-S6 | Dark Glassmorphism theme layer & GlassPanel | #90 | 1,366; contrast by construction, brute-forced over ~136k palettes |
| E1-S10 | Dev seed script & curl smoke collection | #92 | 1,027; 29 checks over every endpoint, both archive states |

**Not delivered**: nothing — the sprint's committed scope landed whole, and the S02-C1 chore (#77) landed
the working agreements in the repository on day one.

## What went well

- **The three Sprint 1 process commitments all held, and each is checkable.** (1) Every framework or
  browser assumption was *executed* before it was believed — jsdom has no canvas out of the box (ADR-018),
  Tailwind's default content scan reaches README prose (sentinels), `@theme static` is byte-identical to
  the default on the pinned version, the fonts render without a single external request. (2) Every story
  PR carries **both** size numbers, and the average hand-written size fell from Sprint 1's 1,245 to
  **1,067** (like-for-like now). (3) The working agreements moved out of session prompts into `.claude/`
  — a fresh session can grep them.
- **Adversarial verification became the house habit, and it caught things prose did not.** E1-S5's
  mutation matrix produced a mutant that changed the PR (a claim was falsified and re-measured);
  E2-S6's by-construction contrast guarantee was brute-forced over ~136k palettes; E2-S3's probes were
  re-run in throwaway copies; E2-S5's counter-experiments reshaped its own docs.
- **The review gate caught real defects in every part of the stack.** The chore's rule text had two
  blockers (an invented rule contradicting files it did not touch; a budget with no consequence — the PR
  template now requires both numbers and the reviewer treats an over-budget size as a finding). E2-S2's
  review found the Vite root-`.env` bug and the unreadable-body mapping. E2-S6's drift guard read the
  first regex match anywhere in `global.css`. E1-S10's guard was a string compare that `//`, `/.`, `..`
  and symlinks walked straight through.
- **The design system is enforceable, not aspirational**: tokens declared once, colour runtime-only,
  contrast computed and defended by tests, one glass fallback, typography measured against its budget.
- **The security audit passed without a new finding.** The new `/images/**` surface implements the
  Sprint 1 audit's requirements (stored-extension media types, `nosniff`, no listings, a 16-path hostile
  battery); all 29 new frontend dependencies verified at their pins with falsification controls and
  registry-matched integrity; the built bundle makes zero external requests.

## What did not

- **Total PR sizes grew while hand-written sizes fell** (1,706 vs Sprint 1's 1,300 total; 1,067 vs 1,245
  hand-written). The gap is the frontend's generated files, which is exactly why the two-number rule
  exists — but five of the eight stories still claimed the atomic-story exception by name, and a claim
  that is routine is a claim that is not being tested. Review adjudicated each one; worth watching.
- **Text drifted from the run three more times** — E2-S1's size numbers described the tree one commit
  early; E2-S6's accent-band comment claimed ≈ 15–17:1 where the measured worst is 5.93:1; E1-S10's
  refusal counts and its write ledger did not add up. Every one was caught in review, and every one is
  the same class of error as Sprint 1's — a number typed from memory instead of pasted from the command
  that produced it.
- **The first cut of E1-S10's guard was a spelling comparison.** Comparing path *strings* instead of
  canonical paths is a known-old mistake, and the adversarial review pass is what caught it — worth
  internalising as a default rather than a review finding.
- **The sprint's own bookkeeping needed a fix at close**: ADR-019 and ADR-020 existed as sections but were
  missing from the DECISION-LOG summary table until this close (see "Decisions taken").

## What we will change (max 3, each verifiable next sprint)

1. **Numbers are pasted from the producing command — or re-measured at the branch tip.** A count, size or
   ledger in a report, README or PR body is copied from the command output that produced it, and any
   number written before the last commit is re-measured after it. **Verifiable**: a review finding of
   the "stale or miscounted number" class (three this sprint) counts as this change failing.
2. **Guards canonicalise before comparing — and ship with their adversarial matrix.** Any code or script
   that compares filesystem paths canonicalises both sides (`os.path.realpath` or equivalent) and its
   test includes the matrix: trailing/doubled slash, `/.`, `..`, symlinks, environment variants.
   **Verifiable**: grep the next story's scripts for canonicalisation and its tests for the matrix.
3. **Every review posts at least one adversarial control, with its result.** Not only prose findings: a
   mutation, a brute force, or a boundary falsification, run and reported. **Verifiable**: read the next
   sprint's review verdicts for the control and its outcome (this sprint's best findings all came from
   such controls).

## Decisions taken

| ADR | Decision | Impact |
| --- | --- | --- |
| ADR-014 | Tailwind CSS v4, configured CSS-first | The styling substrate every frontend story extends |
| ADR-015 | TypeScript 6.0.3 while the lint stack cannot parse 7 | Toolchain pin with a documented exit condition |
| ADR-016 | The frontend reaches the API on its own origin | Same-origin dev proxy; CORS stays untouched |
| ADR-017 | CSS foundation: declared inputs, runtime-only colour, one definition per scale | What E2-S5 and E2-S6 extend |
| ADR-018 | Clustering algorithm and the pipeline's open readings | Determinism and the 50 ms budget; the canvas-less test environment documented |
| ADR-019 | Typography: Playfair Display + Inter Variable, latin subsets, 148.2 kB | The font budget measured, not assumed |
| ADR-020 | Theme layer: role mapping in OKLCh, contrast by construction, one glass fallback | The design system's enforceable core |

## How to audit this sprint

- **Sprint plan**: `docs/scrum/sprints/sprint02.md` (PR #76); the plan text carries the capacity
  rationale, the process commitments and the running notes.
- **One PR per story**: #78, #80, #81, #84, #86, #88, #90, #92 — plus the chore #77 (working agreements)
  and #82 (the size rule). Each body carries the acceptance criteria, the raw evidence, both size
  numbers, and the review verdict as a comment.
- **Reports, one per story**: `reports/verify-e2-s1…s6-*.md`, `reports/verify-e1-s5-20261016.md`,
  `reports/verify-e1-s10-20261016.md` (whose §10 carries the review round); the release gate is
  `reports/security-audit-sprint02.md`.
- **Decisions**: `docs/scrum/DECISION-LOG.md` ADR-014 … ADR-020.
- **Watch out for**: the five atomic-story size claims and their review adjudications; the three
  text-drift findings (above) and where each was corrected; the open security items — #71 (cross-site
  state-changing requests, p1), #72 (Spring Boot EOL decision, p1), #73 (Low-severity hardening, p2) —
  and E6-S17 (#79), the one Low this close's audit re-confirmed. The audit adds no new item.

## Next sprint preview

- **Goal**: The signature entry experience exists: immersive splash, glass menu, first uploads
  (Sprint 3, planned window 2026-11-16 → 2026-11-27).
- **First story**: E3-S1 (immersive splash view, 5 pts, p0) — it builds on the shell and the design
  system this sprint delivered.
- **Carried into planning**: the three process changes above become commitments; the open security
  items (#71, #72, #73) need an explicit decision at planning.
