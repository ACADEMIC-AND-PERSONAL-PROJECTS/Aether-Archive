import type { ProblemDetail } from "../../types/api";

/**
 * The problem bodies the running archive actually wrote, copied from the E2-S2 probe
 * (`reports/verify-e2-s2-20261016.md`) rather than invented — the client tests hand `fetch` the same
 * shapes the real backend produced for the same calls (`.claude/rules/frontend.md`: API payload
 * fixtures live here).
 */

/** `POST /api/v1/dumps` with a photo count other than six: the validation vocabulary, measured. */
export const PROBLEM_400 = {
  type: "about:blank",
  title: "Validation failed",
  status: 400,
  detail:
    "The request failed validation; the 'errors' collection lists the fields that were rejected.",
  instance: "/api/v1/dumps",
  code: "validation-failure",
  errors: [{ field: "photoIds", message: "must name exactly 6 photos" }],
} as const satisfies ProblemDetail;

/** A 500 whose code is the archive's own `internal-failure`. */
export const PROBLEM_500 = {
  type: "about:blank",
  title: "Internal error",
  status: 500,
  detail: "The archive could not process the request.",
  instance: "/api/v1/photos",
  code: "internal-failure",
} as const satisfies ProblemDetail;

/**
 * `POST /api/v1/photos` with a text file declared `image/png`: the server's sniff refused it. Measured
 * in E4-S1's probe (status, content type and body copied from the running backend).
 */
export const PROBLEM_415_UNSUPPORTED = {
  type: "about:blank",
  title: "Unsupported image type",
  status: 415,
  detail:
    "the content of the upload is not a recognised image; the archive accepts jpg, jpeg, png, gif, webp, avif",
  instance: "/api/v1/photos",
  code: "unsupported-image-type",
} as const satisfies ProblemDetail;

/** `POST /api/v1/photos` one byte over the ceiling: measured, 413 with the archive's own code. */
export const PROBLEM_413_TOO_LARGE = {
  type: "about:blank",
  title: "Upload too large",
  status: 413,
  detail: "The upload is larger than the configured limit of 15 MB (AETHER_MAX_UPLOAD_MB).",
  instance: "/api/v1/photos",
  code: "upload-too-large",
} as const satisfies ProblemDetail;
