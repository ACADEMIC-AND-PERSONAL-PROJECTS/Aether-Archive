import { describe, expect, it } from "vitest";

import {
  compositeOver,
  contrastRatio,
  hexToRgb,
  parseColor,
  relativeLuminance,
  rgbaString,
} from "./contrast";

const WHITE = { r: 255, g: 255, b: 255 };
const BLACK = { r: 0, g: 0, b: 0 };

describe("hexToRgb", () => {
  it("reads #rrggbb into channels", () => {
    expect(hexToRgb("#e8e6e3")).toEqual({ r: 232, g: 230, b: 227 });
  });

  it("rejects anything that is not #rrggbb", () => {
    expect(() => hexToRgb("e8e6e3")).toThrow();
    expect(() => hexToRgb("#fff")).toThrow();
    expect(() => hexToRgb("#e8e6e3ff")).toThrow();
  });
});

describe("parseColor", () => {
  it("reads both token forms §2.2 uses", () => {
    expect(parseColor("#0b0b0d")).toEqual({ rgb: { r: 11, g: 11, b: 13 }, alpha: 1 });
    expect(parseColor("rgba(232, 230, 227, 0.62)")).toEqual({
      rgb: { r: 232, g: 230, b: 227 },
      alpha: 0.62,
    });
  });

  it("rejects anything else", () => {
    expect(() => parseColor("white")).toThrow();
  });
});

describe("relativeLuminance", () => {
  it("anchors at black and white", () => {
    expect(relativeLuminance(BLACK)).toBe(0);
    expect(relativeLuminance(WHITE)).toBeCloseTo(1, 10);
  });
});

describe("contrastRatio", () => {
  it("reads 21:1 between the extremes and 1:1 for a colour with itself", () => {
    expect(contrastRatio(WHITE, BLACK)).toBeCloseTo(21, 10);
    expect(contrastRatio(BLACK, BLACK)).toBe(1);
  });

  it("is symmetric", () => {
    const text = hexToRgb("#e8e6e3");
    const bg = hexToRgb("#0b0b0d");
    expect(contrastRatio(text, bg)).toBe(contrastRatio(bg, text));
  });
});

describe("compositeOver", () => {
  it("reproduces the E2-S3 glass-over-bg pair in float sRGB (16.20:1)", () => {
    const bg = hexToRgb("#0b0b0d");
    const overBg = compositeOver(BLACK, 0.4, bg);
    expect(contrastRatio(hexToRgb("#e8e6e3"), overBg)).toBeCloseTo(16.2, 1);
  });

  it("reproduces the E2-S3 muted-over-bg pair (6.40:1)", () => {
    const bg = hexToRgb("#0b0b0d");
    const muted = compositeOver(hexToRgb("#e8e6e3"), 0.62, bg);
    expect(contrastRatio(muted, bg)).toBeCloseTo(6.4, 1);
  });

  it("keeps fractional channels — byte rounding would shift the ratios", () => {
    expect(compositeOver(BLACK, 0.5, WHITE)).toEqual({ r: 127.5, g: 127.5, b: 127.5 });
  });
});

describe("rgbaString", () => {
  it("formats exactly like the stylesheet's tokens", () => {
    expect(rgbaString(BLACK, 0.4)).toBe("rgba(0, 0, 0, 0.4)");
    expect(rgbaString(hexToRgb("#e8e6e3"), 0.62)).toBe("rgba(232, 230, 227, 0.62)");
  });

  it("rounds fractional channels coming out of a composite", () => {
    expect(rgbaString({ r: 147.6, g: 148.5, b: 10.4 }, 1)).toBe("rgba(148, 149, 10, 1)");
  });
});
