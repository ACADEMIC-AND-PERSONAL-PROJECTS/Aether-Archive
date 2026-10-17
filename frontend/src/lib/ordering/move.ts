/**
 * The display order, as one pure reducer (E4-S3).
 *
 * The workshop's `items` array **is** the order. There is no second `order` field to keep in sync, no
 * index stored on a tile and no sorting step at render time: dropping a tile produces one new array,
 * and the slot a photo occupies is its index. A future publish payload therefore reads
 * `items.map(item => item.id)` — `displayOrder` is the index, 0–5 for a six-photo dump. Keeping the
 * array as the single source is what lets the reducer be tested without React and what makes a move
 * impossible to half-apply.
 *
 * ## The rules
 *
 * - `from` and `to` are **clamped** into `[0, length - 1]`. A drag's `over` id always exists in the
 *   grid, so clamping is a guard for the caller, not a feature the drag relies on.
 * - A non-integer index is a caller bug and leaves the array untouched. The browser's drag sensors
 *   only ever produce integers; refusing fractions here keeps `splice` from silently truncating one
 *   and moving a photo the caller did not name.
 * - Any move whose clamped endpoints are equal is a **no-op that returns the same reference**. React
 *   can then skip the re-render, and the workshop does not create a new array for a drag that ended
 *   where it began.
 * - The destination is the index in the **resulting** array: `moveItem([a, b, c], 0, 2)` is
 *   `[b, c, a]`, exactly `arrayMove`'s contract and the one the drag overlay's drop measures.
 *
 * `orderedIds` is the payload projection, not a second source of truth. The test for it states the
 * contract the future publish endpoint will consume: ids in display order, and the index is the
 * `displayOrder` value.
 */

/** Clamps an integer index into `[0, length - 1]`. `length` is assumed non-zero by the caller. */
function clampIndex(index: number, length: number): number {
  return Math.min(length - 1, Math.max(0, index));
}

/**
 * Moves the item at `from` to `to`, returning a new array — or the input array itself when the move
 * changes nothing. Never mutates.
 */
export function moveItem<T>(items: readonly T[], from: number, to: number): readonly T[] {
  const length = items.length;
  if (length < 2 || !Number.isInteger(from) || !Number.isInteger(to)) {
    return items;
  }

  const start = clampIndex(from, length);
  const end = clampIndex(to, length);
  if (start === end) {
    return items;
  }

  const next = [...items];
  const moved = next[start];
  if (moved === undefined) {
    return items;
  }
  next.splice(start, 1);
  next.splice(end, 0, moved);
  return next;
}

/**
 * The order a publish payload will carry: ids in display order. `displayOrder` is the index in this
 * list (0–5 for a dump), so nothing else needs to compute it.
 */
export function orderedIds<T extends { readonly id: string }>(items: readonly T[]): string[] {
  return items.map((item) => item.id);
}
