# Public cold-start evidence — 2026-10-22

This note records what actually happened during the first public deployment, because the original
summary (“the release deploy job hit the 1 GB cold-start limit”) conflated two different failures.
All times are UTC and come from the live host or the GitHub Actions job log for release run
`39865156018`.

## Measured API cold start (manual deploy)

Source: `docker inspect aether-archive-api-1` and `docker logs aether-archive-api-1` on
`ubuntu@168.138.70.166`.

| Time | Event |
| --- | --- |
| `22:39:00.691` | API container started (`State.StartedAt`). |
| `22:42:11.278` | Spring Boot start log (after the JVM launched): `Starting AetherArchiveApplication v0.1.0-SNAPSHOT using Java 21.0.12.1`. |
| `22:43:28` | First manual deploy recorded `failed` in `state/history.tsv`; the old health gate was 240 s. |
| `22:58:11.881` | `Tomcat started on port 8080 (http) with context path '/'`. |
| `22:58:23.386` | `Started AetherArchiveApplication in 1093.293 seconds (process running for 1136.302)`. |
| `23:42:55` | Core-profile deploy recorded `success`; the API container was still the one started at `22:39:00` (warm), so this deploy did not cold-start a second API. |

The measured cold start is therefore **18 m 13 s inside the process** and **19 m 22 s from container
start**. The same log line says `process running for 1136.302` seconds, which puts the process start at
about `22:39:27` — 26 seconds after the container start, i.e. the entrypoint. The 240-second gate was
too short; the API kept starting after the deploy had already recorded the failure. `deploy.sh` now
defaults `AETHER_WAIT_TIMEOUT` to 1800 seconds.

## What failed in the release deploy job

Source: `gh run view 39865156018 --job 120137770217 --log`.

| Time | Event |
| --- | --- |
| `22:59:48` | Deploy job started. |
| `23:00:29` | `deploy.sh` began with `sha-9b6e3a215f03...`. |
| `23:08:29` | `Container aether-archive-api-1 Running` — same warm container from `22:39`. |
| `23:09:03` | Compose reported the API healthcheck `Healthy`. |
| `23:09:10` | Public smoke started. |
| `23:12:27` | `FAIL api: GET /api/v1/photos failed`. |
| `23:15:30` | `FAIL api: GET /api/v1/dumps failed`. |
| `23:15:44` | `FAIL api: unknown route did not return a problem detail`. |
| `23:22:29` | `FAIL jaeger: UI unreachable`. |
| `23:22:30` | `deploy smoke: 4 failed, 0 warnings`; the job ended `failure` at `23:22:32`. |

The release job did **not** fail at the cold-start health gate: the API healthcheck was green. It
failed the public smoke while the full trace/log stack was running on the 1 GB host. The smoke's
API reads did not answer within their bounded retries, and Jaeger's UI was not reachable. The
exact cause of the API read timeouts is not proven by this log; the supported statement is that the
full-profile stack did not pass the public smoke on this host.

## What this supports

- 1800-second default wait: supported by the measured 1093-second in-process start.
- 50-minute release deploy job timeout: gives the cold start plus pull, backup and smoke room.
- Core profile as the public default: supported by the release job's full-profile smoke failure and
  by the successful core-profile deploy on the same images.
- **Not** supported: “the release deploy job timed out during the cold start.” That job's API
  healthcheck passed; its smoke failed.

## Artefacts

- `reports/public-deploy-history.tsv` — the four deploy outcomes on the host.
- `reports/public-smoke-20261024.md` — the post-fix public smoke.
- `reports/public-observability-profile-20261024.md` — the profile decision and incident drill.
- `docs/scrum/DECISION-LOG.md` ADR-031 — the decision record.
