import { describe, expect, it } from "vitest";

import { deltaEok, oklabToRgb, oklabToOklch, rgbToHex, rgbToOklab, rgbToOklch } from "./oklch";

describe("rgbToOklch", () => {
  it("matches the published reference values", () => {
    // Björn Ottosson's sRGB → OKLab article: white, black and pure red.
    const white = rgbToOklch(255, 255, 255);
    expect(white.l).toBeCloseTo(1, 3);
    expect(white.c).toBeCloseTo(0, 4);

    const black = rgbToOklch(0, 0, 0);
    expect(black.l).toBeCloseTo(0, 4);

    const red = rgbToOklch(255, 0, 0);
    expect(red.l).toBeCloseTo(0.6279, 3);
    expect(red.c).toBeCloseTo(0.2577, 3);
    expect(red.h).toBeCloseTo(29.23, 1);
  });

  it("keeps hue in [0, 360) and gives grays almost no chroma", () => {
    const gray = rgbToOklch(128, 128, 128);
    expect(gray.c).toBeLessThan(0.001);

    const samples: Array<[number, number, number]> = [
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
      [12, 200, 255],
      [255, 180, 12],
      [80, 20, 140],
    ];
    for (const [r, g, b] of samples) {
      const { h } = rgbToOklch(r, g, b);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(360);
    }
  });
});

describe("round trips", () => {
  it("rgb → oklab → rgb stays within one byte on a deterministic sweep", () => {
    for (let i = 0; i < 64; i++) {
      const r = (i * 61) % 256;
      const g = (i * 129) % 256;
      const b = (i * 197) % 256;
      const back = oklabToRgb(rgbToOklab(r, g, b));
      expect(Math.abs(back.r - r)).toBeLessThanOrEqual(1);
      expect(Math.abs(back.g - g)).toBeLessThanOrEqual(1);
      expect(Math.abs(back.b - b)).toBeLessThanOrEqual(1);
    }
  });

  it("oklab → oklch → oklab keeps l and c", () => {
    const lab = rgbToOklab(12, 200, 255);
    const { l, c, h } = oklabToOklch(lab);
    const radians = (h * Math.PI) / 180;
    const roundTrip = { l, a: c * Math.cos(radians), b: c * Math.sin(radians) };
    expect(roundTrip.l).toBeCloseTo(lab.l, 10);
    expect(roundTrip.a).toBeCloseTo(lab.a, 10);
    expect(roundTrip.b).toBeCloseTo(lab.b, 10);
  });
});

describe("rgbToHex", () => {
  it("formats lowercase, padded and clamped", () => {
    expect(rgbToHex(255, 0, 0)).toBe("#ff0000");
    expect(rgbToHex(11, 11, 13)).toBe("#0b0b0d");
    expect(rgbToHex(-5, 300, 7.6)).toBe("#00ff08");
  });
});

describe("deltaEok", () => {
  it("is zero for identical colours and grows with distance", () => {
    const a = rgbToOklab(120, 120, 120);
    expect(deltaEok(a, a)).toBe(0);

    const identicalTone = rgbToOklab(120, 121, 119);
    const farTone = rgbToOklab(120, 40, 200);
    expect(deltaEok(a, identicalTone)).toBeLessThan(0.02); // below the merge threshold
    expect(deltaEok(a, farTone)).toBeGreaterThan(0.02);
  });
});
