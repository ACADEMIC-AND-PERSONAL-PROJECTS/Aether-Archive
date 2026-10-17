import { describe, expect, it } from "vitest";

import { isCurrentProgress } from "./progress";

/**
 * The late-progress gate (E4-S2A2), tested without a renderer.
 *
 * The transport already drops a progress event after its own request settles, so this gate is the
 * component's second line of defence: the queue must not read an event from a request that is no longer
 * the one on screen, and it must not write anything after unmount. The second half has no DOM
 * observation point (React 19 no-ops an update on an unmounted tree silently), which is why it lives in
 * a predicate instead of a rendered assertion.
 */
describe("the progress gate", () => {
  it("should reject an event after the view unmounted", () => {
    const request = new AbortController();

    expect(isCurrentProgress(true, request, request)).toBe(true);
    expect(isCurrentProgress(false, request, request)).toBe(false);
  });

  it("should reject an event from a request that is no longer the active one", () => {
    const settled = new AbortController();
    const inFlight = new AbortController();

    expect(isCurrentProgress(true, inFlight, settled)).toBe(false);
    expect(isCurrentProgress(true, null, settled)).toBe(false);
  });
});
