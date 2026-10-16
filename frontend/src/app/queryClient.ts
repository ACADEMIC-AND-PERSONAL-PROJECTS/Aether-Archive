import { QueryClient } from "@tanstack/react-query";

import { retryDelay, shouldRetry } from "../api/retryPolicy";

/**
 * The query cache and the defaults every query in the app inherits.
 *
 * Set here rather than per query, so that a view written in a later story cannot accidentally invent its
 * own retry behaviour: the four options below are the whole data policy of the app, and each is a
 * decision with a reason.
 *
 * - **`retry: shouldRetry`** — at most two attempts, and only for failures a retry could answer
 *   differently. The policy and its reasoning live in `api/retryPolicy.ts`; this is only the wiring.
 * - **`retryDelay`** — 500 ms, then 1 s, capped at 4 s (same file).
 * - **`staleTime: 30_000`** — the archive changes only when its owner changes it, through this app, and a
 *   change is followed by an explicit cache invalidation. Without a `staleTime` every navigation between
 *   `/`, `/river` and `/curate` re-fetches what was just read; thirty seconds is long enough to make
 *   moving around free and short enough that a second tab's upload appears without a reload.
 * - **`refetchOnWindowFocus: false`** — on a phone, "focus" is every app switch. The archive is not a
 *   live feed, and re-requesting a screenful of photos on every return would spend the LAN's bandwidth
 *   to show what did not change. `refetchOnReconnect` keeps its default (on): a genuinely lost
 *   connection is worth recovering from.
 * - **`networkMode: "always"`** — deliberately *not* the default `"online"`. This app talks to an API on
 *   the same machine, the LAN or the same container, and the browser's online flag describes its route to
 *   the *internet*. A phone on a LAN with no internet is exactly the case the app is built for, and a
 *   query paused by `navigator.onLine` there would hang forever with no error to retry.
 * - **Mutations: `retry: false`** — an upload or a publish is not idempotent from the client's point of
 *   view, and the user who just tapped "publish" is watching. A failure is reported at once; retrying a
 *   write automatically is a decision for the story that owns the write (E4), never a default.
 */
export const DEFAULT_STALE_TIME_MS = 30_000;

/**
 * A fresh cache. A function rather than a module-level singleton: a singleton is shared by every test
 * that renders the app, so one test's data leaks into the next one's assertions, and it survives a
 * hot reload in the browser when it should not.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetry,
        retryDelay,
        staleTime: DEFAULT_STALE_TIME_MS,
        refetchOnWindowFocus: false,
        networkMode: "always",
      },
      mutations: {
        retry: false,
        networkMode: "always",
      },
    },
  });
}
