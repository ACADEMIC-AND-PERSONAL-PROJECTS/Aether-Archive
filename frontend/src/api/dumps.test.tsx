import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PROBLEM_400, PROBLEM_500 } from "./__fixtures__/problems";
import { ApiError } from "./client";
import { createDump, publishErrorSentence, usePublishDump } from "./dumps";
import { queryKeys } from "./queryKeys";
import { createQueryClient } from "../app/queryClient";

import type { Dump, DumpCreate, Photo, ProblemDetail } from "../types/api";
import type { ReactNode } from "react";

/**
 * The publish wire and its optimistic write (E4-S5C), against a stubbed `fetch` and a real
 * `QueryClient`.
 *
 * The hook's lifecycle is observed through the cache rather than a screen: the River's dump feed is a
 * later story, and ADR-024 decision 4 is a contract about the cache — a draft at the head before the
 * request, the server's dump in its place after it, the previous list back (or gone) when it fails.
 * Problem bodies are the fixtures measured against the running API; the dump's six photos are built
 * from the same ids the body names.
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

function validationProblem(field: string): ProblemDetail {
  return {
    type: "about:blank",
    title: "Validation failed",
    status: 400,
    detail: "The request failed validation.",
    code: "validation-failure",
    errors: [{ field, message: "refused" }],
  };
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function renderPublish() {
  const client = createQueryClient();
  const view = renderHook(() => usePublishDump(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
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

describe("publishErrorSentence", () => {
  it("should name the failure in one quiet sentence", () => {
    const http = (problem: ProblemDetail) =>
      new ApiError("http", "Validation failed (400)", {
        url: "/api/v1/dumps",
        status: 400,
        code: "validation-failure",
        problem,
      });

    expect(
      publishErrorSentence(new ApiError("network", "unreachable", { url: "/api/v1/dumps" })),
    ).toBe("The archive didn't answer. Try again.");
    expect(
      publishErrorSentence(new ApiError("timeout", "deadline", { url: "/api/v1/dumps" })),
    ).toBe("The archive didn't answer. Try again.");
    expect(publishErrorSentence(http(validationProblem("photoIds")))).toBe(
      "The archive refused the photos — one may already be in a dump. Reload and try again.",
    );
    expect(publishErrorSentence(http(validationProblem("backgroundColor")))).toBe(
      "The archive refused the colour. Choose an aura and save again.",
    );
    expect(publishErrorSentence(http(validationProblem("title")))).toBe(
      "The archive refused the title. Shorten it and try again.",
    );
    expect(publishErrorSentence(http(validationProblem("displayOrder")))).toBe(
      "The dump couldn't be saved. Try again.",
    );
  });

  it("should fall back to the quiet sentence for anything else", () => {
    expect(publishErrorSentence(new Error("boom"))).toBe("The dump couldn't be saved. Try again.");
    expect(publishErrorSentence(null)).toBe("The dump couldn't be saved. Try again.");
  });
});

describe("usePublishDump", () => {
  it("should prepend a draft, then replace it with the stored dump", async () => {
    const response = deferred<Response>();
    vi.spyOn(globalThis, "fetch").mockImplementation(() => response.promise);
    const { client, result } = renderPublish();
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
  });

  it("should keep the server's dump when the cache was cleared mid-flight", async () => {
    const response = deferred<Response>();
    vi.spyOn(globalThis, "fetch").mockImplementation(() => response.promise);
    const { client, result } = renderPublish();
    client.setQueryData<readonly Dump[]>(queryKeys.dumps, [OLDER]);

    let pending!: Promise<Dump>;
    await act(async () => {
      pending = result.current.mutateAsync({ body, photos });
    });
    await waitFor(() => expect(dumps(client)).toHaveLength(2));

    client.removeQueries({ queryKey: queryKeys.dumps, exact: true });

    await act(async () => {
      response.resolve(jsonResponse(STORED, 201));
      await pending;
    });

    expect(dumps(client)).toEqual([STORED]);
  });

  it("should restore the previous list when the publish fails", async () => {
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
  });
});
