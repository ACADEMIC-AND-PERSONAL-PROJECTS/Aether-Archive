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

## Sample data & smoke checks

Two scripts turn a running dev backend into a demo archive, and then walk the whole API — the
"one command away" flow of E1-S10 (from the repository root):

```bash
# Terminal 1 — the backend, on a scratch data directory (never the real archive):
(cd backend && AETHER_DATA_DIR=/tmp/aether-dev ./mvnw spring-boot:run)

# Terminal 2 — twelve sample photos and a dump, then the contract walk:
AETHER_DATA_DIR=/tmp/aether-dev scripts/dev/seed.sh
AETHER_DATA_DIR=/tmp/aether-dev scripts/dev/smoke.sh
```

- `scripts/dev/seed.sh` uploads N deterministic sample photos — 96×64 PNGs written locally by
  `scripts/dev/sample-photos.py`, standard library only, no image dependency — cycling the four
  categories, then publishes one dump whose six photos are evenly spaced over the batch.
  `--count` (default 12, minimum 6), `--base-url` (default `http://localhost:8080`).
- `scripts/dev/smoke.sh` covers **every endpoint including failure paths**: the reads, the six
  upload refusals (missing file part; missing, invalid or file-part `category`; empty and
  non-image bytes; a declared type contradicting the bytes; a JSON content type), the dump
  refusals (malformed JSON, a colour that is not `#RRGGBB`, five ids, a repeated id, unknown
  ids), the 404 / 405 cases, and a full write round-trip — its own six uploads, a dump of
  them, the read-back and the stored image's bytes compared with the file that was sent. Every
  check asserts the status, the machine-readable `code` and the problem media type; any failed
  check exits non-zero.
- **`AETHER_DATA_DIR` is honoured, and the real archive is guarded.** Both scripts compute the
  effective data directory as `${AETHER_DATA_DIR:-$HOME/AetherArchive_Data}` — the same
  semantics the backend binds — and refuse to run against `~/AetherArchive_Data` unless
  `--force` is passed. Export the scratch value for the backend *and* for the scripts, or the
  guard cannot know the truth.
- Both scripts are safe to run twice: a second run adds a fresh batch (smoke adds its six
  photos and a dump per run); nothing is overwritten, moved or deleted. They need `curl` and
  `python3` (standard library only) and a reachable backend.

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
`images/` folder — it is not a filesystem location and not an external address, and it is a path a browser
loads: E1-S5 serves it (see *Serving images*). `uploadedAt` is the row's `created_at` in UTC, at the
precision PostgreSQL keeps (microseconds);
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

The dump endpoints (E1-S7):

| Method | Path | Answers |
| --- | --- | --- |
| `POST` | `/api/v1/dumps` | `201` with the created dump; the body is JSON |
| `GET` | `/api/v1/dumps` | every dump, newest first, each with its six photos in order |

A publish names six photos that are already in the archive — uploads, still uncurated — in the order the
dump displays them:

```json
{
  "title": "Octobre",
  "backgroundColor": "#2E4A62",
  "photoIds": [
    "0b40e720-3a1f-4ce0-a21c-d163454cfd94",
    "2f9a1c04-5b7e-4d38-9a11-0e6c7b2d4a58",
    "6c1d8ab3-90e2-4f77-8c31-5b0a2d9e7f14",
    "a3f5c207-1d64-4b8a-9e02-77c4d1b65a39",
    "cd8b4410-6e29-4a55-93f7-2b6e0c8d1a70",
    "f27e6d95-3c48-4e11-b8a6-4d9f5c2b7e83"
  ]
}
```

`title` is optional (ADR-011: the schema lists it required, the API accepts its absence and answers
`null`); `backgroundColor` is a `#RRGGBB` value; `photoIds` holds exactly six identifiers. A publish
creates one archive item of type `MONTHLY_DUMP` and attaches the six photos to it with display orders
`0..5`, in the order the array names them. The answer is the contract's `Dump`:

```json
{
  "id": "9d1c2a02-8f14-4d0f-bb52-1f2a3c4d5e6f",
  "title": "Octobre",
  "backgroundColor": "#2E4A62",
  "photos": [
    { "id": "0b40e720-3a1f-4ce0-a21c-d163454cfd94",
      "url": "/images/0b40e720-3a1f-4ce0-a21c-d163454cfd94.png",
      "category": "dump", "uploadedAt": "2026-10-16T00:03:15.578182Z" },
    { "id": "2f9a1c04-5b7e-4d38-9a11-0e6c7b2d4a58",
      "url": "/images/2f9a1c04-5b7e-4d38-9a11-0e6c7b2d4a58.jpg",
      "category": "dump", "uploadedAt": "2026-10-16T00:03:16.204917Z" },
    …four more photos, all in the shape above…
  ],
  "createdAt": "2026-10-16T09:30:45.123456Z"
}
```

