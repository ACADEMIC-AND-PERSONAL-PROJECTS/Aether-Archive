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
    │   ├── config/                  WebMvc, CORS, storage properties, multipart ceilings
    │   ├── domain/                  ArchiveItem, Photo, enums
    │   ├── repository/              Spring Data repositories
    │   ├── service/                 StorageService, ArchiveService, DumpService
    │   ├── web/                     REST controllers (/api/v1)
    │   ├── dto/                     request/response records
    │   └── exception/               RFC 9457 error handling
    ├── main/resources/
    │   ├── application.yml          base config (port, datasource, storage dir, CORS)
    │   ├── application-<profile>.yml  dev · test · prod overrides
    │   └── db/migration/            Flyway migrations: V1 creates the schema, V2 tightens it
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

On the first boot against that database, Flyway applies the migrations in `db/migration/` (V1 creates the
tables, V2 tightens their constraints) and records them in `flyway_schema_history`; afterwards Hibernate
only checks that the entities still match the schema (`ddl-auto=validate`) and never creates or alters a
table. Restarting the backend is therefore safe: a migration runs once and is then skipped.

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

- Both paths are relative to the **working directory of the JVM** — where you start the process, not where
  the application or its `pom.xml` lives — and both are `optional:`, so the file that does not exist is
  simply skipped and nothing requires a `.env`: `../.env` is the repository root when you run
  `./mvnw spring-boot:run` from `backend/` (the documented flow), `./.env` covers a run from the repository
  root. Those two are the supported working directories; started from anywhere else, the parent entry
  imports whatever file happens to sit one level above that directory — an unrelated project's `.env` would
  be read without a word. If both entries exist, the second (`./.env`) wins where they disagree.
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

