# Architecture — Aether Archive

> Status: **target architecture**. It describes what the sprints build; sections are marked `TARGET` until
> the corresponding story lands. Keep it honest: when reality diverges, update this file in the same PR.

## 1. Context

Aether Archive is a **single-user, local-first** application. One machine (the owner's) runs both the
backend and the frontend build; a phone on the same LAN opens the app in a browser. Nothing leaves the
machine: no cloud, no external request at runtime, no telemetry.

```text
┌──────────────┐        LAN (http://192.168.x.x:8080)        ┌───────────────────────────┐
│   Phone      │ ──────────────────────────────────────────▶ │  Owner's machine          │
│  (browser)   │ ◀────────────────────────────────────────── │                           │
└──────────────┘                                             │  ┌─────────────────────┐  │
                                                             │  │ Spring Boot :8080   │  │
   Static frontend (built bundle, served locally)  ────────▶ │  │  /api/v1   REST     │  │
                                                             │  │  /images/** files   │  │
                                                             │  └─────────┬───────────┘  │
                                                             │            │ JDBC          │
                                                             │  ┌─────────▼───────────┐  │
                                                             │  │ Postgres (Docker)    │  │
                                                             │  └─────────────────────┘  │
                                                             │  ┌─────────────────────┐  │
                                                             │  │ Data dir (files)     │  │
                                                             │  │  images/ thumbnails/ │  │
                                                             │  └─────────────────────┘  │
                                                             └───────────────────────────┘
```

## 2. Components

| Component | Technology | Responsibility |
| --- | --- | --- |
| **Web app** | React + Vite + TS + Tailwind + Framer Motion + `@dnd-kit` | Splash, glass menu, river, workshop; colour extraction; theme generation |
| **API** | Spring Boot 3, Java 21 | REST `/api/v1`, validation, RFC 9457 errors, image serving |
| **Storage service** | Java NIO | Owns the data directory: atomic writes, UUID names, path safety, (later) thumbnails |
| **Database** | PostgreSQL 17 (Docker) + Flyway | Archive items and photos; schema migrations |
| **Agent layer** | `.claude/` | Rules, skills, hooks, subagents — how the work is performed |

## 3. Domain model (target)

```text
ArchiveItem
  id             UUID (generated in Java)
  type           SINGLE_PIC | ANIME | MONTHLY_DUMP
  title          string? (≤ 80)
  timestamp      Instant (UTC)
  backgroundColor #RRGGBB   (the "aura" of a dump; used by the river background)

Photo
  id             UUID
  archiveItem    → ArchiveItem (nullable: uploaded but not yet curated)
  localFilePath  string (relative to the data root, e.g. "images/<uuid>.jpg")
  displayOrder   int (0-based; unique within a dump)
```

Rules: a dump has exactly **6** photos, `displayOrder` 0–5 follows the curation order, and a photo
belongs to at most one dump. Deleting is soft (DB row) with an explicit purge action.

## 4. API surface

Contract: `_docs/openapi.yml` (read-only, canonical).

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/photos` | River feed, newest first |
| `POST` | `/api/v1/photos` | Upload one photo (multipart, category) |
| `GET` | `/api/v1/photos/random` | Splash hero; 404 when the archive is empty |
| `GET` | `/api/v1/dumps` | Dumps with their ordered photos |
| `POST` | `/api/v1/dumps` | Publish a dump (exactly 6 ordered ids + aura colour) |
| `GET` | `/images/**` | Static images served from the data directory |

## 5. Storage layout (local)

```text
${AETHER_DATA_DIR}/            default ~/AetherArchive_Data  (never committed)
├── images/                    originals, named <uuid>.<ext>
├── thumbnails/                generated derivatives (E5-S3)
└── tmp/                       staging for atomic writes; emptied on boot
```

The database is not a file here anymore: PostgreSQL runs in a Docker volume (ADR-009).

## 6. Frontend structure (target)

```text
frontend/src/
├── app/            routing, providers, shell
├── features/
│   ├── splash/     immersive entry view
│   ├── menu/       glass overlay
│   ├── river/      chronological feed + ambient background
│   └── workshop/   upload, ordering, aura colour, publish
├── components/     GlassPanel and shared primitives
├── lib/
│   ├── color/      dominant-colour extraction + theme generation (pure, tested)
│   ├── image/      downscale, placeholders
│   └── motion/     tokens and variants
├── api/            typed client + query keys/hooks
├── hooks/          reusable hooks
├── types/          shared types mirroring the OpenAPI schemas
└── styles/         global.css (tokens, typography), theme.css, glass.css
```

## 7. Cross-cutting concerns

| Concern | Approach |
| --- | --- |
| **Errors** | Backend: RFC 9457 `ProblemDetail` with a stable `code`. Frontend: quiet, actionable states — never raw messages. |
| **Validation** | Server-side authoritative (Jakarta Validation + service rules); client-side mirrors it for fast feedback. |
| **Security** | Local-only threat model: upload safety, path traversal guards, no secrets, no external calls (`ADR-008`). |
| **Performance** | Mobile budget: LCP < 1.5 s over LAN, no layout shift, lazy images, ≤ 64 px downscale for extraction. |
| **Accessibility** | WCAG 2.2 AA target for interactive UI: focus trap, keyboard paths, ≥ 4.5:1 contrast, reduced motion. |
| **Observability** | Log lines per meaningful operation; no telemetry; verification evidence lands in `reports/`. |
| **Process** | SCRUM artefacts in-repo, one story per branch, merge commits, retro per sprint (`ADR-002`, `ADR-003`, `ADR-007`). |

## 8. Deployment / runbook

**Development (Sprints 1–5)** — database container + native toolchains:

```bash
docker compose -f docker-compose.dev.yml up -d          # PostgreSQL 17
cd backend && ./mvnw spring-boot:run                    # API + images on :8080
cd frontend && npm install && npm run dev -- --host     # Vite :5173 for the phone
```

**v1.0 (target, E6-S11/S12)** — the whole stack as containers, one command:

```bash
cp .env.example .env && docker compose up
# Phone: http://<LAN-IP>:3000 (nginx serves the SPA and proxies /api + /images)
```

Backup = `pg_dump` of the database + a copy of `images/` (scripted in E6-S7, documented in E6-S6).
Full container requirements: `docs/engineering/DEPLOYMENT.md`.

## 9. Known open decisions

Tracked in `docs/scrum/DECISION-LOG.md`: extraction algorithm details (E2-S4), thumbnails vs originals
(E5-S3), feed virtualisation threshold (E5-S4), auth if ever exposed beyond the LAN (`ADR-008`).
