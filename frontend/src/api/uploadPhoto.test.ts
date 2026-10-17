import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeXhr, onlyRequest } from "./__fixtures__/fakeXhr";
import { PROBLEM_415_UNSUPPORTED } from "./__fixtures__/problems";
import { UPLOAD_TIMEOUT_MS, uploadPhoto, type UploadProgress } from "./uploadPhoto";

import type { Photo } from "../types/api";

/**
 * The upload transport, driven through the XHR contract it actually uses.
 *
 * The fake (api/__fixtures__/fakeXhr.ts) is the seam: jsdom has no server, and a stubbed `fetch` could
 * not exercise the progress and abort paths this story exists to prove. What is real here is the shipped
 * code — the URL composition, the multipart body, the listener order, the `ApiError` classification and
 * the RFC 9457 parsing. What is faked is only the browser's network edge.
 */

const PICKED = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "photo.png", {
  type: "image/png",
});

const PHOTO: Photo = {
  id: "9f1c0a3e-6a58-4b0e-9c5a-1f3d7a2b4c6d",
  url: "/images/9f1c0a3e-6a58-4b0e-9c5a-1f3d7a2b4c6d.png",
  category: "uncategorized",
  uploadedAt: "2026-10-17T03:46:21.684975Z",
};

beforeEach(() => {
  FakeXhr.reset();
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a successful upload", () => {
  it("should post the file and the required category to the contract path", async () => {
    const promise = uploadPhoto(PICKED);
    const request = onlyRequest();

    expect(request.method).toBe("POST");
    expect(request.url).toBe("/api/v1/photos");
    expect(request.timeout).toBe(UPLOAD_TIMEOUT_MS);
    // MDN's warning, pinned: an upload listener attached after `send` may miss every event.
    expect(request.progressAttachedBeforeSend).toBe(true);

    const body = request.body;
    expect(body).toBeInstanceOf(FormData);
    if (body instanceof FormData) {
      expect(body.get("file")).toBe(PICKED);
      expect(body.get("category")).toBe("uncategorized");
    }

    request.respond(201, PHOTO);
    await expect(promise).resolves.toEqual(PHOTO);
  });

  it("should report every progress event, and total 0 when the length is unknown", async () => {
    const seen: UploadProgress[] = [];
    const promise = uploadPhoto(PICKED, {
      onProgress: (progress) => seen.push(progress),
    });
    const request = onlyRequest();

    request.emitProgress(25, 100);
    request.emitProgress(100, 0);
    request.respond(201, PHOTO);
    await promise;

    expect(seen).toEqual([
      { loaded: 25, total: 100 },
      { loaded: 100, total: 0 },
    ]);
  });

  it("should honour a caller-supplied deadline", () => {
    void uploadPhoto(PICKED, { timeoutMs: 1234 });
    expect(onlyRequest().timeout).toBe(1234);
  });
});

describe("a failed upload", () => {
  it("should classify a refusal and keep the archive's code and problem body", async () => {
    const promise = uploadPhoto(PICKED);
    onlyRequest().respond(415, PROBLEM_415_UNSUPPORTED, "application/problem+json");

    await expect(promise).rejects.toMatchObject({
      name: "ApiError",
      kind: "http",
      status: 415,
      code: "unsupported-image-type",
      problem: { title: "Unsupported image type" },
    });
  });

  it("should keep a status even when the failure body is not JSON", async () => {
    const promise = uploadPhoto(PICKED);
    onlyRequest().respond(500, "<html>proxy error</html>", "text/html");

    await expect(promise).rejects.toMatchObject({
      kind: "http",
      status: 500,
      code: undefined,
    });
  });

  it("should classify a transport failure as network", async () => {
    const promise = uploadPhoto(PICKED);
    onlyRequest().failNetwork();

    await expect(promise).rejects.toMatchObject({ kind: "network" });
  });

  it("should classify the browser's timeout as a timeout", async () => {
    const promise = uploadPhoto(PICKED);
    onlyRequest().expire();

    await expect(promise).rejects.toMatchObject({ kind: "timeout" });
  });

  it("should classify an unreadable success body as a parse failure", async () => {
    const promise = uploadPhoto(PICKED);
    onlyRequest().respond(201, "this is not json", "application/json");

    await expect(promise).rejects.toMatchObject({ kind: "parse" });
  });
});

describe("cancellation", () => {
  it("should abort the request and reject with the caller's own reason", async () => {
    const controller = new AbortController();
    const promise = uploadPhoto(PICKED, { signal: controller.signal });
    const request = onlyRequest();

    controller.abort();

    expect(request.aborted).toBe(true);
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  });

  it("should not open a request when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    const promise = uploadPhoto(PICKED, { signal: controller.signal });

    expect(FakeXhr.instances).toHaveLength(0);
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  });
});
