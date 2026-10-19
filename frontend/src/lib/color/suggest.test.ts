import { describe, expect, it } from "vitest";

import { ORANGE, bands } from "./__fixtures__/images";
import { PaletteExtractionError } from "./decode";
import { rgbToHex } from "./oklch";
import { MAX_COLORS, extractPalette } from "./palette";
import { mergePalettes, suggestPalette } from "./suggest";

import type { Palette } from "./types";

/** A palette of [hex, weight] pairs — the OKLCh placeholders vary by position so carry-through shows. */
function palette(...colors: Array<[string, number]>): Palette {
  return {
    colors: colors.map(([hex, weight], index) => ({
      hex,
      oklch: { l: 0.5, c: 0.1, h: index * 10 },
      weight,
    })),
  };
}

const TEAL: readonly [number, number, number] = [31, 122, 122];

describe("mergePalettes — ADR-023's pooling", () => {
  it("dedupes normalised hexes and divides summed weights by the photos that produced colours", () => {
    const first = palette(["#AA3344", 0.5], ["#22aa66", 0.25], ["#778899", 0.25]);
    const second = palette(["#aa3344", 0.25], ["#22aa66", 0.25], ["#8899aa", 0.5]);

    const merged = mergePalettes([first, second]);

    expect(merged.map((color) => color.hex)).toEqual(["#aa3344", "#22aa66", "#8899aa", "#778899"]);
    expect(merged.map((color) => color.weight)).toEqual([0.375, 0.25, 0.25, 0.125]);
    // The first occurrence carries its OKLCh through — the pool never re-derives the colour.
    expect(merged[0]?.oklch).toBe(first.colors[0]?.oklch);
  });

  it("breaks weight ties on the hex, so the order never depends on the photos' order", () => {
    const left = palette(["#bb0000", 0.5], ["#00bb00", 0.5]);
    const right = palette(["#00bb00", 0.5], ["#bb0000", 0.5]);

    const direct = mergePalettes([left, right]);

    expect(direct.map((color) => color.hex)).toEqual(["#00bb00", "#bb0000"]);
    const reversed = mergePalettes([right, left]);
    expect(reversed.map((color) => color.hex)).toEqual(["#00bb00", "#bb0000"]);
    expect(reversed.map((color) => color.weight)).toEqual([0.5, 0.5]);
    // Only the ranking is order-independent; the carried OKLCh is the first occurrence's.
    expect(direct[0]?.oklch).toBe(left.colors[1]?.oklch);
    expect(reversed[0]?.oklch).toBe(right.colors[0]?.oklch);
  });

  it("a key that fails normalisation still dedupes trim- and case-insensitively", () => {
    const merged = mergePalettes([palette(["RED", 0.5], ["red ", 0.5])]);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.hex).toBe("red");
    expect(merged[0]?.weight).toBe(1);
  });

  it("caps at MAX_COLORS, keeping the heaviest colours and dropping the tail's weight", () => {
    const nine = palette(
      ["#010101", 0.26],
      ["#020202", 0.2],
      ["#030303", 0.16],
      ["#040404", 0.12],
      ["#050505", 0.1],
      ["#060606", 0.07],
      ["#070707", 0.05],
      ["#080808", 0.03],
      ["#090909", 0.01],
    );

    const merged = mergePalettes([nine]);

    expect(merged).toHaveLength(MAX_COLORS);
    expect(merged.map((color) => color.hex)).toEqual([
      "#010101",
      "#020202",
      "#030303",
      "#040404",
      "#050505",
      "#060606",
      "#070707",
      "#080808",
    ]);
    // The dropped tail is why the shares no longer sum to 1 — they are not re-normalised.
    const sum = merged.reduce((total, color) => total + color.weight, 0);
    expect(sum).toBeCloseTo(0.99, 10);
  });

  it("nine tied colours drop by hex — the cap's tie-break, not the palette's order", () => {
    const tied: Array<[string, number]> = [
      ["#000009", 1 / 9],
      ["#000001", 1 / 9],
      ["#000008", 1 / 9],
      ["#000002", 1 / 9],
      ["#000007", 1 / 9],
      ["#000003", 1 / 9],
      ["#000006", 1 / 9],
      ["#000004", 1 / 9],
      ["#000005", 1 / 9],
    ];

    const merged = mergePalettes([palette(...tied)]);

    expect(merged.map((color) => color.hex)).toEqual([
      "#000001",
      "#000002",
      "#000003",
      "#000004",
      "#000005",
      "#000006",
      "#000007",
      "#000008",
    ]);
    expect(merged.every((color) => color.weight === 1 / 9)).toBe(true);
  });

  it("an empty palette adds nothing and is not counted as a photo", () => {
    const first = palette(["#aa3344", 0.5], ["#22aa66", 0.5]);
    const second = palette(["#aa3344", 0.25], ["#8899aa", 0.75]);

    expect(mergePalettes([palette(), first, palette(), second])).toEqual(
      mergePalettes([first, second]),
    );
    expect(mergePalettes([palette(), palette()])).toEqual([]);
    expect(mergePalettes([])).toEqual([]);
  });

  it("one photo alone keeps its own weights", () => {
    const single = palette(["#aa3344", 0.5], ["#22aa66", 0.25], ["#778899", 0.25]);

    const merged = mergePalettes([single]);

    expect(merged.map((color) => color.hex)).toEqual(["#aa3344", "#22aa66", "#778899"]);
    expect(merged.map((color) => color.weight)).toEqual([0.5, 0.25, 0.25]);
  });

  it("carries the real extraction of two synthetic photos through", () => {
    const orangeDominant = extractPalette(
      bands([
        [0.8, ORANGE],
        [0.2, TEAL],
      ]),
    );
    const tealDominant = extractPalette(
      bands([
        [0.9, TEAL],
        [0.1, ORANGE],
      ]),
    );

    const merged = mergePalettes([orangeDominant, tealDominant]);

    expect(merged[0]?.hex).toBe(rgbToHex(TEAL[0], TEAL[1], TEAL[2]));
    expect(merged[0]?.weight).toBeCloseTo((0.2 + 0.9) / 2, 1);
    expect(merged[1]?.hex).toBe(rgbToHex(ORANGE[0], ORANGE[1], ORANGE[2]));
    expect(merged[1]?.weight).toBeCloseTo((0.8 + 0.1) / 2, 1);
  });
});

