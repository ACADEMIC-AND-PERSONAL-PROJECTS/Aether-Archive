import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "./client";
import { queryKeys } from "./queryKeys";

import type { Dump, DumpCreate, Photo } from "../types/api";

/**
 * The publish wire: `POST /api/v1/dumps` and the optimistic write E4-S5C owns (ADR-024 decision 4).
 *
 * `createDump` is plain TypeScript, reachable without a renderer. `usePublishDump` inserts a draft
 * `Dump` at the head of `queryKeys.dumps` before the request, replaces it with the server's answer on
 * success, and restores the previous list on failure — resetting the query when there was none.
 *
 * **The optimistic id is `optimistic-<first photo id>`, not a UUID.** `crypto.randomUUID` exists only
 * in a secure context, the app is used over plain HTTP on a LAN, and a module counter would leak
 * between tests; publishing curates the six photos, so the same first photo cannot head a second
 * draft, and the entry only lives while the mutation is in flight.
 *
 * **Success is canonical; nothing is invalidated.** The response is the stored dump, so `onSuccess`
 * lands it at the head and drops the optimistic entry and any copy a read raced in — exactly once. A
 * refetch would spend a request to learn what the response already says.
 *
 * **The reader arrived with E5-S1A, and the failure sentences with E4-S5D.** `useDumps` below is the
 * River feed's read, and the mounted reader is what `onMutate`'s cancel protects: a response landing
 * between its optimistic insert and the request would overwrite the draft. The hook still exposes the
 * `ApiError` and says nothing about it — the error→sentence vocabulary lives in the view that shows
 * the sentence, not here. Unlike the upload, the publish takes no `AbortSignal` — leaving the view
 * must not throw away an answer that changes what the archive holds; the 10 s deadline still bounds a
 * wedged backend.
 */

/** `GET /api/v1/dumps` — every dump ever published, newest first, its photos in display order. */
export async function fetchDumps(signal?: AbortSignal): Promise<readonly Dump[]> {
  return apiRequest<readonly Dump[]>("/dumps", signal ? { signal } : {});
}

/**
 * The reader E4-S5C prepared this module for: the River's dump query (E5-S1A).
 *
 * Defaults from the app-wide policy (`app/queryClient.ts`), deliberately nothing on top: the 30 s
 * `staleTime` covers moving between views, and every change to this list arrives through the cache
 * rather than a refetch — `usePublishDump` below lands the server's dump itself (ADR-024 §4).
 */
export function useDumps() {
  return useQuery({
    queryKey: queryKeys.dumps,
    queryFn: ({ signal }) => fetchDumps(signal),
  });
}

/** One publish: the body the plan produced and the six photos it names, in display order. */
export interface PublishDumpRequest {
  readonly body: DumpCreate;
  readonly photos: readonly Photo[];
}

/** `POST /api/v1/dumps` — resolves with the stored dump, its photos in display order. */
export async function createDump(body: DumpCreate): Promise<Dump> {
  return apiRequest<Dump>("/dumps", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** The optimistic entry's id: the draft it stands for, so `onSuccess` can find it again. */
function optimisticDumpId(body: DumpCreate): string {
  const first = body.photoIds[0];
  return first === undefined ? "optimistic-draft" : `optimistic-${first}`;
}

/** The draft `Dump` the list shows while the request is in flight. */
function optimisticDump(request: PublishDumpRequest): Dump {
  return {
    id: optimisticDumpId(request.body),
    title: request.body.title,
    backgroundColor: request.body.backgroundColor,
    photos: request.photos,
    createdAt: new Date().toISOString(),
  };
}

/**
 * The publish mutation, with the optimistic write and its rollback (ADR-024 decision 4).
 *
 * `onMutate` cancels an in-flight dumps read — a response landing between the insert and the request
 * would overwrite the optimistic list — then snapshots it. `onError` restores the snapshot, or resets
 * the query when there was nothing before; `onSuccess` lands the server's dump and never invalidates.
 * `retry: false` is the app-wide mutation default: a double publish is not safe to repeat silently,
 * and the panel disables the action while one is in flight (E4-S5D) — one publish at a time, so the
 * snapshot the rollback restores is always the list as the *one* publish found it.
 */
export function usePublishDump() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: PublishDumpRequest) => createDump(request.body),
    onMutate: async (request) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.dumps });
      const previous = queryClient.getQueryData<readonly Dump[]>(queryKeys.dumps);
      queryClient.setQueryData<readonly Dump[]>(queryKeys.dumps, (dumps) => [
        optimisticDump(request),
        ...(dumps ?? []),
      ]);
      return { previous };
    },
    onError: (_error, _request, context) => {
      if (context?.previous === undefined) {
        // `resetQueries`, not `removeQueries`: the entry must go, but a mounted reader has to be told
        // and left able to fetch again. `removeQueries` would leave it watching a destroyed query
        // with phantom data (E5-S1 mounts the first reader).
        void queryClient.resetQueries({ queryKey: queryKeys.dumps, exact: true });
        return;
      }
      queryClient.setQueryData(queryKeys.dumps, context.previous);
    },
    onSuccess: (dump, request) => {
      const optimisticId = optimisticDumpId(request.body);
      // Prepend the canonical dump and drop the optimistic entry and any copy of the dump a read may
      // have delivered while the request was in flight: the response is the truth, and it appears
      // exactly once.
      queryClient.setQueryData<readonly Dump[]>(queryKeys.dumps, (dumps) => [
        dump,
        ...(dumps ?? []).filter((entry) => entry.id !== optimisticId && entry.id !== dump.id),
      ]);
    },
  });
}
