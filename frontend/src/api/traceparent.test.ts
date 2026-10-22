import { describe, expect, it } from "vitest";

import { createTraceparent } from "./traceparent";

describe("createTraceparent", () => {
  it("should emit the W3C version 00 sampled format", () => {
    expect(createTraceparent()).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
  });

  it("should use a different trace id and parent id for every request", () => {
    expect(createTraceparent()).not.toBe(createTraceparent());
  });

  it("should not emit an all-zero trace or parent id", () => {
    const [, traceId, parentId] = createTraceparent().split("-");
    expect(traceId).not.toMatch(/^0+$/);
    expect(parentId).not.toMatch(/^0+$/);
  });
});
