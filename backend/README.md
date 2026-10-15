# Backend — Spring Boot

Scaffolding lands in **Sprint 1, E1-S1** (`docs/scrum/PRODUCT-BACKLOG.md`).

Planned structure (see `docs/engineering/ARCHITECTURE.md`):

```text
backend/
├── mvnw, mvnw.cmd, .mvn/            Maven wrapper (committed)
├── pom.xml                          Java 21 · Spring Boot 3
└── src/
    ├── main/java/com/aetherarchive/
    │   ├── config/                  WebMvc, CORS, storage properties
    │   ├── domain/                  ArchiveItem, Photo, enums
    │   ├── repository/              Spring Data repositories
    │   ├── service/                 StorageService, ArchiveService, DumpService
    │   ├── web/                     REST controllers (/api/v1)
    │   ├── dto/                     request/response records
    │   └── exception/               RFC 9457 error handling
    ├── main/resources/
    │   ├── application.yml
    │   └── db/migration/            Flyway V*.sql
    └── test/java/com/aetherarchive/ JUnit 5 · MockMvc · @SpringBootTest
```

Rules: `.claude/rules/backend.md` · security: `.claude/rules/security.md` · tests: `.claude/rules/testing.md`.
Contract: `_docs/openapi.yml` (read-only).

Commands once scaffolded: `./mvnw spring-boot:run` · `./mvnw test` · `./mvnw verify`.
