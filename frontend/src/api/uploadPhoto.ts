import { ApiError, parseProblemDetail, resolveApiUrl } from "./client";

import type { Photo } from "../types/api";

/**
 * The upload transport: `POST /api/v1/photos` over `XMLHttpRequest`, because it is the only browser API
 * that reports **upload** progress and can cancel a request in flight (E4-S1B).
 *
 * ## Why not `fetch`
 *
 * `fetch` reports a response's progress, not a request's. Browser Fetch exposes no upload-progress event;
 * streaming a request body with `duplex: "half"` is Chromium-only at the time of writing and would leave
 * Safari — a target this mobile-first app cannot treat as a fallback — with no progress at all. MDN's
 * `XMLHttpRequest.upload` page is the reference for both facts, and records the ordering constraint this
 * module obeys: listeners must be attached before `send()`, or upload events are not dispatched. XHR is
 * not a second API layer: the URL, the `ApiError` mapping and the problem-body parser are shared with
 * `client.ts`, so a failure behaves the same whichever transport carried it.
 *
 * ## What the request carries
 *
 * `file` is the picked image and `category` is the contract's required field. The workshop has no
 * category control yet, so it sends `uncategorized` — the honest value for a photo that is not curated
 * into a dump, and the one the archive documents for exactly that. A future picker changes this one
 * constant, not the request shape.
 *
 * ## What it never does
 *
 * It never builds a server path from the file: the archive regenerates the name as a UUID. It reads the
 * file only through `FormData`, keeps no copy after the request settles, and logs nothing — not the name,
 * not the bytes.
 *
 * ## Cancellation is not a rollback
 *
 * `abort()` stops this client from waiting and asks the browser to stop sending. It cannot promise the
 * archive stored nothing: a cancel that arrives after the server has already accepted the body and
 * called `StorageService.store` may still have stored the photo. The caller therefore says only that
 * the upload was cancelled, never that nothing was saved; the photo, if it landed, is visible on the
 * next refresh. The README states this caveat, and no probe here claims more than it observed.
 */

/** The contract's required category for an upload that is not yet curated (ADR-011). */
export const UPLOAD_CATEGORY = "uncategorized";

/**
 * How long one upload may take. Longer than `client.ts`'s 10 s read deadline on purpose: a 15 MB photo
 * over a slow phone connection is a legitimate request, and abandoning it would turn patience into a
 * failure. It still bounds a wedged backend.
 */
export const UPLOAD_TIMEOUT_MS = 120_000;

/** Bytes sent so far, and the request's total when the browser can know it. */
export interface UploadProgress {
  readonly loaded: number;
  /** `0` when the browser cannot compute the length (`lengthComputable === false`). */
  readonly total: number;
}

export interface UploadPhotoOptions {
  /** The caller's cancellation signal. Aborting it aborts the request; cancellation is not a failure. */
  readonly signal?: AbortSignal;
  /** Called on every `upload.onprogress` event. Never called after the promise settles. */
  readonly onProgress?: (progress: UploadProgress) => void;
  /** Milliseconds before the request is abandoned. `0` disables the deadline. */
  readonly timeoutMs?: number;
}

/**
 * Uploads one photo and resolves with the created row.
 *
 * @throws {ApiError} every failure — HTTP, network, timeout or an unreadable body.
 * @throws the caller's own abort reason when cancelled: `AbortController`'s `signal.reason`, unchanged.
 */
export function uploadPhoto(file: File, options: UploadPhotoOptions = {}): Promise<Photo> {
  const url = resolveApiUrl("/api/v1/photos");
  const timeoutMs = options.timeoutMs ?? UPLOAD_TIMEOUT_MS;
  const { signal, onProgress } = options;

  return new Promise<Photo>((resolve, reject) => {
    // A request started after the caller already cancelled must not open a socket at all.
    if (signal?.aborted === true) {
      reject(signal.reason);
      return;
    }

    const xhr = new XMLHttpRequest();
    let settled = false;

    const finish = (): void => {
      settled = true;
      signal?.removeEventListener("abort", abortRequest);
    };

    const fail = (error: unknown): void => {
      if (settled) {
        return;
      }
      finish();
      reject(error);
    };

    function abortRequest(): void {
      xhr.abort();
    }

    // Listeners are attached before `open`/`send`: MDN records that upload events are not dispatched
    // otherwise, and browser behaviour around the order has historically varied.
    xhr.upload.onprogress = (event: ProgressEvent): void => {
      if (settled) {
        return;
      }
      onProgress?.({
        loaded: event.loaded,
        total: event.lengthComputable ? event.total : 0,
      });
    };

    xhr.onload = (): void => {
      if (settled) {
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        let photo: Photo;
        try {
          photo = JSON.parse(xhr.responseText) as Photo;
        } catch {
          fail(
            new ApiError("parse", `The archive answered with a body that is not JSON (${url}).`, {
              url,
            }),
          );
          return;
        }
        finish();
        resolve(photo);
        return;
      }
      const problem = problemOf(xhr);
      fail(
        new ApiError("http", describeFailure(xhr, problem), {
          url,
          status: xhr.status,
          code: problem?.code,
          problem,
        }),
      );
    };

    xhr.onerror = (): void => {
      fail(new ApiError("network", "The archive could not be reached during the upload.", { url }));
    };

    xhr.ontimeout = (): void => {
      fail(
        new ApiError("timeout", `No answer from the archive within the upload deadline (${url}).`, {
          url,
        }),
      );
    };

    xhr.onabort = (): void => {
      // The caller's own reason travels unchanged, exactly as `fetch` passes an abort through. The
      // fallback exists for a browser that aborts without a caller signal (and for older engines whose
      // `AbortSignal.reason` is not yet the default `AbortError`).
      fail(signal?.reason ?? new DOMException("The upload was cancelled.", "AbortError"));
    };

    if (timeoutMs > 0) {
      xhr.timeout = timeoutMs;
    }

    signal?.addEventListener("abort", abortRequest, { once: true });

    xhr.open("POST", url);
    xhr.send(buildBody(file));
  });
}

/** The multipart body: the file under the contract's `file` part, plus the required category. */
function buildBody(file: File): FormData {
  const body = new FormData();
  body.append("file", file);
  body.append("category", UPLOAD_CATEGORY);
  return body;
}

/**
 * The RFC 9457 body of a failed response, when the archive sent one. Tolerant like `client.ts`'s reader:
 * a proxy's HTML error page still fails as an HTTP error carrying its status.
 */
function problemOf(xhr: XMLHttpRequest): ReturnType<typeof parseProblemDetail> {
  const contentType = xhr.getResponseHeader("content-type") ?? "";
  if (!contentType.includes("json")) {
    return undefined;
  }
  try {
    return parseProblemDetail(JSON.parse(xhr.responseText));
  } catch {
    return undefined;
  }
}

/** A sentence for the log, mirroring `client.ts`: the archive's title, or the status. */
function describeFailure(
  xhr: XMLHttpRequest,
  problem: ReturnType<typeof parseProblemDetail>,
): string {
  const title = problem?.title ?? xhr.statusText;
  return title ? `${title} (${xhr.status})` : `The archive answered ${xhr.status}.`;
}
