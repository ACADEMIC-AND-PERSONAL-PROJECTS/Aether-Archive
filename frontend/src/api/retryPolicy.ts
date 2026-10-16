import { ApiError } from "./client";

/**
 * When a failed request is worth sending again, and how long to wait first.
 *
 * The policy is a decision, not a default: TanStack Query ships `retry: 3` with a delay doubling from
 * one second up to thirty (`1000 * 2 ** attemptIndex`, capped at 30000). That is tuned for a remote API
 * that may be having a bad minute. This archive answers in milliseconds, on the same machine or the
 * next one on the LAN, and its failures are almost always *permanent for the moment they happen*: the
 * backend is not running, or it already said no. Three retries over seven seconds would leave a view
 * loading long after the answer was known, which is the opposite of the quiet, immediate state the
 * design asks for (`.claude/rules/frontend.md`).
 *
 * So: **at most two retries**, after 500 ms and 1 s — at worst 1.5 s of waiting before the UI says what
 * happened — and only for failures that a second attempt could plausibly answer differently.
 */

/** Attempts after the first one. Three requests is the worst case for a single query. */
export const MAX_RETRIES = 2;

/** First retry waits this long; each further one doubles. */
const BASE_DELAY_MS = 500;

/** The delay never grows past this, whatever the attempt count. */
const MAX_DELAY_MS = 4_000;

/**
 * Whether one more attempt is worth making.
 *
 * - **`network` and `timeout`** — yes. Something on the way to the archive was briefly unavailable: a
 *   LAN hiccup, a backend still starting, a laptop that just woke up.
 * - **`http` 5xx** — yes. The archive failed to answer, which may be a transient condition (a busy
 *   pool, a lock, the first request after a restart). Nothing in the archive's vocabulary is 5xx-and-
 *   permanent: `storage-failure` and `internal-failure` are both states worth re-reading once.
 * - **`http` 4xx** — no. The archive read the request and refused it: a wrong body, a photo that does
 *   not exist, a path that is not served. Repeating it repeats the refusal, and the client's move is to
 *   change the request or tell the user, never to wait. A retryable 4xx (`429 Too Many Requests`, a
 *   timeout the server reports itself) would need its own entry here — with the code that earns it, not
 *   on the shelf — which is a change to this function and its test.
 * - **`parse`** — no. A `200` whose body is not the documented JSON is a contract break; a retry will
 *   usually reproduce it, and retrying a bug hides it.
 * - **Anything that is not an `ApiError` — no.** The client classifies every transport failure it can,
 *   so an unclassified error came from the query's own function: a broken mapper, a `TypeError`. That
 *   is a bug to surface, not to retry.
 */
export function isRetryable(error: unknown): boolean {
  if (!(error instanceof ApiError)) {
    return false;
  }

  switch (error.kind) {
    case "network":
    case "timeout":
      return true;
    case "http":
      return error.status !== undefined && error.status >= 500;
    case "parse":
      return false;
  }
}

/**
 * TanStack Query's `retry` option: `(failureCount, error)`, where `failureCount` is 0 on the first
 * retry. Exported as a function rather than configured as a number so the "no" cases above are real.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  return failureCount < MAX_RETRIES && isRetryable(error);
}

/**
 * TanStack Query's `retryDelay` option, in milliseconds: 500, 1000, 2000 … capped at 4000. Exponential
 * rather than flat, so two clients that failed together — a phone and a PC on the same LAN — do not
 * come back in lockstep, and slow enough that a backend being restarted has a moment to finish.
 */
export function retryDelay(attemptIndex: number): number {
  return Math.min(BASE_DELAY_MS * 2 ** attemptIndex, MAX_DELAY_MS);
}
