/**
 * The pull-to-refresh decision, as three pure boundaries.
 *
 * A gestural refresh is a threshold in disguise, and a threshold nobody wrote down is a threshold that
 * drifts. These constants are the whole vocabulary — how far a finger must travel before releasing it
 * means "again", and how much movement still counts as a tap — and they are unit-tested at their edges
 * (`pullToRefresh.test.ts`) rather than tuned by feel inside an event handler.
 *
 * Nothing here moves anything on screen: this story's pull is silent, and the photo's arrival is its
 * feedback (see `usePullToRefresh` for why the finger-following transform is E3-S3's).
 */

/**
 * The `touch-action` the gesture's surface must carry, and the only CSS this story needs.
 *
 * Measured in Chromium with a synthesised touch drag on the built bundle, and it is not optional: with
 * the default `touch-action: auto` the browser claims the vertical drag for scrolling after the first
 * move, and the pointer stream ends `pointerdown → pointermove → pointercancel` — the gesture is dead on
 * a phone, and no test in jsdom can notice, because jsdom never claims a gesture. With
 * `pan-x pinch-zoom` the whole stream arrives (`pointerdown → pointermove ×8 → pointerup`) and the pull
 * re-rolls. Horizontal panning stays available (there is nothing to pan here, so it is inert) and
 * **pinch-zoom stays enabled** — `touch-action: none` would work as well and would take zoom away from
 * the one screen a user is most likely to want it on.
 *
 * Two utilities rather than one arbitrary value because Tailwind v4 composes this property from three
 * variables (`--tw-pan-x`, `--tw-pan-y`, `--tw-pinch-zoom`) and emits
 * `touch-action: var(--tw-pan-x,) var(--tw-pan-y,) var(--tw-pinch-zoom,)`, which is precisely an
 * "these and nothing else" list — measured in `dist/`, not read off the docs.
 *
 * Probe output in the PR; `SplashView.test.tsx` pins that the surface still declares it, which is the
 * only half jsdom can hold.
 */
export const PULL_SURFACE_TOUCH_ACTION = "touch-pan-x touch-pinch-zoom";

/**
 * Downward travel that must be reached before releasing re-rolls the photo.
 *
 * In the range phones already train their owners on — iOS refreshes at roughly this much pull — and
 * large enough that a downward flick from the menu gesture cannot trigger it by accident.
 */
export const PULL_THRESHOLD_PX = 72;

/**
 * Movement above which a gesture has stopped being a tap.
 *
 * A finger that travels further than this is dragging: the release must not also count as the tap that
 * opens the menu, or a short pull would both re-roll and open the overlay. 16 px is the top of the
 * design system's own entry drift (§5) — small enough that a deliberate tap with a shaky finger still
 * opens the menu, large enough that a drag never does.
 */
export const TAP_SLOP_PX = 16;

/** How far a drag has travelled downwards, i.e. away from where it started. Upward travel is 0. */
export function pullDistance(startY: number, currentY: number): number {
  return Math.max(0, currentY - startY);
}

/** Whether a released drag has travelled far enough to mean "another photo". */
export function isPull(distance: number): boolean {
  return distance >= PULL_THRESHOLD_PX;
}

/** Whether a gesture travelled far enough to stop being a tap. */
export function isDrag(distance: number): boolean {
  return distance > TAP_SLOP_PX;
}
