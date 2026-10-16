# Security audit — Sprint 01 (release gate)

**Verdict**: **ISSUES (10) — no Critical or High finding; the release is not blocked.**
Critical 0 · High 0 · Medium 3 · Low 7 · Informational 6.

- **Date**: 2026-10-16 (UTC) · **Auditor**: `security-auditor` subagent (release gate)
- **Audit point**: `develop` = `eef095eb` ("Merge pull request #68 … dump-api"), `main` = `45d16679`
- **Rule set**: `.claude/rules/security.md` (threat model), OWASP Cheat Sheets (File Upload, REST Security,
  Secrets Management, CSRF Prevention), the project's own `docs/engineering/ARCHITECTURE.md` and ADRs

## Scope

`git log --oneline main..develop` → **88 commits**; `git diff --stat main...develop` → **132 files,
+12,065 / −134**. Of that, `backend/` = 36 commits, 83 files, +9,690 / −10 (the rest is `.claude/`,
`docs/`, `reports/`, `scripts/`, `retrospectives/`). Everything merged since the last release is in
scope: the Spring Boot scaffold, the data directory and storage configuration, the storage service, the
PostgreSQL/Flyway persistence, the RFC 9457 error contract, the photo API, the dump API, the dev compose
stack, and the agent configuration changes.

Reviewed as shipped code: `backend/src/main/**`, `backend/src/test/**` (for what it asserts, not for
its own quality), `backend/pom.xml`, `backend/.mvn/wrapper/maven-wrapper.properties`,
`docker-compose.dev.yml`, `.env.example`, `.gitignore`, `.claude/settings.json`,
`.claude/hooks/guard-commands.sh`.

**Not in this release, therefore not audited here**: any frontend (`frontend/` contains only a
`README.md` — no `package.json`, so `npm audit` is `SKIPPED`), the `/images/**` static serving handler
(the story that implements it, E1-S5, is not merged; `StorageService`'s Javadoc refers to it as future
work), authentication (ADR-008: deliberately out of scope for v1), TLS and remote deployment.

**Timing note — E1-S9.** One story is still in flight: E1-S9 (test-suite consolidation), constrained to
test code only. At audit time its work exists **only** as 11 modified, uncommitted files under
`backend/src/test/**`; the audited tree is the commit `eef095eb`. The audit therefore covers all of
`develop`'s production behaviour as it stands. **If any file under `backend/src/main/**`,
`backend/pom.xml` or the root dev stack changes before the release PR is opened, that diff has not been
covered by this audit and must be re-checked separately.**

**Threat model**: local-only, single-user. The realistic risks are data loss, path traversal through
filenames, unsafe file types, committed secrets and supply-chain creep. ADR-008 records that the backend
binds to the LAN and that anyone on the same network can reach the app ("accepted for a personal LAN").
LAN reachability as such is therefore *not* counted as a finding; it is restated in residual risk, and
the browser-reachable part of it that ADR-008 did not consider is finding SEC-01.

## Findings

| # | Severity | Where | Issue | Suggested |
|---|----------|-------|-------|-----------|
| SEC-01 | Medium | `web/PhotoController.java:63-66`, `config/WebMvcConfig.java:29-38` | The multipart upload endpoint is reachable by any web page the user visits (no auth, no `Origin`/`Sec-Fetch-Site` check, upload is a CORS-simple request) | `priority:p1` |
| SEC-02 | Medium | `backend/pom.xml:9-10` (Boot 3.5.16 → Spring 6.2.19) | The framework line is past OSS end-of-life with no OSS patch path for new framework CVEs | `priority:p1` + ADR |
| SEC-03 | Medium | `backend/pom.xml` (jackson-bom → jackson-core 2.21.4) | `jackson-core` 2.21.4 carries two reachable DoS advisories; fixed in 2.21.7 | `priority:p1` |
| SEC-04 | Low | `backend/pom.xml` (tomcat-embed-core 10.1.55) | 31 CVEs fixed in Tomcat 10.1.56–10.1.60; none reachable in this configuration, but the deployment runs known-vulnerable code | `priority:p2` |
| SEC-05 | Low | `backend/pom.xml` (postgresql 42.7.11) | `CVE-2026-54291` (channel-binding downgrade) — not applicable on this loopback/no-TLS connection; fixed in 42.7.12 | `priority:p2` |
| SEC-06 | Low | `backend/pom.xml` (log4j-api 2.24.3) | `CVE-2026-49844` — the vulnerable layout is not on the classpath (Logback is the backend); fixed in 2.25.5 | `priority:p2` |
| SEC-07 | Low | `backend/pom.xml` (commons-compress 1.24.0, **test** scope via Testcontainers) | `CVE-2024-25710`, `CVE-2024-26308`; test-only, no shipped impact; fixed in 1.26.0 | `priority:p2` |
| SEC-08 | Low | `.env.example:52-56`, `config/CorsProperties.java` | The documented LAN pattern `http://192.168.*.*:5173` also matches attacker-controlled DNS names (Spring turns `*` into `.*`, which crosses dots) | `priority:p2` |
| SEC-09 | Low | `service/StorageInitializer.java:134-153` | The boot-time `tmp/` sweep deletes **every** entry, not only staging files — an unrelated directory named `tmp/` under a mis-pointed data dir is emptied at startup | `priority:p2` |
| SEC-10 | Low | `.claude/settings.json:162-175` | The sprint replaced `Read(./.env.*)` by an enumeration; unlisted variants (`.env.ci`, `.env.old.1`, …) and `Bash(cat *)` bypass the intent | `priority:p2` |

