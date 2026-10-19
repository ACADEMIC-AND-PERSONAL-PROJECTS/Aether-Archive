import { describe, expect, it } from "vitest";

/**
 * E6-S2's proof: on purpose, this check fails so the merge gate can be shown refusing it. The scratch
 * branch is closed unmerged; nothing here ever reaches `develop`.
 */
describe("E6-S2 scratch", () => {
  it("should fail on purpose", () => {
    expect(1).toBe(2);
  });
});
