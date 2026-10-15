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
    └── test/java/com/aetherarchive/ JUnit 5 · @SpringBootTest · @WebMvcTest (controller slices grow with E1-S6)
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

The container reads `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` and `AETHER_DB_PORT` from `.env` at
the repository root; the backend reads the same keys from its environment — and from that file once E1-S3
wires the local `.env` into the dev run. Both sides therefore agree by construction. The database listens on
**127.0.0.1 only** — never the LAN — and keeps its data in the named volume `aether_pgdata`, which
`docker compose … down` leaves untouched.

`POSTGRES_*` takes effect on the container's **first** initialisation of that volume: changing it later does
not rename an existing role or database, and the backend would fail to authenticate. Fix that inside `psql`
(`ALTER ROLE …`) rather than with `down -v`, which deletes the archive.

`docker compose -f docker-compose.dev.yml down` stops it and keeps the data; only `down -v` deletes the
archive. Inspect it with (the values come from the environment inside the container, so this works whatever
`POSTGRES_*` you set):

```bash
docker compose -f docker-compose.dev.yml exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

(The quoting is deliberate: `$POSTGRES_USER` is expanded *inside* the container, from its own environment.
Written unquoted on the host it would expand to nothing, since those variables live in `.env`, not in your
shell.)

If port 5432 is already taken by another PostgreSQL, set `AETHER_DB_PORT=5433` in `.env`.

The backend does not connect to it yet: the JDBC driver, datasource and Flyway arrive in **E1-S3**, which is
also where the local `.env` import lands. Until then `./mvnw spring-boot:run` runs on the defaults in
`application.yml` and needs no `.env` at all.

## Configuration

Everything is env-driven: `SERVER_PORT`, `AETHER_DATA_DIR`, `AETHER_MAX_UPLOAD_MB`,
`AETHER_CORS_ALLOWED_ORIGINS` — the defaults live in `src/main/resources/application.yml`, the
documented keys in `.env.example`. The values are bound to typed properties at startup
(`config/StorageProperties`, `config/CorsProperties`) and validated before anything else happens: a
blank or relative `AETHER_DATA_DIR`, an `AETHER_MAX_UPLOAD_MB` outside 1–1024, or an origin that is not
a `scheme://host[:port]` pattern stop the boot with a `Reason:` line. PostgreSQL + Flyway arrive with
E1-S3.

### Data directory

`AETHER_DATA_DIR` must be absolute and outside the repository (default `~/AetherArchive_Data`):

```text
${AETHER_DATA_DIR}/
├── images/       originals, named <uuid>.<ext>
├── thumbnails/   generated derivatives (E5-S3)
└── tmp/          staging for atomic writes; emptied on every boot
```

`StorageInitializer` creates the three subdirectories (idempotently), writes and deletes a probe file
to prove the directory is really writable, and clears `tmp/` — it only ever holds incomplete staging
artefacts, never user data. When any of that fails the application does not start: it logs

```text
Aether Archive cannot start: failed to create the directory '<path>' (<reason>).
Check AETHER_DATA_DIR and that this process can write to the data directory.
```

and exits with status `1`. CORS takes Spring origin *patterns*, so the documented
`http://192.168.*.*:5173` works; an empty `AETHER_CORS_ALLOWED_ORIGINS` disables cross-origin access
entirely, and requests from any other origin are rejected by Spring with `403 Invalid CORS request`.

Rules: `.claude/rules/backend.md` · security: `.claude/rules/security.md` · tests: `.claude/rules/testing.md`.
Contract: `_docs/openapi.yml` (read-only).
