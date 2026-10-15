# Definition of Ready — Aether Archive

A story may enter a sprint only when all of the following are true. If a box is unchecked, refine the
story first (with the `scrum-master` subagent) — never start coding on an unready story.

## Story quality

- [ ] The story is written as a user story with a clear value statement
      ("As a …, I want …, so that …"), or explicitly marked as a technical enabler.
- [ ] Acceptance criteria are listed and **testable** — each names an observable behaviour,
      not an intention ("uploading a 7th image is rejected with a visible message" ✔,
      "the UX is nice" ✘).
- [ ] The story fits in one sprint and is estimated at **8 points or fewer** (Fibonacci).
      Larger stories are split before planning.
- [ ] Priority is set (`p0`/`p1`/`p2`) and consistent with the sprint goal.
- [ ] The story ID is stable and referenced in the backlog.

## Dependencies & clarity

- [ ] Dependencies on other stories are listed and either already `Done` or scheduled earlier.
- [ ] Any contract it touches exists: OpenAPI path/schema in `_docs/openapi.yml`, or a design decision
      recorded in `docs/engineering/DESIGN-SYSTEM.md` / `docs/scrum/DECISION-LOG.md`.
- [ ] The technical approach is clear enough to start; genuine open questions are resolved as ADRs
      during refinement, not during implementation.
- [ ] For UI stories: the design language rules apply, and any new visual pattern is described
      (or explicitly deferred to the design system owner).

## Testability

- [ ] It is known how the result will be verified (automated test, endpoint call, device check), and
      the verification is feasible in this environment (local-only, no external service).
- [ ] Test data needed is available or can be generated (fixtures, seed script).

## When a story is not ready

Move it out of the sprint, note the missing element in the backlog row, and pick the next story by
priority. Do not "fix it while implementing".
