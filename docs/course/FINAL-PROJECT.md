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
3. Tap to open the menu: **The River** (the chronological archive), **Curate** (the workshop),
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

  Caddy /grafana/* ──▶ Grafana (read-only dashboards)
  Prometheus ◀── api:8080/actuator/prometheus      Alertmanager ──▶ host-side on-call responder
  api ──OTLP──▶ Collector ──▶ Jaeger               logs ──▶ Promtail ──▶ Loki
```

- **Frontend:** React 19, Vite, TypeScript, Tailwind CSS 4, TanStack Query, `@dnd-kit`, Fontsource
  (self-hosted). Four routes: `/`, `/river`, `/curate`, `/check` (a deterministic design check page,
  not a product feature).
- **Backend:** Spring Boot 3.5, Java 21, Maven, Flyway, REST under `/api/v1`, images under `/images/**`.
- **Database:** PostgreSQL 17, schema owned by Flyway; Testcontainers in the tests.
- **One origin:** nginx proxies the API and the images, so the client has no API base URL and the
  browser never needs CORS. The Vite dev server mirrors that proxy.
- **Delivery:** multi-stage Dockerfiles, one base Compose file plus local/observability/production
  overlays, GHCR images, a `v*` release workflow, health-gated deploy/rollback scripts.
- **Signals:** Actuator/Prometheus, OpenTelemetry traces, JSON logs with `traceId`/`spanId`; no PII and
  no image bytes in telemetry. The local-first stack keeps tracing off.

The editorial redesign (2026-10-22) recast the four existing views as a print object: ink and paper
tokens, full-bleed photography, serif display type, small-caps kickers, hairline rules, grain and
restrained motion. The redesign deliberately keeps every tested accessibility and text contract. The
evidence is `reports/evidence/app-*.png` and the commit `feat(ui): recast the archive as an editorial
print object`.

---

## 3. Run it locally (one command)

```bash
cp .env.example .env
docker compose up -d --build        # db + api + web
# open http://localhost:3000
make demo                           # 36 attributed photos + 3 dumps through the API
make verify                         # the same gates as CI
```

The full local stack with observability:

```bash
make observe-up                     # app :3000, Grafana :3001, Prometheus :9090, Jaeger :16686
make oncall                         # host-side responder in a second terminal
```

The local stack uses the named volumes `aether_stack_pgdata` and `aether_stack_media`;
`docker compose down` keeps them, `make clean` deletes them after an explicit confirmation.

Dev mode without containers: `docker compose -f docker-compose.dev.yml up -d`, then
`(cd backend && ./mvnw spring-boot:run)` and `(cd frontend && npm run dev)`; open
`http://<LAN-IP>:5173` on a phone.

---

## 4. Public deployment

**Status: VPS reachable; 80/443 accept traffic; first release pending.**

The target is the existing Oracle Cloud VPS `168.138.70.166` (Ubuntu 24.04, 2 vCPU, 1 GB RAM plus a
2 GB swap added for the stack). SSH works as `ubuntu` with the local `~/.ssh/digital_ocean` key; Docker
29.8.1 and Compose are installed. TCP 22, 80 and 443 answer from the development network — 80 and 443
were proven with temporary listeners before the first deploy — and the host `iptables` accepts them and
persists the rules. `168.138.70.166.nip.io` already resolves to the host. The only remaining step is
the first `v*` release, the public smoke and the TLS certificate.

The code path is complete and does not depend on that network fix:

- `.github/workflows/release.yml` — a `v*` tag builds and pushes both images to GHCR, then (when the
  VPS secrets exist) SSHes to `/opt/aether` and runs the deploy script.
- `scripts/deploy/deploy.sh` — validates the environment, backs up PostgreSQL and media, pulls the
  immutable `sha-<commit>` tag, waits for health, runs the public smoke test, seeds the demo once,
  records the tag and history, and restores the previous tag on failure.
- `scripts/deploy/rollback.sh`, `scripts/deploy/backup.sh`, `scripts/deploy/smoke.sh`.
- `docker-compose.prod.yml` + `docker/Caddyfile` — Caddy on 80/443, automatic TLS, `/grafana/*` routed
  to the read-only dashboards.
- `docs/engineering/DEPLOYMENT.md` — the VPS preparation, secrets, first release, rollback, restore
  and security checklist.

Once the firewall/DNS step is done:

```bash
# on the VPS
git clone https://github.com/ACADEMIC-AND-PERSONAL-PROJECTS/Aether-Archive.git /opt/aether
cd /opt/aether
cp .env.example .env
# DOMAIN, POSTGRES_PASSWORD, GRAFANA_ADMIN_PASSWORD, ONCALL_WEBHOOK_TOKEN, AETHER_PUBLIC_ORIGIN
sudo cp oncall/aether-oncall.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now aether-oncall

# from the repository, once the VPS secrets are configured
git tag -a v1.0.0 -m "Aether Archive v1.0.0" && git push origin v1.0.0
```

**Live URL:** _to be inserted after the firewall is opened and the first release completes._

---

## 5. Rubric evidence map

| # | Criterion | Status | Evidence |
| --- | --- | --- | --- |
| 1 | **Problem Description** | DONE | `README.md` §The problem / §What it does; this document §1 |
| 2 | **Product Specification** | DONE | `_docs/aether_archive_specs.md`, `_docs/openapi.yml`, `docs/scrum/PRODUCT-BACKLOG.md`, public issues/milestones (#180, #7) |
| 3 | **Agent Team Specification** | DONE | `docs/agents/TEAM.md` (roles, handoffs, invariants), `.claude/agents/*`, `.claude/skills/*`, `CLAUDE.md` |
| 4 | **Context Management** | DONE | `AGENTS.md` (entry point), `CLAUDE.md` (<200 lines), `.claude/rules/*` path-scoped, `docs/` modular, `reports/` evidence |
| 5 | **Application** | DONE | The four views, upload/publish, one-command stack; editorial redesign screenshots in `reports/evidence/`; verified by the backend/frontend suites and the real-browser axe pass at 320/768/1280 (`frontend/e2e/a11y.spec.ts`). The physical-device pass is a separate, explicitly unclaimed check. |
| 6 | **Testing** | DONE | `make verify`; backend `./mvnw verify` (307 tests, Testcontainers PostgreSQL), frontend `npm run test` (518 tests), lint/typecheck/build in CI, on-call unit tests, deploy shell checks. Evidence: `reports/`, `/tmp/opencode/mvn-verify.log` (local). |
| 7 | **Containerization** | DONE | `backend/Dockerfile`, `frontend/Dockerfile`, `docker-compose.yml`, healthchecks, persistent volumes, non-root API, bounded logs; base stack healthy on `http://localhost:3000`. |
| 8 | **Deployment** | **IN PROGRESS** | `docker-compose.prod.yml`, `docker/Caddyfile`, `docs/engineering/DEPLOYMENT.md`; the release/deploy scripts are shipped; the VPS is reachable on 22/80/443 and `168.138.70.166.nip.io` resolves; the first public release is the remaining step (see §4). |
| 9 | **CI/CD** | **DONE (pipeline); first public run pending** | `.github/workflows/ci.yml` (tests on every PR), `.github/workflows/release.yml` (GHCR build/push + SSH deploy), `scripts/deploy/{deploy,rollback,smoke,backup}.sh`; the deploy job is gated on `VPS_*` secrets. |
| 10 | **Observability** | **DONE (local); public pending** | `docker-compose.observability.yml`, `observability/`, `backend/src/main/resources/application-prod.yml`, `logback-spring.xml`, `frontend/src/api/traceparent.ts`; dashboard and traces in `reports/evidence/`; runbook in `docs/engineering/OBSERVABILITY.md`. |
| 11 | **Alerting** | **DONE (local drill); public pending** | `observability/alerts.yml`, `observability/alertmanager.yml`; `AetherPublish5xxRate` fired for real; incident record and screenshots in `reports/observability-incident-drill-20261022.md`. |
| 12 | **On-Call Agent** | **DONE (local drill); production install pending** | `oncall/` responder + tests + systemd unit + runbook; the drill restarted PostgreSQL and closed the incident (`oncall/incidents/20261022T192818Z-cbafc00e.json`, committed copy in `reports/evidence/`). |

**Score target:** 20+/24. The pass threshold is 10/24. The only criterion currently blocked is #8;
#9–#12 have complete code and local evidence, and #8–#12 gain their strongest form when the public
instance answers. The statuses above are the source of truth, not the target.

---

## 6. Testing

| Layer | Command | Scope |
| --- | --- | --- |
| Backend unit + integration | `cd backend && ./mvnw verify` | 307 tests; Testcontainers PostgreSQL; API, services, storage, validation |
| Frontend unit + component | `cd frontend && npm run test -- --run` | 518 tests; views, hooks, colour extraction, upload queue, a11y contracts, browser traceparent |
| Static gates | `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm run build` | ESLint (0 warnings), Prettier, `tsc -b`, production bundle |
| On-call decision logic | `python3 -m unittest discover -s oncall -p 'test_*.py'` | diagnosis, action selection, incident lifecycle |
| End-to-end API | `scripts/dev/smoke.sh --base-url ...` | every endpoint, success and refusal, byte-identical image round-trip (29 checks) |
| Deployment smoke | `scripts/deploy/smoke.sh https://DOMAIN` | TLS/HSTS, headers, SPA, API reads, problem-detail 404, Grafana, containers, local observability |
| Browser/device | `reports/device-verification-sprint05.md` | Chromium passes; physical iOS/Android explicitly **not** claimed |

CI runs the backend and frontend jobs on every PR to `develop`/`main`; the required status contexts are
pinned by branch protection. The full suite is also `make verify`.

---

## 7. Observability, alerting, on-call

### Signals

- **Metrics** — Spring Boot Actuator + Micrometer Prometheus registry: HTTP server requests (including
  histogram buckets for p95), JVM, HikariCP. Prometheus scrapes `api:8080/actuator/prometheus`; the
  endpoint is never proxied publicly.
- **Traces** — Micrometer Tracing bridge to OpenTelemetry, OTLP export to the collector, Jaeger UI.
  The frontend creates a W3C `traceparent` for the publish request (`frontend/src/api/traceparent.ts`);
  the backend continues the trace, so a slow or failed publish is one trace from click to SQL.
- **Logs** — JSON on stdout in the `prod` profile, with `traceId`/`spanId` from MDC; Promtail ships them
  to Loki. No file names, image bytes, passwords or tokens are logged.
- **Dashboard** — Grafana UID `aether-archive`, provisioned from
  `observability/grafana/dashboards/aether-archive.json`: publish 5xx ratio, publish p95, request
  outcomes, mutations, alert history, JVM, logs with trace id, and a Jaeger link.

The local-first stack exports nothing. `make observe-up` loads the observability overlay and enables
tracing; the local UIs bind to `127.0.0.1`. In production only Grafana is published, under `/grafana/`
with anonymous Viewer access; Prometheus, Alertmanager and Jaeger are reached through an SSH tunnel.

### Alerts

Three rules (`observability/alerts.yml`), all about the publish journey or the API itself:

| Alert | Severity | Condition | For |
| --- | --- | --- | --- |
| `AetherPublish5xxRate` | critical | 5xx share of `POST /api/v1/dumps` over 2 min > 5 % | 1 min |
| `AetherPublishLatency` | warning | publish p95 over 5 min > 2 s | 5 min |
| `AetherApiDown` | critical | `up{job="aether-api"} == 0` | 1 min |

Alertmanager groups by `alertname` and `journey`, sends `resolved`, routes critical alerts to the
host-side responder and warnings to the `none` receiver: a slow save is a dashboard signal, not a page.
The warning route was corrected during the drill after the first rehearsal showed the responder
receiving a latency alert; the final run is the critical one recorded in the report.

### On-call responder

`oncall/` is a small **host** process (systemd, `oncall/aether-oncall.service`), not a container. It
needs the Docker socket to restart services; giving that power to a public-facing container would be a
larger risk. It binds `127.0.0.1` and the Docker bridge gateway (never `0.0.0.0`) and requires a bearer
token from `ONCALL_WEBHOOK_TOKEN`.

1. receives the Alertmanager webhook (idempotent per fingerprint), returns `202`;
2. diagnoses Docker health for `api` and `db`, plus the last 60 API log lines;
3. chooses one action: `restart_db` if the database is unhealthy, `rollback_api` to
   `state/last-good-image` if the API is unhealthy, otherwise `restart_api`;
4. waits for health, records `oncall/incidents/<utc>-<fingerprint>.json`, optionally opens one GitHub
   issue, and closes the record when Alertmanager sends `resolved`;
5. never runs SQL, never deletes data, never reads photo bytes, and never calls an LLM.

The drill is real: `scripts/demo/incident-drill.sh` starts a publish load and stops PostgreSQL, with no
synthetic alert. The 2026-10-22 run produced `AetherPublish5xxRate`, a `restart_db` action, a healthy
database in 8 seconds, and a resolved incident:
`reports/observability-incident-drill-20261022.md`.

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

1. **Splash** — one photo, no chrome; tap; the menu.
2. **River** — scroll through a month; the aura changes; leave and return; the scroll position is
   remembered. The editorial composition is the redesign the jury asked to see.
3. **Workshop** — add six photos, reorder one, pick an aura, title, publish; return to the River.
4. **Public URL** — open the deployed instance and repeat the flow (after the firewall/DNS step).
5. **Observability** — Grafana: the publish trace, the request metrics, the JSON log line with the same
   `traceId`; Jaeger for the click-to-SQL trace.
6. **Incident** — run the drill: stop PostgreSQL for real; the 5xx alert fires; Alertmanager calls the
   responder; it restarts the database; the alert resolves; show the incident JSON. The synthetic
   failure flag is not used because the real path is more convincing.
7. **Rollback** — `scripts/deploy/rollback.sh` and the recorded history; the on-call automatic
   rollback of the API image is the narrower path.

---

## 10. Scope, limitations, honesty

- **No new product features in this slice.** The Zoomcamp work is production readiness plus an
  editorial redesign of the four existing views. Albums, search, auth and multi-user are out of scope.
- **Physical-device checks** (iOS Safari, Android Chrome, safe areas, camera roll, touch drag) were
  prepared but not completed on hardware; the report says so rather than claiming a pass.
- **The public demo is seeded**, not the owner's real archive. The local-first default remains the
  product.
- **The VPS deployment is in progress**: SSH, DNS and 80/443 are verified on `168.138.70.166`; the
  first `v*` release and public smoke are the remaining steps. The deployment criterion stays
  `IN PROGRESS`, not `DONE`, until that smoke passes. The release, deploy, smoke, rollback, backup and
  restore paths are complete and exercised locally.
- **The on-call path is deterministic by design**; it is not a general incident agent. It never runs
  SQL and never deletes data.
- **Known frontend issues** #176 (River scroller), #177 (first-publish cache) and #179 (menu history)
  are tracked. The redesign keeps their acceptance criteria in view and does not claim them fixed
  without a separate verification.
- **The observability stack is a single-VPS demo**, not an SLO claim: Jaeger is in-memory, Loki and
  Prometheus are single instances, and there is no HA.

---

## 11. Peer reviews

The course requires reviewing three other final projects. That is a platform activity, not a code task;
it is tracked here so it is not forgotten before submission:

- [ ] Review 1 — project name / URL / findings
- [ ] Review 2 — project name / URL / findings
- [ ] Review 3 — project name / URL / findings

---

## 12. Submission checklist

- [x] Repository public; epic #180 and the milestone exist.
- [x] README, criteria map, architecture, design system, deployment, observability and on-call runbooks.
- [x] CI green on the branch; the release workflow and deploy scripts are in the repository.
- [ ] VPS firewall open to the operator; DNS pointed at the host.
- [ ] `v1.0.0` tag pushed; first release publishes to GHCR and deploys.
- [ ] Public URL inserted in the README, this document and issue #180.
- [ ] Production drill re-run; the new incident JSON linked.
- [ ] 3–5 minute demo video recorded (the script in §9).
- [ ] Three peer reviews completed.
- [ ] Final submission before **2026-10-26**.
