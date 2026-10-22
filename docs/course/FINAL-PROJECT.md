# Final Project — Aether Archive

**Course:** DataTalksClub — AI Dev Tools Zoomcamp (2026)
**Deadline:** 2026-10-26
**Repository:** https://github.com/ACADEMIC-AND-PERSONAL-PROJECTS/Aether-Archive
**Public tracker:** epic [#180](https://github.com/ACADEMIC-AND-PERSONAL-PROJECTS/Aether-Archive/issues/180),
milestone `Zoomcamp Final Project` (#7)

This document is the reviewer's map: every rubric criterion points at a file, a URL or a command.
Statuses are updated as the work lands; a claim without evidence is marked `WIP`, never `DONE`.

---

## 1. The idea and the problem

**Aether Archive** is a local-first, mobile-first sanctuary for aesthetic photos and monthly
six-picture dumps. The problem is not storage — phones and clouds store everything. The problem is
**attention and ritual**: camera rolls are an endless stream, cloud galleries optimise for sharing and
engagement, and the pictures people actually love are never revisited.

The product's expected behaviour is deliberately small:

1. Open the app on a phone on the same network.
2. See **one** random photo, full-bleed, with no visible UI.
3. Tap to open a glass menu: **The River** (the chronological archive), **Curate** (the workshop),
   **Close**.
4. In the River, scroll through monthly chapters; each six-picture dump carries its own "aura" colour,
   and the page background wears it while the dump is in view.
5. In the Workshop, add up to six photos, drag them into order, choose the aura, add an optional title,
   and publish. The dump joins the River.

The local-first stance is the product: the default deployment talks to no third party, stores images on
the machine and makes no analytics request. The Zoomcamp requires a public deployment and telemetry, so
the repository ships a **separate demo/production profile** (ADR-029) with seeded data and operational
signals only. The local-first default is unchanged.

The full product specification is `_docs/aether_archive_specs.md`; the API contract is
`_docs/openapi.yml`.

---

## 2. Application and architecture

```text
phone / browser
      │ HTTPS
      ▼
  Caddy (TLS, HSTS)  ──▶  web (nginx)
                              ├── serves the built SPA (React 19 + Vite + TS)
                              └── proxies /api/** and /images/** ──▶ api (Spring Boot 3.5, Java 21)
                                                                        ├── PostgreSQL 17 (Flyway)
                                                                        └── /data (images volume)
```

- **Frontend:** React 19, Vite, TypeScript, Tailwind CSS 4, TanStack Query, `@dnd-kit`, Fontsource
  (self-hosted). Four routes: `/`, `/river`, `/curate`, `/check`.
- **Backend:** Spring Boot 3.5, Java 21, Maven, Flyway, REST under `/api/v1`, images under `/images/**`.
- **Database:** PostgreSQL 17, schema owned by Flyway; Testcontainers in the tests.
- **One origin:** nginx proxies the API and the images, so the client has no API base URL and the
  browser never needs CORS. The Vite dev server mirrors that proxy.
- **Delivery:** multi-stage Dockerfiles, `docker-compose.yml` for the whole stack, a production
  overlay with Caddy, GHCR images, and GitHub Actions for CI/CD.
- **Signals:** Actuator/Prometheus, OpenTelemetry traces, JSON logs with `traceId`/`spanId`; no PII and
  no image bytes in telemetry.

---

## 3. Run it locally (one command)

```bash
cp .env.example .env
docker compose up -d --build
# open http://localhost:3000
make seed        # optional: 300 demo photos + one dump through the API
make verify      # the same gates as CI
```

The local stack uses the named volumes `aether_stack_pgdata` and `aether_stack_media`;
`docker compose down` keeps them, `make clean` deletes them after an explicit confirmation.

Dev mode without containers: `docker compose -f docker-compose.dev.yml up -d`, then
`(cd backend && ./mvnw spring-boot:run)` and `(cd frontend && npm run dev)`; open
`http://<LAN-IP>:5173` on a phone.

---

## 4. Public deployment

**Status: BLOCKED — the VPS firewall is closed to the development machine.**

The target is the existing DigitalOcean host `165.232.81.136` (SSH alias in the local config, key
`digital_ocean`). It answers ICMP but TCP 22/80/443 time out, so the droplet firewall (or UFW) must
allow the current public IP before the deployment can proceed. Once open:

```bash
# on the VPS, once
git clone https://github.com/ACADEMIC-AND-PERSONAL-PROJECTS/Aether-Archive.git /opt/aether/dev
cd /opt/aether/dev && cp .env.example .env   # set POSTGRES_PASSWORD, DOMAIN, AETHER_PUBLIC_ORIGIN

# from the repository root, with DOMAIN set
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Caddy obtains TLS for `DOMAIN` (a real domain or a `<ip>.nip.io` name). The production overlay publishes
only 80/443; PostgreSQL and the API stay on the internal network. The deploy runbook and rollback are
in `docs/engineering/DEPLOYMENT.md`.

**Live URL:** _to be inserted after the firewall is opened and the first deploy completes._

---

## 5. Rubric evidence map

| # | Criterion | Status | Evidence |
| --- | --- | --- | --- |
| 1 | **Problem Description** | DONE | `README.md` §The problem / §What it does; this document §1; public demo URL above |
| 2 | **Product Specification** | DONE | `_docs/aether_archive_specs.md`, `_docs/openapi.yml`, `docs/scrum/PRODUCT-BACKLOG.md`, public issues/milestones (#180, #7) |
| 3 | **Agent Team Specification** | DONE | `docs/agents/TEAM.md` (roles, handoffs, invariants), `.claude/agents/*`, `.claude/skills/*`, `CLAUDE.md` |
| 4 | **Context Management** | DONE | `AGENTS.md` (entry point), `CLAUDE.md` (<200 lines), `.claude/rules/*` path-scoped, `docs/` modular, `reports/` evidence |
| 5 | **Application** | WIP | End-to-end app (splash, River, Workshop, upload/publish) and one-command stack; `docker compose up -d --build`. Verified by the test suites and the E6-S4 browser pass. |
| 6 | **Testing** | DONE | `make verify`; backend `./mvnw verify` (307 tests, Testcontainers PostgreSQL), frontend `npm run test` (515 tests), lint/typecheck/build in CI. Evidence: `reports/`. |
| 7 | **Containerization** | WIP | `backend/Dockerfile`, `frontend/Dockerfile`, `docker-compose.yml`, healthchecks, persistent volumes, non-root API. Build verified locally (see build log). |
| 8 | **Deployment** | BLOCKED | `docker-compose.prod.yml`, `docker/Caddyfile`, `docs/engineering/DEPLOYMENT.md`; blocked on the VPS firewall (see §4). |
| 9 | **CI/CD** | WIP | `.github/workflows/ci.yml` (tests on every PR); deploy-dev/deploy-prod workflows and rollback next. |
| 10 | **Observability** | WIP | Actuator + Prometheus registry + OTel bridge/exporter (`backend/pom.xml`), JSON logs with trace/span ids (`logback-spring.xml`), prod config (`application-prod.yml`); Grafana dashboard and frontend trace propagation next. |
| 11 | **Alerting** | WIP | One alert on the publish journey (5xx rate / latency) in Grafana, routed to the on-call responder; to be created with the Grafana stack. |
| 12 | **On-Call Agent** | WIP | `oncall/` responder: receives the Grafana webhook, reads the deploy/health signals, rolls back to the last good image and records the incident; to be implemented and demoed with an injected failure. |

**Score target:** 20+/24. The pass threshold is 10/24. The honest current score is in epic #180; the
statuses above are the source of truth.

---

## 6. Testing

| Layer | Command | Scope |
| --- | --- | --- |
| Backend unit + integration | `cd backend && ./mvnw verify` | 307 tests; Testcontainers PostgreSQL; API, services, storage, validation |
| Frontend unit + component | `cd frontend && npm run test -- --run` | 515 tests; views, hooks, colour extraction, upload queue, a11y contracts |
| Static gates | `npm run lint`, `npm run typecheck`, `npm run build` | ESLint (0 warnings), `tsc -b`, production bundle |
| End-to-end API | `scripts/dev/smoke.sh --base-url ...` | every endpoint, success and refusal, byte-identical image round-trip |
| Browser/device | `reports/device-verification-sprint05.md` | Chromium passes; physical iOS/Android explicitly **not** claimed |

CI runs the backend and frontend jobs on every PR to `develop`/`main`; the required status contexts are
pinned by branch protection. The full suite is also `make verify`.

---

## 7. Observability, alerting, on-call

### Signals

- **Metrics** — Spring Boot Actuator + Micrometer Prometheus registry: HTTP server requests, JVM,
  HikariCP, publish/upload counters. Scraped by Prometheus (or Grafana Cloud) and shown in Grafana.
- **Traces** — Micrometer Tracing bridge to OpenTelemetry, OTLP export to the collector. The frontend
  creates a W3C `traceparent` for the publish request; the backend continues the trace, so a slow or
  failed publish is one trace from click to SQL.
- **Logs** — JSON on stdout in the `prod` profile, with `traceId`/`spanId` from MDC. No file names,
  image bytes, passwords or tokens are logged.

### Alert

One alert with a **user-impact** condition, not a CPU graph:

> `publish` journey: 5xx rate > 5 % for 2 minutes, or p95 latency > 2 s for 5 minutes.

It routes to the on-call webhook and to a GitHub issue. A synthetic failure flag lets the demo inject a
real incident without touching user data.

### On-call responder

`oncall/` is a small service in the production stack:

1. receives the Grafana webhook (shared secret, idempotent incident id);
2. reads the current image tag, the last good tag, `/actuator/health`, and the recent error logs;
3. chooses a remediation: roll back to the last good tag, or disable the failing flag;
4. waits for health, re-checks the alert condition, and posts the incident summary to GitHub;
5. if no safe automatic action exists, escalates and leaves the incident open.

The demo injects a failure, watches the alert fire, and shows the responder rolling back and closing the
incident. The responder is deterministic by default; an LLM adapter can be enabled with an API key, but
the safe path never depends on one.

---

## 8. Agent team and context management

- **Entry point:** `AGENTS.md`.
- **Team and handoffs:** `docs/agents/TEAM.md`.
- **Implementation:** `.claude/agents/` (backend, frontend, reviewer, verifier, security, scrum),
  `.claude/rules/` (path-scoped), `.claude/skills/` (lazy procedures), `.claude/hooks/` (guardrails).
- **Context map:** `CLAUDE.md` under 200 lines, pointing at `docs/engineering/`, `docs/scrum/`,
  `_docs/` and `reports/`. Durable decisions are ADRs in `docs/scrum/DECISION-LOG.md`.
- **Evidence of use:** public issue #180 and its commits; PR history; `reports/`; the sprint docs.
- **What is never delegated:** product scope, destructive operations, secrets, the final merge and the
  release tag.

---

## 9. Demo script (3–5 minutes)

1. **Splash** — one photo, no chrome; tap; the glass menu.
2. **River** — scroll through a month; the aura changes; leave and return; the scroll position is
   remembered.
3. **Workshop** — add six photos, reorder one, pick an aura, title, publish; return to the River.
4. **Production** — open the public URL; show the same flow on the deployed instance.
5. **Observability** — Grafana dashboard: the publish trace, the request metrics, the JSON log line with
   the same `traceId`.
6. **Incident** — enable the failure flag; the alert fires; the on-call responder rolls back; the publish
   works again; the incident issue is closed.

---

## 10. Scope, limitations, honesty

- **No new product features in this slice.** The Zoomcamp work is production readiness plus an
  editorial redesign of the four existing views. Albums, search, auth and multi-user are out of scope.
- **Physical-device checks** (iOS Safari, Android Chrome, safe areas, camera roll, touch drag) were
  prepared but not completed on hardware; the report says so rather than claiming a pass.
- **The public demo is seeded**, not the owner's real archive. The local-first default remains the
  product.
- **The VPS deployment is blocked** until the host firewall allows the development machine; the
  deployment section is deliberately marked BLOCKED, not DONE.
- **Known frontend issues** #176 (River scroller), #177 (first-publish cache) and #179 (menu history)
  are tracked. The redesign must not regress them.

---

## 11. Peer reviews

The course requires reviewing three other final projects. That is a platform activity, not a code task;
it is tracked here so it is not forgotten before submission:

- [ ] Review 1 — project name / URL / findings
- [ ] Review 2 — project name / URL / findings
- [ ] Review 3 — project name / URL / findings
