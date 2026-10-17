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
 * The interaction envelope (E4-S3). These are the numbers the Chromium probe measures; pinning them
 * in a unit test means the probe and the component cannot drift apart silently.
 */
describe("the drag envelope", () => {
  it("should keep the mouse threshold small and the touch press long", () => {
    expect(MOUSE_DRAG_DISTANCE_PX).toBe(8);
    expect(TOUCH_LONG_PRESS_DELAY_MS).toBe(250);
    expect(TOUCH_LONG_PRESS_TOLERANCE_PX).toBe(8);
  });

  it("should keep the drop animation under the story's 300 ms ceiling", () => {
    expect(DROP_ANIMATION_MS).toBe(250);
    expect(DROP_ANIMATION_MS).toBeLessThanOrEqual(300);
    expect(SORT_SETTLE_MS).toBeLessThanOrEqual(300);
  });

  it("should auto-scroll from a band inside the container, not from its exact edge", () => {
    expect(AUTO_SCROLL_OPTIONS.threshold.x).toBeGreaterThan(0);
    expect(AUTO_SCROLL_OPTIONS.threshold.x).toBeLessThan(1);
    expect(AUTO_SCROLL_OPTIONS.threshold.y).toBeGreaterThan(0);
    expect(AUTO_SCROLL_OPTIONS.threshold.y).toBeLessThan(1);
    expect(AUTO_SCROLL_OPTIONS.acceleration).toBeGreaterThan(0);
  });
});
