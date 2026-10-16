/**
 * The wire types: what the API actually sends, copied from `_docs/openapi.yml` (the read-only
 * contract) and from `ADR-013` for the error shape.
 *
 * Two things are deliberately absent, and adding them back would be a contract change rather than a
 * convenience:
 *
 * - **No `displayOrder` on `Photo`.** The order a dump displays its six photos in *is* the position in
 *   `Dump.photos`; the server keeps the column to itself (ADR-011 §3, `DumpResponse`).
 * - **No `type` on `Dump`.** The entity behind it is an `ArchiveItem` with a `SINGLE_PIC | ANIME |
 *   MONTHLY_DUMP` discriminator, but `_docs/openapi.yml` publishes no such field, so a client cannot
 *   and must not switch on it. `/dumps` answers with dumps and `/photos` with photos — the endpoint
 *   is the discriminator.
 */

/** The four categories `POST /api/v1/photos` accepts. */
export type PhotoCategory = "pics" | "anime" | "dump" | "uncategorized";

/**
 * One photo, the `Photo` schema of the contract. Four fields and nothing else.
 *
 * `url` is a path on the API's own origin — `/images/<uuid>.<ext>` — not an absolute URL, because the
 * archive is served from one origin in every environment (`frontend/README.md`, "Where the API lives").
 * It is safe to hand straight to an `<img src>`.
 */
export interface Photo {
  readonly id: string;
  readonly url: string;
  readonly category: PhotoCategory;
  /** ISO-8601 instant, UTC — when the upload happened. */
  readonly uploadedAt: string;
}

/**
 * One monthly dump, the `Dump` schema: a title, the aura colour chosen in the workshop, and the six
 * photos in the order they are displayed in.
 */
export interface Dump {
  readonly id: string;
  /** The name given in the workshop, or `null` when it was published without one. */
  readonly title: string | null;
  /** The dump's background colour, `#RRGGBB`. */
  readonly backgroundColor: string;
  /** Exactly six photos, in display order. */
  readonly photos: readonly Photo[];
  /** ISO-8601 instant, UTC — when the dump was published. */
  readonly createdAt: string;
}

/** The request body of `POST /api/v1/dumps`: the `DumpCreate` schema. */
export interface DumpCreate {
  readonly title: string;
  readonly backgroundColor: string;
  /** Exactly six distinct photo ids, in the order the dump should display them. */
  readonly photoIds: readonly string[];
}

/** One rejected field of a validation failure, as it appears in `ProblemDetail.errors`. */
export interface FieldViolation {
  /** The field's name as the client wrote it (`title`, `photoIds[2]`). */
  readonly field: string;
  /** The validator's sentence — for the developer reading a log, never for the screen. */
  readonly message: string;
}

/**
 * A failed request, the RFC 9457 body `ApiExceptionHandler` writes (ADR-013).
 *
 * The field the UI switches on is **`code`**, never `title` or `detail`: those are prose the archive
 * may reword. `type` is `about:blank` for every problem — the archive has no error-documentation site
 * — and `errors` is present only on a `validation-failure`.
 */
export interface ProblemDetail {
  /** Always `about:blank`: the archive gives no problem a type URI of its own. */
  readonly type: string;
  /** A constant per situation, e.g. `Validation failed`. */
  readonly title: string;
  /** The HTTP status, repeated in the body. */
  readonly status: number;
  /** One sentence for whoever has to fix the request. */
  readonly detail: string;
  /** The path that was asked for. */
  readonly instance?: string;
  /**
   * The machine-readable identity of the situation — `validation-failure`, `not-found`,
   * `empty-archive`, `concurrent-modification`, `internal-failure`, … The full vocabulary is a
   * declared part of the API (ADR-013) and is listed in `backend/README.md`.
   */
  readonly code?: string;
  /** The rejected fields, on a validation failure only. */
  readonly errors?: readonly FieldViolation[];
}
