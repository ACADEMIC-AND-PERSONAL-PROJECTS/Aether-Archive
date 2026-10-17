import { describe, expect, it } from "vitest";

import {
  cancelAnnouncement,
  dropAnnouncement,
  moveAnnouncement,
  pickupAnnouncement,
  SCREEN_READER_INSTRUCTIONS,
} from "./announce";

/**
 * The announcement copy (E4-S3D1), pinned as exact strings.
 *
 * A screen-reader sentence is a decision, not a by-product of JSX: the copy decision is
 * "Photo 2 of 6 moved to position 4.", and a wrong position or a plural that drifts is a defect a
 * visual review would never catch. The clamp cases keep a malformed call from saying "Photo 0 of 6".
 */

describe("the greeting and the move", () => {
  it("should say what was picked up and which keys finish or abandon it", () => {
    expect(pickupAnnouncement(2, 6)).toBe(
      "Photo 2 of 6 picked up. Use the arrow keys to move it, Space or Enter to drop, Escape to cancel.",
    );
  });

  it("should name the position and the destination", () => {
    expect(moveAnnouncement(2, 6, 4)).toBe("Photo 2 of 6 moved to position 4.");
  });

  it("should announce the final position on drop", () => {
    expect(dropAnnouncement(4, 6)).toBe("Photo 4 of 6 dropped.");
  });

  it("should say the photo is back where it started on cancel", () => {
    expect(cancelAnnouncement(2, 6)).toBe("Move cancelled. Photo 2 of 6 is back in position 2.");
  });
});

describe("position bounds", () => {
  it("should clamp a position below the first photo", () => {
    expect(moveAnnouncement(0, 6, 0)).toBe("Photo 1 of 6 moved to position 1.");
    expect(cancelAnnouncement(-3, 6)).toBe("Move cancelled. Photo 1 of 6 is back in position 1.");
  });

  it("should clamp a position past the last photo", () => {
    expect(moveAnnouncement(99, 6, 99)).toBe("Photo 6 of 6 moved to position 6.");
    expect(dropAnnouncement(42, 6)).toBe("Photo 6 of 6 dropped.");
  });

  it("should handle a one-photo list and a non-finite position", () => {
    expect(pickupAnnouncement(1, 1)).toContain("Photo 1 of 1");
    expect(dropAnnouncement(Number.NaN, 3)).toBe("Photo 1 of 3 dropped.");
  });
});

describe("the screen-reader instructions", () => {
  it("should name the pick-up, move, drop and cancel keys", () => {
    expect(SCREEN_READER_INSTRUCTIONS).toContain("Space or Enter");
    expect(SCREEN_READER_INSTRUCTIONS).toContain("arrow keys");
    expect(SCREEN_READER_INSTRUCTIONS).toContain("Escape");
  });
});
