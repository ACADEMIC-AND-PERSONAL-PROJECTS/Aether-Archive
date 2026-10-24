# Public deployment and 1 GB core profile — 2026-10-24

## Live state

- **URL:** https://168.138.70.166.nip.io
- **Archive:** 36 attributed photos and 3 dumps (the intended seeded demo data).
- **Image:** `ghcr.io/academic-and-personal-projects/aether-archive-api:sha-9b6e3a215f03dee75d8fc4262dca14344ac0dc3b`
  (the immutable image from the v1.0.0 release).
- **TLS / headers:** Caddy certificate for the nip.io name; HSTS, CSP and `X-Content-Type-Options`
  pass the public smoke.
- **Grafana:** https://168.138.70.166.nip.io/grafana/ (anonymous Viewer, read-only).

## Release and deploy timeline

- The v1.0.0 release workflow (run `39865156018`) published both images successfully. Its first deploy
  job started the **full** observability stack on the 1 GB host; the Spring Boot cold start took about
  18 minutes under memory pressure and the smoke timed out. The job is recorded as failed in GitHub.
- The same `sha-9b6e3a215f03...` images were deployed with the **core profile** at
  `2026-10-22T23:42:55Z`; `state/history.tsv` records `success`. The profile fix is ADR-031 and is
  default in `scripts/deploy/deploy.sh` for later releases.
- The public smoke passed every check: HTML/SPA, hashed asset, 36 photos, 3 dumps, random photo,
  `404 application/problem+json`, Grafana health, the seven core containers, Prometheus, Alertmanager
  and the on-call health endpoint. The trace/log containers are intentional `SKIP`s on this host.

Full output: [`reports/public-smoke-20261024.md`](public-smoke-20261024.md).
Machine-readable deploy history: [`reports/public-deploy-history.tsv`](public-deploy-history.tsv).

## Public incident drill

The real drill stopped PostgreSQL on the live host at `2026-10-22T23:52:04Z`:

- alert: `AetherPublish5xxRate` (critical, 100% publish 5xx over two minutes);
- responder diagnosis: API healthy, database missing;
- action: `restart_db` — `docker compose ... restart db`, exit 0;
- health gate: database healthy before the incident was marked remediated;
- Alertmanager resolved the incident at `2026-10-22T23:55:06Z`;
- history: `received → diagnosed:restart_db → remediation_healthy → alertmanager_resolved`.

Record: [`reports/public-incident-20261022T235204Z.json`](public-incident-20261022T235204Z.json).
The archive counts were still 36 photos / 3 dumps after the drill; the publish load did not leave a
test dump.

The on-call unit is active with the fixed bind: `127.0.0.1:9099` and `172.17.0.1:9099` only; external
TCP 9099 is closed (connection timeout). `/healthz` answers on both bind addresses.

## Why the core profile

The 1 GB Oracle VPS cannot run the full trace/log stack and the Spring Boot API at once: starting
Loki, Promtail, the OTel Collector and Jaeger made the API unresponsive, while the core metrics and
alerting path stayed stable. ADR-031 keeps PostgreSQL, API, web, Caddy, Prometheus, Grafana and
Alertmanager on the public host, and keeps Jaeger/Loki/Promtail/OTel in the local/full profile
(`AETHER_FULL_OBSERVABILITY=1`). The observability criterion is demonstrated by the public Grafana,
Prometheus, Alertmanager and the public drill; traces and logs remain demonstrated locally.

## Known limits (honest)

- The v1.0.0 release deploy job remains a failed run in GitHub history; the public deployment used the
  same images with the core profile. A later release uses the reviewed profile fix and a 50-minute
  deploy-job timeout, but it was not re-tagged here to avoid a second 18-minute public cold start.
- The public host is a single 1 GB VPS with 2 GB swap; warm requests are fast, cold JVM startup is
  slow. This is a course demo, not an availability claim.
- The physical iOS/Android pass remains explicitly unclaimed.
