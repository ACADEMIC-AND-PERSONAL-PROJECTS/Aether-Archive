---
name: verify
description: Project verification recipe — build and run whatever exists (backend tests, frontend lint/test/build, endpoint smoke checks) and report honest evidence with SKIPPED for what does not exist yet. Use before every commit, before opening a PR, and before merging.
allowed-tools: Read, Write, Edit, Grep, Glob, Bash
---

# Verify the change

Goal: prove the current working tree is in a shippable state, with evidence. Never invent a result.

Run every step that applies to the change; report `SKIPPED (not scaffolded yet)` when a step cannot run
(empty `backend/`, no `package.json`, …). A failing step stops the run: fix it, then re-run from the top.

## 0. Context

```bash
git status --short
git diff --stat            # what exactly are we verifying?
```

## 1. Backend — only if `backend/pom.xml` exists

```bash
cd backend
./mvnw -q -B verify                       # full build + tests
# quick subset while iterating:  ./mvnw -q -B test
```

## 2. Frontend — only if `frontend/package.json` exists

```bash
cd frontend
npm run lint --if-present
npm run test --if-present -- --run
npm run build
```

## 3. Runtime smoke — when the change touches the API or a view

Start the backend on a spare port with a throwaway data directory (never the real one):

```bash
AETHER_DATA_DIR="$(mktemp -d)" SERVER_PORT=18080 ./mvnw -q spring-boot:run &
until curl -sf http://localhost:18080/api/v1/photos >/dev/null 2>&1; do sleep 1; done
curl -s http://localhost:18080/api/v1/photos | jq 'length'
curl -s http://localhost:18080/api/v1/photos/random | jq '.id // .status'
# upload smoke (once the endpoint exists):
# curl -s -F "file=@fixture.jpg" -F "category=pics" http://localhost:18080/api/v1/photos | jq
kill %1
```

- Check the response shape against `_docs/openapi.yml`.
- Exercise at least one failure path (invalid payload → 400 with `ProblemDetail`).

## 4. UI smoke — when the change touches the frontend

```bash
cd frontend && npm run build && npm run preview -- --port 14173 &
# browse http://localhost:14173 (mobile viewport), check:
#  - zero external network requests (fonts, images, analytics)
#  - no console errors
#  - loading / empty / error states render quietly
kill %1
```

Use a browser/Playwright screenshot when available and attach it to the report for UI stories.

## 5. Report

```
## Verify — <branch> @ <short sha>

| # | Step | Command | Result | Evidence (tail) |
|---|------|---------|--------|-----------------|
| 1 | Backend tests | ./mvnw -q -B verify | PASS | "Tests run: 24, Failures: 0" |
| 2 | Frontend build | npm run build | SKIPPED | no package.json yet |

**Verdict**: GREEN | RED — <one line>
**Not covered**: <what you could not test and why>
```

- Paste the report in the PR description for `/open-pr`, and keep the raw tails in the session.
- A `SKIPPED` step is not a failure — lying about it is.
