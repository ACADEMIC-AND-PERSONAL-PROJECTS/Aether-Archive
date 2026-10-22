# Incident drill — publish outage, alert and on-call response (2026-10-22)

**Scope:** local production-shaped stack (base + local override + observability overlay), commit range
`5c8e21e` plus the observability work on `feature/zoomcamp-final`.
**Not production:** the Oracle VPS is reachable on 22/80/443 and `168.138.70.166.nip.io` resolves, but
the first public release is still pending. This drill is the reproducible evidence for the alerting and
on-call criteria until the public deploy runs the same path.

## Scenario

A reader is publishing a six-photo dump. PostgreSQL disappears; the API keeps answering reads it has
cached, then every publish fails at the Hikari connection timeout (30 s) with a 500. The publish 5xx
alert must fire, Alertmanager must call the host-side responder, the responder must diagnose the
database (not the API), restart it, and the alert must resolve without a human.

No synthetic alert was posted. The failure is `docker compose stop db`.

## Reproduction

```bash
make observe-up                  # app :3000, Prometheus :9090, Grafana :3001, Alertmanager :9093
make oncall                      # host-side responder on 127.0.0.1:9099
scripts/demo/incident-drill.sh   # starts the publish load, stops PostgreSQL, waits for the record
```

The load publishes the same six photos every five seconds. Reused ids return `400`/`409` while the
database is healthy; they are client errors and do not feed the 5xx alert. During the stop, the same
request fails before validation and returns `500` — that is the signal.

## Recorded timeline (UTC, 19:26 run)

| Time | Event |
| --- | --- |
| 19:26:03 | publish load starts against `http://localhost:3000` |
| ~19:26:08 | PostgreSQL stopped |
| 19:26:43 | first `500` on `POST /api/v1/dumps` (30 s Hikari timeout) |
| 19:28:08.655 | `AetherPublish5xxRate` starts firing: 100 % of publishes failed over the 2-minute window |
| 19:28:18.663 | Alertmanager `POST /alerts` accepted by the responder (HTTP 202) |
| 19:28:19 | diagnosis: `api` healthy, `db` stopped (`restart_db`) |
| 19:28:19–19:28:26 | the responder repaired the database container; container healthy |
| 19:30:18.666 | Alertmanager sends `resolved`; the incident is closed |

## Re-run after the review fixes (UTC, 20:55 run)

The review found that `up -d --no-deps` is a no-op for an existing unhealthy container. The responder
now runs `docker compose restart <service>` and records the container identity before and after. The
same drill was run again on the fixed code:

| Time | Event |
| --- | --- |
| 20:54:23 | publish load and warning latency alert start |
| 20:55:23 | `AetherPublish5xxRate` fires; PostgreSQL stopped |
| 20:55:34 | Alertmanager accepted (`202`); diagnosis `db: missing`; action `restart_db` |
| 20:55:34–20:55:42 | `docker compose restart db`; `StartedAt` changed, same container id, healthy |
| 20:58:03 | `resolved`; incident closed |

The new incident JSON proves the fix:

```json
"action": {
  "command": "docker compose -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.observability.yml restart db",
  "before": { "id": "6c105ee…", "startedAt": "2026-10-22T19:28:19.689235397Z" },
  "after":  { "id": "6c105ee…", "startedAt": "2026-10-22T20:55:34.95857673Z" },
  "changed": true,
  "serviceHealth": { "running": true, "health": "healthy" }
}
```

The alert-to-webhook latency is **10 s**; the database is back in **8 s**; the record closes
**110 s** later, which is the 2-minute rate window plus the 1-minute `for` plus the Alertmanager
resolve path. The responder's own deadline is visible in the incident JSON: `receivedAt`,
`action.startedAt`, `action.finishedAt`, `resolvedAt`.

## Alert and diagnosis

```promql
sum(rate(http_server_requests_seconds_count{
  job="aether-api", method="POST", uri="/api/v1/dumps", status=~"5.."
}[2m]))
/
clamp_min(sum(rate(http_server_requests_seconds_count{
  job="aether-api", method="POST", uri="/api/v1/dumps"
}[2m])), 0.001)
> 0.05
```

Rule `AetherPublish5xxRate`, severity `critical`, `for: 1m`. The alert description reported 100 %.

The responder's diagnosis is Docker state, not a guess:

```json
"diagnosis": {
  "api": { "running": true, "health": "healthy" },
  "db":  { "running": false, "health": "missing" }
}
```

The API log excerpt in the incident shows the expected failure chain:
`SQLTransientConnectionException: HikariPool-1 - Connection is not available, request timed out after
30000ms` → `UnknownHostException: db`. Trace id `d86aa5493296c4bf7a9c084c625830a9` appears in both
the log line and the Jaeger trace.

