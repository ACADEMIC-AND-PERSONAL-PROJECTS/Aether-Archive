# On-call responder

A small, deterministic host process that receives Alertmanager notifications, diagnoses the compose
stack, applies one safe remediation, and writes an incident record. It is the on-call part of the
Zoomcamp final project (criterion 12) and the alerting story (criterion 11).

It is **not** an LLM agent. The incident path must work at 03:00 with no API key, no vendor status page
and no network dependency. An optional GitHub issue is the only outbound call; the remediation itself
is Docker and the deployment state.

## Why it runs on the host

The responder needs to restart the API and PostgreSQL and, on a bad deploy, recreate the API from
`state/last-good-image`. Mounting a writable Docker socket into a container that is reachable from the
internet would give that container root-equivalent power. Running it as a systemd service on the VPS,
reachable only through Docker's host gateway with a bearer token, keeps the trade-off visible. The
same reasoning is recorded in ADR-029.

## Endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/healthz` | none | liveness for the smoke test and systemd |
| `POST` | `/alerts` | `Authorization: Bearer <token>` | Alertmanager webhook |
| `GET` | `/incidents` | bearer | last 20 incident records, for the runbook |

`POST /alerts` accepts the Alertmanager payload (`{"alerts": [...]}`), is idempotent per
`fingerprint`, returns `202` immediately and handles each alert in a worker thread. A `resolved`
notification closes the matching incident.

## Decision table

The diagnosis reads Docker's state, not a guess:

| Observed state | Action | Why |
| --- | --- | --- |
| `db` stopped or unhealthy | `restart_db` (`docker compose restart db`; `up -d` only when the container is missing) | Most publish failures are a database that is not there; the API recovers by itself. |
| `api` unhealthy or stopped | `rollback_api` to `state/last-good-image` (`up -d --force-recreate`) | A bad image is the likely cause; the previous image is known to pass the smoke test. Without a recorded image the API is restarted. |
| Both healthy, critical publish alert | `restart_api` (`docker compose restart api`) | A wedged process or a flapping dependency; the least destructive next step. |
| A warning (`AetherPublishLatency`) | no page | Latency is a dashboard signal, not an outage; the Alertmanager route sends warnings to `none`. |

`compose up -d --no-deps svc` is a no-op for a container that already exists, even when it is
unhealthy. The responder therefore restarts existing containers and records the container id and
`StartedAt` before and after the command; a command that changed neither is recorded as
`remediation_not_applied` and the incident is escalated. The health gate checks the service the action
was meant to repair — a rollback is never marked healthy because PostgreSQL is up.

The database is **never** rolled back automatically: a restart is safe, replacing its volume is not.
If the health gate after a remediation still fails, the incident is marked `escalated` and the operator
follows the runbook.

## Incident record

One JSON file per incident under `oncall/incidents/` (gitignored):

```json
{
  "id": "20261022T192818Z-cbafc00e",
  "fingerprint": "…",
  "status": "resolved",
  "receivedAt": "2026-10-22T19:28:18Z",
  "alert": { "name": "AetherPublish5xxRate", "severity": "critical", "journey": "publish", "…": "…" },
  "diagnosis": { "api": { "running": true, "health": "healthy" }, "db": { "running": false, "health": "missing" }, "logExcerpt": "…" },
  "action": { "kind": "restart_db", "returnCode": 0, "changed": true, "before": { "id": "…", "startedAt": "…" }, "after": { "id": "…", "startedAt": "…" }, "serviceHealth": { "running": true, "health": "healthy" } },
  "history": [
    { "at": "2026-10-22T19:28:18Z", "event": "received" },
    { "at": "2026-10-22T19:28:20Z", "event": "diagnosed:restart_db" },
    { "at": "2026-10-22T19:30:12Z", "event": "remediation_healthy" },
    { "at": "2026-10-22T19:30:18Z", "event": "alertmanager_resolved" }
  ],
  "resolvedAt": "2026-10-22T19:30:18Z"
}
```

The log excerpt is capped at 8 000 characters. It contains trace ids and stack traces, never request
bodies, tokens or image bytes.

## Run locally

```bash
make observe-up          # the stack and Alertmanager
make oncall              # in a second terminal; reads .env
```

`oncall/run.sh` sources `.env`, writes `oncall/webhook-token` (mode 0644: Alertmanager runs as an
unprivileged container user and must be able to read the file; it contains only the webhook token,
which `.env` already holds), and starts the responder on two explicit addresses: `127.0.0.1` for the
host health check and the Docker bridge gateway (normally `172.17.0.1`, discovered with
`docker network inspect bridge`) for Alertmanager's `host.docker.internal`. It never binds `0.0.0.0`.
Neither address is published by Caddy or the VPS firewall; the bearer token still travels over plain
HTTP inside the host. Verify the boundary with `ss -ltnp | grep 9099`: exactly the two addresses, never
`*:9099`.

Test the decision functions without Docker:

```bash
python3 -m unittest discover -s oncall -p 'test_*.py' -v
```

Test the webhook with a synthetic **resolved** notification (no incident is created):

```bash
token="$(grep '^ONCALL_WEBHOOK_TOKEN=' .env | cut -d= -f2-)"
curl -sS -X POST http://127.0.0.1:9099/alerts \
  -H "Authorization: Bearer $token" \
  -H 'Content-Type: application/json' \
  -d '{"alerts":[{"status":"resolved","fingerprint":"0123456789abcdef","labels":{"alertname":"Synthetic"}}]}'
```

The real drill is `scripts/demo/incident-drill.sh`; it stops PostgreSQL, waits for
`AetherPublish5xxRate`, and prints the closed incident. The recorded run is
`reports/observability-incident-drill-20261022.md`.

## Production install

Prerequisites: the checkout is `/opt/aether`, the deploy user owns it and is in the `docker` group,
and `.env` contains `ONCALL_WEBHOOK_TOKEN` (generate with `openssl rand -hex 24`).

```bash
sudo /opt/aether/oncall/install-service.sh ubuntu
systemctl status aether-oncall.service --no-pager
curl -fsS http://127.0.0.1:9099/healthz
ss -ltnp | grep 9099
```

`install-service.sh` substitutes the real deploy user and checkout path into the unit (the template's
`User=deploy` and `/opt/aether` are documentation defaults), allows TCP 9099 only from Docker's
private ranges (`172.16.0.0/12`) through the host firewall, persists the rule when
`netfilter-persistent` is installed, and enables the service. Adjust the user if the VPS login is not
`ubuntu`. The unit passes `AETHER_COMPOSE_ARGS` for the production overlay, so a restart or rollback
targets the same project the deploy uses. `journalctl -u aether-oncall -f` is the live log.

## Limits

- Single host, single responder; no leader election. The `POST /alerts` handler is idempotent per alert
  fingerprint, so an Alertmanager retry does not duplicate an incident.
- The auto-rollback only replaces the API image. A migration that breaks the schema still needs a
  human and the pre-deploy backup.
- The responder does not delete data, run SQL, or read the photo volume.
- The optional GitHub issue uses `ONCALL_GITHUB_TOKEN` (fine-grained, `issues: write`) and
  `ONCALL_GITHUB_REPOSITORY`; without them the incident is still recorded locally.
- The 0644 token file is a deliberate trade-off for the unprivileged Alertmanager container. Rotate it
  by editing `.env`, running `scripts/dev/oncall-token.sh`, and restarting Alertmanager and the
  responder.
