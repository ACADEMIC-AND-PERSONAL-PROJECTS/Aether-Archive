# Definition of Done — Aether Archive

A user story is **Done** only when every applicable box below is checked **with evidence** in the pull
request. "It works on my machine" is not evidence; a command and its output tail is.

## Code

- [ ] The acceptance criteria of the story are met, one by one (list copied into the PR).
- [ ] Code follows the project rules: `.claude/rules/backend.md`, `.claude/rules/frontend.md`,
      `.claude/rules/design-language.md`, `.claude/rules/security.md`.
- [ ] No dead code, no commented-out blocks, no leftover debug output, no TODOs without a backlog entry.
- [ ] No new dependency without a one-line justification in the PR.
- [ ] Public behaviour matches `_docs/openapi.yml`; any contract change was approved and recorded (ADR).

## Tests

- [ ] New or changed behaviour has automated tests (unit and/or slice and/or integration).
- [ ] The full relevant suite is green locally: `./mvnw verify` (backend), `npm run test -- --run` (frontend).
- [ ] Failure paths are covered (validation errors, 404/500, empty states), not only the happy path.
- [ ] Tests are deterministic — no sleeps, no real network, no dependence on the user's data directory.
- [ ] Frontend builds: `npm run build` succeeds; lint is clean: `npm run lint`.

## Verification (evidence required)

- [ ] The `verify` skill was run on the final commit of the branch and its report is pasted in the PR.
- [ ] For API changes: a real HTTP call was exercised (success and at least one failure path).
- [ ] For UI changes: a screenshot or short recording on a mobile viewport is attached.
- [ ] For data-touching changes: a migration or format change is described, and the impact on existing data is stated.
- [ ] Anything not testable yet is explicitly marked `SKIPPED` with the reason — never omitted.

## Review

- [ ] A `code-reviewer` pass was run on the diff; every blocking finding is fixed or explicitly deferred
      with a backlog entry and the user informed.
- [ ] The PR is one story, ideally under ~400 changed lines; larger work was split.
- [ ] The PR description follows `.github/PULL_REQUEST_TEMPLATE.md` and links the issue (`Closes #NN`).

## Repository hygiene

- [ ] Commits follow Conventional Commits with the story id, and are **frequent** logical units.
- [ ] No secrets, `.env` content, personal paths or generated artefacts are committed.
- [ ] Documentation updated where behaviour, commands or structure changed (`README`, rules, `CLAUDE.md` §Commands).
- [ ] The sprint doc row and the backlog table are set to `Done` (via the docs branch + PR flow).
- [ ] The branch is merged **with a merge commit** and deleted; `develop` is green afterwards.

## Not "Done" (common traps)

- A PR that "will add tests later".
- A feature that works but breaks an existing view.
- A design that ignores the design language ("we will polish later" is a new story, not a free pass).
- Anything merged with failing checks because "they are flaky".
