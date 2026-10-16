import { describe, expect, it } from "vitest";

import {
  ORANGE,
  dominantHue,
  grayscale,
  lowSaturation,
  seededNoise,
  solid,
  syntheticPhoto,
  transparentHalf,
} from "./__fixtures__/images";
import { deltaEok, rgbToHex, rgbToOklab } from "./oklch";
import { MAX_COLORS, MIN_COLORS, extractPalette } from "./palette";
import { MERGE_THRESHOLD } from "./score";

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
}

function deltaBetween(hexA: string, hexB: string): number {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  return deltaEok(rgbToOklab(a.r, a.g, a.b), rgbToOklab(b.r, b.g, b.b));
}

describe("extractPalette — the §2.1 pipeline", () => {
  it("finds the dominant hue first and reports weights that sum to 1", () => {
    const { colors } = extractPalette(dominantHue());
    expect(colors.length).toBeGreaterThanOrEqual(3);
    expect(colors[0]?.hex).toBe(rgbToHex(ORANGE[0], ORANGE[1], ORANGE[2]));
    expect(colors[0]?.weight).toBeCloseTo(0.7, 2);
    const sum = colors.reduce((total, color) => total + color.weight, 0);
    expect(sum).toBeCloseTo(1, 9);
  });

  it("keeps low-saturation images as low-saturation palettes", () => {
    const { colors } = extractPalette(lowSaturation());
    expect(colors).toHaveLength(6);
    for (const color of colors) {
      expect(color.oklch.c).toBeLessThan(0.05);
    }
  });

  it("recovers the grayscale bands exactly, with no chroma", () => {
    const { colors } = extractPalette(grayscale());
    expect(colors.map((color) => color.hex).sort()).toEqual(
      ["#282828", "#464646", "#646464", "#828282", "#a0a0a0", "#bebebe", "#dcdcdc"].sort(),
    );
    for (const color of colors) {
      expect(color.oklch.c).toBeLessThan(0.01);
    }
  });

  it("ignores fully transparent regions — no black bleed, full weight", () => {
    const { colors } = extractPalette(transparentHalf());
    expect(colors).toHaveLength(1);
    expect(colors[0]?.hex).toBe(rgbToHex(ORANGE[0], ORANGE[1], ORANGE[2]));
    expect(colors[0]?.weight).toBeCloseTo(1, 9);
  });

  it("is deterministic: identical input, identical palette", () => {
    const image = seededNoise(7);
    expect(extractPalette(image)).toEqual(extractPalette(image));
    expect(extractPalette(seededNoise(7))).toEqual(extractPalette(image));
  });

  it("keeps the general case inside the 5–8 colour contract", () => {
    const { colors } = extractPalette(seededNoise(11));
    expect(colors.length).toBeGreaterThanOrEqual(MIN_COLORS);
    expect(colors.length).toBeLessThanOrEqual(MAX_COLORS);
  });

  it("never returns two colours closer than the merge threshold", () => {
    for (const image of [dominantHue(), lowSaturation(), grayscale(), seededNoise(3)]) {
      const { colors } = extractPalette(image);
      for (let i = 0; i < colors.length; i++) {
        for (let j = i + 1; j < colors.length; j++) {
          const a = colors[i];
          const b = colors[j];
          // a hair under the threshold: hex rounding can shave 0.001 off the distance
          if (a && b) {
            expect(deltaBetween(a.hex, b.hex)).toBeGreaterThan(MERGE_THRESHOLD - 0.003);
          }
        }
      }
    }
  });

  it("drops near-black and near-white regions from the palette", () => {
    const image = solid([120, 90, 60], 64, 64);
    const regions = image.data;
    const total = 64 * 64;
    const fill = (start: number, end: number, rgb: readonly [number, number, number]): void => {
      for (let i = start; i < end; i++) {
        regions[i * 4] = rgb[0];
        regions[i * 4 + 1] = rgb[1];
        regions[i * 4 + 2] = rgb[2];
        regions[i * 4 + 3] = 255;
      }
    };
    fill(0, Math.floor(total * 0.4), [3, 3, 5]); // near-black: OKLab L ≈ 0.10, below the 0.12 floor
    fill(Math.floor(total * 0.4), Math.floor(total * 0.8), [120, 90, 60]); // kept
    fill(Math.floor(total * 0.8), total, [252, 252, 252]); // near-white

    const { colors } = extractPalette(image);
    expect(colors).toHaveLength(1);
    expect(colors[0]?.hex).toBe(rgbToHex(120, 90, 60));
    expect(colors[0]?.weight).toBeCloseTo(1, 9);
  });

  it("keeps the dominant region's mass when a textured region splits across clusters", () => {
    // The jittered photo's rust region covers 45% of the pixels; k-means++ splits it into
    // several tones — that is what "dominant colours" means on a textured surface (ADR-018).
    // Whatever the split, the region's family must keep its measured mass.
    const { colors } = extractPalette(syntheticPhoto());
    const rustMass = colors
      .filter((color) => deltaBetween(color.hex, "#bc5634") < 0.1)
      .reduce((total, color) => total + color.weight, 0);
    expect(rustMass).toBeGreaterThanOrEqual(0.4);
  });
});