- It is a Java properties file, not a dotenv parser, and the two grammars disagree where it hurts:
  `export KEY=value` and shell-style quoting are not part of it, a trailing `# comment` stays in the value,
  and `\` starts an escape sequence — `AETHER_DATA_DIR=C:\Users\me\data` is read as `C:Usersmedata`, with
  the separators gone, while a lowercase `\u` not followed by four hex digits is not skipped: it aborts the
  boot with `Malformed \uxxxx encoding`. The file is also decoded as ISO-8859-1, the properties encoding, so
  a non-ASCII character has to be written as a `\uXXXX` escape. Use `/` as the separator (or `\\`) and keep
  `.env` to `KEY=value` with comments on their own line.
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

## API

Everything lives under `/api/v1` and answers JSON. The photo endpoints (E1-S6):

| Method | Path | Answers |
| --- | --- | --- |
| `POST` | `/api/v1/photos` | `201` with the created photo; the body is `multipart/form-data` |
| `GET` | `/api/v1/photos` | the feed: every photo, newest first |
| `GET` | `/api/v1/photos/random` | one photo, or `404` with the `empty-archive` code when the archive holds none |

The upload takes two parts: `file`, the image itself, and `category`, one of `pics`, `anime`, `dump`,
`uncategorized` — lowercase, exactly as `_docs/openapi.yml` spells them (ADR-011). An accepted upload is
recorded *unassigned*: the photo belongs to no archive item and has no display order until a later story
curates it. A photo is answered as:

```json
{
  "id": "0b40e720-3a1f-4ce0-a21c-d163454cfd94",
  "url": "/images/0b40e720-3a1f-4ce0-a21c-d163454cfd94.png",
  "category": "pics",
  "uploadedAt": "2026-10-16T00:03:15.578182Z"
}
```

`url` is relative to the API host and names the file's generated UUID under the data directory's
`images/` folder — it is not a filesystem location and not an external address. Serving it is E1-S5
(Sprint 2): until that resource handler lands the archive knows the name, and no endpoint serves the
bytes. `uploadedAt` is the row's `created_at` in UTC, at the precision PostgreSQL keeps (microseconds);
the feed and the `201` that created a photo therefore name the same instant.

What an upload can answer besides the `201`:

| Status | `code` | When |
| --- | --- | --- |
| `400` | `validation-failure` | `category` is absent, blank or not one of the four values; `errors` names the field |
| `400` | `missing-request-part` | the request carries no `file` part |
| `400` | `invalid-parameter` | the field arrived as a file part, as `curl -F "category=@values.txt"` posts it |
| `413` | `upload-too-large` | the upload is over `AETHER_MAX_UPLOAD_MB`, at either ceiling |
| `415` | `unsupported-image-type` | the bytes are not an accepted image, or the declared type contradicts them |

The feed is ordered `created_at DESC, id DESC`: the id is the stability the instants alone cannot give,
because two uploads can share one. `GET /photos/random` picks with `order by random()` over the whole
table — a single owner curates one archive, so the cost of that scan is not worth the machinery of a
better method.

## Uploads

`StorageService.store(MultipartFile)` is the only way bytes reach the disk, and it trusts nothing about
an upload: the client's file name is discarded, and the declared media type is only checked *against*
the bytes. An upload is accepted when, in order:

1. it is not empty;
2. it declares an accepted image media type — `image/jpeg` (or `image/jpg`), `image/png`, `image/gif`,
   `image/webp`, `image/avif`; case and parameters (`; charset=…`) are ignored, a missing type is refused;
3. its first bytes carry the signature of that same format;
4. it fits in `AETHER_MAX_UPLOAD_MB`.

| Format | Signature (at offset 0 unless stated) |
| --- | --- |
| JPEG | `FF D8 FF` |
| PNG | `89 50 4E 47 0D 0A 1A 0A` |
| GIF | `GIF87a` or `GIF89a` |
| WEBP | `RIFF` at 0 and `WEBP` at 8 |
| AVIF | an `ftyp` box at 0 whose major brand (at 8) or compatible brands are `avif` or `avis` |

Anything else is refused. `service/ImageFormat` is the single source of truth for signatures, extensions
and media types, and the stored extension is the one of the *sniffed* format: a text file named
`holiday.jpg` is refused, a JPEG named `holiday.png` lands as `.jpg`. The AVIF box is parsed rather than
probed at a fixed offset: its declared length bounds the brand walk, the walk also stops at the bytes that
were read, and a box too short to carry a brand — or truncated — is refused. A file majoring in `mif1`
with `avif`/`avis` among its compatible brands is an AVIF, as HEIF tooling writes them.

The name on disk is `<uuid>.<ext>` — never the client's. Writes are atomic and durable: the bytes go to a
temporary file in `tmp/` (same filesystem) through a synchronised stream and are moved into `images/` with
`ATOMIC_MOVE`, so a reader sees either the whole file or none of it and a power loss cannot publish a
correctly named file with unflushed content; every failure path deletes the temporary file, and a failed
store leaves `tmp/` empty. The moved file keeps the owner-only mode (`0600`) `createTempFile` gives the
staged one: the archive's images are readable by the user running the backend and nobody else, which is
the same user that serves `/images/**` (E1-S5) and writes the backups (E6-S7) — a deployment that served
or backed up the data directory as another user would have to revisit that. Before writing, the
destination is resolved and checked to stay inside the data directory: `../` in a client file name is
inert, and an `images/` or `tmp/` symlinked *outside* the data directory is refused, while a link that
stays inside it is accepted (the data directory itself may be a symlink, ADR-012).

The size limit is enforced twice, from the same key. The container's ceilings are computed by
`config/MultipartConfig` from `AETHER_MAX_UPLOAD_MB` — `spring.servlet.multipart.*` is deliberately left
unset, so the bean is the one source of truth: the file ceiling is the configured maximum itself, and the
request ceiling is that plus a megabyte of headroom for the multipart envelope (boundaries, part headers,
the `category` field), because with equal ceilings the container refuses a file *at* the documented limit
before the service ever sees it. Parts are staged on disk from their first byte, never buffered in
memory. The service then counts the bytes it actually copies rather than trusting `Content-Length` or
`getSize()`, so a client that under-reports its length still hits the ceiling. A request over either
ceiling is refused by the container with a `413` carrying the same `code` as the service's own refusal
(see *Errors*): one upload behaves the same whichever of the two ceilings caught it.

Refusals throw `UnsupportedImageTypeException`, `UploadTooLargeException` or `StorageException`, each
carrying a stable `code` (`unsupported-image-type`, `upload-too-large`, `storage-failure`) that
`ApiExceptionHandler` turns into an RFC 9457 problem detail (see *Errors*). No message contains a
filesystem path — the operator finds paths in the log.

A flow that stores bytes and cannot finish removes them again: `StorageService.delete(StoredFile)` rebuilds
the file's name from its identifier and validated extension, proves the target stays inside `images/` and
removes it idempotently, so a retry cannot fail on work already done. An upload calls it when the row cannot
be saved (the `500` in *API*), which is what keeps an accepted upload from leaving an image no API can reach.

## Errors

Every failure leaves as an RFC 9457 problem detail in `application/problem+json`, produced by one
`@RestControllerAdvice` (`exception/ApiExceptionHandler`). A request whose body fails validation:

```json
{
  "type": "about:blank",
  "title": "Validation failed",
  "status": 400,
  "detail": "The request failed validation; the 'errors' collection lists the fields that were rejected.",
  "instance": "/api/v1/dumps",
  "code": "validation-failure",
  "errors": [
    { "field": "backgroundColor", "message": "must match \"^#[0-9a-fA-F]{6}$\"" },
    { "field": "title", "message": "size must be between 0 and 80" }
  ]
}
```

`type` is always `about:blank`: the archive has no error-documentation site to link, and RFC 9457 defines
that value as "nothing more to say about this problem". The machine-readable identity is `code` — switch
on it, never on `detail` or `title`, which are prose for the person fixing the request and may be reworded.
`instance` is the path the client asked for. `title` is a constant per situation and never an exception
message; `detail` is one sentence, taken from the domain exception when it has one fit for a client.

| `code` | Status | Meaning |
| --- | --- | --- |
| `unsupported-image-type` | 415 | an upload is not an accepted image format, by its declaration or by its bytes |
| `upload-too-large` | 413 | an upload over `AETHER_MAX_UPLOAD_MB`, refused by the service or the container's ceiling |
| `storage-failure` | 500 | the storage layer failed: an unreadable upload, an unusable data directory, a refused path |
| `validation-failure` | 400 | a body or a method call failed its Jakarta Validation constraints; the fields are listed |
| `invalid-parameter` | 400 | a path variable or request parameter does not parse as the type the endpoint declares, or a field arrived as a file part |
| `malformed-request` | 400 | the body is not JSON this endpoint can read, or a request declared multipart cannot be read as one |
| `missing-request-part` | 400 | a multipart request arrived without a part the endpoint requires |
| `not-found` | 404 | neither a controller nor a static resource serves the path |
| `empty-archive` | 404 | `/photos/random` found no photo: the archive holds none yet, which the frontend shows as an empty state |
| `internal-failure` | 500 | a bug: no handler above claimed the exception |

The table is the archive's own vocabulary (ADR-013). A refusal Spring raises before a controller runs
borrows its code from the status instead: the status name in kebab-case — `bad-request` for a required
parameter that is missing, `unsupported-media-type` for a `Content-Type` the endpoint does not take,
`method-not-allowed`, `not-acceptable` — and `request-rejected` when no status name describes it.

A validation failure lists the rejected fields in `errors`, so a client can mark them all at once instead
of resubmitting to discover the next one. Where the violation was found makes no difference to the client:
a request body, a handler parameter validated by Spring MVC itself, and an argument of a `@Validated` bean
all answer alike. The collection holds at most **10** entries — a request rejected on a hundred fields
still answers in one screen — and a violation with no field of its own, such as a class-level rule, is
reported against `request` rather than dropped. Each entry carries the `field` as the client wrote it and
the validator's `message`; the **rejected value itself is never echoed back** — a response body is copied
into logs and screenshots — with the one exception named below for an upload's declared media type.

A refusal the archive raises *itself*, after a controller saw the request — a 404 for a photo it does not
hold — is its own statement: its `detail` is answered as written, and the `code` its problem detail set,
when it set one. Only the refusals Spring MVC raises *before* a controller runs are flattened; those keep
the framework's status and its own headers — `405` with the `Allow` header carrying the verbs that work,
`406`, `415` — and take the status-derived code above, because their own message names converters and value
classes. Both stay refusals rather than becoming `500`, which would report the client's mistake as a
server failure.

**Nothing internal leaves the process.** No stack trace and no filesystem path, which
`.claude/rules/security.md` forbids, and no SQL, class or exception name either. The one value an error
response may repeat is the media type an upload declared, which the 415 refusal names back (stripped of
control characters and cut to 100 characters in `StorageService`) because a client cannot correct a
`Content-Type` it cannot see, and a declared label is not the picture's bytes. The 5xx
cases log the stack trace (`StorageException` and anything unclaimed), and the operator reads the cause
there; even `StorageException`'s client-facing sentence is written without a path. The limits themselves are
constants in `dto/ValidationConstraints` (title ≤ 80, `#RRGGBB`, exactly six photo ids), referenced from the
DTO annotations so the annotation, the message and the test cannot drift.

The codes are a stable vocabulary: renaming one is a contract change with an ADR, not a refactor.
`_docs/openapi.yml` fixes the statuses it documents — the `400` of `POST /dumps` is the
`validation-failure` above — but carries no error schema, so this table is where the vocabulary is written
down; moving it into the spec is a contract change and needs an ADR.

## Tests

A `@WebMvcTest` slice loads the web layer and its advice but not the typed configuration properties those
beans are built from, so a slice that expects an error response needs
`@EnableConfigurationProperties({ StorageProperties.class, CorsProperties.class })` — without it the context
fails on the advice's constructor, not on the test.

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
