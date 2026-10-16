import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, apiRequest, resolveApiUrl } from "./client";

/**
 * The API client's failure mapping, exercised against a stubbed `fetch`.
 *
 * `fetch` is spied on rather than mocked by a library: the client's whole job is to read what `fetch`
 * gives back, so the tests hand it the exact shapes the runtime produces — a `Response` for anything the
 * server answered, a rejected promise for anything it did not. Those shapes were measured against a real
 * HTTP server first (`frontend/README.md`, "How a failure arrives"); nothing here is guessed.
 */

const PROBLEM_400 = {
  type: "about:blank",
  title: "Validation failed",
  status: 400,
  detail:
    "The request failed validation; the 'errors' collection lists the fields that were rejected.",
  instance: "/api/v1/dumps",
  code: "validation-failure",
  errors: [{ field: "photoIds", message: "must name exactly 6 photos" }],
} as const;

const PROBLEM_500 = {
  type: "about:blank",
  title: "Internal error",
  status: 500,
  detail: "The archive could not process the request.",
  instance: "/api/v1/photos",
  code: "internal-failure",
} as const;

/** A response carrying a problem body, as `ApiExceptionHandler` writes one. */
function problemResponse(problem: unknown, status: number): Response {
  return new Response(JSON.stringify(problem), {
    status,
    headers: { "content-type": "application/problem+json" },
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function spyOnFetch() {
  return vi.spyOn(globalThis, "fetch");
}

/**
 * The URL and init of one call to the stubbed `fetch`.
 *
 * Asserted field by field rather than with `toHaveBeenCalledWith`, because every request also carries a
 * fresh timeout signal: comparing the whole init would match on an object that is *supposed* to differ
 * from call to call.
 */
function callTo(
  fetchSpy: ReturnType<typeof spyOnFetch>,
  index = 0,
): { url: RequestInfo | URL | undefined; init: RequestInit | undefined } {
  const [url, init] = fetchSpy.mock.calls[index] ?? [];
  return { url, init };
}

/**
 * A `fetch` that never answers on its own and rejects with its own signal's reason the moment it is
 * aborted — which is what the real one does (measured: an expired `AbortSignal.timeout` rejects with a
 * `TimeoutError` named `DOMException`, a cancelled request with an `AbortError`).
 */
function stallUntilAborted(): void {
  spyOnFetch().mockImplementation(
    (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal ?? undefined;
        signal?.addEventListener("abort", () => reject(signal.reason));
      }),
  );
}

/** What a request rejected with, asserted to be the app's own error before it is used as one. */
async function rejectionOf(request: Promise<unknown>): Promise<ApiError> {
  const thrown = await request.catch((error: unknown) => error);
  expect(thrown).toBeInstanceOf(ApiError);
  return thrown as ApiError;
}

/** The same, for the rejections that are deliberately *not* an {@link ApiError}. */
async function rawRejectionOf(request: Promise<unknown>): Promise<unknown> {
  return request.catch((error: unknown) => error);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveApiUrl", () => {
  it("should keep the path same-origin when VITE_API_BASE_URL is not set", () => {
    expect(resolveApiUrl("/api/v1/photos")).toBe("/api/v1/photos");
  });

  it("should keep the path same-origin when VITE_API_BASE_URL is empty", () => {
    vi.stubEnv("VITE_API_BASE_URL", "");

    expect(resolveApiUrl("/api/v1/dumps")).toBe("/api/v1/dumps");
  });

  it("should prefix the configured origin when VITE_API_BASE_URL is set", () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://192.168.1.20:8080");

    expect(resolveApiUrl("/api/v1/photos")).toBe("http://192.168.1.20:8080/api/v1/photos");
  });

  it("should not double the slash when the configured origin ends with one", () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://192.168.1.20:8080/");

    expect(resolveApiUrl("/api/v1/dumps")).toBe("http://192.168.1.20:8080/api/v1/dumps");
  });
});

describe("apiRequest — the successful path", () => {
  it("should request the contract path under /api/v1 on the app's own origin", async () => {
    const fetchSpy = spyOnFetch().mockResolvedValue(jsonResponse([]));

    await apiRequest("/photos");

    const { url, init } = callTo(fetchSpy);
    expect(url).toBe("/api/v1/photos");
    expect(init?.method).toBe("GET");
    expect(init?.body).toBeUndefined();
  });

  it("should compose a configured origin, the prefix and the path exactly once", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://192.168.1.20:8080");
    const fetchSpy = spyOnFetch().mockResolvedValue(jsonResponse([]));

    await apiRequest("/photos");

    // Pinned because the E2-S2 probe caught the opposite: a base that already ends in `/api/v1`
    // produced `…/api/v1/api/v1/photos` and a 404, while every unit test still passed.
    expect(callTo(fetchSpy).url).toBe("http://192.168.1.20:8080/api/v1/photos");
  });

  it("should arm a deadline on every request", async () => {
    const fetchSpy = spyOnFetch().mockResolvedValue(jsonResponse([]));

    await apiRequest("/photos");

    const { init } = callTo(fetchSpy);
    expect(init?.signal).toBeDefined();
    expect(init?.signal?.aborted).toBe(false);
  });

  it("should return the parsed body typed by the caller", async () => {
    spyOnFetch().mockResolvedValue(jsonResponse([{ id: "a", url: "/images/a.png" }]));

    const photos = await apiRequest<readonly { id: string }[]>("/photos");

    expect(photos).toHaveLength(1);
    expect(photos[0]?.id).toBe("a");
  });

  it("should send the method, headers and body of a write", async () => {
    const fetchSpy = spyOnFetch().mockResolvedValue(jsonResponse({ id: "d1" }, 201));

    await apiRequest("/dumps", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Septembre" }),
    });

    const { url, init } = callTo(fetchSpy);
    expect(url).toBe("/api/v1/dumps");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({ "content-type": "application/json" });
    expect(init?.body).toBe(JSON.stringify({ title: "Septembre" }));
  });

  it("should resolve with undefined when the archive answers without a body", async () => {
    spyOnFetch().mockResolvedValue(new Response(null, { status: 204 }));

    await expect(apiRequest("/photos/42b6608a")).resolves.toBeUndefined();
  });
});