(The response really carries all six, in the requested order; the array above is abbreviated to two
entries so the shape stays readable.)

**A dump's order is the position in `photos`, not a field.** The contract's `Photo` schema has four
properties, so no `displayOrder` is published: `photos[0]` is the first photo of the compilation, and the
position lives in the database (`photo.display_order`) and nowhere else (ADR-011 §3). `POST` echoes the
order it was asked for; `GET` reads the stored positions back, so the two agree by construction. The
listing is ordered `timestamp DESC, id DESC` like the photo feed, and `createdAt` is the row's `timestamp`
truncated to microseconds — the instant the `201` names is the instant every later read shows.

What a publish can answer besides the `201`:

| Status | `code` | When |
| --- | --- | --- |
| `400` | `validation-failure` | the body breaks a constraint: five or seven ids, a colour that is not `#RRGGBB`, a title over 80 characters |
| `400` | `validation-failure` | the six identifiers are not six *different* photos of the archive that are still uncurated |
| `409` | `concurrent-modification` | another write changed a row this publish was writing first; nothing was published |

The second row is the rule no annotation can state, and the service checks it before it writes anything: a
duplicate, an identifier no photo holds, and a photo that already belongs to another item are all refused
with the same 400 the body's own constraints produce, because the client's repair is the same — send a
different `photoIds`. Each violation names `photoIds` and the identifier at fault: an unknown id is a `400`
rather than a `404` because the path exists, it is the body that has to change, and a client that sent six
ids has no other way to learn which of them the archive could not match (see *Errors*). A photo already
curated is refused, never moved — moving it would empty the dump it came from.

`GET /api/v1/dumps` reads everything in two statements whatever the number of dumps: the items first,
then all of their photos in one batch, grouped in memory. No per-dump query and no lazy loading while
grouping; `DumpQueryTest` counts the statements against a real PostgreSQL so the constant stays true.

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

## Serving images

The `url` a photo is answered with is a `GET` that works (E1-S5): `config/ImageServingConfig` — a
`WebMvcConfigurer` — maps `/images/**` to `file:${AETHER_DATA_DIR}/images/`, the one directory
`StorageService` writes originals into, and to no other location. A stored file is answered with:

| Header | Value | Why |
| --- | --- | --- |
| `Content-Type` | the media type of the stored extension | decided by the name on disk, never by a request |
| `Cache-Control` | `max-age=31536000, public, immutable` | a UUID name never changes: one fetch per image, ever |
| `X-Content-Type-Options` | `nosniff` | the audit's SEC-N2: a browser renders the type above instead of guessing another |

The media types come from the platform's table, keyed by the same extension whitelist the upload path
writes: `.jpg` and `.jpeg` are `image/jpeg`, `.png` is `image/png`, `.gif` is `image/gif`, `.webp` is
`image/webp`, `.avif` is `image/avif`. Every extension `ImageFormat` can store has one, and
`ImageServingFlowTest` checks the serving map against `ImageFormat.acceptedExtensions()` rather than
against a list of its own — a format added to the enum fails the test until its media type is decided.
`X-Content-Type-Options` is added by an interceptor on the same path pattern, so it reaches the refusal
that answers a missing image as well as the file itself; the year-long cache is set by the resource
handler, so a refusal carries none of it (a 404 is not worth remembering), and neither answer contains a
filesystem path.

**A path that climbs out of `images/` is refused, by whichever layer sees it first.** A path that still
contains a `..` segment when it reaches the archive is not resolved at all — the archive answers its 404
rather than handing back a file of the data directory — while `%2f`, `%5c` and a null byte are refused by
Tomcat with a 400 before the servlet is reached. Neither answer repeats the contents of a file outside the
directory. `ImageServingFlowTest` pins sixteen of those paths, each with the status the running server
answers, plus two that name a file that really is stored, so a `..` tidied up before the lookup would fail
the test instead of passing unnoticed.

**There is no directory listing, with or without the trailing slash.** `GET /images`, `/images/`,
`/images/nested` and `/images/nested/` answer 404, like any other name that holds no file: the images
directory is a name space for the files the API published, not one a client can browse.

**A file the archive did not write is served with the type of its extension.** The upload path stores the
canonical extension of the sniffed format and nothing else, so a stored file is always one of the six
above; a file dropped into `images/` by hand is answered with the media type the platform's MIME table
gives that extension, which is not always `application/octet-stream` (`.xyz` is `chemical/x-xyz`, and a
`.html` would be `text/html`). Serving only the archive's own formats would be a decision of its own —
no request can currently place such a file — so it is stated rather than assumed.

