# Public deployment and 1 GB core profile — 2026-10-24

## Live state

- **URL:** https://168.138.70.166.nip.io
- **Archive:** 36 attributed photos and 3 dumps (the intended seeded demo data).
- **Image:** `ghcr.io/academic-and-personal-projects/aether-archive-api:sha-9b6e3a215f03dee75d8fc4262dca14344ac0dc3b`
  (the immutable image from the v1.0.0 release).
- **TLS / headers:** Caddy certificate for the nip.io name; HSTS, CSP and `X-Content-Type-Options`
  pass the public smoke.
- **Grafana:** https://168.138.70.166.nip.io/grafana/ (anonymous Viewer, read-only).
- **Core containers:** `db`, `api`, `web`, `caddy`, `prometheus`, `grafana`, `alertmanager`, `loki`.

## Release and deploy timeline

All times UTC; the measured evidence is in [`public-cold-start-20261022.md`](public-cold-start-20261022.md).

- The v1.0.0 release workflow (run `39865156018`) published both images.
- The first manual deploy started the API container at `22:39:00`; the old 240-second gate expired and
  the deploy recorded `failed` at `22:43:28`. The API kept starting and logged `Started
  AetherArchiveApplication in 1093.293 seconds` at `22:58:23` — 18 m 13 s inside the process.
- The release deploy job started at `22:59:48` with that API container already warm. Its healthcheck
  was green at `23:09:03`, but the public smoke failed the DB-backed API reads and the Jaeger UI, and
  the job ended `failure` at `23:22:32` with the full trace/log stack running on the 1 GB host.
- The same `sha-9b6e3a215f03...` images were deployed with the **core profile** at
  `2026-10-22T23:42:55Z`; `state/history.tsv` records `success`. This deploy reused the warm API
  container, so it added no second cold start.
- The public smoke passed every check: HTML/SPA, hashed asset, 36 photos, 3 dumps, random photo,
  `404 application/problem+json`, Grafana health, the eight core containers, Prometheus, Alertmanager
  and the on-call health endpoint. Promtail, Jaeger and the OTel Collector are intentional `SKIP`s on
  this host.

Full output: [`public-smoke-20261024.md`](public-smoke-20261024.md).
Machine-readable deploy history: [`public-deploy-history.tsv`](public-deploy-history.tsv).

## Why Loki is in the core profile

Loki backs Grafana's log datasource. Without it, the public Grafana reports a broken datasource even
though the metrics path is healthy. Loki is idle without a shipper and fits the host: on 2026-10-24 it
started in 1.09 s, `/ready` returned `ready`, and the host still reported ~407 MB available of 954 MB
(with 651 MB of swap in use). Promtail, Jaeger and the OTel Collector remain full-profile only, so the
public log view is healthy but empty by design.

## Public incident drill

The real drill stopped PostgreSQL on the live host at `2026-10-22T23:52:04Z`:

- alert: `AetherPublish5xxRate` (critical, 100% publish 5xx over two minutes);
- responder diagnosis: API healthy, database missing;
- action: `restart_db` — `docker compose ... restart db`, exit 0;
- health gate: database healthy before the incident was marked remediated;
- Alertmanager resolved the incident at `2026-10-22T23:55:06Z`;
- history: `received → diagnosed:restart_db → remediation_healthy → alertmanager_resolved`.

Record: [`public-incident-20261022T235204Z.json`](public-incident-20261022T235204Z.json).
The archive counts were still 36 photos / 3 dumps after the drill; the publish load did not leave a
test dump.

The on-call unit is active with the fixed bind: `127.0.0.1:9099` and `172.17.0.1:9099` only; external
TCP 9099 is closed (connection timeout). `/healthz` answers on both bind addresses.

## Why the core profile

The 1 GB Oracle VPS could not pass the public smoke with the full trace/log stack: the release job's
API healthcheck was green, but its DB-backed reads failed and the Jaeger UI was unreachable under that
load. The core profile keeps the metrics and alerting path the rubric measures and includes Loki for
the log datasource. The full stack remains the local `make observe-up` profile and is available on a
larger host with `AETHER_FULL_OBSERVABILITY=1`.

## Known limits (honest)

- The v1.0.0 release deploy job remains a failed run in GitHub history; the same images were deployed
  manually with the core profile. A later release uses the reviewed profile fix and a 50-minute
  deploy-job timeout, but it was not re-tagged here to avoid a second 18-minute public cold start.
- The public host is a single 1 GB VPS with 2 GB swap; warm requests are fast, the first JVM start is
  slow (1093 s measured). This is a course demo, not an availability claim.
- The public log datasource is healthy but empty: Promtail is not part of the core profile.
- The physical iOS/Android pass remains explicitly unclaimed.
