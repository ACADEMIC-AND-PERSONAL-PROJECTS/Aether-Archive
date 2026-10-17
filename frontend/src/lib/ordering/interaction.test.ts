import { describe, expect, it } from "vitest";

import {
  AUTO_SCROLL_OPTIONS,
  DROP_ANIMATION_MS,
  MOUSE_DRAG_DISTANCE_PX,
  SORT_SETTLE_MS,
  TOUCH_LONG_PRESS_DELAY_MS,
  TOUCH_LONG_PRESS_TOLERANCE_PX,
} from "./interaction";

/**
 * The gesture envelope (E4-S3B), auto-scroll's band and the motion it settles with (E4-S3C). These
 * are the numbers the Chromium probe measures; pinning them in a unit test means the probe and the
 * component cannot drift apart silently.
 */
describe("the drag envelope", () => {
  it("should keep the mouse threshold small and the touch press long", () => {
    expect(MOUSE_DRAG_DISTANCE_PX).toBe(8);
    expect(TOUCH_LONG_PRESS_DELAY_MS).toBe(250);
    expect(TOUCH_LONG_PRESS_TOLERANCE_PX).toBe(8);
  });

  it("should keep the settle under the story's 300 ms ceiling", () => {
    expect(SORT_SETTLE_MS).toBeLessThanOrEqual(300);
  });

  it("should keep the drop animation under the 300 ms ceiling", () => {
    expect(DROP_ANIMATION_MS).toBe(250);
    expect(DROP_ANIMATION_MS).toBeLessThanOrEqual(300);
  });

  it("should pin auto-scroll's tuned values, not merely their sign", () => {
    // Exact values: a silent revert to dnd-kit's defaults would keep the probe's "scrolling happens"
    // assertion true while the tuning the story measured disappeared.
    expect(AUTO_SCROLL_OPTIONS).toEqual({
      threshold: { x: 0.15, y: 0.18 },
      acceleration: 8,
      interval: 5,
    });
  });
});
