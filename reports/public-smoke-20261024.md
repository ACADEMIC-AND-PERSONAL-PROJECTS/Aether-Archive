# Public smoke — 2026-10-24

URL: `https://168.138.70.166.nip.io`
Command: `SMOKE_PUBLIC_PROFILE=1 ./scripts/deploy/smoke.sh https://168.138.70.166.nip.io`
Result: **all checks passed, 0 warnings**. The four trace/log containers and Jaeger are expected
`SKIP`s on the public 1 GB core profile (ADR-031), not failures.

```text
smoke: https://168.138.70.166.nip.io
PASS  tls: Strict-Transport-Security present
PASS  headers: Content-Security-Policy present
PASS  headers: X-Content-Type-Options nosniff
PASS  home: SPA root
PASS  home: title
PASS  assets: /assets/index-Dk_geeLR.js
PASS  api: GET /api/v1/photos → 200, 36 photos
PASS  api: GET /api/v1/dumps → 200, 3 dumps
PASS  api: GET /api/v1/photos/random → 200
PASS  api: unknown route → 404 application/problem+json
PASS  grafana: /grafana/api/health → database ok (11.5.1)
PASS  container: db running
PASS  container: api running
PASS  container: web running
PASS  container: caddy running
PASS  container: prometheus running
PASS  container: grafana running
PASS  container: alertmanager running
SKIP  container: jaeger (full observability profile only)
SKIP  container: loki (full observability profile only)
SKIP  container: promtail (full observability profile only)
SKIP  container: otel-collector (full observability profile only)
PASS  prometheus: /-/healthy
PASS  alertmanager: /-/healthy
SKIP  jaeger: UI (full observability profile only)
PASS  on-call: responder healthz

deploy smoke: all checks passed, 0 warnings
```
