---
paths:
  - "backend/**"
  - "_docs/openapi.yml"
---

# Backend rules — Spring Boot (loaded for backend/**)

## Package layout (`backend/src/main/java/com/aetherarchive/`)

```
AetherArchiveApplication.java
config/      WebMvcConfigurer, CORS, storage properties, JSON config
domain/      JPA entities + enums (ArchiveItem, Photo, ItemType)
repository/  Spring Data repositories
service/     business logic (StorageService, ArchiveService, DumpService, PaletteService?)
web/         REST controllers (v1)
dto/         request/response records + validation annotations
exception/   domain exceptions + @RestControllerAdvice (RFC 9457)
```

Controllers are thin: validate → call service → map to DTO. No business logic in controllers,
no entities in responses, no repository calls from controllers.

## Domain model

- `ArchiveItem`: `id` (UUID, generated in Java), `type` (`SINGLE_PIC | ANIME | MONTHLY_DUMP`),
  `title` (nullable), `timestamp` (Instant, UTC), `backgroundColor` (`#RRGGBB`).
- `Photo`: `id` (UUID), `archiveItem` (ManyToOne, non-null for items; nullable for unassigned photos),
  `localFilePath` (relative to the data root), `displayOrder` (Integer, 0-based).
- Enums persist as `STRING`. Timestamps are `Instant`/UTC. `@Version` for optimistic locking when a
  story mutates existing rows.
- Dumps: exactly **6** photos, `displayOrder` unique within a dump. Enforce in the service layer and
  in tests — never rely on the client.

## API rules

- Follow `_docs/openapi.yml` as the contract. Deviating requires updating the spec (ADR + user approval)
  in the same PR.
- Paths under `/api/v1`. `GET` endpoints: read-only, cacheable where sensible.
- Validation via `jakarta.validation` on DTOs: `title` ≤ 80 chars, `backgroundColor` matches
  `^#[0-9a-fA-F]{6}$`, `photoIds` exactly 6 distinct UUIDs, uploads ≤ `AETHER_MAX_UPLOAD_MB`.
- Errors: `@RestControllerAdvice` returning `ProblemDetail` (type, title, status, detail, instance,
  plus a stable `code`). No stack traces, no filesystem paths in messages.
- `GET /photos/random` returns 404 with a clear problem detail when the archive is empty (frontend
  handles it as an empty state, never as a crash).
- Sorting: the river is chronological, newest first (`timestamp DESC, id` as a stable tiebreaker).

## Storage

- `StorageService` owns the data directory (default `~/AetherArchive_Data`, configurable via
  `aether.storage.data-dir` from `AETHER_DATA_DIR`):
  `images/` (originals), `thumbnails/` (P1), `tmp/` (atomic write staging). The database is **not** a file
  here: PostgreSQL runs in its own Docker volume (ADR-009).
- Writes are atomic: write to `tmp/` then `Files.move(... , ATOMIC_MOVE)`. On failure, clean up `tmp/`.
- Filenames are UUIDs + validated extension. Original client filenames are stored only in metadata
  (if a story needs them), never used on disk.
- Static serving: `WebMvcConfigurer#addResourceHandlers` maps `/images/**` to
  `file:${dataDir}/images/`, plus `Cache-Control` headers. No directory listing.
- Deletion is soft (DB row) with a separate explicit "purge" action; never cascade-delete files
  implicitly.

## Persistence

- PostgreSQL 17 via Spring Data JPA (`org.postgresql:postgresql`); schema managed by Flyway migrations
  in `backend/src/main/resources/db/migration/V*.sql` (Postgres dialect). Never use
  `hibernate.ddl-auto=update` — `validate` everywhere.
- Dev server: `docker compose -f docker-compose.dev.yml up -d` (ADR-009 / E1-S11); connection from env
  (`.env.example`). No community dialects, no embedded-DB fallbacks.
- Repositories: derived queries or `@Query` with bound parameters. Never concatenate SQL.

## Tests (see `.claude/rules/testing.md`)

- `@WebMvcTest` per controller; `@DataJpaTest` for repositories against a real Postgres via Testcontainers
  (test-only dependency — justified in the PR); unit tests for services with `@TempDir`.
- At least one `@SpringBootTest` covering the dump creation flow end to end (HTTP → DB → files) —
  Testcontainers, no pre-running database required.

## Performance & logging

- Stream file responses; do not read whole images into memory.
- Generate thumbnails once, cache on disk, serve from `/images/thumbnails/**` (P1 story).
- Log one line per meaningful operation (upload stored, dump created) with the item id; never log
  file contents or absolute credentials. Use `INFO` in dev, keep the format grep-able.
