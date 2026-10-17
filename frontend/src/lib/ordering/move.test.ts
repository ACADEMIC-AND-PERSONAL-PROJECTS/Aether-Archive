import { describe, expect, it } from "vitest";

import { moveItem, orderedIds } from "./move";

/**
 * The display-order reducer (E4-S3).
 *
 * Six is the dump's size, so the canonical fixture is six photos; the bounds, no-op and ordering
 * tests run on it and on a four-photo array where every move can be enumerated. The payload test is
 * the contract the future publish endpoint will consume: ids in array order, `displayOrder` = index.
 */

interface Photo {
  readonly id: string;
}

function photos(count: number): Photo[] {
  return Array.from({ length: count }, (_, index) => ({ id: `photo-${index + 1}` }));
}

const SIX = photos(6);

describe("moveItem", () => {
  it("should move an item forward, leaving the others in relative order", () => {
    const moved = moveItem(SIX, 0, 2);

    expect(orderedIds(moved)).toEqual([
      "photo-2",
      "photo-3",
      "photo-1",
      "photo-4",
      "photo-5",
      "photo-6",
    ]);
  });

  it("should move an item backward, leaving the others in relative order", () => {
    const moved = moveItem(SIX, 4, 1);

    expect(orderedIds(moved)).toEqual([
      "photo-1",
      "photo-5",
      "photo-2",
      "photo-3",
      "photo-4",
      "photo-6",
    ]);
  });

  it("should fill the destination with the moved item for every pair of positions", () => {
    const four = photos(4);
    const ids = orderedIds(four);

    for (let from = 0; from < four.length; from += 1) {
      for (let to = 0; to < four.length; to += 1) {
        const moved = moveItem(four, from, to);
        const result = orderedIds(moved);
        const movedId = ids[from];

        expect(result).toHaveLength(ids.length);
        expect(new Set(result)).toEqual(new Set(ids));
        expect(result[to]).toBe(movedId);
        // Everything except the moved photo keeps its relative order.
        expect(result.filter((id) => id !== movedId)).toEqual(ids.filter((id) => id !== movedId));
      }
    }
  });

  it("should return the same array when the clamped indices are equal", () => {
    expect(moveItem(SIX, 2, 2)).toBe(SIX);
    expect(moveItem(SIX, -4, -1)).toBe(SIX);
    expect(moveItem(SIX, 99, 42)).toBe(SIX);
  });

  it("should clamp an index below zero to the first slot", () => {
    expect(orderedIds(moveItem(SIX, -2, 3))).toEqual([
      "photo-2",
      "photo-3",
      "photo-4",
      "photo-1",
      "photo-5",
      "photo-6",
    ]);
    expect(orderedIds(moveItem(SIX, 3, -2))).toEqual([
      "photo-4",
      "photo-1",
      "photo-2",
      "photo-3",
      "photo-5",
      "photo-6",
    ]);
  });

  it("should clamp an index past the end to the last slot", () => {
    expect(orderedIds(moveItem(SIX, 0, 99))).toEqual([
      "photo-2",
      "photo-3",
      "photo-4",
      "photo-5",
      "photo-6",
      "photo-1",
    ]);
    expect(orderedIds(moveItem(SIX, 99, 0))).toEqual([
      "photo-6",
      "photo-1",
      "photo-2",
      "photo-3",
      "photo-4",
      "photo-5",
    ]);
  });

  it("should leave empty and single-item arrays untouched", () => {
    const empty: Photo[] = [];
    const single = photos(1);

    expect(moveItem(empty, 0, 0)).toBe(empty);
    expect(moveItem(single, 0, 0)).toBe(single);
    expect(moveItem(single, 0, 1)).toBe(single);
  });

  it("should refuse a non-integer index instead of truncating it", () => {
    const fractional = moveItem(SIX, 1.5, 3);
    const notANumber = moveItem(SIX, Number.NaN, 3);
    const infinite = moveItem(SIX, 0, Number.POSITIVE_INFINITY);

    expect(fractional).toBe(SIX);
    expect(notANumber).toBe(SIX);
    expect(infinite).toBe(SIX);
  });

  it("should never mutate the input array", () => {
    const frozen = Object.freeze(photos(3));

    const moved = moveItem(frozen, 0, 2);

    expect(orderedIds(frozen)).toEqual(["photo-1", "photo-2", "photo-3"]);
    expect(orderedIds(moved)).toEqual(["photo-2", "photo-3", "photo-1"]);
  });
});

describe("the payload order", () => {
  it("should project a moved array as ids with displayOrder 0–5", () => {
    const moved = moveItem(SIX, 0, 3);

    // The future publish payload takes `items.map(item => item.id)` in order — exactly this.
    expect(orderedIds(moved)).toEqual(moved.map((photo) => photo.id));
    expect(orderedIds(moved)).toEqual([
      "photo-2",
      "photo-3",
      "photo-4",
      "photo-1",
      "photo-5",
      "photo-6",
    ]);

    const payload = moved.map((photo, displayOrder) => ({ id: photo.id, displayOrder }));
    expect(payload.map((entry) => entry.displayOrder)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(payload[3]).toEqual({ id: "photo-1", displayOrder: 3 });
  });

  it("should keep the pick order when nothing has moved", () => {
    expect(orderedIds(SIX)).toEqual([
      "photo-1",
      "photo-2",
      "photo-3",
      "photo-4",
      "photo-5",
      "photo-6",
    ]);
  });
});
