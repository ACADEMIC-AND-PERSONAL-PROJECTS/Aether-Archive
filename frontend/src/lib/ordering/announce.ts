/**
 * What a screen reader hears while a photo is moved (E4-S3).
 *
 * dnd-kit's default announcements name the internal ids ("Draggable item selection-2 was moved over
 * droppable area selection-4"). The ids here are generated, so that sentence describes the DOM, not
 * the photo. These builders speak in the vocabulary the grid already uses — "Photo 2 of 6" — and
 * state the destination as a **position**, which is the only thing a move changes. The wording is a
 * decision, so it lives in pure functions with exact-string tests rather than in JSX.
 *
 * Positions are 1-based on purpose: "position 4" is what a person counts, while the workshop and the
 * reducer stay 0-based. `clampPosition` keeps a malformed call from producing "Photo 0 of 6"; the
 * grid never announces an empty list, so a non-positive total is treated as one photo.
 */

/** Clamps a 1-based position into `[1, total]`; a non-finite position reads as the first photo. */
function clampPosition(position: number, total: number): number {
  const safeTotal = Math.max(1, Math.trunc(total));
  const safePosition = Number.isFinite(position) ? Math.trunc(position) : 1;
  return Math.min(safeTotal, Math.max(1, safePosition));
}

/** The pick-up announcement: what was lifted, and every key that can finish or abandon the move. */
export function pickupAnnouncement(position: number, total: number): string {
  const at = clampPosition(position, total);
  const count = Math.max(1, Math.trunc(total));
  return `Photo ${at} of ${count} picked up. Use the arrow keys to move it, Space or Enter to drop, Escape to cancel.`;
}

/** An over change: the photo's current position and the position it is now over. */
export function moveAnnouncement(position: number, total: number, destination: number): string {
  const at = clampPosition(position, total);
  const count = Math.max(1, Math.trunc(total));
  const to = clampPosition(destination, total);
  return `Photo ${at} of ${count} moved to position ${to}.`;
}

/** The drop: the photo's final position, after the array has been reordered. */
export function dropAnnouncement(destination: number, total: number): string {
  const count = Math.max(1, Math.trunc(total));
  const at = clampPosition(destination, total);
  return `Photo ${at} of ${count} dropped.`;
}

/** Esc, or a drop outside the grid: the photo stayed where it was. */
export function cancelAnnouncement(position: number, total: number): string {
  const at = clampPosition(position, total);
  const count = Math.max(1, Math.trunc(total));
  return `Move cancelled. Photo ${at} of ${count} is back in position ${at}.`;
}

/**
 * The instructions dnd-kit attaches to every draggable tile (through `aria-describedby`). It is the
 * custom wording for our grid; the default is similar but never names the arrow keys' meaning.
 */
export const SCREEN_READER_INSTRUCTIONS =
  "To move a photo, press Space or Enter to pick it up. While it is picked up, use the arrow keys to move it, Space or Enter to drop it, or Escape to cancel.";