The responder chose `restart_db` (the database is never rolled back automatically), ran the compose
command, confirmed the container healthy, and left the API in place. The Alertmanager `resolved`
notification closed the record; the responder did not need to guess that the outage was over.

## Evidence

| Evidence | File |
| --- | --- |
| Grafana dashboard at the end of the drill: 5xx ratio, p95, request outcomes, alert history | [`evidence/grafana-drill.png`](evidence/grafana-drill.png) |
| Dashboard in the healthy state, all panels | [`evidence/grafana-dashboard.png`](evidence/grafana-dashboard.png) |
| Prometheus rule state during/after the drill (5xx, latency, API down) | [`evidence/prometheus-alerts.png`](evidence/prometheus-alerts.png) |
| Alertmanager: the critical route, the webhook, the resolved notification | [`evidence/alertmanager.png`](evidence/alertmanager.png) |
| Jaeger search for `http post /api/v1/dumps` | [`evidence/jaeger-publish-search.png`](evidence/jaeger-publish-search.png) |
| The publish trace, including the browser-started `traceparent` | [`evidence/jaeger-trace.png`](evidence/jaeger-trace.png) |
| Incident JSON (first run) | [`evidence/incident-20261022T192818Z.json`](evidence/incident-20261022T192818Z.json) |
| Incident JSON (fixed code, 20:55 run; `restart` + changed identity) | [`evidence/incident-20261022T205533Z.json`](evidence/incident-20261022T205533Z.json) |
| Publish load log (final run from 19:26:03; the 5xx window and the recovery) | [`evidence/publish-load.log`](evidence/publish-load.log) |
| Responder log (accept, remediate, resolve) | [`evidence/oncall.log`](evidence/oncall.log) |

The live copies are `oncall/incidents/20261022T192818Z-cbafc00e.json` and
`oncall/incidents/20261022T205533Z-cbafc00e.json`; that directory is gitignored, so the reviewed copies
above are committed as evidence. They contain a stack trace and trace ids, no request bodies, no
credentials and no image bytes.

## Checks after the drill

- `curl -fsS http://localhost:3000/api/v1/photos` returned the seeded archive; the workshop publishes
  again.
- Prometheus: `AetherPublish5xxRate` inactive; `AetherApiDown` inactive; `AetherPublishLatency` inactive
  after the pool recovered.
- Grafana: the 5xx panel returned to zero (the panel uses `or vector(0)`); the log panel shows the
  trace id; the alert-history panel shows the firing and resolved transitions.
- The responder's `/incidents` endpoint lists the resolved record; the incident JSON status is
  `resolved`, `resolvedAt` set.
- The alert drill did **not** restart the API or roll back an image: the diagnosis selected the
  database, which is the common cause and the least destructive action.

## What the drill exposed

1. **The warning route was wrong at first.** The first rehearsal produced a latency warning that the
   responder received (visible in `evidence/oncall.log` at 19:24:18). A slow save must not page, and it
   must not restart anything. `observability/alertmanager.yml` now routes `severity="warning"` to the
   `none` receiver; the final critical drill is the route that is recorded. The warning remains visible
   in Grafana and Prometheus.
2. **Alertmanager needs a recreate, not a reload, after a config edit.** `docker compose up -d` alone
   did not pick up the mounted config; the container was force-recreated before the final run. This is
   in the runbook.
3. **The token file cannot be 0600.** Alertmanager's container user cannot read a host file owned by
   the deploy user with mode 0600. The token is generated at 0644, readable by the container; the host
   is single-user and `.env` holds the same value. Recorded in ADR-029 and `oncall/README.md`.
4. **Hikari's 30 s timeout makes the latency warning legitimate.** p95 reached 30 s during the outage.
   The responder's restart is fast; the reader still waits for the pool. The dashboard and trace are
   what explain the difference between "database is gone" and "database is slow".
5. **The 400s are not the incident.** The load's reused photo ids are rejected once a dump owns them.
   The 5xx alert only counts `status=~"5.."`; the report keeps the distinction visible instead of
   pretending every line is a failure.

## Production follow-up

The same alert rules, responder and drill apply on the VPS. The VPS is reachable on 22/80/443, DNS
resolves, and the responder service is installed and active; the remaining steps are the first public
release and the same drill against the public origin:

- run the first `v*` release and `./scripts/deploy/smoke.sh https://168.138.70.166.nip.io`;
- run `scripts/demo/incident-drill.sh BASE_URL=https://168.138.70.166.nip.io` once and attach the new
  incident JSON here;
- keep 9090/9093/16686 on the SSH tunnel.

Until then this report claims a **verified local drill**, not a production incident.
