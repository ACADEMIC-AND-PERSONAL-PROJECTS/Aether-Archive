import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "./client";
import { queryKeys } from "./queryKeys";
import { uploadPhoto, type UploadProgress } from "./uploadPhoto";

import type { Photo } from "../types/api";

/**
 * The photo queries (ADR-004), one function each and one hook on top of it.
 *
 * `fetchRandomPhoto` is plain TypeScript with no React import, so the request and its failure mapping
 * are reachable without a renderer; `useRandomPhoto` is the only thing a view sees.
 */

/** `GET /api/v1/photos/random` — one photo of the archive, chosen by the server on every call. */
export async function fetchRandomPhoto(signal?: AbortSignal): Promise<Photo> {
  // Built conditionally rather than passing `{ signal }` unconditionally: `exactOptionalPropertyTypes`
  // refuses an explicit `undefined` on an optional field, and "no signal" is a real case (a caller
  // that does not want cancellation).
  return apiRequest<Photo>("/photos/random", signal ? { signal } : {});
}

/**
 * How long a random photo stays fresh — **zero**, against the app-wide 30 s (`app/queryClient.ts`).
 *
 * Criterion: "fresh random photo per visit". The default is right for the feed (moving between
 * `/`, `/river` and `/curate` must not re-read what was just read) and wrong for this endpoint: its
 * answer is deliberately different the second time, so a cached one is not a stale copy of the truth,
 * it is a different photo withheld. Measured: with the defaults, an unmount and a remount inside the
 * same 30 s served the cached photo and issued **no** request at all (probe output in the PR).
 */
export const RANDOM_PHOTO_STALE_TIME_MS = 0;

/**
 * How long the cached photo survives its last observer — also **zero**.
 *
 * `staleTime` alone is not enough: it makes the cached photo stale, but the cache would still *hold*
 * it, so returning to the splash would paint the previous visit's photo first and swap it a moment
 * later — the wrong photo, visibly, on the one screen whose whole promise is a new one. Dropping the
 * entry on unmount means a visit starts from nothing and fetches.
 *
 * Cost, stated: in dev, `StrictMode` double-mounts, so a visit issues two requests there. In the built
 * app it is one per visit, which the browser probe confirms.
 */
export const RANDOM_PHOTO_GC_TIME_MS = 0;

/**
 * The splash hero's photo. `data` is absent while loading and after a failure — the caller branches on
 * `isPending` / `isError` (and on `error.code` for the empty archive) rather than on a placeholder.
 */
export function useRandomPhoto() {
  return useQuery({
    queryKey: queryKeys.randomPhoto,
    queryFn: ({ signal }) => fetchRandomPhoto(signal),
    staleTime: RANDOM_PHOTO_STALE_TIME_MS,
    gcTime: RANDOM_PHOTO_GC_TIME_MS,
  });
}

/** One upload in flight: the file, the caller's cancellation, and the progress callback. */
export interface UploadPhotoRequest {
  readonly file: File;
  readonly signal: AbortSignal;
  readonly onProgress: (progress: UploadProgress) => void;
}

/**
 * `POST /api/v1/photos`, with the cache update E4-S1B's fourth criterion names.
 *
 * **One invalidation covers both consumers.** `queryKeys.randomPhoto` is `["photos", "random"]`, a child
 * of `queryKeys.photos`, and TanStack matches invalidation by prefix — so a successful upload marks the
 * feed *and* the splash hero stale without a second call. That is the intended meaning of the key
 * layout (`api/queryKeys.ts`): an upload changes what the archive holds, and the two views must never
 * disagree about it.
 *
 * **Only success invalidates.** The callback is `onSuccess`, not `onSettled`: a refused or cancelled
 * upload changed nothing the archive holds, and marking the feed stale would spend a request to confirm
 * it. Both directions are pinned by the hook's tests — a failure leaving the queries untouched is as
 * much a part of the contract as a success invalidating them.
 *
 * **The splash's per-visit policy is untouched.** It lives on the query (zero `staleTime`, zero
 * `gcTime`), not on the key; invalidation does not resurrect an entry the splash dropped on unmount.
 * While the workshop is mounted the splash is not, so there is usually nothing to mark — and when the
 * splash returns it asks again either way.
 *
 * **`retry: false` comes from the app-wide mutation defaults** (`app/queryClient.ts`): an upload is not
 * idempotent from the client's point of view, and the user watching a failure is the one who chooses to
 * retry. The workshop's "Try again" is that explicit choice.
 */
export function useUploadPhoto() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: UploadPhotoRequest) =>
      uploadPhoto(request.file, {
        signal: request.signal,
        onProgress: request.onProgress,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.photos });
    },
  });
}
