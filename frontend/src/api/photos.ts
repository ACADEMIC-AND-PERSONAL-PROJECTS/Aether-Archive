import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "./client";
import { queryKeys } from "./queryKeys";

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
 * The splash hero's photo. `data` is absent while loading and after a failure — the caller branches on
 * `isPending` / `isError` (and on `error.code` for the empty archive) rather than on a placeholder.
 *
 * **Caching, for now: the app-wide default** (`app/queryClient.ts`: 30 s `staleTime`). This endpoint is
 * per-visit state by nature — it answers differently on purpose, so a cached answer is not a stale copy
 * of the truth but a different photo withheld. The per-visit policy (`staleTime: 0` **and** `gcTime: 0`;
 * measured across an unmount and a remount inside one client: defaults → 1 request, the policy → 2)
 * belongs to **E3-S1B**, the follow-up slice of this story — the same slice that adds the re-roll which
 * makes a second visit observable at all. Until it lands, a second visit inside 30 s is served the
 * cached photo and issues no request; ADR-021 keeps the decision and its measurement so the slice can
 * restore them rather than rediscover them.
 */
export function useRandomPhoto() {
  return useQuery({
    queryKey: queryKeys.randomPhoto,
    queryFn: ({ signal }) => fetchRandomPhoto(signal),
  });
}