Informational notes (no action required for this release): N1–N6, last section.

### SEC-01 (Medium) — the upload endpoint accepts cross-site POSTs

**What an attacker could do.** A user who visits any web page (ad, blog, a compromised site — nothing
Aether-specific) while the backend runs has that page POST a file to `http://localhost:8080/api/v1/photos`
or to the machine's LAN address. The archive accepts it: deliberately no authentication (ADR-008), and
no check of `Origin` or `Sec-Fetch-Site` anywhere in the codebase. `multipart/form-data` POSTs are
CORS-**simple** requests — the browser sends them without a preflight — so the absence of CORS response
headers does not stop the write; the page cannot read the answer, and does not need to. Each accepted
request stores up to `AETHER_MAX_UPLOAD_MB` (default 15 MB) of real image bytes (the sniffing is passed by
embedding a valid PNG in the page) and inserts a row that shows up in the river. Repeated in a loop, this
fills the data directory — and a full disk is exactly the data-loss scenario the threat model cares
about (the PostgreSQL Docker volume lives on the same filesystem).

**Verification.** By reading: `PhotoController.java:63` (`@PostMapping(consumes = MULTIPART_FORM_DATA_VALUE)`,
`@RequestPart("file") MultipartFile file` at `:66`), `WebMvcConfig.java:29-38` (the only `WebMvcConfigurer`
in `src/main`; CORS only — this is a *response-header* mechanism, and `allowCredentials(false)` does not
stop simple writes), and a repository-wide `git grep` for `Origin`/`Sec-Fetch` which returns hits only
inside the CORS configuration. By execution: the 279-test suite covers the endpoint over MockMvc and a
real HTTP `@SpringBootTest` path, so the handler's behaviour itself is not in doubt. Not executed: an
actual cross-origin browser request (not reproducible in this environment); the argument rests on the
fetch/CORS "simple request" rules, which are the same rules Spring Boot relies on for its own CORS
documentation. Modern Chrome additionally gates public→private-network requests behind a Local Network
Access permission — browser-dependent, not a server-side control, and LAN-origin pages are exempt.

**Suggested fix.** Before the release PR (small), or as the next story: reject state-changing requests
whose `Origin` header is present and not in `AETHER_CORS_ALLOWED_ORIGINS` (a one-method
`HandlerInterceptor` or `OncePerRequestFilter`), or require `Sec-Fetch-Site: same-origin|none`. This is
the CSRF stand-in for the authentication ADR-008 defers; note it in the ADR when added.

### SEC-02 (Medium) — the framework line is past OSS end-of-life with no OSS patch path

**What an attacker or an accident could do.** Nothing today — the two known framework CVEs are not
reachable (see below) — but the next framework CVE will have no free fix on this line, and Spring will
not backport it. This is a structural security-maintenance problem rather than an open door.

**Verification.**
- Resolved versions (build, not memory): `spring-webmvc:jar:6.2.19`, `spring-web:jar:6.2.19` via
  `./mvnw -B dependency:list -DincludeScope=test`, inherited from `spring-boot-starter-parent`
  `3.5.16` (`backend/pom.xml:9-10`).
- `spring.io/blog/2026/06/25/spring-boot-3-5-16-available-now`, fetched 2026-10-16, verbatim:
  *"This is the last OSS release of the 3.5.x generation."* — *"To continue to receive OSS support,
  upgrade to 4.0.x or 4.1.x at your earliest convenience."* The 3.5.x OSS support end date is
  2026-06-30 (`endoflife.date/spring-boot`), i.e. ~3.5 months before this audit.
