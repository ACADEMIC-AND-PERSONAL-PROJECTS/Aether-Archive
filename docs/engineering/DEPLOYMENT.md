# Deployment and containers — Aether Archive

> Status: **shipped code, public instance pending**. The images, the Compose stack, the release
> workflow, the deploy/rollback/backup scripts and the smoke test are in the repository and verified
> locally. The first public deploy is blocked on the VPS firewall/domain, not on missing code; this
> document marks the public URL as pending until it answers.
>
> Decisions: ADR-009 (PostgreSQL), ADR-010 (containerized delivery), ADR-029 (public demo and the
> observability profile).

## 1. Topology

```text
                       VPS (one host, one origin)
  visitor :443 ── Caddy ──▶ web (nginx) ──▶ api (Spring Boot) ──▶ db (PostgreSQL 17)
                     │        │                  │
                     │        └── /api/v1, /images
                     │
                     └── /grafana/* ──▶ Grafana (anonymous Viewer, read-only)

  GitHub Actions ──▶ GHCR (api + web images) ──▶ ssh ──▶ scripts/deploy/deploy.sh
                                                              │
                                              docker compose pull + up, health gate, smoke,
                                              one-time demo seed, state/history
```

- **One origin.** Caddy terminates TLS and redirects HTTP to HTTPS. nginx serves the SPA and proxies
  `/api/**` and `/images/**` to the API on the internal network. The browser never talks to the API
  directly, so the public origin is the only CORS origin.
- **Only two public surfaces:** the archive and the read-only Grafana dashboards under `/grafana/`.
  Prometheus, Alertmanager and Jaeger bind to `127.0.0.1`; Loki and the OTel Collector are internal.
- **No image bytes in Git, no secrets in images.** Media lives in the `aether_stack_media` volume,
  PostgreSQL in `aether_stack_pgdata`, and every credential in the root `.env` (gitignored).

## 2. Compose files

| File | Purpose |
| --- | --- |
| `docker-compose.yml` | Base stack: `db`, `api`, `web`, named volumes, healthchecks, bounded logs. No host port for the API or the database. |
| `docker-compose.override.yml` | Local only (auto-loaded by `docker compose up`): publishes the web on `WEB_PORT` (3000). |
| `docker-compose.observability.yml` | Prometheus, Grafana, Alertmanager, OTel Collector, Jaeger, Loki, Promtail; enables tracing on the API. UIs bind to `127.0.0.1`. |
| `docker-compose.prod.yml` | Caddy on 80/443 with automatic TLS, the Grafana sub-path, the public CORS origin. No local web port. |

Local:

```bash
cp .env.example .env
docker compose up -d --build          # http://localhost:3000
make demo                             # 36 attributed photos + 3 dumps
make verify                           # every gate CI runs
```

Local with observability:

```bash
make observe-up                       # app :3000, Grafana :3001, Prometheus :9090, Jaeger :16686
make oncall                           # host-side responder in a second terminal
```

Production is the base + observability + prod overlays, started by the deploy script; do not run
`docker compose -f docker-compose.yml -f docker-compose.prod.yml` on the VPS, because the Caddy route
expects the `grafana` service from the observability overlay.

## 3. Images and volumes

| Service | Image | Port | Volume | Health |
| --- | --- | --- | --- | --- |
| `db` | `postgres:17-alpine` | internal 5432 | `aether_stack_pgdata` | `pg_isready` |
| `api` | `ghcr.io/academic-and-personal-projects/aether-archive-api:<tag>` | internal 8080 | `aether_stack_media:/data` | Actuator health over HTTP |
| `web` | `ghcr.io/academic-and-personal-projects/aether-archive-web:<tag>` | internal 80 | — | `wget` on `/` |
| `caddy` | `caddy:2.9-alpine` | 80, 443 | `aether_caddy_data`, `aether_caddy_config` | running |
| observability | pinned in the overlay | `127.0.0.1` only | `aether_prometheus_data`, `aether_alertmanager_data`, `aether_grafana_data`, `aether_loki_data` | see `OBSERVABILITY.md` |

The API image is a multi-stage Maven/Temurin build and runs as a non-root user. The web image builds
the Vite bundle and serves it with nginx; both base tags are pinned, and every service has a bounded
`json-file` log (`10m × 3`).

## 4. Prepare the VPS (once)

Assumptions: Ubuntu 22.04/24.04, a non-root user in the `docker` group, and a domain (or a
wildcard-DNS name) pointing at the host.

