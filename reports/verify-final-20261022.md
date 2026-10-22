# Verification — final project slice (2026-10-22)

**Branch:** `feature/zoomcamp-final`
**Environment:** Linux, Docker Compose v2, Node 22/24, Java 21, local production-shaped stack.
**Scope:** the observability/alerting/on-call slice, the release/deploy scripts, the editorial redesign and
the browser-started publish trace. The public VPS deployment is **not** verified here; see §5.

## 1. The gate: `make verify`

```bash
make verify
```

Exit code **0**. The command runs the same gates as CI, plus the on-call and shell checks:

| Gate | Result |
| --- | --- |
| `backend && ./mvnw -B verify` | **307 tests**, 0 failures/errors/skips, `BUILD SUCCESS`, executable jar repackaged |
| `frontend && npm run lint` | passed (ESLint, 0 warnings) |
| `frontend && npm run format:check` | passed (Prettier) |
| `frontend && npm run test -- --run` | **518 tests passed (518)** |
| `frontend && npm run typecheck` | passed (`tsc -b`) |
| `frontend && npm run build` | passed; 195 modules; `index-Bs89wBys.js` 287.23 kB / 90.62 kB gzip, CSS 43.87 kB / 8.67 kB gzip |
| `python3 -m unittest discover -s oncall -p 'test_*.py'` | **14 tests**, OK |
| `bash -n scripts/dev/oncall-token.sh oncall/run.sh scripts/deploy/*.sh scripts/demo/*.sh` | passed |

The backend has no skipped tests. The frontend suite includes the three `createTraceparent` tests and the
`createDump` assertion that the publish request carries a sampled W3C header.

## 2. Configuration and edge validation

| Check | Result |
| --- | --- |
| `docker compose -f docker-compose.yml -f docker-compose.observability.yml -f docker-compose.prod.yml config --quiet` | passed (with `DOMAIN` set) |
| `caddy validate` on `docker/Caddyfile` (caddy 2.9-alpine) | `Valid configuration` |
| `.github/workflows/release.yml` + `ci.yml` parsed by PyYAML | passed |
| Caddy + Grafana sub-path rehearsal on host port 9443 | `GET /grafana/api/health` → `{"database":"ok","version":"11.5.1"}`; `GET /grafana` → 308 to `/grafana/`; `/` → 502 in the two-service rehearsal (no `web` service), as expected |
| API histogram | `http_server_requests_seconds_bucket` present (1173 series) — the p95 panels and the latency alert have data |
| Local stack | `db`, `api`, `web`, `prometheus`, `grafana`, `alertmanager`, `jaeger`, `loki`, `promtail`, `otel-collector` running; `api`, `db`, `web` healthy |

The Caddy/Grafana test proves the route, the `serve_from_sub_path` configuration and the health endpoint,
not the full public origin: the local host already binds port 80 and the VPS is blocked. The complete
production smoke runs in the release workflow on the VPS.

## 3. Application evidence

- Editorial redesign screenshots: `reports/evidence/app-splash-1440.png`,
  `app-river-1440.png`, `app-workshop-1440.png` (1440 px; captured on the 36-photo/3-dump seed).
- Dashboard: `grafana-dashboard.png`; drill dashboard: `grafana-drill.png`.
- Traces: `jaeger-publish-search.png`, `jaeger-trace.png`.
- Alerting: `prometheus-alerts.png`, `alertmanager.png`.
- The incident drill and its timeline: `reports/observability-incident-drill-20261022.md`.

A note on seed counts: `make demo` **appends**; the recorded screenshots and the public first deploy use
a fresh 36-photo/3-dump archive. The long-lived local stack at the end of the session had extra batches
from repeated demo runs and the dev smoke (48 photos / 5 dumps). This is a local test artefact, not a
product claim; the public deploy seeds only when `/api/v1/photos` is empty.

## 4. What was exercised end-to-end

1. Base stack: `docker compose up -d --build`, seed, browser screenshots, dev smoke (29 checks) in the
   earlier run of this slice.
2. Observability: Prometheus scraping the API and itself; all three rules loaded; Grafana dashboard;
   Loki logs with `traceId`; Jaeger publish traces.
3. Alerting and on-call: the real drill stopped PostgreSQL, `AetherPublish5xxRate` fired, Alertmanager
   called the responder, it ran `restart_db`, the database became healthy, and the incident closed as
   `resolved` (see the drill report). No synthetic alert was posted.
4. Deployment code: the release workflow, the deploy/rollback/backup/smoke scripts, the production
   Compose file and the Caddyfile; all static checks and the Caddy/Grafana rehearsal pass.
5. Frontend trace: `createTraceparent` emits `00-<32 hex>-<16 hex>-01`; `createDump` sends it; the
   backend's JSON logs and Jaeger show the same trace id.

## 5. Not verified (honest status)

- **Public VPS deployment:** blocked at the provider firewall — TCP 22/80/443 time out from the
  development network. The repository cannot open a provider firewall. The deployment criterion is
  `BLOCKED` in `docs/course/FINAL-PROJECT.md`.
- **First release run:** the `v*` workflow has not run on GitHub (no tag pushed; the VPS secrets are not
  configured yet), so GHCR visibility and the first certificate issuance are untested in production.
- **Production on-call systemd unit:** the unit file and the install steps are in `oncall/README.md`;
  the responder itself ran in the drill as a host process, not as the systemd unit.
- **Physical devices:** not claimed (see `reports/device-verification-sprint05.md`).
- **Backup restore:** the dump/media scripts are written and syntax-checked; a restore has not been
  drilled on the VPS.
- **Peer reviews and demo video:** platform activities, not code; tracked in
  `docs/course/FINAL-PROJECT.md` §11–§12.

## 6. Residual risks

- The first production deploy depends on DNS/TLS and GHCR package visibility; the runbook covers both.
- The Caddy route and the Grafana sub-path were validated in a focused rehearsal; the full origin
  smoke will be the first real check on the VPS.
- Jaeger is in-memory, Loki/Prometheus are single instances, and the responder is single-host: a demo
  profile, not an HA claim.
- The publish trace starts in the browser; the unit test and the API trace confirm the contract, but
  no automated browser-driven publish test exists.
- The warning route (`AetherPublishLatency` → `none`) was corrected after the first drill rehearsal; the
  final critical drill is the recorded evidence.

## 7. Reproduction

```bash
make verify
make observe-up
make oncall
scripts/demo/incident-drill.sh
./scripts/deploy/smoke.sh https://DOMAIN   # after the public deploy
```

The raw `make verify` log is kept outside git (`/tmp/opencode/make-verify-final.log` in this session);
this report is the committed summary. A report that contradicts the docs means the docs are wrong.