- OSV for `org.springframework:spring-webmvc:6.2.19` returns two advisories, both affecting
  `6.2.0 – 6.2.19` (last affected) with fixes only in `7.0.9`:
  `GHSA-j9f9-w8pj-32f8` / `CVE-2026-47890` (SSE stream corruption while rendering view fragments) and
  `GHSA-pc63-qcmh-9cmg` / `CVE-2026-47884` (XsltView path limitation).
  `https://spring.io/security/cve-2026-47890` (fetched 2026-10-16) lists *fixed in 6.2.20 —
  "Enterprise Support Only"*; `https://repo.maven.apache.org/maven2/org/springframework/spring-webmvc/6.2.20/`
  returns **HTTP 404** (verified), i.e. no OSS artefact exists for the 6.2.x fix.
- **Reachability of the two CVEs in this application: no.** CVE-2026-47890 requires Server-Sent Events
  with view fragments — the app has four REST endpoints and no views (`git grep` for SSE/`SseEmitter`:
  no hits). CVE-2026-47884 requires an `XsltView` — none. NVD/GHSA rate both `CRITICAL`
  (CVSS 9.8-style `AV:N/…/C:H/I:H/A:H`); Spring rates CVE-2026-47890 `LOW`. In this codebase the
  question is moot: unreachable either way. The aggregator rating is quoted so the discrepancy is on
  record, not to inflate the finding.

**Suggested fix.** An ADR that plans the Spring Boot 4.x migration (Spring Framework 7, Jackson 3) and
names the trigger for doing it, plus keeping the two CVEs' non-reachability on record. Interim
mitigation is possible and worth stating: none of the affected features may be introduced (no SSE, no
XSLT views, no new view technologies) while the project stays on 3.5.x. This finding does not block the
release — there is no reachable framework vulnerability at this commit.

### SEC-03 (Medium) — jackson-core 2.21.4: two reachable DoS advisories

