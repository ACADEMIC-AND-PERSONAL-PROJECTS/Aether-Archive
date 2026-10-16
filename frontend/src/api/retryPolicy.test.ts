import { describe, expect, it } from "vitest";

import { ApiError } from "./client";
import { MAX_RETRIES, isRetryable, retryDelay, shouldRetry } from "./retryPolicy";

/**
 * The retry policy, case by case.
 *
 * Every branch of `isRetryable` is a decision the app's behaviour depends on — a 4xx retried three times
 * is a request the user waits an extra seven seconds for, and a network failure not retried is a "the API
 * is down" screen shown for a backend that was merely still starting. Both directions are asserted.
 */

function apiError(kind: ApiError["kind"], status?: number): ApiError {
  return new ApiError(kind, `${kind} failure`, {
    url: "/api/v1/photos",
    ...(status === undefined ? {} : { status }),
  });
}

describe("isRetryable", () => {
  it("should retry a request that never reached the archive", () => {
    expect(isRetryable(apiError("network"))).toBe(true);
  });

  it("should retry a request that ran out of time", () => {
    expect(isRetryable(apiError("timeout"))).toBe(true);
  });

  it("should retry a 500", () => {
    expect(isRetryable(apiError("http", 500))).toBe(true);
  });

  it("should retry a 503", () => {
    expect(isRetryable(apiError("http", 503))).toBe(true);
  });

  it("should not retry a validation failure", () => {
    expect(isRetryable(apiError("http", 400))).toBe(false);
  });

  it("should not retry a 404", () => {
    expect(isRetryable(apiError("http", 404))).toBe(false);
  });

  it("should not retry a conflict the client has to resolve first", () => {
    expect(isRetryable(apiError("http", 409))).toBe(false);
  });

  it("should not retry a 422", () => {
    expect(isRetryable(apiError("http", 422))).toBe(false);
  });

  it("should not retry a broken success body", () => {
    expect(isRetryable(apiError("parse"))).toBe(false);
  });

  it("should not retry an http failure with no status to judge", () => {
    expect(isRetryable(apiError("http"))).toBe(false);
  });

  it("should not retry an error the client did not classify", () => {
    expect(isRetryable(new TypeError("boom"))).toBe(false);
    expect(isRetryable("boom")).toBe(false);
    expect(isRetryable(undefined)).toBe(false);
  });
});

describe("shouldRetry", () => {
  it("should retry a network failure while attempts remain", () => {
    expect(shouldRetry(0, apiError("network"))).toBe(true);
    expect(shouldRetry(MAX_RETRIES - 1, apiError("network"))).toBe(true);
  });

  it("should stop at the retry budget", () => {
    expect(shouldRetry(MAX_RETRIES, apiError("network"))).toBe(false);
    expect(shouldRetry(MAX_RETRIES + 5, apiError("network"))).toBe(false);
  });

  it("should never retry a refusal, however few attempts were made", () => {
    expect(shouldRetry(0, apiError("http", 400))).toBe(false);
    expect(shouldRetry(0, apiError("http", 404))).toBe(false);
  });

  it("should spend at most two extra requests on one query", () => {
    expect(MAX_RETRIES).toBe(2);
  });
});

describe("retryDelay", () => {
  it("should wait half a second before the first retry", () => {
    expect(retryDelay(0)).toBe(500);
  });

  it("should double the wait for each further retry", () => {
    expect(retryDelay(1)).toBe(1_000);
    expect(retryDelay(2)).toBe(2_000);
  });

  it("should stop growing at the ceiling", () => {
    expect(retryDelay(3)).toBe(4_000);
    expect(retryDelay(20)).toBe(4_000);
  });
});