describe("suggestPalette — the extraction beside the merge", () => {
  it("extracts every source and merges what came back", async () => {
    const sources = [new Blob(["one"]), new Blob(["two"])];
    const seen: Blob[] = [];

    const merged = await suggestPalette(sources, {
      async extract(source) {
        seen.push(source);
        return source === sources[0]
          ? palette(["#AA3344", 0.5], ["#22aa66", 0.5])
          : palette(["#aa3344", 0.25], ["#8899aa", 0.75]);
      },
    });

    expect(seen).toEqual(sources);
    expect(merged.map((color) => color.hex)).toEqual(["#8899aa", "#aa3344", "#22aa66"]);
    expect(merged.map((color) => color.weight)).toEqual([0.375, 0.375, 0.25]);
  });

  it("skips a refused extraction, and the shares follow the survivors", async () => {
    const sources = [new Blob(["ok"]), new Blob(["broken"]), new Blob(["ok too"])];

    const merged = await suggestPalette(sources, {
      extract(source) {
        if (source === sources[1]) {
          return Promise.reject(
            new PaletteExtractionError("decode-failed", "the decoder refused the bytes"),
          );
        }
        return Promise.resolve(
          source === sources[0]
            ? palette(["#aa3344", 0.5], ["#22aa66", 0.5])
            : palette(["#aa3344", 0.25], ["#8899aa", 0.75]),
        );
      },
    });

    // Two survivors, so the denominator is 2 — a third photo would have pushed each weight to 0.25s.
    expect(merged.map((color) => color.hex)).toEqual(["#8899aa", "#aa3344", "#22aa66"]);
    expect(merged.map((color) => color.weight)).toEqual([0.375, 0.375, 0.25]);
  });

  it("a synchronously-throwing extract is a skip like any refusal", async () => {
    const sources = [new Blob(["ok"]), new Blob(["throws"]), new Blob(["ok too"])];

    const merged = await suggestPalette(sources, {
      extract(source) {
        if (source === sources[1]) {
          throw new Error("sync boom");
        }
        return Promise.resolve(
          source === sources[0]
            ? palette(["#aa3344", 0.5], ["#22aa66", 0.5])
            : palette(["#aa3344", 0.25], ["#8899aa", 0.75]),
        );
      },
    });

    expect(merged.map((color) => color.hex)).toEqual(["#8899aa", "#aa3344", "#22aa66"]);
    expect(merged.map((color) => color.weight)).toEqual([0.375, 0.375, 0.25]);

    await expect(
      suggestPalette([new Blob(["throws"])], {
        extract() {
          throw new Error("sync boom");
        },
      }),
    ).resolves.toEqual([]);
  });

  it("every extraction failing yields an empty list, not a rejection", async () => {
    const failure = new PaletteExtractionError("unsupported", "no decoder here");

    await expect(
      suggestPalette([new Blob(["a"]), new Blob(["b"])], {
        extract: () => Promise.reject(failure),
      }),
    ).resolves.toEqual([]);
  });

  it("no sources at all is an empty list, not an error", async () => {
    await expect(suggestPalette([])).resolves.toEqual([]);
  });

  it("starts every extraction before any one resolves — the photos read beside each other", async () => {
    const sources = [new Blob(["a"]), new Blob(["b"])];
    const started: Blob[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const pending = suggestPalette(sources, {
      extract(source) {
        started.push(source);
        return gate.then(() =>
          source === sources[0] ? palette(["#aa3344", 1]) : palette(["#22aa66", 1]),
        );
      },
    });

    // The `Promise.resolve().then(…)` wrapper defers each `extract` by one microtask; none has
    // resolved yet (the gate is still closed), so both must have started.
    await Promise.resolve();
    expect(started).toEqual(sources);
    release();
    const merged = await pending;
    expect(merged.map((color) => color.hex)).toEqual(["#22aa66", "#aa3344"]);
  });
});
