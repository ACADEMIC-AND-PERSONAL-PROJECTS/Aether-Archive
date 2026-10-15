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
    │   ├── application.yml          base config (port, datasource, storage dir, CORS)
    │   ├── application-<profile>.yml  dev · test · prod overrides
    │   └── db/migration/            Flyway migrations, V1__baseline.sql owns the schema
    └── test/java/com/aetherarchive/ JUnit 5 · @WebMvcTest slices · @DataJpaTest and @SpringBootTest
                                     against a throwaway PostgreSQL (Testcontainers)
```

## Requirements

- **JDK 21** — required by `java.version`; the build fails on older JDKs.
- **Docker** — the development database is a container, and the test suite starts its own throwaway
  PostgreSQL (Testcontainers). Nothing is skipped without it: a missing daemon fails the build.
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
the repository root, and the backend imports that same file (see *How the backend reads `.env`* below), so
both sides agree by construction. The database listens on **127.0.0.1 only** — never the LAN — and keeps
its data in the named volume `aether_pgdata`, which `docker compose … down` leaves untouched.

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

On the first boot against that database, Flyway applies `db/migration/V1__baseline.sql` and records it in
`flyway_schema_history`; afterwards Hibernate only checks that the entities still match the schema
(`ddl-auto=validate`) and never creates or alters a table. Restarting the backend is therefore safe: the
migration runs once and is then skipped.

### How the backend reads `.env`

Spring Boot does not read `.env` files — docker compose does — so `application.yml` imports it explicitly:

```yaml
spring:
  config:
    import:
      - optional:file:../.env[.properties]
      - optional:file:./.env[.properties]
```

What it does:

- Both paths are relative to the **working directory** and both are `optional:`, so the one that does not
  exist is simply skipped and nothing requires a `.env`: `../.env` is the repository root when you run
  `./mvnw spring-boot:run` from `backend/` (the documented flow), `./.env` covers a run from the repository
  root. If both exist, the second entry (`./.env`) wins where they disagree.
- The `[.properties]` hint makes Spring read the file as a Java properties file, which is exactly what the
  `KEY=value` lines of `.env.example` are. Dotted keys (`spring.datasource.url=…`) work as well.
- An imported value wins over the default `application.yml` writes for it — `.env` configures the run, it
  is not a fallback.
- The values are read **below** real environment variables and command-line arguments:
  `POSTGRES_USER=someone ./mvnw spring-boot:run` wins over `.env`.
- Only the keys the configuration actually asks for are looked up (`${POSTGRES_DB:aether}`,
  `${POSTGRES_USER:aether}`, `${POSTGRES_PASSWORD:change-me-local}`, `${AETHER_DB_PORT:5432}`,
  `${SPRING_DATASOURCE_URL:…}`, plus the E1-S2 storage and CORS keys) — the full list is the datasource and
  `aether` sections of `application.yml`, and every default matches `.env.example` and
  `docker-compose.dev.yml`.

What it does not do:

- It is not a dotenv parser: `export KEY=value`, shell-style quoting and a trailing `# comment` after a
  value are not part of the properties grammar. Lines it cannot read are ignored rather than guessed at;
  keep `.env` to `KEY=value` and comments on their own line.
- It never creates or writes `.env`. The file stays local and gitignored; the repository only carries
  `.env.example`.
- It does not decide which database the tests run against: they use their own PostgreSQL container
  (Testcontainers), whose connection details replace `spring.datasource.*` entirely, whatever `.env` says.
  The other keys reach the tests like anywhere else — the `test` profile overrides the data directory and
  the logging level, not every value.

## Configuration

