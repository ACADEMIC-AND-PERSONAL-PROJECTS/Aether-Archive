import { describe, expect, it } from "vitest";

import { viewIdentity } from "./route";

/**
 * What counts as a different view — the one rule the route transition turns on.
 *
 * The value is a React `key`, so "same identity" means "same element, no remount, no replay" and
 * "different identity" means "the old view is torn down and the new one animates in". Both directions
 * are load-bearing: a false positive remounts a view the user did not leave (losing its state and
 * replaying a full-screen fade on a navigation that changed nothing), and a false negative means two
 * routes share one element, which React would try to update in place rather than replace.
 */
describe("viewIdentity", () => {
  it("should keep the paths that are already canonical", () => {
    expect(viewIdentity("/")).toBe("/");
    expect(viewIdentity("/river")).toBe("/river");
    expect(viewIdentity("/curate")).toBe("/curate");
  });

  it("should treat one route's slash variants as one view", () => {
    // React Router matches all three to the same route, so keying on the raw pathname would remount the
    // view on `/river` → `/river/` — a navigation that changes nothing, and state the user loses.
    expect(viewIdentity("/river/")).toBe("/river");
    expect(viewIdentity("/river//")).toBe("/river");
    expect(viewIdentity("/curate/")).toBe("/curate");
  });

  it("should leave the root a path and not the empty string", () => {
    // `"/".replace(/\/+$/, "")` is `""`, which would be a key that no longer says what it is.
    expect(viewIdentity("/")).toBe("/");
    expect(viewIdentity("//")).toBe("/");
  });

  it("should not fold anything else — the router has already resolved the URL", () => {
    expect(viewIdentity("/River")).toBe("/River");
    expect(viewIdentity("/river/photo")).toBe("/river/photo");
  });
});