Images are subject to the same CORS rule as the API (`AETHER_CORS_ALLOWED_ORIGINS`): an allowed origin
gets `Access-Control-Allow-Origin` on the image response, which is what a later story's colour extraction
needs — a canvas that reads an image's pixels without it is tainted. `thumbnails/` is not served yet:
E1-S5 maps `images/` only, and the story that serves derivatives adds its own mapping.

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
| `concurrent-modification` | 409 | another write changed the row this one was changing: read it again and retry |
| `internal-failure` | 500 | a bug: no handler above claimed the exception |

The table is the archive's own vocabulary (ADR-013). A refusal Spring raises before a controller runs
borrows its code from the status instead: the status name in kebab-case — `bad-request` for a required
parameter that is missing, `unsupported-media-type` for a `Content-Type` the endpoint does not take,
`method-not-allowed`, `not-acceptable` — and `request-rejected` when no status name describes it.

`concurrent-modification` is the table's first conflict code. The request was well formed and the archive
is intact — the write that lost the race rolled back whole, which is why the answer is not a `500` — but
another write changed the same row first, so the client reads it again and retries. A `400` would blame a
request that was perfectly valid, and a `500` would report an archive that nothing has broken: both send
the client looking for the wrong problem.

A validation failure lists the rejected fields in `errors`, so a client can mark them all at once instead
of resubmitting to discover the next one. Where the violation was found makes no difference to the client:
a request body, a handler parameter validated by Spring MVC itself, an argument of a `@Validated` bean,
and a `POST /dumps` the service refused all answer alike — the service's refusals are raised as
`DumpValidationException`, which this advice renders with the same status, code, detail and `errors` shape
as a body Jakarta Validation rejected. The collection holds at most **10** entries — a request rejected on
a hundred fields still answers in one screen — and a violation with no field of its own, such as a
class-level rule, is reported against `request` rather than dropped. Each entry carries the `field` as the
client wrote it and the validator's `message`; the **rejected value itself is never echoed back** — a
response body is copied into logs and screenshots — with the two exceptions named below: an upload's
declared media type, and the identifier of a photo a dump refused.

A refusal the archive raises *itself*, after a controller saw the request — a 404 for a photo it does not
hold — is its own statement: its `detail` is answered as written, and the `code` its problem detail set,
when it set one. Only the refusals Spring MVC raises *before* a controller runs are flattened; those keep
the framework's status and its own headers — `405` with the `Allow` header carrying the verbs that work,
`406`, `415` — and take the status-derived code above, because their own message names converters and value
classes. Both stay refusals rather than becoming `500`, which would report the client's mistake as a
server failure.

**Nothing internal leaves the process.** No stack trace and no filesystem path, which
`.claude/rules/security.md` forbids, and no SQL, class or exception name either. Two values an error
response may repeat, each because the client cannot identify what to correct without it: the media type an
upload declared, which the 415 refusal names back (stripped of control characters and cut to 100
characters in `StorageService`) — a declared label is not the picture's bytes — and, in a dump refusal, the
photo identifier that was not publishable, which is one of the six the client just sent. A rejected *value*
is otherwise never echoed. The 5xx
cases log the stack trace (`StorageException` and anything unclaimed), and the operator reads the cause
there; even `StorageException`'s client-facing sentence is written without a path. The limits themselves are
constants in `dto/ValidationConstraints` (title ≤ 80, `#RRGGBB`, exactly six photo ids), referenced from the
DTO annotations so the annotation, the message and the test cannot drift.

The codes are a stable vocabulary: renaming one is a contract change with an ADR, not a refactor.
`_docs/openapi.yml` fixes the statuses it documents — the `400` of `POST /dumps` is the
`validation-failure` above — but carries no error schema, so this table is where the vocabulary is written
down; moving it into the spec is a contract change and needs an ADR.

## Tests

`./mvnw verify` runs the whole suite; from the repository root that is
`mvn -f backend/pom.xml -B clean verify`. It needs Docker and nothing else — a missing daemon fails the
build loudly rather than skipping the database tests — and takes about 45–55 s on the development machine
(306 tests, 2026-10-16), depending on the class order and on what else the machine is doing: a loaded one
has been measured at 58 s. Treat 60 s as a ceiling that is close, not as headroom. Nothing in the suite
sleeps or reads the clock: time is injected, a fixed `Clock` per test.

