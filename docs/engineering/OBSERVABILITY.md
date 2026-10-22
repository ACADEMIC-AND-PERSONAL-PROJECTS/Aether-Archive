# Observability, alerting and on-call — Aether Archive

> Status of the **production** deployment: the stack is implemented and verified locally; the public
> instance is waiting for the VPS firewall and domain (see `DEPLOYMENT.md`). Statuses in
> `docs/course/FINAL-PROJECT.md` say `BLOCKED`, never `DONE`, until the public URL exists.
>
> Decision record: ADR-029 in `docs/scrum/DECISION-LOG.md`. The local-first default remains
> telemetry-free; this stack is the demo/production profile.

## 1. What is collected, and why

The product makes one promise: **six photos become a dump**. The signals are chosen around that
journey, not around host graphs.

| Signal | Pipeline | Kept for | Contains |
| --- | --- | --- | --- |
| Metrics | Spring Boot Actuator → Prometheus (`api:8080/actuator/prometheus`) | 15 days | request counts, latency histogram, JVM, HikariCP |
| Traces | Micrometer → OTLP → OpenTelemetry Collector → Jaeger | in-memory, last traces | HTTP spans; the publish trace starts in the browser (`traceparent`) |
| Logs | JSON on stdout → Docker `json-file` → Promtail → Loki | 7 days (Loki config) | level, logger, `traceId`, `spanId`, message; no request bodies, no image bytes |
| Alerts | Prometheus rules → Alertmanager → host-side responder | notification log in the `aether_alertmanager_data` volume | rule name, severity, journey, description |

Every service runs with a bounded log rotation (`10m × 3`). The API exports a histogram for
`http.server.requests`, without which the p95 alert and panel would have no buckets
(`backend/src/main/resources/application-prod.yml`). The frontend sends a W3C `traceparent` on the
publish request (`frontend/src/api/traceparent.ts`), so the trace begins at the click.

**Not collected:** photo content, filenames, request bodies, query strings, passwords, tokens, user
identifiers. The public demo is seeded; it is not a real archive.

## 2. Topology

```text
                        ┌─────────────────────────────┐
  public :443 ── Caddy ──▶ web (nginx) ──▶ api ──▶ PostgreSQL 17
       │                  │                 │
       │                  └── /grafana/* ──▶ Grafana (anonymous Viewer)
       │                                    │
       │                    ┌───────────────┼──────────────────────────┐
       │                    ▼               ▼                          ▼
       │              Prometheus ◀── scrape api:8080          Loki ◀── Promtail ◀ Docker logs
       │                    │                                        ▲
       │                    ▼                                        │
       │              Alertmanager ── webhook ──▶ host responder (Docker bridge:9099)
       │                    │                                        │
       │                    └── resolved ──▶ incident closed         └── docker compose restart/rollback
       │
       └── OTLP ──▶ otel-collector ──▶ Jaeger (UI on 127.0.0.1:16686)
```

- **Only Grafana is public**, read-only, under `/grafana/`. Prometheus, Alertmanager and Jaeger bind
  to `127.0.0.1` and are reached through an SSH tunnel; they are operational tools.
