# Backend — Spring Boot

Java 21 · Spring Boot 3, built with the committed Maven wrapper (Maven 3.9.16).
The API listens on `http://localhost:8080` and is local-first: nothing leaves the machine at runtime.

```text
backend/
├── mvnw, mvnw.cmd, .mvn/wrapper/    Maven wrapper (committed)
├── pom.xml                          Java 21 · Spring Boot 3
└── src/
    ├── main/java/com/aetherarchive/
    │   ├── AetherArchiveApplication   @SpringBootApplication entry point
    │   ├── config/                  WebMvc, CORS, storage properties
    │   ├── domain/                  ArchiveItem, Photo, enums
    │   ├── repository/              Spring Data repositories
    │   ├── service/                 StorageService, ArchiveService, DumpService
    │   ├── web/                     REST controllers (/api/v1)
    │   ├── dto/                     request/response records
    │   └── exception/               RFC 9457 error handling
    ├── main/resources/
    │   ├── application.yml          base config (port, storage dir, CORS)
    │   └── application-<profile>.yml  dev · test · prod overrides
    └── test/java/com/aetherarchive/ JUnit 5 · @SpringBootTest (MockMvc arrives with the controllers)
```

## Requirements

- **JDK 21** — required by `java.version`; the build fails on older JDKs.
- Network access the first time Maven resolves dependencies; afterwards the local `~/.m2` cache is enough.

## Commands

Run from `backend/`:

| Command | Purpose |
| --- | --- |
| `./mvnw spring-boot:run` | Start the API on `:8080` (`dev` profile) |
| `./mvnw test` | Run the test suite |
| `./mvnw verify` | Full build + tests (run this before a commit) |
| `./mvnw package` | Build the runnable jar into `target/` |

Profiles: `dev` (default via `spring.profiles.default`), `test`, `prod`. An explicit
`SPRING_PROFILES_ACTIVE` wins over the default.

## Dev database

The development database is a PostgreSQL 17 container (ADR-009). Start it once per machine:

```bash
cp .env.example .env                                        # from the repository root
docker compose -f docker-compose.dev.yml up -d              # start (root of the repository)
docker compose -f docker-compose.dev.yml ps                 # wait for "healthy"
```

The container reads `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` and `AETHER_DB_PORT` from the same
`.env` the backend uses, so both sides always agree. It listens on **127.0.0.1 only** — never the LAN — and
keeps its data in the named volume `aether_pgdata`, which `docker compose … down` leaves untouched.

`docker compose -f docker-compose.dev.yml down` stops it and keeps the data; only `down -v` deletes the
archive. Inspect it with:

```bash
docker compose -f docker-compose.dev.yml exec db psql -U aether -d aether
```

The backend does not connect to it yet: the JDBC driver, datasource and Flyway arrive in **E1-S3**, at which
point `./mvnw spring-boot:run` will use the values documented in `.env.example` with no further setup.

## Configuration

Everything is env-driven: `SERVER_PORT`, `AETHER_DATA_DIR`, `AETHER_MAX_UPLOAD_MB`,
`AETHER_CORS_ALLOWED_ORIGINS` — the defaults live in `src/main/resources/application.yml`, the
documented keys in `.env.example`. Typed binding and startup validation arrive with E1-S2;
PostgreSQL + Flyway with E1-S3.

Rules: `.claude/rules/backend.md` · security: `.claude/rules/security.md` · tests: `.claude/rules/testing.md`.
Contract: `_docs/openapi.yml` (read-only).
