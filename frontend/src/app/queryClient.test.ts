import { describe, expect, it, vi } from "vitest";

import { DEFAULT_STALE_TIME_MS, createQueryClient } from "./queryClient";
import { ApiError } from "../api/client";
import { MAX_RETRIES, retryDelay, shouldRetry } from "../api/retryPolicy";

/**
 * The wiring between the documented retry policy and the cache the app actually uses.
 *
 * `api/retryPolicy.test.ts` proves the policy's decisions; these tests prove that a query running
 * through a real `QueryClient` obeys them — that a network failure is in fact retried, and that a 400 is
 * in fact not. Without them the policy could be perfect and unreferenced.
 *
 * The delay is overridden per query to a millisecond so the tests do not spend 1.5 s waiting; the
 * *decision* to retry still comes from the client's defaults, which is the part under test.
 */

const NO_WAIT = { retryDelay: () => 1 };

describe("createQueryClient", () => {
  it("should hand the documented retry policy to every query", () => {
    const client = createQueryClient();

    expect(client.getDefaultOptions().queries?.retry).toBe(shouldRetry);
    expect(client.getDefaultOptions().queries?.retryDelay).toBe(retryDelay);
  });

  it("should keep reads fresh for the documented window", () => {
    const client = createQueryClient();

    expect(client.getDefaultOptions().queries?.staleTime).toBe(DEFAULT_STALE_TIME_MS);
  });

  it("should never retry a write", () => {
    const client = createQueryClient();

    expect(client.getDefaultOptions().mutations?.retry).toBe(false);
  });

  it("should give each app instance its own cache", () => {
    expect(createQueryClient()).not.toBe(createQueryClient());
  });
});

describe("a query that fails", () => {
  it("should retry a network failure until the budget is spent", async () => {
    const client = createQueryClient();
    const queryFn = vi
      .fn()
      .mockRejectedValue(new ApiError("network", "unreachable", { url: "/x" }));

    await expect(
      client.fetchQuery({ queryKey: ["photos"], queryFn, ...NO_WAIT }),
    ).rejects.toBeInstanceOf(ApiError);

    expect(queryFn).toHaveBeenCalledTimes(1 + MAX_RETRIES);
  });

  it("should not retry a refusal the archive has already given", async () => {
    const client = createQueryClient();
    const queryFn = vi.fn().mockRejectedValue(
      new ApiError("http", "Validation failed (400)", {
        url: "/x",
        status: 400,
        code: "validation-failure",
      }),
    );

    await expect(
      client.fetchQuery({ queryKey: ["dumps"], queryFn, ...NO_WAIT }),
    ).rejects.toBeInstanceOf(ApiError);

    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it("should recover when a retry succeeds", async () => {
    const client = createQueryClient();
    const queryFn = vi
      .fn()
      .mockRejectedValueOnce(new ApiError("timeout", "no answer", { url: "/x" }))
      .mockResolvedValueOnce({ id: "a" });

    await expect(
      client.fetchQuery({ queryKey: ["randomPhoto"], queryFn, ...NO_WAIT }),
    ).resolves.toEqual({ id: "a" });

    expect(queryFn).toHaveBeenCalledTimes(2);
  });
});
