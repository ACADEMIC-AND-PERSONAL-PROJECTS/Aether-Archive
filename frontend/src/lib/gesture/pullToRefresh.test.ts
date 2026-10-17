import { describe, expect, it } from "vitest";

import { isDrag, isPull, pullDistance, PULL_THRESHOLD_PX, TAP_SLOP_PX } from "./pullToRefresh";

/**
 * The gesture's three thresholds, at their edges rather than in the middle.
 *
 * A threshold is a boundary, and a boundary is only worth having if an off-by-one would be caught: every
 * assertion below sits exactly on one (the last value that is *not* a pull, the first that is) or on the
 * side of a value that must never be reached (a drag that travelled upwards).
 */
describe("pullDistance", () => {
  it("should measure downward travel from the start", () => {
    expect(pullDistance(200, 260)).toBe(60);
  });

  it("should never be negative when the finger travels upwards", () => {
    expect(pullDistance(200, 140)).toBe(0);
    expect(pullDistance(200, 200)).toBe(0);
  });
});

describe("isPull", () => {
  it("should refuse one pixel short of the threshold", () => {
    expect(isPull(PULL_THRESHOLD_PX - 1)).toBe(false);
  });

  it("should accept the threshold itself", () => {
    expect(isPull(PULL_THRESHOLD_PX)).toBe(true);
  });

  it("should refuse a gesture that never moved", () => {
    expect(isPull(0)).toBe(false);
  });
});

describe("isDrag", () => {
  it("should refuse movement up to the tap's slop", () => {
    expect(isDrag(TAP_SLOP_PX)).toBe(false);
  });

  it("should accept movement past it", () => {
    expect(isDrag(TAP_SLOP_PX + 1)).toBe(true);
  });

  it("should call every pull a drag", () => {
    // What makes one flag enough in the hook: a releasing pull is always more than a tap's worth of
    // travel, so "the click after this must not open the menu" follows from the pull itself.
    expect(isDrag(PULL_THRESHOLD_PX)).toBe(true);
  });
});
