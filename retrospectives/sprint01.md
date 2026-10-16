# Sprint 01 — Retrospective

- **Dates**: 2026-10-15 → 2026-10-16 (the two-week box was not needed; the sprint closed in two working days)
- **Goal**: The archive can store and serve images and dumps on PostgreSQL through a tested local API
- **Outcome**: **Achieved** — with one acceptance criterion explicitly deferred to Sprint 2 (see below)
- **Sprint plan**: `docs/scrum/sprints/sprint01.md`
- **Release**: release PR `develop` → `main`, tagged `sprint-01`
- **Board**: milestone "Sprint 01 — Foundation & Backend"
- **Security audit (release gate)**: `reports/security-audit-sprint01.md` — no Critical or High findings

## Metrics

| Metric | Value |
| --- | --- |
| Stories committed / delivered | 9 / 9 |
| Points committed / delivered | 34 / 34 |
| Velocity (delivered points) | 34 |
| PRs merged | 13 — 9 stories, 4 process (sprint plan, agent-permission fix, status catch-up, dependency patch) |
| Test classes / tests (backend) | 25 classes · 280 tests, 0 failures, suite 45 s |
| Average story PR size (changed lines) | 1,300 (9 PRs, 11,689 lines — see "What did not") |
| Independent reviews | 10 — every one returned findings; 3 blocking |
| Defects caught before merge | 3 blocking + ~50 smaller findings, all fixed on their branch |
| Carry-over stories | 0 |
| New decisions | ADR-011 (contract clarifications), ADR-012 (storage & CORS constraints + amendment), ADR-013 (error vocabulary + 2 amendments) |

## What was delivered

| Story | Title | PR | Notes |
| --- | --- | --- | --- |
| E1-S1 | Scaffold the Spring Boot project | #60 | Java 21, Spring Boot 3.5.16, wrapper with a pinned checksum |
| E1-S11 | Dev PostgreSQL via Docker Compose | #61 | loopback-bound database; the `spring-boot:run` criterion was deferred to E1-S3 and closed there |
| E1-S2 | Configuration & local data directory | #62 | typed, validated properties; the review found a data-loss defect (below) |
| E1-S3 | PostgreSQL persistence + Flyway baseline | #63 | first schema; `validate` proven by tampering with a column name |
| E1-S4 | StorageService — safe local file storage | #64 | magic-byte validation, atomic writes, containment; found the multipart-ceiling gap |
| E1-S8 | Error handling (RFC 9457) & validation | #66 | one advice, stable codes, no internals in any body |
| E1-S6 | Photo API — upload, list, random | #67 | upload → disk → row → feed, proven end to end |
| E1-S7 | Dump API — create and list 6-photo dumps | #68 | order round-trip proven with a shuffled request |
| E1-S9 | Backend test suite | #69 | one PostgreSQL for the whole suite: 69 s → 45 s; two reviewers found the suite was order-dependent — fixed and proven under two orders |

**Deferred, and named rather than hidden**: E1-S4's acceptance criterion "oversized files rejected with a
`ProblemDetail`" was `SKIPPED` at merge because the HTTP mapping belongs to E1-S8, whose own criteria name the
size limit; it was completed there. E1-S5 (`/images/**` serving) and E1-S10 (seed script) were Sprint 2 stories
from the start and stayed there.

## What went well

- **The independent review gate earned its cost.** Ten reviews, three blocking findings, and every one of them
  was a defect that would otherwise have shipped: a symlinked `tmp/` that made the boot **delete a link
  target's contents** (found by execution, written up in `reports/security-finding-e1s2-symlinked-staging.md`,
  never merged); a parameter that failed to parse answered **500 instead of 400**; and a 404 the archive raised
  itself flattened into a sentence that was untrue — which would have made the empty-archive case
  indistinguishable from a typo'd URL in the very next story.
- **Evidence discipline held.** Reviews reproduced the suites from `git archive` snapshots, mutation-tested
  assertions to prove they had teeth, ran negative controls (the old config really did answer 413 for an
  at-the-limit upload; without the Flyway V2 constraints exactly the three new tests fail), and booted real
  Tomcat + PostgreSQL to check claims rather than reasoning about them.
- **Claims corrected against the record, including the agent's own.** A status update credited the review with
  a finding the story's own verification had made — corrected rather than left to flatter. A javadoc
  justified a check with a false reason about symlinks — corrected. A comment contradicted the code beside it,
  and the reviewer disproved the comment by removing a `fetch join` and re-measuring.
- **The suite is fast and deterministic**: 280 tests in 45–49 s, one container for the whole run, an injected
  `Clock` everywhere, and greps proving no sleeps and no wall-clock reads in production code.
- **The security audit found no Critical or High issue**, verified every dependency at its resolved version
  against OSV, and flagged one reachable DoS (jackson-core) that was fixed before the release.

