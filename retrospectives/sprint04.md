# Sprint 04 — Retrospective

- **Dates**: 2026-10-17 → 2026-10-19 (planned to 2026-10-31; delivered early)
- **Goal**: Dumps can be curated end to end (upload, order, colour, publish) with CI guarding merges.
- **Outcome**: Achieved
- **Sprint plan**: `docs/scrum/sprints/sprint04.md`
- **Release**: `develop` → `main` (release PR in the Sprint 04 milestone), tag `sprint-04`
- **Board**: milestone "Sprint 04 — Workshop & CI"
- **Security audit**: `reports/security-audit-sprint04.md` — **CLEAR**, 0 blocking

## Metrics

| Metric | Value |
| --- | --- |
| Stories committed / delivered | 5 / 5 |
| Slices delivered | 14 (E4-S3 re-cut at review into 2a–2e; E4-S4 3, E4-S5 4, E6-S1/S2 1 each) |
| Points committed / delivered | 25 / 25 |
| Velocity (delivered points) | 25 |
| PRs merged | 31 (1 plan, 18 story, 12 scrum-record) |
| PRs closed unmerged | 3 — #124 (E4-S3 re-cut into 2a–2e), #152 (the E6-S2 drill), #154 (re-cut as #155) |
| Average story-PR size (changed lines) | 323 (range 8–839; 5,824 total) |
| Defects found by review/probe and fixed in-sprint | 3 — the extraction/queue race (#139), the keyboard announcement copy (#132), the double-publish race (locked in E4-S5D) |
| Backend / frontend suite at the release | 307 / 450 tests, all green |
| Security audit | CLEAR — 0 blocking; 2 new informational notes (N6 dnd-kit supply chain; N7 CI provenance → folds into E6-S22) |
| Carry-over stories | 0 |

## What was delivered

| Story | Title | PR | Notes |
| --- | --- | --- | --- |
| E6-S1 | CI on every PR — backend and frontend jobs, cached | #123 | The workflows E6-S2 later made required |
| E4-S3 | Drag-and-drop ordering | #125, #126, #127, #128, #131, #132 | Re-cut at #124's review into five slices: reducer, gesture core, motion, keyboard, announcements |
| E4-S4 | Aura colour picker with palette suggestions | #133, #135, #137, #138, #139, #141 | ADR-023; the session keeps the picker across refreshes |
| E4-S5 | Publish dump with optimistic UI | #143, #145, #147, #150 | Pre-cut in the plan and all four slices merged as planned — a first; ADR-024; the epic (#35) closes |
| E6-S2 | Required status checks on `main`/`develop` | #153 | Proved by a red drill (#152) and an API read-back; the gate's first green traversal was its own PR |

**Not delivered**: nothing — 0 carry-over.

## What went well

- **The pre-cuts held.** E4-S3 was re-cut at #124's review and all five slices landed under the
  trigger; E4-S4 stayed three slices; E4-S5's four-slice pre-cut from planning shipped exactly as
  planned, with no split-at-review — the first story in this repo to do so.
- **The average story-PR size fell from 949 to 323 changed lines** (range 8–839): the largest
  sprint-4 story PR is smaller than sprint 3's average.
- **Review rounds kept finding real things**, and the record names them: the extraction/queue race
  (#139), the keyboard announcement copy (#132), the double-publish race (locked in E4-S5D), the
  glass wording nits (#138), and E4-S5C's sentence map parked at its only future surface (S5D).
- **Proof over prose hardened.** E4-S5D's Chromium probe re-ran byte-identical under review; E6-S2
  turned "a setting changed" into an executed drill (#152: red checks, `mergeStateStatus: BLOCKED`,
  `gh pr merge` exit 1) plus a read-back, and its round 2 proved the follow-up comment delta
  gate-inert by parsed-tree equality.
- **The record survived its own accident.** The E6-S2 comment authored on the wrong branch was moved
  by cherry-pick (no history rewrite), #154 was re-cut clean as #155, and the whole sequence was
  written into `sprint04.md` rather than hidden.
- **The gate was built last on purpose** (E6-S2 after every story): every earlier merge had already
  trained the flow the release then relied on.

## What did not

- **Manual closure drift.** At the close, two Done stories' issues (#33 E4-S3, #40 E6-S1) were still
  open; the completeness check found them and they were closed with comments. The house closes
  issues by hand, and the habit did not keep up with the record PRs.
- **One workspace accident.** The E6-S2 `ci.yml` comment was authored on the checked-out flip branch
  instead of the story branch; caught before review, but it cost a re-cut (#154 → #155) and a
  cherry-pick.
- **The budget was met by trimming prose, not by cutting scope.** E4-S5D first measured 535 and
  landed at 495 by tightening comments and docs — ~40 lines bought, no structural headroom. The next
  story that exceeds the trigger cannot buy its way down the same way twice.
- **Six story PRs still exceeded the ~400 guidance** (largest 839; E4-S5B/C/D at 411/495/495), so the
  guidance now sits near the middle of the distribution, not at a ceiling.

## What we will change (max 3, each verifiable next sprint)

1. **The branch is printed before the first edit, not discovered after the first push.** Every
   editing session starts with `git branch --show-current`; verified next sprint by zero
   misrouted-commit re-cuts (this sprint: one, #154).
2. **Closing a story includes the issue sweep.** The record step closes the story's issue (and its
   parent at epic close) with the closing comment, and the sprint-close completeness check
   (`gh issue list --milestone … --state open`) must return empty; verified at the next close (this
   sprint: two stale issues found).
3. **A probe ships its script.** Any probe-backed evidence commits the probe script beside its
   captures (e.g. `reports/probes/`), so a capture can be re-run from the repository alone; verified
   by the next probe-bearing PR (reviewers flagged the out-of-repo scripts twice: E4-S5D's capture
   and E6-S2's fixture).

## Decisions taken

| ADR | Decision | Impact |
| --- | --- | --- |
| ADR-023 | The aura picker: the chosen page colour is kept, the glass flips, suggestions merge by pixel share | The picker's contrast contract and the suggestion ranking |
| ADR-024 | The draft survives its upload; the publish reads the six stored photos in order, optimistically | The E4-S5 pre-cut and the whole publish contract |

## Surprises

- The sprint's smallest story PR (#153, 14 lines) produced the largest verification artifact: a red
  drill, two protection read-backs and a byte-level match proof.
- The recorder accident (#154 → #155) happened inside the very flow the sprint was hardening — and
  the re-cut procedure absorbed it without touching history.
- The frontend suite grew 344 → 450 tests while the backend — frozen by design since sprint 3 —
  stayed at 307.

## Known issues carried into Sprint 5

| Item | Priority | State |
| --- | --- | --- |
| #71 / E6-S13 — cross-site state-changing requests | p1 | Open; the publish POST joins the upload POST as a CORS-simple write |
| #72 / E6-S14 — Spring Boot 3.5 end-of-life | p1 | Open; no reachable CVE, the line is past OSS EOL |
| #79 / E6-S17 — `/images/**` follows filesystem links | p1 | Open; not request-reachable |
| #73 / E6-S16 — low-severity hardening | p2 | Open |
| #103 / E6-S18 — colour-token parsing | p2 | Open; the aura tokens are computed in the client (ADR-020/023) |
| E6-S19 — upload-validation hardening | p2 | Backlog row, no issue yet |
| E6-S20 — static-WebP downscaling | p2 | Backlog row, no issue yet |
| E6-S21 — splash hero URL origin validation | p2 | Backlog row, no issue yet |
| E6-S22 — GitHub Actions majors and Dependabot | p2 | New this sprint (recorded in the E6-S1 record); backlog row, no issue yet — the audit's N7 (fork/PR-workflow hardening) folds in here |
| E6-S23 — drag overlay stacking at short viewports | p2 | New this sprint (recorded in the E4-S3C/E4-S3D records); backlog row, no issue yet |
| Cancel/retry can duplicate a stored photo | — | Documented in the workshop header; an idempotency key is a later story |

## How to audit this sprint

- Sprint plan and running record: `docs/scrum/sprints/sprint04.md` (this file's numbers come from it
  and from `git diff` at the record tips).
- Retrospective: this file. Security audit: `reports/security-audit-sprint04.md`.
- Story PRs: #123, #125–#128, #131–#133, #135, #137–#139, #141, #143, #145, #147, #150, #153;
  scrum-record PRs: #129/#130/#134/#136/#140/#142/#144/#146/#149/#151/#155/#156; closed unmerged:
  #124 (re-cut), #152 (drill), #154 (re-cut).
- Merges of interest: `648ea16` (E6-S1), `b30a532` (E4-S4A), `4d9633e` (E4-S5C, tip `c18b608`),
  `de3ca13` (E4-S5D — the epic's last merge), `cd50eac` (E6-S2); `22620b6` / `d0fe574` (the S5D
  record), `c98adf9` (the E6-S2 record).
- Evidence: `reports/verify-e4-s5d-20261019.md` + `reports/e4s5d-{saving,returned,refused}-390.png`;
  the E6-S2 drill on PR #152 and the protection read-back in PR #153; gate outputs in each PR body.

## Next sprint preview

- Goal (plan): **The Time River scrolls and the background follows each dump's aura** — Sprint 5,
  planned 2026-12-14 → 2026-12-25.
- First story: **E5-S1 — River feed & timeline markers** (8 pts, p0), the first reader of
  `queryKeys.dumps` (and of the optimistic entry E4-S5C writes).
