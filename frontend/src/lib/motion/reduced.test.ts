import { describe, expect, it } from "vitest";

import { prefersReducedMotion } from "./reduced";

/**
 * The rule the sortable grid consults before enabling its transitions. jsdom has no `matchMedia`, so
 * every case injects its own environment instead of relying on the test host.
 */
describe("prefersReducedMotion", () => {
  it("should read the reduce query's matches flag", () => {
    const queries: string[] = [];
    const environment = {
      matchMedia: (query: string) => {
        queries.push(query);
        return { matches: true };
      },
    };

    expect(prefersReducedMotion(environment)).toBe(true);
    expect(queries).toEqual(["(prefers-reduced-motion: reduce)"]);
  });

  it("should be false when the reader has no preference", () => {
    expect(prefersReducedMotion({ matchMedia: () => ({ matches: false }) })).toBe(false);
  });

  it("should be false when matchMedia is missing", () => {
    expect(prefersReducedMotion({})).toBe(false);
  });
});
