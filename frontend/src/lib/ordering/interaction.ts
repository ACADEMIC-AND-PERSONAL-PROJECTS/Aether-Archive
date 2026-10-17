/**
 * The drag's interaction envelope, as data (E4-S3B, completed in E4-S3C).
 *
 * Every number a finger or a clock can feel is stated once, so the probe and the report can name the
 * same value the component uses. The sensors read the first three; the sortable settle and the
 * overlay's drop animation read the next two; auto-scroll reads the last.
 *
 * ## Why two activation constraints
 *
 * A mouse has no scroll to protect, so 8 px of travel is enough to tell a click from a drag; waiting
 * for a press would make the grid feel sticky. A finger *does* have a scroll to protect, so touch
 * waits 250 ms and abandons the pending drag once it travels more than 8 px — a swipe scrolls, a
 * long press lifts. The `touch-action: manipulation` on the tile keeps the swipe native (dnd-kit's
 * touch sensor can then `preventDefault` once the drag has really started), and pinch-zoom is not
 * removed from the screen.
 *
 * The values are plain numbers, not imports from `@dnd-kit`: this module stays testable anywhere,
 * and the component is where they meet the library's option types.
 */

/** Mouse travel before the drag starts — a click is not a drag. */
export const MOUSE_DRAG_DISTANCE_PX = 8;

/** How long a finger must stay still on a tile before the drag starts. */
export const TOUCH_LONG_PRESS_DELAY_MS = 250;

/** Movement during the long press that turns the gesture back into a scroll. */
export const TOUCH_LONG_PRESS_TOLERANCE_PX = 8;

/** The tiles' settle transition while a dragged tile displaces its neighbours. */
export const SORT_SETTLE_MS = 200;

/**
 * The overlay's drop animation. Deliberately below the story's 300 ms ceiling: the drop is tactile
 * feedback, not a cinematic exit, and a constant makes the budget checkable without a browser.
 */
export const DROP_ANIMATION_MS = 250;

/**
 * Auto-scroll: the distance from the scroll container's edge, as a fraction of its height, at which
 * the grid starts moving, and how quickly it accelerates. Passed to `DndContext`'s `autoScroll`,
 * which walks up from the dragged tile to the `overflow-y-auto` grid scroller.
 */
export const AUTO_SCROLL_OPTIONS = {
  threshold: { x: 0.15, y: 0.18 },
  acceleration: 8,
  interval: 5,
} as const;
