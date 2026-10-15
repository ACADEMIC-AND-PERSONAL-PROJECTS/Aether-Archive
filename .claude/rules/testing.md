# Testing rules (always loaded)

## Principle

Every acceptance criterion of a story is either covered by an automated test or explicitly listed as
manually verified in the PR (with the command or the device used). Untested behaviour is unfinished work.

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
