import { describe, expect, it } from "vitest";

import {
  MOUSE_DRAG_DISTANCE_PX,
  SORT_SETTLE_MS,
  TOUCH_LONG_PRESS_DELAY_MS,
  TOUCH_LONG_PRESS_TOLERANCE_PX,
} from "./interaction";

/**
 * The gesture envelope (E4-S3B). These are the numbers the Chromium probe measures; pinning them in a
 * unit test means the probe and the component cannot drift apart silently.
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
});
