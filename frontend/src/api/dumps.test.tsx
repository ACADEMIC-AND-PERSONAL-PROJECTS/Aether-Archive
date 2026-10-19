import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PROBLEM_400, PROBLEM_500 } from "./__fixtures__/problems";
import { ApiError } from "./client";
import { createDump, fetchDumps, useDumps, usePublishDump } from "./dumps";
import { queryKeys } from "./queryKeys";
import { createQueryClient } from "../app/queryClient";

import type { Dump, DumpCreate, Photo } from "../types/api";
import type { ReactNode } from "react";

/**
 * The publish wire and its optimistic write (E4-S5C), against a stubbed `fetch` and a real
 * `QueryClient`. ADR-024 decision 4 is a contract about the cache — a draft at the head before the
 * request, the server's dump in its place after it, the previous list back (or gone) when it fails,
 * exactly once even when a read raced the request. The reader E5-S1A mounts — `useDumps` — shares the
 * same client, so the draft's effect on a mounted observer is observable; `fetchDumps` and `useDumps`
 * are pinned in the last two describes. Problem bodies are the measured fixtures; the six photos are
 * built from the ids the body names.
 */

function photo(id: string): Photo {
  return {
    id,
    url: `/images/${id}.png`,
    category: "uncategorized",
    uploadedAt: "2026-10-18T21:00:00Z",
  };
}

const SIX = ["photo-a", "photo-b", "photo-c", "photo-d", "photo-e", "photo-f"];

const body: DumpCreate = {
  title: "Summer",
  backgroundColor: "#1f7a7a",
  photoIds: SIX,
};

const photos = SIX.map(photo);

const STORED: Dump = {
  id: "3f4d2a9e-0c1b-4a7d-9e2f-6b8c0d1e2f3a",
  title: "Summer",
  backgroundColor: "#1f7a7a",
  photos,
  createdAt: "2026-10-18T22:00:00Z",
};

