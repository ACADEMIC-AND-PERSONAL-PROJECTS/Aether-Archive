# Deployment & containers — Aether Archive

> Status: **TARGET** — written ahead of E6-S11/S12; update it to the shipped reality in the same PR that
> containerizes the stack. Decisions: `ADR-009` (PostgreSQL), `ADR-010` (containerized delivery).

## 1. Target topology (v1.0)

```text
Phone (LAN)                Owner's machine — docker compose
┌─────────┐   :3000    ┌──────────────────────────────────────────────┐
│ browser │ ─────────▶ │ web (nginx)                                  │
└─────────┘            │  ├── serves the built SPA                    │
                       │  └── proxies /api/** and /images/** ──┐      │
                       │                                       ▼      │
                       │                     api (Spring Boot) :8080  │
                       │                          │ JDBC              │
                       │                     db (PostgreSQL 17) :5432  │
                       │  volumes: aether_pgdata · AETHER_DATA_DIR ◀──┘
                       └──────────────────────────────────────────────┘
```

One published port (`3000`) → one origin for the phone → **no CORS in the containerized runtime**.
Nothing leaves the machine: builds may pull base images, the running stack makes zero external requests.

## 2. Services

| Service | Image / build | Ports | Volumes | Notes |
| --- | --- | --- | --- | --- |
| `db` | `postgres:17-alpine` (pinned) | internal 5432 | `aether_pgdata` named volume | `POSTGRES_*` from `.env`; `pg_isready` healthcheck |
| `api` | build `backend/` (multi-stage: Maven → Temurin 21 JRE) | internal 8080 | bind mount of `${AETHER_DATA_DIR}` (images) | `depends_on: db (healthy)`; HTTP healthcheck; **`SPRING_PROFILES_ACTIVE=prod`** (the app defaults to `dev`, so the container must set it) |
| `web` | build `frontend/` (multi-stage: Node build → nginx) | `3000` published (LAN) | — | serves the SPA; proxies `/api/**` and `/images/**` to `api` |

Exact base image tags are pinned at implementation time (major.minor at least, **never `:latest`**) and
recorded in the PR.

## 3. Hard requirements

1. **One command**: from a clean clone, `cp .env.example .env && docker compose up` runs everything.
2. **Pinned bases**, multi-stage builds, a `.dockerignore` per build context, no secrets in image layers.
3. **Non-root** processes where practical (dedicated user in `api`; `nginx-unprivileged` or equivalent for `web`).
4. **Offline at runtime**: no external requests from any container; fonts/icons bundled (ADR-005).
5. **Data survives**: database data in the named volume; images in `AETHER_DATA_DIR`;
   `docker compose down` must never remove volumes.
6. **Healthchecks** for `db` and `api`; `web` starts only after `api` is healthy.
7. **Configuration only via env** (`.env`); nothing environment-specific baked into images.
8. **Dev stays native**: Sprints 1–5 use `docker-compose.dev.yml` (db only) + `./mvnw` + `npm run dev`.

## 4. Verification (acceptance for E6-S11/S12)

- [ ] Clean clone → `cp .env.example .env` → `docker compose up` → app opens on the phone at
      `http://<LAN-IP>:3000` (evidence in the PR).
- [ ] `docker compose down && docker compose up` keeps the archive intact.
- [ ] Backup/restore (E6-S7) works against the containers (`pg_dump`/`psql` via `docker compose exec`).
- [ ] Image rebuild is reproducible: `docker compose build` run twice behaves identically.
- [ ] `ARCHITECTURE.md` §8 and the README reflect the shipped commands.

## 5. Non-goals

Registry publishing, Kubernetes, remote deployment, TLS/auth (single user on a trusted LAN — ADR-008),
multi-arch images beyond the owner's machine. Anything beyond these needs a new ADR.