Class order is the other half of that promise, and it is kept knowingly. Two pieces of global state are in
play: the Logback logger tree, which the whole JVM shares and whose root level every `test`-profile context
sets to `WARN` without restoring it, and the test databases below, where a context that names none is not
allowed to exist. So a test that captures a log pins that logger's level itself and puts back what it found
(`DumpServiceTest`) — a capture that trusted the level it inherited would pass or fail depending on which
class ran first. When you touch a test that reads global state, run the suite both ways —
`-Dsurefire.runOrder=alphabetical` and `-Dsurefire.runOrder=reversealphabetical` — because the default
order is the one your IDE and CI are least likely to reproduce.

Run it with `clean` whenever an IDE has been compiling the project. An IDE writes `target/classes` with
its own timestamps and its own compiler, and Maven's incremental check can then treat a stale
`target/test-classes` as up to date and skip recompiling it — the build goes green against classes that no
longer match the source (observed during E1-S7). `clean` costs a full compile and removes the doubt.

Three layers, each with the job it is there for:

- **Unit** — services and utilities, with `@TempDir` for anything that touches the filesystem
  (`StorageServiceTest`, `DumpServiceTest`, `PhotoServiceTest`, `ImageFormatTest`, `StorageInitializerTest`).
  No Spring context: these are the fast tests that name the rule itself.
- **Slice** — `@WebMvcTest` per controller family (`PhotoControllerTest`, `DumpControllerTest`), asserting
  the status and the exact body of every outcome the contract names, refusals included: `400`, `404`,
  `409`, `413`, `415`. `@DataJpaTest` for the repositories against the real PostgreSQL — the four classes
  share one context and one schema because their annotations are identical, and their assertions are about
  the whole archive (`DumpQueryTest` reads every dump there is).
- **Integration** — `@SpringBootTest` for the flows that cross HTTP, database and disk:
  `DumpApiFlowTest` is the one the backend rules ask to see end to end (six uploads through the photo API,
  the dump published from them, that dump read back, on a real Tomcat, the real data directory and a real
  PostgreSQL), plus `PhotoApiFlowTest`, `PhotoUploadCompensationTest`, `MultipartUploadCeilingTest` and
  `ImageServingFlowTest` — the last one is HTTP and disk rather than the database, and names a database of
  its own only because the context boots one; its hostile paths go through the JDK's `HttpClient` instead
  of `TestRestTemplate`, because the request has to arrive exactly as written for the refusal to be the
  server's and not the test client's.

A `@WebMvcTest` slice loads the web layer and its advice but not the typed configuration properties those
beans are built from, so a slice that expects an error response needs
`@EnableConfigurationProperties({ StorageProperties.class, CorsProperties.class })` — without it the context
fails on the advice's constructor, not on the test.

`DumpQueryTest` counts the statements of the dump read path and needs Hibernate's statistics, which the
test profile turns on (`application-test.yml`): the counters cost one increment per event and are off
everywhere else.

### One container, one database per context

`support/PostgresTestConfiguration` starts one `postgres:17-alpine` container for the whole JVM — the same
tag as the dev database, ADR-009 — and gives each Spring context its own database on it (a
`JdbcConnectionDetails` bean, built from Testcontainers' own coordinates). Flyway applies the real
migrations to that database and `ddl-auto=validate` then runs against the real schema, so a drift between
the entities and `db/migration` fails the suite.

One database per context preserves the isolation the suite had when every context had its own server: the
flow classes delete rows and add test-only Flyway migrations, and either would otherwise reach the
repository slices, whose assertions are about the whole archive. A context names its database with
`@TestPropertySource(properties = "aether.test.database=<name>")`, and **naming one is required**: there is
no default, so a context that boots a database without a name fails on the spot with a message saying what
to add. Sharing is then always written down in both classes rather than inherited from whichever ran first
— the four repository slices all name `repository` on purpose, and a class added to that family that reads
no row it did not write can name it too.

The container is deliberately not a Spring bean — it is started in a static initialiser and the framework
never closes it. As a bean it would be closed by the first context that shuts down, and every later context
would meet a dead port. Nothing else stops it either: cleanup is Testcontainers' reaper, Ryuk, which is on
by default and removes the container when the JVM exits. That is a precondition rather than a detail — a run
with `TESTCONTAINERS_RYUK_DISABLED=true` (or with a Ryuk that cannot reach the Docker socket, which
Testcontainers reports as a warning and then continues past) leaves one `postgres:17-alpine` container
running per build, and the next one starts another. Find them with `docker ps --filter
ancestor=postgres:17-alpine` and remove them with `docker rm -f <id>`; the databases inside a container are
worth nothing, so nothing is lost by that.

Adding a test class: choose the family it belongs to and copy that family's annotations. An identical
annotation set shares a context and a database with the classes that already carry it, which is what keeps
the suite at 13 contexts; a new combination is a new context (about 1 s) and, if it boots a database, a new
database migrated from scratch.

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