const OLDER: Dump = {
  id: "0a1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d",
  title: null,
  backgroundColor: "#001421",
  photos: SIX.map((id) => photo(`old-${id}`)),
  createdAt: "2026-10-01T00:00:00Z",
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function problemResponse(problem: unknown, status: number): Response {
  return new Response(JSON.stringify(problem), {
    status,
    headers: { "content-type": "application/problem+json" },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function renderPublish(client = createQueryClient()) {
  const view = renderHook(() => usePublishDump(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  return { client, ...view };
}

/**
 * The publish action next to its real reader — `useDumps` (E5-S1A) — sharing one client, so the
 * draft's effect on a mounted observer is observable.
 */
function renderWithReader(client = createQueryClient()) {
  const view = renderHook(
    () => ({
      publish: usePublishDump(),
      read: useDumps(),
    }),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    },
  );
  return { client, ...view };
}

/** The dumps list the cache holds, or an empty array when the key was removed. */
function dumps(client: ReturnType<typeof createQueryClient>): readonly Dump[] {
  return client.getQueryData<readonly Dump[]>(queryKeys.dumps) ?? [];
}

describe("createDump", () => {
  it("should POST the plan's body and resolve with the stored dump", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(STORED, 201));

    await expect(createDump(body)).resolves.toEqual(STORED);

    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe("/api/v1/dumps");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(String(init?.body))).toEqual(body);
  });

  it("should reject a validation failure as the archive's own error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(problemResponse(PROBLEM_400, 400));

    const thrown = await createDump(body).catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(ApiError);
    expect(thrown).toMatchObject({
      kind: "http",
      status: 400,
      code: "validation-failure",
    });
  });
});

describe("usePublishDump", () => {
  it("should prepend a draft, then replace it with the stored dump", async () => {
    const response = deferred<Response>();
    vi.spyOn(globalThis, "fetch").mockImplementation(() => response.promise);
    const { client, result } = renderPublish();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    client.setQueryData<readonly Dump[]>(queryKeys.dumps, [OLDER]);

    let pending!: Promise<Dump>;
    await act(async () => {
      pending = result.current.mutateAsync({ body, photos });
    });
    await waitFor(() => expect(dumps(client)).toHaveLength(2));

    const optimistic = dumps(client);
    expect(optimistic.map((entry) => entry.id)).toEqual([`optimistic-${SIX[0]}`, OLDER.id]);
    expect(optimistic[0]).toMatchObject({
      title: "Summer",
      backgroundColor: "#1f7a7a",
      photos,
    });
    expect(optimistic[0]?.createdAt).toEqual(expect.any(String));

    await act(async () => {
      response.resolve(jsonResponse(STORED, 201));
      await pending;
    });

    expect(dumps(client)).toEqual([STORED, OLDER]);
    // The response is canonical; a refetch would spend a request to learn nothing (ADR-024 §4).
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("should land the server's dump exactly once when the cache changed mid-flight", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { client, result } = renderPublish();
    let pending!: Promise<Dump>;

    // The cache was cleared while the publish was in flight: the dump still lands.
    const cleared = deferred<Response>();
    fetchSpy.mockImplementation(() => cleared.promise);
    client.setQueryData<readonly Dump[]>(queryKeys.dumps, [OLDER]);
    await act(async () => {
      pending = result.current.mutateAsync({ body, photos });
    });
    await waitFor(() => expect(dumps(client)).toHaveLength(2));
    client.removeQueries({ queryKey: queryKeys.dumps, exact: true });
    await act(async () => {
      cleared.resolve(jsonResponse(STORED, 201));
      await pending;
    });
    expect(dumps(client)).toEqual([STORED]);

    // A read repopulated the list while the publish was in flight: the draft is gone, but the dump
    // still lands at the head.
    const repopulated = deferred<Response>();
    fetchSpy.mockImplementation(() => repopulated.promise);
    await act(async () => {
      pending = result.current.mutateAsync({ body, photos });
    });
    await waitFor(() => expect(dumps(client)).toHaveLength(2));
    client.setQueryData<readonly Dump[]>(queryKeys.dumps, [OLDER]);
    await act(async () => {
      repopulated.resolve(jsonResponse(STORED, 201));
      await pending;
    });
    expect(dumps(client)).toEqual([STORED, OLDER]);

    // The read raced ahead and already delivered the dump: the response must not duplicate it.
    const delivered = deferred<Response>();
    fetchSpy.mockImplementation(() => delivered.promise);
    await act(async () => {
      pending = result.current.mutateAsync({ body, photos });
    });
    await waitFor(() => expect(dumps(client)).toHaveLength(3));
    await act(async () => {
      delivered.resolve(jsonResponse(STORED, 201));
      await pending;
    });
    expect(dumps(client)).toEqual([STORED, OLDER]);
  });

  it("should restore the list it found when the publish fails", async () => {
    const response = deferred<Response>();
    vi.spyOn(globalThis, "fetch").mockImplementation(() => response.promise);
    const { client, result } = renderPublish();
    client.setQueryData<readonly Dump[]>(queryKeys.dumps, [OLDER]);

    let pending!: Promise<unknown>;
    await act(async () => {
      pending = result.current.mutateAsync({ body, photos }).catch((error: unknown) => error);
    });
    await waitFor(() => expect(dumps(client)).toHaveLength(2));

    await act(async () => {
      response.resolve(problemResponse(PROBLEM_400, 400));
      await pending;
    });

    expect(dumps(client)).toEqual([OLDER]);

    // An empty *list* is a value to restore; only `undefined` is "there was nothing".
    const second = deferred<Response>();
    vi.spyOn(globalThis, "fetch").mockImplementation(() => second.promise);
    client.setQueryData<readonly Dump[]>(queryKeys.dumps, []);
    await act(async () => {
      pending = result.current.mutateAsync({ body, photos }).catch((error: unknown) => error);
    });
    await waitFor(() => expect(dumps(client)).toHaveLength(1));

    await act(async () => {
      second.resolve(problemResponse(PROBLEM_400, 400));
      await pending;
    });

    expect(client.getQueryData(queryKeys.dumps)).toEqual([]);
  });

  it("should remove the entry entirely when there was no list before", async () => {
    const response = deferred<Response>();
    vi.spyOn(globalThis, "fetch").mockImplementation(() => response.promise);
    const { client, result } = renderPublish();

    let pending!: Promise<unknown>;
    await act(async () => {
      pending = result.current.mutateAsync({ body, photos }).catch((error: unknown) => error);
    });
    await waitFor(() => expect(dumps(client)).toHaveLength(1));

    await act(async () => {
      response.resolve(problemResponse(PROBLEM_500, 500));
      await pending;
    });

    expect(client.getQueryData(queryKeys.dumps)).toBeUndefined();
    // `resetQueries`, not `removeQueries`: the entry is gone, but the query is left able to fetch
    // again for the reader E5-S1 mounts — a destroyed query would leave it with phantom data.
    expect(client.getQueryState(queryKeys.dumps)?.status).toBe("pending");
  });

  it("should abort an in-flight dumps read before inserting the draft", async () => {
    const read = deferred<Response>();
    const publish = deferred<Response>();
    const readSignals: AbortSignal[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) => {
      if (init?.method === "POST") {
        return publish.promise;
      }
      if (init?.signal) {
        readSignals.push(init.signal);
      }
      return read.promise;
    });
    const client = createQueryClient();
    // The real reader's load (E5-S1A): a dumps GET still in flight when the publish starts.
    void client
      .fetchQuery({
        queryKey: queryKeys.dumps,
        queryFn: ({ signal }) => fetchDumps(signal),
      })
      .catch(() => undefined);
    const { result } = renderPublish(client);
    await waitFor(() => expect(readSignals).toHaveLength(1));

    let pending!: Promise<Dump>;
    await act(async () => {
      pending = result.current.mutateAsync({ body, photos });
    });
    await waitFor(() => expect(dumps(client)[0]?.id).toBe(`optimistic-${SIX[0]}`));

    // The read was cancelled before the draft went in: a late answer cannot overwrite it.
    expect(readSignals[0]?.aborted).toBe(true);

    await act(async () => {
      publish.resolve(jsonResponse(STORED, 201));
      await pending;
    });
    expect(dumps(client)).toEqual([STORED]);
  });

  it("should clear a failed draft for a mounted reader and refetch", async () => {
    const firstRead = deferred<Response>();
    const refetch = deferred<Response>();
    const publish = deferred<Response>();
    let reads = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) => {
      if (init?.method === "POST") {
        return publish.promise;
      }
      reads += 1;
      return reads === 1 ? firstRead.promise : refetch.promise;
    });
    // The reader's first load is still in flight, so the cache holds no list when the publish starts.
    const { result } = renderWithReader();
    await waitFor(() => expect(reads).toBe(1));

    let pending!: Promise<unknown>;
    await act(async () => {
      pending = result.current.publish
        .mutateAsync({ body, photos })
        .catch((error: unknown) => error);
    });
    // The reader sees the draft while the publish is in flight.
    await waitFor(() => expect(result.current.read.data?.[0]?.id).toBe(`optimistic-${SIX[0]}`));

    await act(async () => {
      publish.resolve(problemResponse(PROBLEM_400, 400));
      await pending;
    });

    // The draft is gone for the reader — not a destroyed query with phantom data — and the reader is
    // asking the archive again.
    await waitFor(() => expect(result.current.read.data).toBeUndefined());
    await waitFor(() => expect(reads).toBe(2));
    expect(result.current.read.fetchStatus).toBe("fetching");

    await act(async () => {
      refetch.resolve(jsonResponse([OLDER]));
    });
    await waitFor(() => expect(result.current.read.data).toEqual([OLDER]));
  });
});