```bash
# 1. Docker, Compose v2, git, make, a small swap file if the host has 1 GB of RAM.
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-v2 git make ufw
sudo usermod -aG docker "$USER"     # log out and back in

# 2. Firewall. SSH should be limited to the operator's address; 80/443 are public.
sudo ufw allow from <OPERATOR_IP> to any port 22 proto tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# 3. Checkout. The release workflow assumes /opt/aether.
sudo mkdir -p /opt/aether && sudo chown "$USER:$USER" /opt/aether
git clone https://github.com/ACADEMIC-AND-PERSONAL-PROJECTS/Aether-Archive.git /opt/aether
cd /opt/aether

# 4. Configuration.
cp .env.example .env
# Required:
#   DOMAIN=<the DNS name that resolves to this host>
#   POSTGRES_PASSWORD=<strong>
#   GRAFANA_ADMIN_PASSWORD=<strong>
#   ONCALL_WEBHOOK_TOKEN=$(openssl rand -hex 24)
#   AETHER_PUBLIC_ORIGIN=https://<DOMAIN>
# Optional: ONCALL_GITHUB_TOKEN / ONCALL_GITHUB_REPOSITORY for one issue per incident.
chmod 600 .env
```

If the domain is not available yet, a wildcard-DNS name such as `203.0.113.10.nip.io` works: it
resolves to the IP, and Caddy obtains a normal certificate for it. Do not use a bare IP; Let's Encrypt
does not issue for IP addresses.

If `ssh` times out before you reach the shell, the block is at the provider firewall or `ufw`, not in
this repository. Allow TCP 22 from the operator address and 80/443 from anywhere, then retry.

### GitHub configuration

Repository secrets (preferably in the `production` environment):

| Secret | Value |
| --- | --- |
| `VPS_HOST` | hostname or IP of the VPS |
| `VPS_USER` | the deploy user |
| `VPS_SSH_KEY` | private key of a dedicated deploy keypair (no passphrase) |
| `VPS_KNOWN_HOSTS` | `ssh-keyscan -H <VPS_HOST>` output, verified once |
| `VPS_PORT` | optional, defaults to 22 |

Repository variable (optional): `PUBLIC_URL=https://<DOMAIN>` so the Actions deployment links to the
live instance.

The workflow logs in to GHCR with the run's `GITHUB_TOKEN` to push. The VPS must be able to pull: make
both packages public in the repository's package settings (recommended for the course demo), or run
`docker login ghcr.io` once on the VPS with a `read:packages` token.

## 5. Release: tag → images → deploy

```bash
git tag -a v1.0.0 -m "Aether Archive v1.0.0"
git push origin v1.0.0
```

`.github/workflows/release.yml` then:

1. checks out the tag (pinned action), builds the API and web images, and pushes
   `ghcr.io/academic-and-personal-projects/aether-archive-{api,web}:v1.0.0` and the immutable
   `:sha-<full commit>` tag;
2. deploys only if the four VPS secrets exist; otherwise it publishes the images and emits a warning;
3. opens an SSH connection with `StrictHostKeyChecking=yes` and runs
   `cd /opt/aether && ./scripts/deploy/deploy.sh 'sha-<full commit>'`.

`deploy.sh` runs on the VPS and is the only deployment path (the workflow does not recreate the
logic):

1. validates the tag, `.env`, `DOMAIN`, the database password and the two generated secrets;
2. regenerates `oncall/webhook-token` for Alertmanager;
3. backs up PostgreSQL and the media volume into `backups/` (skipped on the first deploy);
4. `docker compose pull api web`, then `up -d --wait` for the whole stack;
5. runs `scripts/deploy/smoke.sh https://DOMAIN` (public HTML/assets/API/Grafana + local containers);
6. seeds 36 attributed photos and 3 dumps exactly once, when `/api/v1/photos` is empty;
7. runs the smoke again, writes `state/current-image`, `state/last-good-image` and the append-only
   `state/history.tsv`.

Any failed pull, health gate, seed or smoke restores the previous tag with
`docker compose up -d --no-deps api web`, records `failed` in the history, and exits non-zero. The
state files are gitignored; `last-good-image` is the full API reference the on-call responder uses.

Manual deploy, same script:

```bash
cd /opt/aether
./scripts/deploy/deploy.sh sha-<commit>          # images must already be in GHCR
./scripts/deploy/deploy.sh sha-<commit> --skip-seed
```

First deploy without a release tag: build locally once with
`docker compose -f docker-compose.yml -f docker-compose.observability.yml -f docker-compose.prod.yml up -d --build`,
seed with `make demo BASE_URL=https://DOMAIN`, then start tagging releases so the GHCR path is the
normal one. The deploy script is the path that records state and rollback metadata.

