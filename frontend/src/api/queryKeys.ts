import type { QueryKey } from "@tanstack/react-query";

/**
 * Every cache key in the app, in one file (ADR-004).
 *
 * Keys are written once here and imported by the query hooks, never typed inline at a call site: a
 * key is a cache address, and two spellings of the same address silently double the cache and leave
 * one copy stale. Later stories extend this object — a filtered feed adds a segment to an existing
 * tuple rather than inventing a second root.
 *
 * The prefixes are deliberate. TanStack Query matches by prefix, so invalidating `queryKeys.photos`
 * also invalidates `queryKeys.randomPhoto`, which is exactly right: an upload changes the feed *and*
 * the splash hero, and the two must never disagree about what the archive holds.
 */
export const queryKeys = {
  /** The archive's feed, newest first (`GET /api/v1/photos`). */
  photos: ["photos"] as const,

  /** One random photo for the splash hero (`GET /api/v1/photos/random`); `empty-archive` when there is none. */
  randomPhoto: ["photos", "random"] as const,

  /** Every monthly dump, with its photos in display order (`GET /api/v1/dumps`). */
  dumps: ["dumps"] as const,
} as const satisfies Record<string, QueryKey>;
