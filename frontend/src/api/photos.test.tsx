import { QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PROBLEM_500 } from "./__fixtures__/problems";
import { ApiError } from "./client";
import { fetchPhotos, usePhotos } from "./photos";
import { createQueryClient } from "../app/queryClient";

import type { Photo } from "../types/api";
import type { ReactNode } from "react";

/**
 * The feed's read (E5-S1A): `GET /api/v1/photos` as the whole list, one query on the existing
 * `["photos"]` key.
 *
 * Against a stubbed `fetch` and a real `QueryClient`. What is pinned here: the contract path, the
 * order as served (display order is the feed model's business, S1B), the classified failure, and the
 * one promise this query itself makes — moving away and back inside the 30 s window does not re-read
 * (`app/queryClient.ts`).
 */

function photo(id: string, uploadedAt: string): Photo {
  return { id, url: `/images/${id}.png`, category: "pics", uploadedAt };
}

/** Newest first, the order `GET /photos` serves (`_docs/openapi.yml`). */
const SERVED: readonly Photo[] = [
  photo("11111111-1111-4111-8111-111111111111", "2026-10-18T21:00:00Z"),
  photo("22222222-2222-4222-8222-222222222222", "2026-09-30T08:00:00Z"),
];

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("fetchPhotos", () => {
  it("should GET the whole list and return it in the order served", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(SERVED));

    await expect(fetchPhotos()).resolves.toEqual(SERVED);

    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe("/api/v1/photos");
    expect(init?.method).toBe("GET");
  });

  it("should return an empty list for an empty archive", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse([]));

    await expect(fetchPhotos()).resolves.toEqual([]);
  });

  it("should reject a failing archive as the archive's own error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(PROBLEM_500), {
        status: 500,
        headers: { "content-type": "application/problem+json" },
      }),
    );

    const thrown = await fetchPhotos().catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(ApiError);
    expect(thrown).toMatchObject({ kind: "http", status: 500, code: "internal-failure" });
  });

  it("should reject an unreachable archive as a network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed"));

    const thrown = await fetchPhotos().catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(ApiError);
    expect(thrown).toMatchObject({ kind: "network" });
  });
});

function renderPhotos(client = createQueryClient()) {
  const view = renderHook(() => usePhotos(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  return { client, ...view };
}

describe("usePhotos", () => {
  it("should resolve with the whole list", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(SERVED));
    const { result } = renderPhotos();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(SERVED);
  });

  it("should not re-read what was just read when the view moves and returns", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(SERVED));
    const client = createQueryClient();

    const first = renderPhotos(client);
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    first.unmount();

    const second = renderPhotos(client);
    await waitFor(() => expect(second.result.current.isSuccess).toBe(true));

    // One request for two mounts: the 30 s staleTime is the feed's rule (`app/queryClient.ts`).
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
