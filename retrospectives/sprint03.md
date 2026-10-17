# Sprint 03 — Retrospective

- **Dates**: 2026-10-16 → 2026-10-17 (planned to 2026-10-30; delivered early)
- **Goal**: The signature entry experience exists: immersive splash, glass menu, first uploads.
- **Outcome**: Achieved
- **Sprint plan**: `docs/scrum/sprints/sprint03.md`
- **Release**: `develop` → `main` (release PR in the Sprint 03 milestone), tag `sprint-03`
- **Board**: milestone "Sprint 03 — Splash & Workshop"
- **Security audit**: `reports/security-audit-sprint03.md` — **CLEAR**, 0 blocking

## Metrics

| Metric | Value |
| --- | --- |
| Stories committed / delivered | 7 / 7 |
| Points committed / delivered | 28 / 28 |
| Velocity (delivered points) | 28 |
| Slices delivered | 12 (five stories were split) |
| PRs merged | 18 (12 story, 5 scrum-record, 1 plan) |
| PRs closed unmerged and re-cut | 4 (#99, #109, #113, #116) |
| Average story-PR size (changed lines) | 949 (range 248–1,787) |
| Total story-PR changed lines | 11,385 |
| Backend / frontend suite at the release | 307 / 344 tests, all green |
| Security audit | CLEAR — 0 blocking, 5 informational notes, 7 carried items |
| Carry-over stories | 0 |

## What was delivered

| Story | Title | PR | Notes |
| --- | --- | --- | --- |
| E3-S1A/B | Immersive splash: photo, tone, quiet states / tap intent, pull, per-visit photo | #100, #101 | Split at review after the atomic claim failed; the split made the story 51% larger |
| E3-S2 | Glass menu overlay | #104 | Focus trap, Escape, touch tap; measured contrast found the muted token at 4.14:1 on glass |
| E3-S3 | Route transitions and the motion system | #106 | ADR-022: CSS keyframes, no Framer Motion — a spec divergence approved by the owner on four-build numbers |
| E3-S4 | Quiet loading / empty / error states | #108 | Cross-cutting states; glass-notice contrast rule |
| E3-S5A/B | Accessibility: axe gate / contrast, `inert`, announcements, manual pass | #110, #111 | Split by criterion at review; the status region became a sibling of `<main>` |
| E4-S1A/B | Single photo upload: picker + validation / send, progress, cancel, retry, invalidation | #114, #115 | Split after #113's review; XHR transport; no external requests |
| E4-S2A1/A2/B | Selection grid / multi-select + queue / client-side downscale | #117, #118, #119 | Cut three ways after #116's review; the StrictMode defect was found there |

## What went well

- The sprint goal was met in two days against a two-week window, with no carry-over.
- The review gate earned its cost: every REQUEST CHANGES verdict found something real, and the last three stories each found a defect the author's own mutants missed — uploads dead under `StrictMode`, a "centred" grid that sat at the top, and a "compression" step that grew uploads by 1.56×.
- The pure-core/browser-edge pattern (`decode.ts`, then `selection.ts`, `progress.ts`, `downscale.ts`) kept jsdom tests meaningful while the real paths were proven in Chromium.
- Probes over assumptions: real Chromium runs measured progress events, abort behaviour, glass contrast, the per-visit photo, and the downscale's actual bytes.
- The record stayed honest under pressure: four PRs were closed unmerged rather than defended, and six "cannot be split" claims were withdrawn against measured cuts.

## What did not

- **Every size claim was wrong at least once.** Six stories needed a re-measure; totals mixed record lines with slice lines; one cut was green in the author's copy but not reproducible under review. The rule existed (Sprint 2, change 1); the discipline did not.
- **Split-at-review was the norm, not the exception.** Five of seven stories were split, and the splits cost 19–51% extra writing. The sprint opened promising to construct cuts early and still discovered them at review.
- **A built-bundle probe cannot see development-only behaviour.** The StrictMode defect made uploads dead in `npm run dev` while the production probe stayed green.
- **Claims in prose outran their measurement.** "The grid is centred", "nothing is saved", "the page cannot grow the upload" were each falsified by a browser or a test.
- **The commit shape was post-hoc.** Two branches landed their commits within seconds of one another, so the production/tests/docs partition was created after the code, not by it.

## What we will change (max 3, each verifiable next sprint)

1. **A visible-behaviour claim ships with the measurement that can falsify it.** Every UI claim in a PR names the command or observation (geometry, capture, probe) and the tip it was taken at; the `open-pr` checklist gains the line, and the reviewer re-runs one claim (extending Sprint 2's adversarial control). Verified next sprint by counting PRs whose claims have no measurement.
2. **Size numbers are generated, never typed, and re-run after the last commit.** Every PR pastes a `git diff --numstat`-derived table (production / tests / docs / records separately) from a command run at the tip; the `open-pr` template and the verify skill link the command. Verified by the absence of a stale-number review finding.
3. **Lifecycle and state-machine changes get a dev-mode probe as well as a built-bundle one.** Any change to effects, refs or app lifecycle is exercised under `StrictMode` (`npm run dev` or a StrictMode-wrapped test) in addition to the built bundle. Verified by the probe section naming both environments.

## Decisions taken

| ADR | Decision | Impact |
| --- | --- | --- |
| ADR-021 | The splash hero: one photo per visit, read once, tone placeholder | Per-visit cache policy; probe-measured |
| ADR-022 | Route transitions and motion: CSS keyframes, no animation library | A divergence from the canonical spec's Framer Motion mandate, approved by the owner on four-build numbers (+83.9 kB raw / +29.2 kB gzip vs +0.49 kB) |

## Surprises

- The upload path dominated the sprint: **1,279 + 1,750 + 1,017 = 4,046 hand-written lines** across E4-S1 and E4-S2, more than the whole E3 epic.
- A "compression" step can grow a file: the re-encode measured 1.56× and 1.77× before the no-shrink rule.
- Documentation density is now the size driver: tests plus docs exceed production in every E4 slice.

## Known issues carried into Sprint 4

| Item | Priority | State |
| --- | --- | --- |
| #71 / E6-S13 — cross-site state-changing requests | p1 | Open; the upload POST is CORS-simple and still unprotected server-side |
| #72 / E6-S14 — Spring Boot 3.5 end-of-life | p1 | Open; no reachable CVE today, but the line is past OSS EOL |
| #79 / E6-S17 — `/images/**` follows filesystem links | p1 | Open; not request-reachable |
| #73 / E6-S16 — low-severity hardening | p2 | Open |
| #103 / E6-S18 — colour-token parsing | p2 | Open |
| E6-S19 — upload-validation hardening | p2 | Open (new in Sprint 3) |
| E6-S20 — static-WebP downscaling | p2 | Open (new in Sprint 3) |
| E6-S21 — splash hero URL origin validation | p2 | Open (new: audit note N1 — the client trusts `Photo.url` to be a relative `/images/` path) |
| Cancel/retry can duplicate a stored photo | — | Documented in the workshop header and README; an idempotency key is a later story |

## How to audit this sprint

- Sprint plan and running record: `docs/scrum/sprints/sprint03.md`.
- Retrospective: this file. Security audit: `reports/security-audit-sprint03.md`.
- Story PRs: #100, #101, #104, #106, #108, #110, #111, #114, #115, #117, #118, #119; closed unmerged: #99, #109, #113, #116.
- Merges of interest: ADR-022 `f84063a`; the E4-S1 split `c376404`; the StrictMode fix in #118 `3bf459c`; the downscale no-shrink rule in #119 `4856bb7`.
- Evidence: `reports/e4s1a-selected-390.png`, `e4s1b-{uploading,cancelled,error,success}-390.png`, `e4s2a2-{grid,summary}-390.png`, `e4s2b-preparing-390.png`, `reports/verify-e3-s3-20261017.md`.

## Next sprint preview

- Goal: see `docs/scrum/SPRINT-PLAYBOOK.md` (Sprint 4 row).
- First story: E4-S3 — drag-and-drop ordering (`@dnd-kit` arrives here).
