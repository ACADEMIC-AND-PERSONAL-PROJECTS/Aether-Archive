import { describe, expect, it } from "vitest";

import {
  MAX_SELECTION,
  capSentence,
  planSelection,
  queueSummary,
  refusalSentence,
  selectionNotices,
  selectionSentence,
} from "./selection";

/**
 * The multi-select cap and its grammar (E4-S2A2), tested without a renderer.
 *
 * The boundary that matters is "selection + pick": seven files from an empty grid keep six, but three
 * files on top of four keep two. The other boundary is the one a naive implementation gets wrong — a
 * refused file must not consume the slot a later valid file needs, because the client check runs on
 * every picked file and the user cannot see which validation ran first.
 */

/** A file whose declared type and size are the axes `validateUpload` reads. */
function fileOf(name: string, type = "image/png", size = 16): File {
  const file = new File([new Uint8Array(Math.min(size, 8))], name, { type });
  if (size !== Math.min(size, 8)) {
    Object.defineProperty(file, "size", { configurable: true, value: size });
  }
  return file;
}

function images(count: number): File[] {
  return Array.from({ length: count }, (_, index) => fileOf(`photo-${index}.png`));
}

describe("the cap", () => {
  it("should keep six of seven picked files and say one was left out", () => {
    const plan = planSelection(0, images(7));

    expect(plan.accepted).toHaveLength(MAX_SELECTION);
    expect(plan.refused).toEqual([]);
    expect(plan.overCap).toBe(1);
    expect(selectionNotices(plan)).toEqual([
      "You can add up to 6 photos at a time — 1 wasn't added.",
    ]);
  });

  it("should count the existing selection against the cap", () => {
    const plan = planSelection(5, images(2));

    expect(plan.accepted).toHaveLength(1);
    expect(plan.overCap).toBe(1);
    expect(selectionNotices(plan)).toEqual([
      "You can add up to 6 photos at a time — 1 wasn't added.",
    ]);
  });

  it("should accept nothing when the selection is already full", () => {
    const plan = planSelection(MAX_SELECTION, images(1));

    expect(plan.accepted).toEqual([]);
    expect(plan.overCap).toBe(1);
  });

  it("should accept exactly six with no explanation", () => {
    const plan = planSelection(0, images(MAX_SELECTION));

    expect(plan.accepted).toHaveLength(MAX_SELECTION);
    expect(plan.overCap).toBe(0);
    expect(selectionNotices(plan)).toEqual([]);
  });

  it("should use the plural form when several files are left out", () => {
    expect(capSentence(3)).toBe("You can add up to 6 photos at a time — 3 weren't added.");
  });
});

describe("validation refusals", () => {
  it("should report every refused file by name and keep the valid ones", () => {
    const notes = fileOf("notes.txt", "text/plain");
    const empty = fileOf("empty.png", "image/png", 0);
    const good = fileOf("good.png");

    const plan = planSelection(0, [notes, empty, good]);

    expect(plan.accepted).toEqual([good]);
    expect(plan.refused).toEqual([
      {
        name: "notes.txt",
        message:
          "That file isn't an image the archive can keep. Use a JPEG, PNG, GIF, WebP or AVIF.",
      },
      { name: "empty.png", message: "That file is empty." },
    ]);
    expect(selectionNotices(plan)).toEqual([
      "notes.txt: That file isn't an image the archive can keep. Use a JPEG, PNG, GIF, WebP or AVIF.",
      "empty.png: That file is empty.",
    ]);
  });

  it("should refuse an oversize file by name", () => {
    const plan = planSelection(0, [fileOf("huge.png", "image/png", 16 * 1024 * 1024)]);

    expect(plan.accepted).toEqual([]);
    expect(plan.refused).toEqual([
      { name: "huge.png", message: "That photo is larger than 15 MB." },
    ]);
  });

  it("should not let a refused file consume the last slot", () => {
    // Five tiles exist, so exactly one slot is open. The refused pick comes first; the valid one after
    // it must still fit, or a single bad file in a multi-pick would silently cost a good one.
    const plan = planSelection(5, [
      fileOf("notes.txt", "text/plain"),
      fileOf("good.png"),
      fileOf("extra.png"),
    ]);

    expect(plan.accepted.map((file) => file.name)).toEqual(["good.png"]);
    expect(plan.refused.map((refusal) => refusal.name)).toEqual(["notes.txt"]);
    expect(plan.overCap).toBe(1);
  });

  it("should leave the name out when the browser supplies none", () => {
    expect(refusalSentence({ name: "", message: "That file is empty." })).toBe(
      "That file is empty.",
    );
  });
});

describe("the sentences", () => {
  it("should switch the count sentence on the singular", () => {
    expect(selectionSentence(1)).toBe("1 photo selected.");
    expect(selectionSentence(4)).toBe("4 photos selected.");
  });

  it("should state both halves of a partial batch", () => {
    expect(queueSummary(3, 0)).toBe("Added 3 photos.");
    expect(queueSummary(0, 2)).toBe("2 photos couldn't be added.");
    expect(queueSummary(2, 1)).toBe("Added 2 photos. 1 photo couldn't be added.");
    expect(queueSummary(1, 1)).toBe("Added 1 photo. 1 photo couldn't be added.");
  });
});
