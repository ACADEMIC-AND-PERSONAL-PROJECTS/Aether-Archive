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
