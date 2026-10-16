# Testing rules (always loaded)

## Principle

Every acceptance criterion of a story is either covered by an automated test or explicitly listed as
manually verified in the PR (with the command or the device used). Untested behaviour is unfinished work.

## Path guards

- Code that compares filesystem paths (traversal checks, sandboxing, static serving) is tested with the
  adversarial matrix: trailing and doubled slashes, `/.` and `..` segments, symlinks — including a
  **directory** symlink and a **link as the leaf itself** — and environment variants (the data dir with and
  without a trailing separator). E1-S10's first-cut guard was a string comparison that `//`, `/.`, `..` and
  symlinks walked straight through (Sprint 2's retrospective, change 2).
- **Run the matrix per call site, not per project.** The matrix has two kinds of cell: the ones the guard
  must refuse, and the ones a call site accepts deliberately. A write site accepts a leaf that is a link —
  its write replaces the link rather than following it — but the same cell at a *serving* site is a
  traversal. So the cells a guard refuses and the cells it accepts are both pinned by tests, with the reason
  for each accepted cell written beside it (`.claude/rules/security.md`). **This is the target, not the
  current state**: a shipped guard whose accepted cell has no test (the write site's leaf link is one today,
  tracked in E6-S17) gets that test with the next change to that guard, and until then the gap is named here
  rather than assumed closed.

## Backend (Java / Spring Boot)

- Frameworks: JUnit 5, Spring Boot Test, MockMvc, AssertJ. No network, no remote service dependencies —
  local Testcontainers (Docker) are fine.
- Layers to test:
  - **Unit** — services and utilities (storage service, ordering logic, validation). Use `@TempDir`
    for anything touching the filesystem.
  - **Slice** — `@WebMvcTest` for controllers (status codes, payload shape, validation errors).
  - **Integration** — `@SpringBootTest` + PostgreSQL via Testcontainers (same image tag as dev) for
    persistence and the full HTTP path of critical flows (create dump, upload photo).
- Naming: `should_<expectedBehaviour>_when_<condition>`.
- **A test of a hostile URL must use a path-faithful client.** `TestRestTemplate` re-encodes the path on the
  way out — measured: `%2e%2e%2f` arrives as `%252e%252e%252f` and a doubled slash is collapsed, while dot
  segments themselves pass through unchanged — so an *encoded* traversal string reaches the server as a
  different string than the test wrote. In E1-S5 the same inputs Tomcat answers `400` to came back `404`
  through it, which is the archive answering a double-encoded literal: the test would have asserted nothing
  about the case it named. Use a client that sends the request line as written
  (`java.net.http.HttpClient`), or state that the case is covered by a probe instead.
- Deterministic: no sleeps, no time-dependent assertions (inject a `Clock`), no random without a seed.
- Test data builders live in `backend/src/test/java/.../support/`; never reuse production fixtures.

## Frontend (React / TypeScript)

- Frameworks: Vitest + React Testing Library. No snapshot-only tests.
- Must-have automated coverage:
  - the dominant-colour extraction algorithm (deterministic fixtures + expected palette),
  - theme/CSS-variable generation from a palette,
  - drag-and-drop ordering logic (pure reducer, tested without the DOM),
  - API client error paths (timeout, 4xx, 5xx).
- Component tests assert behaviour visible to the user (roles, labels, text), not implementation details.
- Accessibility assertions are welcome (focus trap in the menu, keyboard reorder).

## Before every commit

Run the `verify` skill (`.claude/skills/verify/SKILL.md`) — it runs what exists and reports `SKIPPED`
for what does not yet exist. Never report a check as passed when it did not run.

## Quality gates (Definition of Done)

1. New or changed behaviour has tests.
2. Full relevant suite is green locally.
3. `npm run build` (frontend) and `./mvnw verify` (backend) succeed once those exist.
4. No new warnings from the linters/formatters.
