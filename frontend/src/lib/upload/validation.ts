/**
 * What the archive accepts, and the client's half of saying so before an upload starts (E4-S1).
 *
 * ## The list is the server's, not a guess
 *
 * `backend/.../service/ImageFormat.java` is the single source of truth on the server: it sniffs magic
 * bytes and accepts exactly JPEG, PNG, GIF, WEBP and AVIF, with the media types below. A client that
 * refuses a format the server takes is a UI bug; one that accepts a format the server refuses wastes a
 * round trip and, on a large file, the user's time. So the vocabulary here is derived from that enum and
 * pinned by tests at the boundary in both directions.
 *
 * Two deliberate asymmetries mirror the server rather than extend it:
 *
 * - **The file name is never consulted.** The server discards it (the stored name is a UUID), so an
 *   accepted image called `holiday.txt` is fine, and a real `.png` that declares `text/plain` is not.
 *   This module therefore validates the declared media type, never the extension.
 * - **Magic bytes are not re-implemented.** The browser has the bytes, and a rename can lie about them,
 *   but the server's sniff is the authority and duplicating its parser here would be a second
 *   implementation to keep in step. A file whose declared type passes this check but whose bytes do not
 *   is refused by the server with `unsupported-image-type`, which the workshop surfaces as a quiet,
 *   retryable failure — the correct outcome, reached one round trip later.
 *
 * Size is the one boundary the server enforces twice (servlet and streaming copy);
 * `parseMaxUploadMb` reads the same documented default, and the tests pin both the accepted edge and the
 * first rejected byte.
 */

/** The media types `ImageFormat` accepts, normalised as the server normalises them. */
export const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
] as const;

/**
 * What the native picker filters on. `image/jpg` is omitted on purpose: it is a non-standard spelling the
 * server tolerates, not one a browser's file dialog knows, and `accept` is a hint, not a validation.
 */
export const ACCEPT_ATTRIBUTE = "image/jpeg,image/png,image/gif,image/webp,image/avif";

/** The extensions the server accepts, as `ImageFormat.acceptedExtensions()` writes them. */
export const ACCEPTED_FORMATS_SENTENCE = "JPEG, PNG, GIF, WebP or AVIF";

const ACCEPTED_TYPE_SET: ReadonlySet<string> = new Set(ACCEPTED_IMAGE_TYPES);

/**
 * The server's default (`aether.storage.max-upload-mb`, `AETHER_MAX_UPLOAD_MB` in `application.yml` and
 * `.env.example`). A deployment that changes the backend key changes the client's build-time mirror with
 * `VITE_MAX_UPLOAD_MB`; the server remains the authority either way, and a client that is wrong by being
 * stricter shows a quiet refusal instead of an upload that would fail.
 */
export const DEFAULT_MAX_UPLOAD_MB = 15;

/** The bounds `StorageProperties` enforces on the same setting. */
export const MIN_MAX_UPLOAD_MB = 1;
export const MAX_MAX_UPLOAD_MB = 1024;

const BYTES_PER_MB = 1024 * 1024;

/**
 * The configured limit, or the documented default when the value is absent or outside the server's own
 * bounds. Parsed rather than trusted: an operator typo must not disable client validation.
 */
export function parseMaxUploadMb(value: string | undefined): number {
  if (value === undefined || value.trim() === "") {
    return DEFAULT_MAX_UPLOAD_MB;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < MIN_MAX_UPLOAD_MB || parsed > MAX_MAX_UPLOAD_MB) {
    return DEFAULT_MAX_UPLOAD_MB;
  }
  return parsed;
}

/** The limit this build validates against, in megabytes and in bytes. */
export const MAX_UPLOAD_MB = parseMaxUploadMb(import.meta.env.VITE_MAX_UPLOAD_MB);
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * BYTES_PER_MB;

/** Why a pick was refused — the three cases the client can decide without the server. */
export type UploadRejection = "empty" | "type" | "size";

/** The verdict on one picked file. A refusal carries the sentence the workshop shows. */
export type UploadValidation =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: UploadRejection; readonly message: string };

/**
 * Normalises a declared media type the way `ImageFormat.forMediaType` does: case-insensitive, with any
 * parameters (`; charset=binary`) dropped. The server is forgiving about both, so the client must be too.
 */
export function normaliseMediaType(mediaType: string): string {
  const semicolon = mediaType.indexOf(";");
  const type = semicolon < 0 ? mediaType : mediaType.slice(0, semicolon);
  return type.trim().toLowerCase();
}

/**
 * The client's pre-upload check, in the server's order: emptiness, then the declared type, then size.
 *
 * `maxBytes` is a parameter so the boundary tests can state their own limit; the app passes the default.
 * A file **exactly at** the limit is accepted — the server's copy stops at the first byte *over* it,
 * measured: 15 MiB answered 201, 15 MiB + 1 answered 413.
 */
export function validateUpload(
  file: Pick<File, "size" | "type">,
  maxBytes: number = MAX_UPLOAD_BYTES,
): UploadValidation {
  if (file.size === 0) {
    return { ok: false, reason: "empty", message: "That file is empty." };
  }
  if (!ACCEPTED_TYPE_SET.has(normaliseMediaType(file.type))) {
    return {
      ok: false,
      reason: "type",
      message: `That file isn't an image the archive can keep. Use a ${ACCEPTED_FORMATS_SENTENCE}.`,
    };
  }
  if (file.size > maxBytes) {
    const limitMb = Math.round(maxBytes / BYTES_PER_MB);
    return {
      ok: false,
      reason: "size",
      message: `That photo is larger than ${limitMb} MB.`,
    };
  }
  return { ok: true };
}
