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
    └── test/java/com/aetherarchive/ JUnit 5 · MockMvc · @SpringBootTest
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

## Configuration

Everything is env-driven: `SERVER_PORT`, `AETHER_DATA_DIR`, `AETHER_MAX_UPLOAD_MB`,
`AETHER_CORS_ALLOWED_ORIGINS` — the defaults live in `src/main/resources/application.yml`, the
documented keys in `.env.example`. Typed binding and startup validation arrive with E1-S2;
PostgreSQL + Flyway with E1-S3.

Rules: `.claude/rules/backend.md` · security: `.claude/rules/security.md` · tests: `.claude/rules/testing.md`.
Contract: `_docs/openapi.yml` (read-only).
