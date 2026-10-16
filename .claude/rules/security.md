# Security rules (always loaded)

## Threat model

Aether Archive is local-only and single-user. The realistic risks are not remote attackers but:
data loss (images, database), path traversal through filenames, unsafe file types, secrets committed
by accident, and supply-chain creep from unnecessary dependencies. Design for those.

## Non-negotiables

- **No external network calls at runtime.** No CDN, no Google Fonts, no analytics, no telemetry,
  no third-party API. Fonts come from Fontsource NPM packages; icons are inline SVG or bundled assets.
  A request leaving the machine is a bug.
- **No secrets in the repository.** Configuration lives in `.env` (gitignored) with `.env.example`
  documenting every key. Never print secrets into logs, errors, or agent reports.
- **Never trust an uploaded file.** On every upload:
  1. validate declared MIME type *and* sniff magic bytes,
  2. whitelist extensions (`jpg`, `jpeg`, `png`, `webp`, `gif`, `avif`),
  3. enforce a size limit (`AETHER_MAX_UPLOAD_MB`),
  4. **regenerate the filename** as a UUID — never reuse the client filename or path,
  5. write inside the configured data directory only, after canonical-path verification.
- **Path traversal guards**: any path built from data or input must be resolved and checked to stay
  under the data root before read or write. Serve `/images/**` from an explicit resource handler; never
  build file paths from request parameters.
- **Canonicalise before comparing — both sides** (`Path.toRealPath()`, `os.path.realpath`); a string or
  prefix comparison is not a guard. E1-S10's first cut was one, and `//`, `/.`, `..` and symlinks walked
  straight through it (Sprint 2's retrospective, change 2). A path guard ships with its adversarial
  matrix (`.claude/rules/testing.md`).
- **No SQL string concatenation.** JPA/derived queries only; native queries with bound parameters.
- **No `eval`, no `innerHTML`, no `dangerouslySetInnerHTML`** with server or user content.
- **Dependency discipline**: every new dependency needs a one-line justification in the PR.
  Prefer the standard library. Run the audit tooling when it exists (`npm audit`, `./mvnw dependency:tree`).

## Backend specifics

- Actuator endpoints stay off, or restricted to `localhost` and a minimal set. No stack traces in
  HTTP responses: map errors to RFC 9457 `ProblemDetail` without internal paths.
- CORS: only the origins in `AETHER_CORS_ALLOWED_ORIGINS` (dev: the Vite dev server on the LAN).
- Uploads are written through the storage service — controllers never touch `java.nio.file`.
- Data directory deletion, database drops, and destructive migrations require explicit user approval.

## When something looks exploitable

Stop, write a short report in `reports/` (impact, reproduction, suggested fix), add it to the backlog
with priority `priority:p0`, and tell the user. Do not silently patch security-relevant behaviour.