## What did not

- **Every significant defect was an unverified belief about a framework.** Spring does not read `.env` files;
  `allowedOrigins` ignores wildcards while `allowedOriginPatterns` does not; Tomcat caps multipart at 1 MB by
  default; `MethodArgumentTypeMismatchException` is not an `ErrorResponse` but `ResponseStatusException` is;
  `Files.list` follows a symlinked directory; `saveAndFlush` on an assigned-id entity returns a *different*
  managed instance, so a version test measured nothing. Each was discovered by execution, after being written
  down as fact.
- **PRs were far larger than the project's own guidance** — story PRs averaged ~1,300 changed lines against a
  "~400/500" rule. Three reviewers independently flagged it and proposed the same carve-outs; the rule as
  written was never met once.
- **Commit granularity improved only after being criticised.** E1-S1 arrived as one commit for the whole
  story; by E1-S4 the briefs asked for staged work and the branch carried four logical units. The instruction
  lived in session prompts, not in the repository, so it would not survive a new session.
- **Two process slips were mine, not the agents'.** A `git add reports/` swept a concurrently-written audit
  report into a story commit (corrected by an explicit untrack commit, since history is append-only), and a
  compound `git push … && git log origin/develop` was blocked by the project's own guard because it reads the
  whole command line.
- **The retrospective had to correct its own sprint notes**: a claim credited the review with a finding the
  story had made itself.

## What we will change (max 3, each verifiable next sprint)

1. **Probe, do not reason — for anything the repository did not write.** Every brief asks the implementer to
   *execute* a framework or database assumption and paste the output, never to state it. **Verifiable**: the
   next sprint's reports contain a probe per assumption; a review that finds a defect traceable to an
   unexecuted assumption is a process failure to record here.
2. **Right-size the change budget, by measuring what a human wrote.** Encode the rule the reviews proposed:
   the ~400-line guidance applies to hand-written changes, generated files (Maven wrapper, lockfiles) are
   excluded, and a story that is atomic and large is split into *production / tests / docs* commits rather
   than into artificial stories. **Verifiable**: the next sprint's story PRs are measured twice — total and
   hand-written — and both numbers appear in the retro.
3. **Move the working agreements out of session prompts into the repository.** Staged commits, the
   probe-don't-reason rule, and the "never `git add <dir>` while an agent is writing" lesson go into
   `.claude/agents/*.md` and `.claude/rules/git-workflow.md`. **Verifiable**: a fresh session can follow them
   without this conversation; grep the files for each rule.

## Decisions taken

| ADR | Decision | Impact |
| --- | --- | --- |
| ADR-011 | `openapi.yml` is the contract of record; `title` optional on `DumpCreate`; uploads create unassigned photos; `Photo` gains `createdAt`/`category` | Removed every two-way reading an implementer could have taken |
| ADR-012 (+ amendment) | Upload ceiling 1–1024 MB; CORS through origin *patterns* with bare wildcards refused; data directory absolute, never `/` or `$HOME`, staging never a symlink; one symlink rule for the write path | Made every configuration failure a startup failure with an actionable message |
| ADR-013 (+ 2 amendments) | The error vocabulary is a declared part of the contract: the code list, the status-derived family for Spring's refusals, `about:blank`, and `empty-archive` / `concurrent-modification` | Clients switch on `code`; renaming one is a contract change |

## How to audit this sprint

- **Sprint plan and its review**: `docs/scrum/sprints/sprint01.md`; PR #58 (+ review comment).
- **One PR per story**: #60, #61, #62, #63, #64, #66, #67, #68, #69 — each body carries the acceptance
  criteria, the raw verification evidence, and the review verdict as a comment.
- **Reports, one per story**: `reports/verify-e1-s1…s9-*.md`; the data-loss finding in
  `reports/security-finding-e1s2-symlinked-staging.md`; the release gate in
  `reports/security-audit-sprint01.md`.
- **Decisions**: `docs/scrum/DECISION-LOG.md` ADR-011 … ADR-013 (and the amendments inside them).
- **Watch out for**: the two acceptance criteria deferred at merge and where each was closed (above), and the
  security findings left open — issues #71 (cross-site writes), #72 (framework EOL decision), #73 (Low-severity
  hardening).

## Next sprint preview

- **Goal**: The React shell runs and the design system — colour extraction from the user's own images,
  Fontsource typography, the Dark Glassmorphism layer — is defined.
- **First story**: E2-S1 (scaffold the frontend toolchain).
- **Carried into planning**: E1-S5 (`/images/**` serving) and E1-S10 (seed script + smoke collection), plus the
  audit's p1 items (#71, #72) if capacity allows — the sprint map already commits 33 of the 25–34 band to E2
  and those two stories, so the security items need an explicit decision rather than a silent over-commit.