describe("fetchDumps", () => {
  it("should GET the whole list and return it in the order served", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse([STORED, OLDER]));

    await expect(fetchDumps()).resolves.toEqual([STORED, OLDER]);

    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe("/api/v1/dumps");
    expect(init?.method).toBe("GET");
  });

  it("should reject a failing archive as the archive's own error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(problemResponse(PROBLEM_500, 500));

    const thrown = await fetchDumps().catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(ApiError);
    expect(thrown).toMatchObject({ kind: "http", status: 500, code: "internal-failure" });
  });
});

describe("useDumps", () => {
  it("should resolve with the whole list for the feed", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse([STORED, OLDER]));
    const { result } = renderWithReader();

    await waitFor(() => expect(result.current.read.isSuccess).toBe(true));
    expect(result.current.read.data).toEqual([STORED, OLDER]);
  });

  it("should not re-read what was just read when the view moves and returns", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse([STORED]));
    const client = createQueryClient();

    const first = renderWithReader(client);
    await waitFor(() => expect(first.result.current.read.isSuccess).toBe(true));
    first.unmount();

    const second = renderWithReader(client);
    await waitFor(() => expect(second.result.current.read.isSuccess).toBe(true));

    // One request for two mounts: the 30 s staleTime is the feed's rule (`app/queryClient.ts`).
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
