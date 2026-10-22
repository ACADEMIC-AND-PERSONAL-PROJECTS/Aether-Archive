# Aether Archive

> A local-first, mobile-first digital sanctuary for aesthetic photos and monthly six-picture dumps.
> Images are the product — the interface stays almost invisible.

[![CI](https://github.com/ACADEMIC-AND-PERSONAL-PROJECTS/Aether-Archive/actions/workflows/ci.yml/badge.svg)](https://github.com/ACADEMIC-AND-PERSONAL-PROJECTS/Aether-Archive/actions/workflows/ci.yml)

**Final project — DataTalksClub AI Dev Tools Zoomcamp (2026).**
Public demo: _added by the deployment step; see issue #180 for the current status._
Criteria evidence: [`docs/course/FINAL-PROJECT.md`](docs/course/FINAL-PROJECT.md).

## The problem

Personal photos accumulate faster than anyone curates them. Camera rolls are a stream; cloud galleries
are built for storage, sharing and engagement; neither gives a private, quiet ritual for looking at the
pictures you actually love. The result is an archive you never revisit — and a monthly "dump" of six
favourites that never gets made.

Aether Archive is a small answer to that: a **local-first** sanctuary with one image on screen, a
deliberate monthly dump, and no feed, no likes, no third-party requests. It is designed to be opened
from a phone on the same network, not to harvest attention.

## What it does

| View | Behaviour |
| --- | --- |
| **The Immersive Splash** | One random photo, full-bleed, no visible chrome. Tap anywhere to open the menu; pull down to re-roll. |
| **The Glass Menu** | A dark glass sheet with three entries: The River, Curate, Close. Escape and the veil close it; focus is trapped and returned. |
| **The Time River** | The chronological archive: every photo and every six-picture dump, grouped by month. The page wears the aura of the dump in view and remembers your scroll position. |
| **The Curator's Workshop** | Add up to six photos, drag them into order, choose the aura, add an optional title, publish the dump. Uploads are downscaled client-side, one request at a time, with per-file refusal messages. |

The expected behaviour is deliberately small: **open → look → curate → publish → return to the River.**
There is no account, no social graph, no recommendation engine.

## Quickstart — one command

```bash
git clone https://github.com/ACADEMIC-AND-PERSONAL-PROJECTS/Aether-Archive.git
cd Aether-Archive
cp .env.example .env          # optional; the defaults work
docker compose up -d --build  # db + api + web
# open http://localhost:3000
```

Seed a realistic demo archive (300 photos and one dump) through the running API:

```bash
make seed
```

Stop it without losing data: `docker compose down`. The named volumes
`aether_stack_pgdata` and `aether_stack_media` keep the archive. `make clean` is the explicit,
destructive reset.

### Development without containers

```bash
docker compose -f docker-compose.dev.yml up -d     # PostgreSQL on 127.0.0.1:5432
(cd backend && ./mvnw spring-boot:run)             # API on :8080
(cd frontend && npm install && npm run dev)        # Vite on :5173, LAN-bound
```

Open `http://<LAN-IP>:5173` on a phone. The Vite proxy and the container's nginx both keep the API on
the **same origin** as the app; that is why no API URL or CORS configuration is needed in the client.

## Architecture

```text
phone / browser
      │  HTTPS
      ▼
  Caddy (TLS)  ──▶  web (nginx: SPA + /api + /images proxy)
                         │
                         ▼
                    api (Spring Boot 21)
                    │            │
                    ▼            ▼
             PostgreSQL 17   /data (images, named volume)
```

- **Frontend** — React 19, Vite, TypeScript, Tailwind CSS 4, TanStack Query, `@dnd-kit`, Fontsource
  (self-hosted; zero runtime requests to a third party).
- **Backend** — Java 21, Spring Boot 3.5, Maven, Flyway, REST under `/api/v1`, images at `/images/**`.
- **Database** — PostgreSQL 17, schema owned by Flyway.
- **Delivery** — multi-stage Dockerfiles, one `docker-compose.yml`, a production overlay with Caddy,
  GitHub Actions CI, and GHCR images promoted by CD.
- **Signals** — Actuator/Prometheus metrics, OpenTelemetry traces, JSON logs with `traceId`/`spanId`;
  no PII and no image content in telemetry.

## Production readiness

This repository is also the final project for the Zoomcamp, so the product slice is wrapped in the
course's production criteria:

| Concern | Where |
| --- | --- |
| Containers / one command | `docker-compose.yml`, `backend/Dockerfile`, `frontend/Dockerfile` |
| Public deployment | `docker-compose.prod.yml`, `docker/Caddyfile`, `docs/engineering/DEPLOYMENT.md` |
| CI/CD + rollback | `.github/workflows/`, `scripts/deploy/` |
| Observability | `backend/src/main/resources/application-prod.yml`, `logback-spring.xml`, `docker/observability/` |
| Alerting + on-call | `docs/course/FINAL-PROJECT.md`, `oncall/` |
| Agent team + context | `AGENTS.md`, `CLAUDE.md`, `docs/agents/TEAM.md`, `.claude/` |

The local-first default remains telemetry-free. The public demo is a deployment profile with seeded
data; it exports operational signals only. The decision is recorded in `docs/scrum/DECISION-LOG.md`
(ADR-029).

## Testing

```bash
make verify
```

This runs the same gates as CI: `./mvnw verify` for the backend (unit + integration with Testcontainers
PostgreSQL) and `lint`, `test`, `typecheck`, `build` for the frontend. The last full run recorded
**307 backend tests** and **515 frontend tests**; the reports live in `reports/`. The browser-dependent
checks (safe areas, real camera roll, physical iOS/Android) are documented in
`reports/device-verification-sprint05.md` and are not claimed as automated coverage.

## How the work is done

The project is built by an **agent team** with explicit handoffs, context maps and evidence:

- `AGENTS.md` — entry point for any coding agent.
- `CLAUDE.md` — invariants, commands, branch and merge rules.
- `docs/agents/TEAM.md` — roles, handoff protocol, context management, what is never delegated.
- `.claude/agents/`, `.claude/rules/`, `.claude/skills/`, `.claude/hooks/` — the implementation.
- `docs/scrum/` — public backlog, sprint plans, definition of done, ADRs.
- GitHub issues and milestones — the public task tracker (epic #180 is this course slice).

Hard rules: one story per branch, no direct pushes to `main`/`develop`, no history rewriting, merge
commits only, and every claim verified by a command or a report.

## Repository layout

```text
backend/          Spring Boot API, Flyway migrations, tests
frontend/         React/Vite app, design system, tests
docker/           Caddyfile and observability configuration
scripts/          dev seed/smoke, deploy and rollback helpers
_docs/            canonical product spec + OpenAPI contract (read-only)
docs/             scrum/ · engineering/ · agents/ · course/
reports/          verification, security and device evidence
```

## Documentation

- [Final-project criteria map](docs/course/FINAL-PROJECT.md)
- [Architecture](docs/engineering/ARCHITECTURE.md) · [Design system](docs/engineering/DESIGN-SYSTEM.md)
- [Deployment](docs/engineering/DEPLOYMENT.md) · [Decision log](docs/scrum/DECISION-LOG.md)
- [Product backlog](docs/scrum/PRODUCT-BACKLOG.md) · [Sprint playbook](docs/scrum/SPRINT-PLAYBOOK.md)
- [Agent team](docs/agents/TEAM.md)

## Status

The product slice (splash, menu, River, Workshop) is complete and tested; Sprint 5 of the project plan
is closed except for a physical-device pass that requires real iOS/Android hardware. The Zoomcamp slice
adds containers, deployment, CD, observability, alerting, the on-call responder and an editorial
redesign of the four existing views. Known frontend findings are tracked as issues #176, #177 and #179.

## License

Personal project. No license granted.
