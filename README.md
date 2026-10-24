# Aether Archive

> A local-first, mobile-first sanctuary for aesthetic photos and monthly six-picture dumps.
> The archive is the object; the interface is the frame.

[![CI](https://github.com/ACADEMIC-AND-PERSONAL-PROJECTS/Aether-Archive/actions/workflows/ci.yml/badge.svg)](https://github.com/ACADEMIC-AND-PERSONAL-PROJECTS/Aether-Archive/actions/workflows/ci.yml)

**Final project — DataTalksClub AI Dev Tools Zoomcamp (2026).**
Public demo: **https://168.138.70.166.nip.io** — 36 attributed photos and 3 dumps, seeded for
evaluation; the 1 GB host runs the core metrics/alerting profile. See
[Deployment §4](docs/engineering/DEPLOYMENT.md).
Criteria evidence: [`docs/course/FINAL-PROJECT.md`](docs/course/FINAL-PROJECT.md).

![The River, desktop](reports/evidence/app-river-1440.png)

## The problem

Personal photos accumulate faster than anyone curates them. Camera rolls are a stream; cloud galleries
are built for storage, sharing and engagement; neither gives a private, quiet ritual for looking at the
pictures you actually love. The result is an archive you never revisit — and the monthly "dump" of six
favourites that never gets made.

Aether Archive is a small answer: a **local-first** sanctuary with one image on screen, a deliberate
monthly dump, and no feed, no likes, no third-party requests. It is designed to be opened from a phone
on the same network, not to harvest attention.

## What it does

| View | Behaviour |
| --- | --- |
| **Splash** | One random photo, full-bleed, no visible chrome. Tap anywhere for the menu; pull down for another image. |
| **Menu** | A paper-and-ink index sheet on mobile, a right-hand editorial column on desktop. The River, Curate, Close; Escape and the veil close it; focus is trapped and returned. |
| **The River** | The chronological archive: every photo and every six-picture dump, grouped by month. Each dump is a full-bleed essay with its own aura; the page remembers your scroll position. |
| **Workshop** | Add up to six photos, drag them into order, choose the aura, add a title, publish. Uploads are downscaled client-side, one at a time, with per-file refusals. |

The ritual is deliberately small: **open → look → curate → publish → return to the River.** No account,
no social graph, no recommendation engine.

![Splash](reports/evidence/app-splash-1440.png)
![The Workshop](reports/evidence/app-workshop-1440.png)

## Quickstart — one command

```bash
git clone https://github.com/ACADEMIC-AND-PERSONAL-PROJECTS/Aether-Archive.git
cd Aether-Archive
cp .env.example .env          # optional; the defaults work locally
docker compose up -d --build  # db + api + web
# open http://localhost:3000
```

Seed the photographic demo through the running API (on an empty archive this is 36 attributed photos
and three six-picture dumps; re-running appends a new batch):

```bash
make demo
```

Stop it without losing data: `docker compose down`. The named volumes `aether_stack_pgdata` and
`aether_stack_media` keep the archive. `make clean` is the explicit, destructive reset.

### The full local stack, with observability

```bash
make observe-up    # app :3000, Grafana :3001, Prometheus :9090, Alertmanager :9093, Jaeger :16686
make oncall        # host-side responder in a second terminal
make demo
```

`make observe-up` enables tracing (the default stack is telemetry-free) and starts Prometheus,
Grafana, Alertmanager, the OpenTelemetry Collector, Jaeger, Loki and Promtail. The recorded incident
drill is [`reports/observability-incident-drill-20261022.md`](reports/observability-incident-drill-20261022.md).

### Development without containers

```bash
docker compose -f docker-compose.dev.yml up -d     # PostgreSQL on 127.0.0.1:5432
(cd backend && ./mvnw spring-boot:run)             # API on :8080
(cd frontend && npm install && npm run dev)        # Vite on :5173, LAN-bound
```

Open `http://<LAN-IP>:5173` on a phone. The Vite proxy and nginx both keep the API on the **same
origin** as the app; that is why the client needs no API URL or CORS configuration.

## Architecture

```text
phone / browser
      │  HTTPS
      ▼
  Caddy (TLS, HSTS) ──▶ web (nginx: SPA + /api + /images)
      │                     │
      │                     ▼
      │                api (Spring Boot 21) ──▶ PostgreSQL 17
      │                     │                    /data (images, named volume)
      │                     ├── /actuator/prometheus ◀── Prometheus ──▶ Alertmanager
      │                     └── OTLP ──▶ Collector ──▶ Jaeger
      └── /grafana/* ──▶ Grafana (read-only dashboards)
```

- **Frontend** — React 19, Vite, TypeScript, Tailwind CSS 4, TanStack Query, `@dnd-kit`, Fontsource
  (self-hosted; zero runtime requests to a third party).
- **Backend** — Java 21, Spring Boot 3.5, Maven, Flyway, REST under `/api/v1`, images at `/images/**`.
- **Database** — PostgreSQL 17, schema owned by Flyway.
- **Delivery** — multi-stage Dockerfiles, one base Compose file plus local/observability/production
  overlays, GHCR images, a `v*` release workflow, health-gated deploy and rollback scripts.
- **Signals** — Actuator/Prometheus metrics, OpenTelemetry traces (the publish trace starts in the
  browser), JSON logs with `traceId`/`spanId`, Prometheus alerts and a host-side on-call responder.
  No PII, no request bodies, no image content.

## Production readiness

| Concern | Where |
| --- | --- |
| Containers / one command | `docker-compose.yml`, `backend/Dockerfile`, `frontend/Dockerfile` |
| Public deployment, TLS, Grafana route | `docker-compose.prod.yml`, `docker/Caddyfile`, `docs/engineering/DEPLOYMENT.md` |
| CD, rollback, backup, smoke | `.github/workflows/release.yml`, `scripts/deploy/` |
| Observability | `docker-compose.observability.yml`, `observability/`, `docs/engineering/OBSERVABILITY.md` |
| Alerting + on-call | `observability/alerts.yml`, `observability/alertmanager.yml`, `oncall/` |
| Agent team + context | `AGENTS.md`, `CLAUDE.md`, `docs/agents/TEAM.md`, `.claude/` |

The local-first default remains telemetry-free. The public demo is a deployment profile with seeded
data and operational signals only (ADR-029 in `docs/scrum/DECISION-LOG.md`).

## Testing

```bash
make verify
```

This runs the same gates as CI: `./mvnw verify` for the backend (unit + integration with Testcontainers
PostgreSQL) and `lint`, `test`, `typecheck`, `build` for the frontend, plus the on-call unit tests and
the shell syntax checks. The latest recorded full run is **307 backend tests** and **518 frontend
tests**; the reports live in `reports/`. Browser-dependent checks (safe areas, a real camera roll,
physical iOS/Android) are documented in `reports/device-verification-sprint05.md` and are not claimed
as automated coverage.

The production smoke test is `SMOKE_PUBLIC_PROFILE=1 ./scripts/deploy/smoke.sh https://DOMAIN`; it checks TLS/HSTS, the
security headers, the SPA and its hashed entry, the API reads, the problem-detail 404, Grafana under
`/grafana/`, the eleven containers and the local observability endpoints. A deployment that cannot
pass it is rolled back.

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
frontend/         React/Vite app, editorial design system, tests
docker/           Caddyfile
observability/    Prometheus rules/config, Alertmanager, Grafana provisioning, Collector, Loki
oncall/           host-side responder, tests, systemd unit, runbook
scripts/          demo fetch/seed, dev smoke, deploy/rollback/backup/smoke
_docs/            canonical product spec + OpenAPI contract (read-only)
docs/             scrum/ · engineering/ · agents/ · course/
reports/          verification, security, observability and redesign evidence
```

## Documentation

- [Final-project criteria map](docs/course/FINAL-PROJECT.md)
- [Architecture](docs/engineering/ARCHITECTURE.md) · [Design system](docs/engineering/DESIGN-SYSTEM.md)
- [Deployment](docs/engineering/DEPLOYMENT.md) · [Observability and runbook](docs/engineering/OBSERVABILITY.md)
- [On-call responder](oncall/README.md) · [Incident drill](reports/observability-incident-drill-20261022.md)
- [Decision log](docs/scrum/DECISION-LOG.md) · [Product backlog](docs/scrum/PRODUCT-BACKLOG.md)
- [Agent team](docs/agents/TEAM.md)

## Status

The four views (splash, menu, River, Workshop) are complete, tested, and redesigned as an editorial
print object: ink and paper surfaces, full-bleed photography, serif display type, hairline rules and
restrained motion. The course slice adds containers, the public deployment profile, CI/CD with GHCR,
the self-hosted observability stack, the publish alert, the on-call responder and the deploy/rollback
path. The public instance is live at **https://168.138.70.166.nip.io**. The release workflow publishes the
GHCR images, and the same smoke test used locally passes against the public origin. The 1 GB VPS runs
the core profile (PostgreSQL, API, web, Caddy, Prometheus, Grafana, Alertmanager, Loki); the trace
shippers (Jaeger, Promtail, OTel Collector) remain the local/`make observe-up` profile. Known frontend
findings remain tracked as issues #176, #177 and #179.

## License

Personal project. No license granted.
