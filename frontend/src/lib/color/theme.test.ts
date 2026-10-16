import { describe, expect, it } from "vitest";

import { hexToRgb } from "./contrast";
import { oklchToHex, rgbToOklch } from "./oklch";
import {
  applyFallbackTheme,
  applyTheme,
  clearTheme,
  CONTRAST_MINIMUM,
  contrastReport,
  FALLBACK_THEME,
  paletteToTheme,
  THEME_PROPERTIES,
} from "./theme";
import globalCss from "../../styles/global.css?raw";

import type { Palette, PaletteColor } from "./types";

const color = (l: number, c: number, h: number, weight: number): PaletteColor => {
  const oklch = { l, c, h };
  return { hex: oklchToHex(oklch), oklch, weight };
};

/* The fixture palettes: a typical photo, a mid-tone accent (the fit path), a degenerate
 * single-colour bitmap, a bright image and a dark one. */
const rust = color(0.62, 0.13, 45, 0.24);
const photo: Palette = {
  colors: [
    color(0.25, 0.04, 250, 0.28),
    color(0.35, 0.06, 195, 0.18),
    rust,
    color(0.8, 0.07, 85, 0.16),
    color(0.55, 0.09, 20, 0.08),
    color(0.92, 0.01, 60, 0.06),
  ],
};
const midTone = color(0.55, 0.02, 30, 0.6);
const midAccent: Palette = {
  colors: [color(0.14, 0.02, 250, 0.4), midTone],
};
const mono = color(0.4, 0.02, 220, 1);
const monochrome: Palette = { colors: [mono] };
const bright: Palette = { colors: [color(0.75, 0.08, 90, 0.6), color(0.9, 0.03, 100, 0.4)] };
const dark: Palette = { colors: [color(0.13, 0.02, 260, 0.7), color(0.3, 0.05, 260, 0.3)] };

const PALETTES: Array<[string, Palette]> = [
  ["photo", photo],
  ["mid accent", midAccent],
  ["monochrome", monochrome],
  ["bright", bright],
  ["dark", dark],
];

describe("paletteToTheme", () => {
  it.each(PALETTES)("keeps every §2.2 pair at or above 4.5:1 (%s)", (_name, palette) => {
    const report = contrastReport(paletteToTheme(palette));

    expect(report.textOnBg).toBeGreaterThanOrEqual(CONTRAST_MINIMUM);
    expect(report.textOnSurface).toBeGreaterThanOrEqual(CONTRAST_MINIMUM);
    expect(report.textOnGlass).toBeGreaterThanOrEqual(CONTRAST_MINIMUM);
    expect(report.mutedOnBg).toBeGreaterThanOrEqual(CONTRAST_MINIMUM);
    expect(report.accentContrastOnAccent).toBeGreaterThanOrEqual(CONTRAST_MINIMUM);
  });

  it("keeps surfaces monotonic — the surface sits above the background", () => {
    const theme = paletteToTheme(photo);
    const bg = hexToRgb(theme.bg);
    const surface = hexToRgb(theme.surface);

    expect(rgbToOklch(surface.r, surface.g, surface.b).l).toBeGreaterThan(
      rgbToOklch(bg.r, bg.g, bg.b).l,
    );
  });

  it("takes the accent from weight × C and keeps it when a base passes as-is", () => {
    const theme = paletteToTheme(photo);

    expect(theme.accent).toBe(rust.hex); // the rust, 0.24 × 0.13
    expect(theme.accentContrast).toBe("#0b0b0d");
  });

  it("fits a mid-tone accent instead of shipping an unreadable pair", () => {
    const theme = paletteToTheme(midAccent);

    expect(theme.accent).not.toBe(midTone.hex); // moved in lightness
    expect(contrastReport(theme).accentContrastOnAccent).toBeGreaterThanOrEqual(CONTRAST_MINIMUM);
  });

  it("chooses the light base for a dark-enough accent (monochrome bitmap)", () => {
    const theme = paletteToTheme(monochrome);

    expect(theme.accent).toBe(mono.hex);
    expect(theme.accentContrast).toBe("#e8e6e3");
  });

  it("is deterministic — the same palette always yields the same theme", () => {
    expect(paletteToTheme(photo)).toEqual(paletteToTheme(photo));
  });

  it("refuses an empty palette — that path is applyFallbackTheme", () => {
    expect(() => paletteToTheme({ colors: [] })).toThrow(/at least one colour/);
  });
});

describe("FALLBACK_THEME", () => {
  /* The stylesheet's `:root` block, raw — comments stripped so a mention in prose cannot
   * satisfy the regex, block-scoped so a declaration anywhere else in the file cannot either.
   * This is the drift guard between theme.ts and global.css. */
  const rootBlock =
    /:root\s*\{([\s\S]*?)\}/.exec(globalCss.replace(/\/\*[\s\S]*?\*\//g, ""))?.[1] ?? "";

  const rootValue = (property: string): string => {
    const value = new RegExp(`${property}\\s*:\\s*([^;]+);`).exec(rootBlock)?.[1];
    if (value === undefined) {
      throw new Error(`Missing ${property} in global.css`);
    }
    return value.trim();
  };

  it("mirrors the stylesheet's neutral set value for value (no drift)", () => {
    expect(rootValue("--aura-bg")).toBe(FALLBACK_THEME.bg);
    expect(rootValue("--aura-surface")).toBe(FALLBACK_THEME.surface);
    expect(rootValue("--aura-glass")).toBe(FALLBACK_THEME.glass);
    expect(rootValue("--aura-glass-solid")).toBe(FALLBACK_THEME.glassSolid);
    expect(rootValue("--aura-hairline")).toBe(FALLBACK_THEME.hairline);
    expect(rootValue("--aura-text")).toBe(FALLBACK_THEME.text);
    expect(rootValue("--aura-muted")).toBe(FALLBACK_THEME.muted);
    expect(rootValue("--aura-accent")).toBe(FALLBACK_THEME.accent);
    expect(rootValue("--aura-accent-contrast")).toBe(FALLBACK_THEME.accentContrast);
  });

  it("reproduces the pairs the E2-S3 report measured over these exact values", () => {
    const report = contrastReport(FALLBACK_THEME);

    expect(report.textOnBg).toBeCloseTo(15.79, 1);
    expect(report.textOnSurface).toBeCloseTo(15.01, 1);
    expect(report.textOnGlass).toBeCloseTo(16.2, 1);
    expect(report.mutedOnBg).toBeCloseTo(6.4, 1);
    expect(report.accentContrastOnAccent).toBeCloseTo(8.46, 1);
  });
});

describe("applyTheme", () => {
  it("writes every §2.2 property onto the target and removes them again", () => {
    const target = document.createElement("div");

    applyTheme(FALLBACK_THEME, target);
    for (const [key, property] of THEME_PROPERTIES) {
      expect(target.style.getPropertyValue(property)).toBe(FALLBACK_THEME[key]);
    }

    clearTheme(target);
    for (const [, property] of THEME_PROPERTIES) {
      expect(target.style.getPropertyValue(property)).toBe("");
    }
  });

  it("defaults to the document root, the way the app applies a theme", () => {
    applyFallbackTheme();

    expect(document.documentElement.style.getPropertyValue("--aura-text")).toBe(
      FALLBACK_THEME.text,
    );

    clearTheme();
    expect(document.documentElement.style.getPropertyValue("--aura-text")).toBe("");
  });
});