describe("apiRequest — 4xx", () => {
  it("should carry the archive's own code from the problem body", async () => {
    spyOnFetch().mockResolvedValue(problemResponse(PROBLEM_400, 400));

    const error = await rejectionOf(apiRequest("/dumps", { method: "POST" }));

    expect(error.kind).toBe("http");
    expect(error.status).toBe(400);
    expect(error.code).toBe("validation-failure");
    expect(error.url).toBe("/api/v1/dumps");
  });

  it("should keep the rejected fields of a validation problem", async () => {
    spyOnFetch().mockResolvedValue(problemResponse(PROBLEM_400, 400));

    const error = await rejectionOf(apiRequest("/dumps", { method: "POST" }));

    expect(error.problem?.title).toBe("Validation failed");
    expect(error.problem?.errors).toEqual([
      { field: "photoIds", message: "must name exactly 6 photos" },
    ]);
  });

  it("should still classify a 404 that has no body to read", async () => {
    spyOnFetch().mockResolvedValue(new Response("", { status: 404 }));

    const error = await rejectionOf(apiRequest("/photos/unknown"));

    expect(error.kind).toBe("http");
    expect(error.status).toBe(404);
    expect(error.code).toBeUndefined();
    expect(error.problem).toBeUndefined();
  });

  it("should keep the status when the failure body is not JSON at all", async () => {
    spyOnFetch().mockResolvedValue(
      new Response("<html>502 Bad Gateway</html>", {
        status: 502,
        headers: { "content-type": "text/html" },
      }),
    );

    const error = await rejectionOf(apiRequest("/photos"));

    expect(error.kind).toBe("http");
    expect(error.status).toBe(502);
    expect(error.problem).toBeUndefined();
  });
});

describe("apiRequest — 5xx", () => {
  it("should classify a 500 as an http failure carrying internal-failure", async () => {
    spyOnFetch().mockResolvedValue(problemResponse(PROBLEM_500, 500));

    const error = await rejectionOf(apiRequest("/photos"));

    expect(error.kind).toBe("http");
    expect(error.status).toBe(500);
    expect(error.code).toBe("internal-failure");
  });

  it("should not report a 500 as a request that never arrived", async () => {
    spyOnFetch().mockResolvedValue(problemResponse(PROBLEM_500, 500));

    const error = await rejectionOf(apiRequest("/photos"));

    // The archive answered, so the UI must not tell the user the API is unreachable.
    expect(error.kind).not.toBe("network");
    expect(error.kind).not.toBe("timeout");
  });
});

describe("apiRequest — the request never arriving", () => {
  it("should classify a refused connection as a network failure without a status", async () => {
    spyOnFetch().mockRejectedValue(new TypeError("fetch failed"));

    const error = await rejectionOf(apiRequest("/photos"));

    expect(error.kind).toBe("network");
    expect(error.status).toBeUndefined();
    expect(error.code).toBeUndefined();
  });

  it("should classify an unresolvable host the same way", async () => {
    spyOnFetch().mockRejectedValue(new TypeError("fetch failed"));

    const error = await rejectionOf(apiRequest("/random"));

    expect(error.kind).toBe("network");
    expect(error.url).toBe("/api/v1/random");
  });

  it("should classify an expired deadline as a timeout when nothing answers", async () => {
    stallUntilAborted();

    const error = await rejectionOf(apiRequest("/photos", { timeoutMs: 20 }));

    expect(error.kind).toBe("timeout");
    expect(error.status).toBeUndefined();
  });

  it("should rethrow the browser's own abort when the caller cancels", async () => {
    stallUntilAborted();
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 5);

    const error = await rawRejectionOf(
      apiRequest("/photos", { signal: controller.signal, timeoutMs: 5_000 }),
    );

    // A cancellation is not a failure: reporting it would leave a view in an error state for a request
    // the user themselves walked away from.
    expect(error).not.toBeInstanceOf(ApiError);
    expect((error as Error).name).toBe("AbortError");
  });

  it("should give up on its own deadline even while the caller is still waiting", async () => {
    stallUntilAborted();
    const controller = new AbortController();

    const error = await rejectionOf(
      apiRequest("/photos", { signal: controller.signal, timeoutMs: 20 }),
    );

    expect(error.kind).toBe("timeout");
    expect(controller.signal.aborted).toBe(false);
  });
});

describe("apiRequest — a broken success", () => {
  it("should classify a body that is not JSON as a parse failure", async () => {
    spyOnFetch().mockResolvedValue(
      new Response("<html>proxy</html>", { status: 200, headers: { "content-type": "text/html" } }),
    );

    const error = await rejectionOf(apiRequest("/photos"));

    expect(error.kind).toBe("parse");
    expect(error.status).toBeUndefined();
  });
});
