import { useMutation, useQueryClient } from "@tanstack/react-query";

import { ApiError, apiRequest } from "./client";
import { queryKeys } from "./queryKeys";

import type { Dump, DumpCreate, Photo } from "../types/api";

/**
 * The publish wire: `POST /api/v1/dumps` and the optimistic write E4-S5C owns (ADR-024 decision 4).
 *
 * `createDump` is plain TypeScript, reachable without a renderer. `usePublishDump` is the only thing a
 * view sees: it inserts a draft `Dump` at the head of `queryKeys.dumps` before the request, replaces it
 * with the server's answer on success, and restores the previous list on failure — removing the entry
 * entirely when there was none.
 *
 * ## The optimistic entry is named after the draft, not randomly
 *
 * Its id is `optimistic-<first photo id>`. A UUID would depend on `crypto.randomUUID`, which browsers
 * expose only in a secure context — the app is used over plain HTTP on a LAN — and a module counter
 * would make two tests in one file share state. The first photo id is unique per draft (publishing
 * curates those six photos, so the same first photo cannot head a second dump), which is all the
 * replacement needs: the optimistic entry only lives while this mutation is in flight.
 *
 * ## Success is canonical; nothing is invalidated
 *
 * The response is the stored dump, so `onSuccess` swaps the optimistic entry for it — id, title,
 * colour, photos and `createdAt` included — and leaves the rest of the list untouched. A refetch would
 * spend a request to learn what the response already says (ADR-024 decision 4).
 *
 * ## The cache has no reader yet
 *
 * The River's dump feed is a later story; this module prepares the entry it will read. Until then the
 * tests read the cache directly through their own `QueryClient`, which is also what makes the
 * optimistic lifecycle observable without a screen.
 *
 * ## The request is not cancelled on unmount
 *
 * Unlike the upload, the publish takes no `AbortSignal`: leaving the workshop while the request is in
 * flight must not throw away an answer that changes what the archive holds, and a cancelled publish
 * could still have been stored. The 10 s deadline still bounds a wedged backend.
 */

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
 * One sentence for a refused publish. The archive's `detail` is for the operator, never the screen.
 *
 * The 400's fields are the server's own vocabulary (`ValidationConstraints`): `photoIds` covers
 * missing, duplicated and already-curated photos; `backgroundColor` and `title` name themselves. Any
 * other failure — a parse error, a 500, a validation field this client did not expect — falls through
 * to the same quiet sentence, because a stack trace or a server string is not something to show.
 */
export function publishErrorSentence(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.kind === "network" || error.kind === "timeout") {
      return "The archive didn't answer. Try again.";
    }
    if (error.code === "validation-failure") {
      const fields = new Set((error.problem?.errors ?? []).map((violation) => violation.field));
      if (fields.has("photoIds")) {
        return "The archive refused the photos — one may already be in a dump. Reload and try again.";
      }
      if (fields.has("backgroundColor")) {
        return "The archive refused the colour. Choose an aura and save again.";
      }
      if (fields.has("title")) {
        return "The archive refused the title. Shorten it and try again.";
      }
    }
  }
  return "The dump couldn't be saved. Try again.";
}

/**
 * The publish mutation, with the optimistic write and its rollback (ADR-024 decision 4).
 *
 * `onMutate` cancels an in-flight dumps read first — a response landing between the insert and the
 * request would overwrite the optimistic list — then snapshots it. (No hook reads the key yet, so the
 * cancel is a no-op today; it is the contract the first reader inherits.) `onError` restores the
 * snapshot, or removes the key when there was nothing before; `onSuccess` swaps the entry and never
 * invalidates. `retry: false` is the app-wide mutation default: a double publish is not safe to repeat
 * silently.
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
        queryClient.removeQueries({ queryKey: queryKeys.dumps, exact: true });
        return;
      }
      queryClient.setQueryData(queryKeys.dumps, context.previous);
    },
    onSuccess: (dump, request) => {
      const optimisticId = optimisticDumpId(request.body);
      queryClient.setQueryData<readonly Dump[]>(queryKeys.dumps, (dumps) =>
        dumps === undefined
          ? [dump]
          : dumps.map((entry) => (entry.id === optimisticId ? dump : entry)),
      );
    },
  });
}