Everything is env-driven: `SERVER_PORT`, `AETHER_DATA_DIR`, `AETHER_MAX_UPLOAD_MB`,
`AETHER_CORS_ALLOWED_ORIGINS` — the defaults live in `src/main/resources/application.yml`, the
documented keys in `.env.example`. The values are bound to typed properties at startup
(`config/StorageProperties`, `config/CorsProperties`) and validated before anything else happens: a
blank or relative `AETHER_DATA_DIR`, one pointing at the filesystem root or at the user's home
directory, an `AETHER_MAX_UPLOAD_MB` outside 1–1024, an `AETHER_CORS_ALLOWED_ORIGINS` entry that is not
a `scheme://host[:port]` pattern or whose host is only `*`, or a stray comma in that list, stop the boot
with a `Reason:` line.

### Database

The datasource is built from the same keys the compose file reads, with the same defaults, so an
unconfigured backend and an unconfigured container still meet:

| Key | Default | Meaning |
| --- | --- | --- |
| `SPRING_DATASOURCE_URL` | built from the keys below | full JDBC override, when the pieces are not enough |
| `POSTGRES_DB` | `aether` | database name |
| `POSTGRES_USER` | `aether` | role |
| `POSTGRES_PASSWORD` | `change-me-local` | password (a placeholder: change it in `.env`) |
| `AETHER_DB_PORT` | `5432` | host port `docker-compose.dev.yml` publishes on 127.0.0.1 |

The default URL is `jdbc:postgresql://localhost:${AETHER_DB_PORT}/${POSTGRES_DB}`. The schema is
Flyway's: `src/main/resources/db/migration/V*.sql` is applied at startup, and Hibernate runs with
`ddl-auto=validate` — it refuses to map an entity to a table that is not there, but it never creates or
changes one. A new table or column means a new migration file, not an annotation change.

## Tests

`./mvnw test` needs Docker, nothing else: every context-booting test runs against a throwaway
PostgreSQL container (`postgres:17-alpine`, the same tag as the dev database, ADR-009) that
`support/PostgresTestConfiguration` hands to Spring via `@ServiceConnection`. Flyway applies the real
migration to it and `ddl-auto=validate` then runs against the real schema, so a drift between the
entities and `db/migration` fails the suite. Docker must be running: a missing daemon fails the build
loudly rather than skipping the database tests. Each test context gets its own container, and
Testcontainers removes them when the run is over — nothing to stop by hand, nothing left behind.

### Data directory

`AETHER_DATA_DIR` must be absolute, must not be the filesystem root and must not be the user's home
directory itself: the boot creates `images/`, `thumbnails/` and `tmp/` inside it and empties `tmp/` on
every start, which neither of those two locations is meant for (default `~/AetherArchive_Data`):

```text
${AETHER_DATA_DIR}/
├── images/       originals, named <uuid>.<ext>
├── thumbnails/   generated derivatives (E5-S3)
└── tmp/          staging for atomic writes; emptied on every boot
```

`StorageInitializer` creates the three subdirectories (idempotently), writes and deletes a probe file in
each of them to prove they are really writable, and clears `tmp/` — it only ever holds incomplete
staging artefacts, never user data. `tmp/` must be a real directory: a `tmp/` that is itself a symbolic
link would send that cleanup into whatever it points at, so the boot refuses it instead of following the
link (the data directory itself may be a symlink, e.g. `~/AetherArchive_Data -> /mnt/archive`). When any
of that fails the application does not start: it logs

```text
Aether Archive cannot start: failed to create the directory '<path>' (<reason>).
Check AETHER_DATA_DIR and that this process can write to the data directory.
```

and exits with status `1`. CORS takes Spring origin *patterns*, so the documented
`http://192.168.*.*:5173` works, while a `*` host (`https://*`) is rejected at boot because it matches
every origin; an empty `AETHER_CORS_ALLOWED_ORIGINS` disables cross-origin access entirely (a stray comma
is an error, not an empty value), and requests from any other origin are rejected by Spring with
`403 Invalid CORS request`.

Rules: `.claude/rules/backend.md` · security: `.claude/rules/security.md` · tests: `.claude/rules/testing.md`.
Contract: `_docs/openapi.yml` (read-only).