**What an attacker could do.** Any client that can reach the LAN address (or `localhost`, e.g. a page
using the SEC-01 hole does not suffice here — JSON bodies *are* preflighted) can send one crafted
`POST /api/v1/dumps` body and pin a request thread in quadratic-time number parsing. `application/json`
bodies are not size-capped (`SEC-N3`), so the payload size is limited only by `maxSwallowSize` (2 MB
default, verified in Spring Boot 3.5.16's configuration metadata) — enough for a multi-second burn per
request. It is a denial-of-service, not a data breach: for a single-user archive, an availability hit
the user notices immediately.

**Verification.** OSV, 2026-10-16, `org.apache.jackson.core:jackson-core:2.21.4`:
`GHSA-p6pp-m3f8-5c89` / `CVE-2026-89407` — "ReDoS: quadratic backtracking in `NumberInput.PATTERN_FLOAT`
via `looksLikeValidNumber`", and `GHSA-7hhh-6rmp-j9qf` / `CVE-2026-89425` —
"`_reportInvalidToken()` missing `maxErrorTokenLength` limit"; both rated `HIGH` by the advisory database
(`CVSS:3.1/AV:N/AC:L/PR:N/UI:N/…/A:H`), both fixed in **2.21.7**. Reachability by reading: the app
parses JSON request bodies (`DumpController.java:57`, `@RequestBody DumpCreateRequest`) with the default
Boot `ObjectMapper`, so the parser entry points in the advisories are on the request path. The nine
`jackson-databind` advisories that also match 2.21.4 (`CVE-2026-91776`, `CVE-2026-91777`,
`CVE-2026-68497`, `CVE-2026-54515`, `CVE-2026-59889`, `CVE-2026-83557`, `CVE-2026-77310`,
`CVE-2026-19032`, `GHSA-mhm7-754m-9p8w`) require polymorphic typing, `@JsonView`/`@JsonUnwrapped`,
case-insensitive ignoral, `Duration` from `XMLGregorianCalendar`, or `java.nio.file.Path` fields — the
archive's DTOs use none of these; they are fixed by the same bump.

**Suggested fix.** One property in `backend/pom.xml`: `<jackson-bom.version>2.21.7</jackson-bom.version>`
(Spring Boot's managed-version override mechanism), then `./mvnw verify`. Same family, patch-level,
low regression risk. This is the cheapest of the three Medium findings.

### SEC-04 (Low) — Tomcat 10.1.55: 31 fixes behind, none reachable here

`tomcat-embed-core:10.1.55` (Boot-managed). `https://tomcat.apache.org/security-10.html` (fetched
2026-10-16) lists **31 distinct CVEs fixed in 10.1.56–10.1.60** — 4 rated Important by the vendor in
10.1.58/10.1.59 (e.g. `CVE-2026-65182` security-constraint bypass, `CVE-2026-68569` principal lookup
fail-open, `CVE-2026-65927` RewriteValve access-control bypass) and 4 more in 10.1.60
(`CVE-2026-86350` HTTP/2 header mix-up, `CVE-2026-78383` AJP DoS, `CVE-2026-76183` WebSocket path
templates, `CVE-2026-77791` WebSocket close DoS). OSV/GHSA surfaces only three of the 31
(`CVE-2026-65905`, `CVE-2026-65182`, `CVE-2026-68525`) and rates them `CRITICAL`, while the vendor rates
them Low/Important — a reminder that aggregator severity is not project risk.

**Reachability check, configuration by configuration** (all by reading; the relevant switch is verified
in the build's own metadata, not from memory):
- no authentication, no realm, no security constraints declared → the DIGEST/FORM/DataSourceRealm/
  `security-role-ref`/constraint-ordering CVEs have nothing to bypass;
- HTTP/2 off — `server.http2.enabled` default `false` (Spring Boot 3.5.16
  `spring-configuration-metadata.json`) and the app does not set it → the HTTP/2 CVEs are dead;
- no AJP connector wired, no WebSocket endpoints, no TLS/OCSP/CRL configuration, no RewriteValve,
  no UDS connector, no EncryptInterceptor.

So: **no reachable impact at this commit**, but the deployment runs a component with 31 known defects.
10.1.61 exists on Maven Central (verified `HTTP 200`); the security page's newest release section is
10.1.60. Fix: `<tomcat.version>10.1.61</tomcat.version>` (or the newest 10.1.x), re-run `./mvnw verify`.

### SEC-05 (Low) — postgresql 42.7.11: CVE-2026-54291 not applicable

`GHSA-j92g-9f8w-j867` / `CVE-2026-54291`: silent channel-binding authentication downgrade via an
unsupported certificate. The archive connects to `localhost` without TLS and without channel binding
(`application.yml:26`), so there is no channel binding to downgrade; the prerequisite (a
`channel_binding=require`-style setup) is absent. Fixed in **42.7.12**; harmless to take with
`<postgresql.version>42.7.14</postgresql.version>` when convenient.

### SEC-06 (Low) — log4j-api 2.24.3: CVE-2026-49844 not applicable

`GHSA-qv9r-c865-cp47` / `CVE-2026-49844` (improper encoding of non-finite floats in `MapMessage` under
the JSON template layout) — fixed in 2.25.5. `log4j-api` is present only as the SLF4J bridge that ships
with `spring-boot-starter-logging`; the backend of the app is **Logback**, and `log4j-core` (which owns
the JSON template layout) is not on the classpath at all (`dependency:list`, 2026-10-16). No log call in
`src/main` uses `MapMessage`. Not exploitable; `log4j2.version=2.25.5` is the tidy-up.

### SEC-07 (Low) — commons-compress 1.24.0, test scope only

`CVE-2024-25710` (infinite loop on a corrupted DUMP file) and `CVE-2024-26308` (OOM on a broken Pack200
file), fixed in 1.26.0, reach the build only through `org.testcontainers:testcontainers:1.21.4`
(Testcontainers itself is clean). Test-scope code never ships and never runs in production; the risk is
a hostile container image triggering a test-suite hang. Fix when Testcontainers moves, or pin
`commons-compress` in `dependencyManagement`.

### SEC-08 (Low) — the documented CORS LAN pattern over-matches

`.env.example:56` documents `AETHER_CORS_ALLOWED_ORIGINS=http://localhost:5173,http://192.168.*.*:5173`
and `CorsProperties` validates it by delegating to Spring's `OriginPattern` matching, where `*` becomes
`.*` — which crosses dots. `http://192.168.evil.com:5173` is therefore also an allowed origin, and a
page served from any such DNS name could **read** every JSON response of the API (dumps, photo
metadata; images too once E1-S5 adds `/images/**`). It requires the operator to opt into the LAN
pattern (the default is `http://localhost:5173` only) and an attacker who controls a DNS name starting
with `192.168.` — so Low, not Medium — but the file's comment ("wildcards inside the host are allowed")
sells it as safe. Fix: enumerate the real LAN origins in `.env.example`, or narrow the example to the
exact host of the dev machine.

### SEC-09 (Low) — the boot sweep of `tmp/` is broader than the staging directory

`StorageInitializer.emptyTmp()` (`:134-153`) deletes **every** entry of `<data-dir>/tmp`, recursively,
without following symlinks. That is correct for the intended layout (a crash can only leave UUID-named
staging files there) and it refuses a symlinked `tmp/` (`:88`). But `AETHER_DATA_DIR` is user-supplied
and only validated as absolute/non-root/non-home; if it is pointed one level wrong at a directory that
happens to contain an unrelated `tmp/` — a plausible slip on a machine where `~/AetherArchive_Data` was
meant — the archive deletes that directory's contents at every startup. Data loss is this project's
first risk, so the sweep should delete only `*.tmp`/prefixed staging artefacts (the constant prefix
already exists in `StorageService`), not everything. Not exploitable; an accident, hence Low.

### SEC-10 (Low) — the agent deny-list was narrowed to an enumeration

The sprint (commit `ba03160`…`1bdeb8a`) replaced `Read(./.env.*)` with an explicit list
(`.claude/settings.json:162-175`): `.env`, `.env.local`, `.env.*.local`, `.env.dev`, `.env.development`,
`.env.test`, `.env.prod`, `.env.production`, `.env.staging`, `.env.bak`, `.env.old`, `.env.save`,
`.env.backup`. Anything else — `.env.ci`, `.env.old.1`, `.env.new`, `.env.2026-10-16`, `.env.docker` —
is readable again by any agent, and `Bash(cat *)`/`Bash(grep *)` remain allowed, so the deny list has
always been honour-based anyway. Nothing in the repository hides a secret (see checks), so this is
hardening: keep the glob (`Read(./.env.*)`) **and** the `.env.example` exception, or make the rule
`Read(./.env*)` minus the example.

### Informational notes

- **N1 — the two deliberate echo exceptions, reviewed.** `backend/README.md:407-409` documents them and
  I concur: the upload refusal echoes the *declared* media type after `sanitiseMediaType`
  (`StorageService.java:273` strips control characters, truncates to 100 chars) and a dump refusal names
  the rejected *photo identifier* (`DumpService.java:210-243`). Neither is attacker-controlled in a
  meaningful sense (a client can always name its own strings), neither carries a path, and every other
  message is a constant (`ApiExceptionHandler.java:160-161` returns `ex.getMessage()`, and every
  `new StorageException(…)` site was read: all constants, no paths). The 759-line
  `ApiExceptionHandlerTest` asserts the absence of stack traces, SQL, absolute paths, class names and
  rejected values across the whole error surface, and it runs green (see checks).
- **N2 — polyglots are accepted by design; E1-S5 must serve defensively.** Only the first 64 bytes are
  sniffed (`ImageFormat.HEADER_LENGTH`), so a file with a valid JPEG header and an HTML tail is stored
  as `.jpg` (verified by execution). That is the standard trade-off and is fine *while nothing renders
  the bytes*; when E1-S5 adds `/images/**`, it must (a) send the Content-Type derived from the stored
  extension, (b) add `X-Content-Type-Options: nosniff`, and (c) never list directories. Record it as an
  acceptance criterion of that story.
- **N3 — no size ceiling on JSON bodies.** Multipart is capped twice (`MultipartConfig.java:47-51`, both
  the file ceiling and the request ceiling) but a JSON body is bounded only by Tomcat's 2 MB swallow
  default. Hardening for a later story; the practical impact is bounded by the 2 MB default.
- **N4 — the API binds to all interfaces.** `server.address` is unset (`application.yml:38-39` sets only
  `server.port`; the metadata default is "none") so Tomcat listens on `0.0.0.0`. This is ADR-008's
  accepted risk; restated here so the release PR cannot claim otherwise. PostgreSQL, by contrast, is
  loopback-only (verified below).
- **N5 — multipart parts are staged in the container's temp dir first.** Tomcat writes received parts to
  `java.io.tmpdir` (Spring's `DiskFileItem`, 0600, deleted at request end) before `StorageService` sees
  them; `MultipartConfig.java:41` (`STAGE_ON_DISK = 0`) is a `jakarta.servlet` knob for the file-size
  threshold and does not change Tomcat's behaviour. Transient and owner-only; relevant only as a
  data-hygiene item for the backup story (E6-S7): back up `AETHER_DATA_DIR`, not `/tmp`.
- **N6 — `postgres:17-alpine` is a floating tag.** Not digest-pinned, and no image scanner is available
  in this environment (no `trivy`/`grype`, no Docker registry credentials for a scan). The image is the
  dev stack's only third-party runtime artefact; pin it by digest when the E1-S11 story is revisited.

## Dependency audit

**Method.** Exact resolved versions were taken from the build itself
(`./mvnw -B dependency:list -DincludeScope=test` → 111 lines, **108 distinct Maven coordinates**), not
from memory or from the story description. Each coordinate was then queried individually against the
**OSV API** (`POST https://api.osv.dev/v1/query`, ecosystem `Maven`) on **2026-10-16**; every hit was
cross-checked against the vendor page or the GitHub advisory it names, and the version ranges quoted
below are the ones OSV returns for the Maven ecosystem. **88 of 108 coordinates returned no advisory.**

| Package | Version resolved | Advisory (source) | Severity per source | Fixed in | Reachable here? | Action |
|---|---|---|---|---|---|---|
| `org.springframework:spring-webmvc` | 6.2.19 | `CVE-2026-47890`, `CVE-2026-47884` — [OSV](https://api.osv.dev/v1/vulns/GHSA-j9f9-w8pj-32f8), [spring.io](https://spring.io/security/cve-2026-47890) | GHSA: Critical · Spring: Low | 7.0.9 (6.2.20 = **Enterprise Support Only**; 404 on Maven Central) | No (no SSE/view fragments, no XsltView) | SEC-02 — ADR for Boot 4.x |
| `org.springframework.boot:*` | 3.5.16 | no advisory in OSV; **OSS support ended 2026-06-30** — [spring.io blog](https://spring.io/blog/2026/06/25/spring-boot-3-5-16-available-now) | — | 4.0.x / 4.1.x | — | SEC-02 |
| `com.fasterxml.jackson.core:jackson-core` | 2.21.4 | `CVE-2026-89407`, `CVE-2026-89425` — [OSV](https://api.osv.dev/v1/vulns/GHSA-p6pp-m3f8-5c89) | High (CVSS 7.5, A:H) | 2.21.7 | **Yes** — JSON request parsing | SEC-03 — bump |
| `com.fasterxml.jackson.core:jackson-databind` | 2.21.4 | 9 advisories (`CVE-2026-91776/91777/68497/54515/59889/83557/77310/19032`, `GHSA-mhm7-754m-9p8w`) — OSV | High/Moderate | 2.21.7 | No (polymorphic typing, `@JsonView`, `JsonIgnoreProperties` case-insensitivity, `Path`/`Duration` features unused) | Same bump as SEC-03 |
| `org.apache.tomcat.embed:tomcat-embed-core` | 10.1.55 | 31 CVEs fixed 10.1.56–10.1.60 — [tomcat.apache.org](https://tomcat.apache.org/security-10.html); OSV knows 3 (`CVE-2026-65905/65182/68525`, rated Critical) | Vendor: Low–Important | 10.1.60/10.1.61 | No (no auth/realms/constraints, HTTP/2 off, no AJP, no WebSockets, no TLS) | SEC-04 — bump |
| `org.postgresql:postgresql` | 42.7.11 | `CVE-2026-54291` — [OSV](https://api.osv.dev/v1/vulns/GHSA-j92g-9f8w-j867) | High (CVSS 4.0 `AV:N/AC:H/AT:P`) | 42.7.12 | No (loopback, no TLS/channel binding) | SEC-05 — bump optional |
| `org.apache.logging.log4j:log4j-api` | 2.24.3 | `CVE-2026-49844` — [OSV](https://api.osv.dev/v1/vulns/GHSA-qv9r-c865-cp47), [logging.apache.org](https://logging.apache.org/security.html#CVE-2026-49844) | Moderate | 2.25.5 | No (`log4j-core` absent, Logback is the backend) | SEC-06 — bump optional |
| `org.apache.commons:commons-compress` | 1.24.0 (**test**) | `CVE-2024-25710`, `CVE-2024-26308` — OSV | Moderate | 1.26.0 | No (test scope, via Testcontainers) | SEC-07 |
| `org.testcontainers:*` | 1.21.4 (test) | none in OSV | — | — | — | — |
| `ch.qos.logback:logback-classic`/`-core` | 1.5.34 | none in OSV | — | — | — | — |
| `org.yaml:snakeyaml` | 2.4 | none in OSV | — | — | — | — |
| `org.flywaydb:flyway-core`, `flyway-database-postgresql` | 11.7.2 | none in OSV | — | — | — | — |
| `org.springframework:spring-web`, `spring-core`, `spring-context`, `spring-data-jpa`, `spring-data-commons` | 6.2.19 / 3.5.x | none in OSV beyond the framework line above | — | — | — | covered by SEC-02 |
| `org.hibernate.orm:*`, `jakarta.*`, `org.junit.*`, `org.assertj`, `org.mockito`, `org.slf4j` | (all resolved versions) | none in OSV | — | — | — | — |

Coverage limits, stated plainly: OSV/GHSA covers only 3 of Tomcat's 31 vendor-documented CVEs, so for
Tomcat the vendor page is the source of record and OSV is the under-count. `nvd.nist.gov` detail pages
did not render for `WebFetch` during this audit (the site returns its SPA shell); the NVD data points
therefore arrive through the OSV records, which carry `CVE-*` aliases and CVSS vectors, and through the
vendor pages (Spring, Tomcat, Apache Logging, PostgreSQL JDBC). No CVE id, advisory or link in this
report was written from memory.

## Checks performed

1. **Scope** — `/usr/bin/git log --oneline main..develop` → 88 commits; `git diff --stat main...develop`
   → `132 files changed, 12065 insertions(+), 134 deletions(-)`; `git diff --shortstat main...develop -- backend`
   → `83 files changed, 9690 insertions(+), 10 deletions(-)`. `rev-parse` → HEAD = develop = `eef095eb`,
   main = `45d16679`. Working tree: 11 modified test files (E1-S9, in flight).
2. **Test suite / build** — `cd backend && ./mvnw -B verify` (run at `eef095e`) →
   `Tests run: 279, Failures: 0, Errors: 0, Skipped: 0` and `BUILD SUCCESS`.
3. **Adversarial storage harness** (outside the repo, `/tmp/aether-audit`, compiled against
   `backend/target/classes`) — direct execution of `StorageService`:
   - client filename `../../../../../../etc/hostname` (and absolute-path variants) → stored under a
     generated UUID inside `images/`, file mode `rw-------` (0600), nothing written outside the data
     root;
   - declared `image/png` with non-PNG bytes → `UnsupportedImageTypeException`;
   - a body one byte over `max-upload-mb` → `UploadTooLargeException`, destination absent, `tmp/` empty;
   - `StoredFile` with crafted escaping extensions (`../../../../../../outside/precious.txt`,
     `x/../../../../../../outside/precious.txt`, `../../../etc/hostname`) → `StorageException` from
     `requireInside` (`StorageService.java:321-322`), the outside victim file untouched (checked after
     each call);
   - `delete()` ignores a tampered `relativePath` (it rebuilds `images/<id>.<ext>`) and a second delete
     of the same file is a no-op;
   - AVIF brand detection walks only the declared `ftyp` box, bounded by both the box length and the
     64-byte header (a brand outside the box is not detected; no out-of-bounds read).
4. **Loopback claim** — `docker compose -f docker-compose.dev.yml config` →
   `host_ip: 127.0.0.1` / `published: "5432"`. The database port is published to loopback only, as
   claimed. No other service is published (`docker-compose.dev.yml` defines only `db`), and the backend
   itself is the only listener the app opens.
5. **Sweeps** —
   `/usr/bin/git grep -nE "(password|secret|token|api[_-]?key)\s*[:=]"` → 2 hits, both benign:
   `.env.example:27` (a comment explaining that the placeholder is not a secret) and
   `application.yml:28` (`password: ${POSTGRES_PASSWORD:change-me-local}` — a documented placeholder,
   overridden by `.env`, and `.env` is gitignored). No `.env` has ever been committed
   (`git log --all --diff-filter=A -- .env` → nothing; `.gitignore:12-14` ignores `.env` and `.env.*`,
   with `!.env.example`).
   `git grep -nE "dangerouslySetInnerHTML|eval\(|child_process|innerHTML"` → hits only in
   `.claude/agents/security-auditor.md` and `.claude/rules/security.md` (the rules themselves quoting
   the patterns). No unsafe JS exists yet, because no frontend exists yet.
   `git grep -nE "https?://" backend/src/main` → all hits are Javadoc/validation-message examples in
   `CorsProperties.java` and the `application.yml` CORS default; no outbound request. No HTTP client
   API anywhere: `git grep -nE "RestTemplate|WebClient|HttpClient|URLConnection|new Socket|WebSocket"`
   → no hits. Zero external requests at runtime holds as far as static analysis can show.
6. **Persistence** — `git grep` for SQL assembly: the only `@Query` is a constant
   `select * from random() limit 1` native query; every other repository method is a derived query.
   Migrations V1–V3 are additive (`V2` adds check constraints and a partial unique index; `V3` adds
   `version bigint NOT NULL DEFAULT 0`); no `DROP`, `DELETE` or destructive `ALTER` in the sprint's
   migrations.
7. **Maven wrapper integrity** — `backend/.mvn/wrapper/maven-wrapper.properties` pins
   `distributionSha256Sum=5af3b743dd8b876b5c45da33b676251e5f1687712644abb4ee519ca56e1d89ce` for
   `apache-maven-3.9.16-bin.zip`; the downloaded artefact's SHA-256 matches the pinned value and its
   SHA-512 matches the `.sha512` published on Maven Central (verified 2026-10-16).
8. **`npm audit`** — `SKIPPED`: `frontend/package.json` does not exist (frontend not scaffolded).
   `./mvnw -q dependency:tree` — run; nothing in it is out of the ordinary beyond the table above.
9. **Error surface** — read `ApiExceptionHandler.java` end to end (490 lines, 15 handlers): all
   responses are `application/problem+json`; 5xx details are constant sentences; `handleStorageFailure`
   returns `ex.getMessage()`, whose every producer was read and is path-free; the media-type echo is
   `sanitiseMediaType`-guarded; the `archiveRefused` branch (`:415`) forwards Spring's own refusal
   detail and code — the documented exception. `ApiExceptionHandlerTest` (759 lines) asserts the absence
   of stack traces, SQL, absolute paths, class names and rejected values, and passes in the suite run
   above.

**URLs fetched during this audit (2026-10-16)**: `api.osv.dev/v1/query` (108 queries),
`api.osv.dev/v1/vulns/{GHSA-j9f9-w8pj-32f8, GHSA-pc63-qcmh-9cmg, GHSA-p6pp-m3f8-5c89,
GHSA-7hhh-6rmp-j9qf, GHSA-cxp5-3px4-pw24, GHSA-gcx9-497g-6cp6, GHSA-h3x4-894j-xpx5,
GHSA-9xv2-5v5q-p794, GHSA-j92g-9f8w-j867, GHSA-qv9r-c865-cp47, GHSA-4265-ccf5-phj5,
GHSA-4g9r-vxhx-9pgx}`, `spring.io/security/cve-2026-47890`,
`spring.io/blog/2026/06/25/spring-boot-3-5-16-available-now`, `spring.io/projects/spring-boot#support`,
`tomcat.apache.org/security-10.html`, `logging.apache.org/security.html#CVE-2026-49844`,
`repo.maven.apache.org/maven2/...` (version metadata and HEAD checks),
`cheatsheetseries.owasp.org` (File Upload, REST Security, Secrets Management, CSRF Prevention).

## Not checked / residual risk

- **No live instance was attacked.** Every runtime claim comes from executing the storage service
  directly (harness) or from the project's own 279-test suite; no HTTP request was sent to a running
  Tomcat by this audit. The CORS/simple-request argument in SEC-01 is a reading of the Fetch and Spring
  rules, not an executed browser test; the Tomcat reachability analysis in SEC-04 is a configuration
  reading, not an exploit attempt.
- **`npm audit`, CORS preflight behaviour against a real browser, container image scanning, and
  `/images/**` serving** were not covered — the first three for absence of tooling/frontend, the last
  because the hander is not merged (see N2 for the requirements to carry into E1-S5).
- **The E1-S9 working tree** is outside this audit; production files changed before the release PR will
  be re-checked separately.
- **The security page for Tomcat lists 10.1.60 as its newest release section** while Maven Central also
  has 10.1.61 (no CVEs documented for it yet). "Newest 10.1.x" is the correct target either way.
- **Residual risk accepted (ADR-008)**: the API is unauthenticated and bound to all interfaces; anyone
  on the LAN can read, upload, publish and (once the endpoints exist) delete. Revisit at E6-S5, as the
  ADR requires.
- **Residual risk, structural**: on this framework line there is no OSS patch path (SEC-02). A future
  framework CVE that *is* reachable would arrive with no free fix; that is why SEC-02, though Medium
  today, should not survive many sprints unresolved.

## Release verdict

**No Critical and no High findings at commit `eef095eb`. The release is not blocked.**

Three Medium findings (SEC-01 cross-site reachable upload, SEC-02 framework line past OSS EOL, SEC-03
reachable jackson-core parser DoS) may ship; SEC-03 and SEC-01 are cheap to fix before the release PR
and worth doing, SEC-02 needs an ADR rather than a patch. The seven Low findings are hardening, and the
six informational notes carry requirements into later stories (E1-S5 above all). Details have been
recorded so the release PR can cite them; the `priority:p1`/`priority:p2` labels in the findings table
are proposed for the backlog.