- **The responder runs on the host**, not in a container. It needs to inspect and restart services;
  giving that power to a container means mounting a writable Docker socket into something reachable
  from the network. The process binds `127.0.0.1` (host health checks) and the Docker bridge gateway
  (Alertmanager's `host.docker.internal`), never `0.0.0.0`, and requires a bearer token.
- **One compose overlay** (`docker-compose.observability.yml`) adds all of it to the base stack. The
  production file adds Caddy and the Grafana sub-path.

## 3. Run it locally

```bash
make observe-up   # base + local override + observability; app on :3000
make oncall       # in a second terminal: the host-side responder
```

| UI | URL |
| --- | --- |
| App | <http://localhost:3000> |
| Grafana (dashboard `aether-archive`) | <http://localhost:3001> |
| Prometheus | <http://localhost:9090> |
| Alertmanager | <http://localhost:9093> |
| Jaeger | <http://localhost:16686> |

Loki and the OTel Collector are internal to the compose network. Grafana is provisioned from
`observability/grafana/provisioning/`; the dashboard is
`observability/grafana/dashboards/aether-archive.json` (UID `aether-archive`). It is the home
dashboard and shows: publish 5xx ratio, publish p95, request outcomes, mutations by method, alert
state over time, logs with `traceId`, and a link to the Jaeger trace search.

`make observe-down` stops the stack and keeps its volumes.

### Telemetry toggle

The base stack is telemetry-free: `MANAGEMENT_TRACING_ENABLED` defaults to `false`. The observability
overlay sets it to `true` and points `OTEL_EXPORTER_OTLP_ENDPOINT` at the collector. The API's
`/actuator/prometheus` endpoint is internal in every profile; it is never proxied by nginx.

## 4. Production access

The first public deploy is pending; once it exists:

- Grafana: `https://DOMAIN/grafana/` (anonymous Viewer; admin password from
  `GRAFANA_ADMIN_PASSWORD`).
- Prometheus, Alertmanager, Jaeger: SSH tunnel from the operator machine:

  ```bash
  ssh -N \
    -L 9090:127.0.0.1:9090 \
    -L 9093:127.0.0.1:9093 \
    -L 16686:127.0.0.1:16686 \
    deploy@VPS_HOST
  # then http://localhost:9090, http://localhost:9093, http://localhost:16686
  ```

The on-call responder is a systemd unit on the VPS (`oncall/aether-oncall.service`), reachable only
from the Docker bridge. Its runbook is `oncall/README.md`.

## 5. Alert rules

Source: `observability/alerts.yml`; expressions and thresholds are the ones actually deployed.

| Alert | Severity | Condition | For | Page? |
| --- | --- | --- | --- | --- |
| `AetherPublish5xxRate` | critical | 5xx share of `POST /api/v1/dumps` over 2 min > 5 % | 1 min | yes |
| `AetherPublishLatency` | warning | publish p95 over 5 min > 2 s | 5 min | no — dashboard signal |
| `AetherApiDown` | critical | `up{job="aether-api"} == 0` | 1 min | yes |

Alertmanager groups by `alertname` and `journey`, waits 10 s, repeats every hour, and sends
`resolved` notifications. Critical alerts go to the responder; warnings go to the `none` receiver, so
a slow save does not wake anyone at night. The responder receives the notification log through the
`aether_alertmanager_data` volume after a restart.

The rules use the same metric the dashboard uses. The 5xx ratio is guarded with `clamp_min(..., 0.001)`
so a quiet archive cannot divide by zero, and the dashboard adds `or vector(0)` so the panel shows a
flat zero instead of "No data" before the first failure.

## 6. Runbook

### Publish 5xx

**Symptom:** the dashboard's publish 5xx ratio is above 5 %, or `AetherPublish5xxRate` is firing.
A reader cannot save a dump.

1. The responder has already run (see `oncall/incidents/<id>.json`): it checks the database and the
   API, restarts PostgreSQL first if it is unhealthy, otherwise restarts the API, and uses the last
   good image if the API is unhealthy. It records the action and closes the incident when
   Alertmanager sends `resolved`.
2. Confirm the current state:
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.observability.yml \
     -f docker-compose.prod.yml ps
   curl -fsS https://DOMAIN/api/v1/photos | head -c 200
   ```
3. Read the API logs with the trace id from the dashboard:
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.observability.yml \
     -f docker-compose.prod.yml logs --tail=200 api
   ```
4. If the database is the cause, check its health and disk:
   ```bash
   docker compose ... exec -T db pg_isready -U aether -d aether
   df -h
   ```
5. If the API image is the cause, roll back to the last successful deployment:
   ```bash
   ./scripts/deploy/rollback.sh
   ```
   The script runs the same smoke test as a forward deploy; a failed rollback exits non-zero.
6. If a restore is needed, the pre-deploy dump is in `backups/db-*.sql.gz`; the restore steps are in
   `DEPLOYMENT.md`.
7. Write the incident: what the reader saw, the action, the root cause, the follow-up issue. The
   responder's JSON is the starting point.

### Publish latency

**Symptom:** `AetherPublishLatency` is firing (p95 > 2 s for 5 min), or the workshop feels stuck.
This is a warning: it does not page.

1. Open the dashboard's p95 panel and the Jaeger trace search for `http post /api/v1/dumps`. The
   publish trace starts in the browser; the slow span is usually the database.
2. Check PostgreSQL: connection count, locks, disk.
   ```bash
   docker compose ... exec -T db psql -U aether -d aether -c '\
     select state, count(*) from pg_stat_activity group by state;'
   ```
3. Check the Hikari pool and the JVM in the dashboard. If the pool is exhausted, find the slow query
   in the logs (the trace id is in the JSON line) before changing any pool size.
4. The latency rule is deliberately not connected to the responder: a slow save is a degraded
   experience, not an outage. Fix the cause; do not restart the database to hide it.

### API down

**Symptom:** `AetherApiDown` is firing or the public page returns 502/503 from Caddy.

1. The responder sees the API container unhealthy and attempts a restart, then a rollback to the last
   good image; the incident JSON records which path ran.
2. Check the container and its logs:
   ```bash
   docker compose ... ps api
   docker compose ... logs --tail=200 api
   ```
3. Check that the database is healthy; the API's readiness depends on it. If the db is down, restart
   it first (the responder does this automatically).
4. If the API cannot start after a rollback, stop and escalate: do not loop restarts. Capture the
   logs, the image tag (`state/current-image`), and the last good tag (`state/last-good-image`).
5. Check the VPS disk and memory; a full disk breaks PostgreSQL and the image volume.
6. If Caddy is the only broken piece, `docker compose ... restart caddy`; the certificate volumes
   survive.

## 7. On-call responder

Details and the security model: `oncall/README.md`. In short:

- `POST /alerts` with an `Authorization: Bearer` token; idempotent by Alertmanager fingerprint.
- Diagnosis: Docker health for `api` and `db`, plus the last 60 API log lines.
- Decision order: database unhealthy → `restart_db`; API unhealthy → `rollback_api` to
  `state/last-good-image`; otherwise `restart_api`.
- It waits for Docker health, records `oncall/incidents/<utc>-<fingerprint>.json`, optionally opens a
  GitHub issue (token in `ONCALL_GITHUB_TOKEN`), and closes the record on `resolved`.
- It never runs SQL, never deletes data, never reads photo bytes, and never makes an LLM call. The
  deterministic path needs no API key.

## 8. Incident drill (the evidence)

The drill is real: `scripts/demo/incident-drill.sh` starts a publish load, stops PostgreSQL, waits for
the critical alert, waits for the responder to restart the database, and prints the closed incident.
The recorded run is in `reports/observability-incident-drill-20261022.md` with the dashboard
screenshot, the Jaeger trace, the incident JSON and the load log.

```bash
make observe-up
scripts/demo/incident-drill.sh        # takes ~5 minutes
```

## 9. Retention, backup and limits

- Prometheus: 15 days, `aether_prometheus_data`.
- Loki: 7 days, `aether_loki_data`; Promtail positions in its container.
- Jaeger: in-memory, intentionally; traces are for the last debugging window, not an audit log.
- Alertmanager: notification log in `aether_alertmanager_data`; survives a restart.
- Grafana: `aether_grafana_data`; dashboards are provisioned from git, so a lost volume loses only
  manual edits.
- The database and media are backed up before every deploy by `scripts/deploy/backup.sh` into
  `backups/` (7-day retention). Copy that directory off the VPS; it is gitignored.
- Limits of this single-VPS setup: no HA, Jaeger is not durable, Loki is a single instance, and the
  Grafana dashboards are anonymous read-only. That is deliberate for a demo, not a claim of a
  production SLO.