## 6. Smoke test

The same script runs in the deploy and by hand:

```bash
./scripts/deploy/smoke.sh https://DOMAIN
make deploy-smoke BASE_URL=https://DOMAIN
```

It checks HSTS, CSP, `X-Content-Type-Options`, the SPA shell and the hashed JavaScript entry, the
photo/dump reads, the random photo, the `404 application/problem+json` shape, the Grafana health under
`/grafana/`, the eleven production containers and the local Prometheus/Alertmanager/Jaeger endpoints.
The host-side on-call responder is reported as `WARN` if it is not installed; the public checks are
hard failures. A deployment that cannot pass it is rolled back, not announced.

## 7. Rollback

```bash
cd /opt/aether
./scripts/deploy/rollback.sh
```

It reads `state/current-image`, finds the last distinct `success` tag in `state/history.tsv`, and calls
`deploy.sh <previous> --skip-seed`; the rollback itself must pass the smoke before it is recorded as
another success. The on-call responder has a narrower automatic path: it recreates only the API from
`state/last-good-image` when the API is unhealthy. The database is never rolled back automatically.

## 8. Backup and restore

`scripts/deploy/backup.sh` (called before every deploy) writes:

- `backups/db-<utc>.sql.gz` — `pg_dump` of the archive;
- `backups/media-<utc>.tar.gz` — the `aether_stack_media` volume;
- deletes files older than `RETENTION_DAYS` (7).

Copy `backups/` off the VPS; it is gitignored. Restore, with the API stopped:

```bash
cd /opt/aether
docker compose -f docker-compose.yml -f docker-compose.observability.yml \
  -f docker-compose.prod.yml stop api
gunzip -c backups/db-<utc>.sql.gz | \
  docker compose -f docker-compose.yml -f docker-compose.observability.yml \
    -f docker-compose.prod.yml exec -T db psql -U aether -d aether
docker run --rm -v aether_stack_media:/media \
  -v "$PWD/backups:/backup" alpine:3.21 \
  tar xzf "/backup/media-<utc>.tar.gz" -C /media
docker compose -f docker-compose.yml -f docker-compose.observability.yml \
  -f docker-compose.prod.yml start api
```

Restores are destructive; take a fresh dump first if the current data might still be wanted.

## 9. Observability and on-call in production

- Grafana: `https://DOMAIN/grafana/` (anonymous Viewer; admin login uses
  `GRAFANA_ADMIN_PASSWORD`).
- Prometheus, Alertmanager, Jaeger: SSH tunnel only.

  ```bash
  ssh -N -L 9090:127.0.0.1:9090 -L 9093:127.0.0.1:9093 \
    -L 16686:127.0.0.1:16686 deploy@VPS_HOST
  ```

- Install the responder once:

  ```bash
  sudo cp /opt/aether/oncall/aether-oncall.service /etc/systemd/system/
  sudo systemctl daemon-reload
  sudo systemctl enable --now aether-oncall.service
  curl -fsS http://127.0.0.1:9099/healthz
  ```

Details, alert rules and the runbook: `docs/engineering/OBSERVABILITY.md`; responder security model:
`oncall/README.md`. The recorded drill is `reports/observability-incident-drill-20261022.md`.

## 10. Security checklist

- [ ] `.env` is `chmod 600`, not in git, and contains no placeholder password.
- [ ] Only 22 (operator), 80 and 443 are open; 9090/9093/16686 are not reachable publicly.
- [ ] Caddy HSTS is on; the nginx CSP and `X-Content-Type-Options: nosniff` are present.
- [ ] Grafana anonymous access is Viewer only; the admin password is strong and not the default.
- [ ] GHCR packages are public or the VPS has a read-only login; no push token on the VPS.
- [ ] The deploy key is dedicated, not the operator's personal key; `VPS_KNOWN_HOSTS` was verified.
- [ ] `state/`, `backups/`, `oncall/incidents/`, `oncall/webhook-token` are gitignored.
- [ ] The public demo contains seeded photography only, with attribution in
      `scripts/demo/README.md`.

## 11. Known limits

- One VPS, no HA, no multi-region; the demo is best-effort for the course window.
- Jaeger keeps traces in memory; Prometheus keeps 15 days; Loki keeps 7 days.
- Caddy's certificate requires 80/443 to be reachable and the DNS record to be correct; the first
  issuance can take a minute.
- The automated rollback covers the API image only; a bad migration needs the backup and a human.
- The on-call responder is deterministic by design; it is not a general incident agent.
