/**
 * sRGB ⇄ OKLab ⇄ OKLCh, after Björn Ottosson's published transforms (the same matrices the design
 * system's §2.1 assumes: L 0–1, C up to ~0.37, h in degrees). Pure math, no canvas, no dependency.
 */
import type { Oklab, Oklch } from "./types";

const srgbToLinear = (channel: number): number =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

const linearToSrgb = (channel: number): number =>
  channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055;

/** `r`, `g`, `b` in 0–255. */
export function rgbToOklab(r: number, g: number, b: number): Oklab {
  const rl = srgbToLinear(r / 255);
  const gl = srgbToLinear(g / 255);
  const bl = srgbToLinear(b / 255);

  const l = Math.cbrt(0.4122214708 * rl + 0.5363325363 * gl + 0.0514459929 * bl);
  const m = Math.cbrt(0.2119034982 * rl + 0.6806995451 * gl + 0.1073969566 * bl);
  const s = Math.cbrt(0.0883024619 * rl + 0.2817188376 * gl + 0.6299787005 * bl);

  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

/** Returns channels in 0–255, rounded and clamped into the sRGB gamut. */
export function oklabToRgb(lab: Oklab): { r: number; g: number; b: number } {
  const l = (lab.l + 0.3963377774 * lab.a + 0.2158037573 * lab.b) ** 3;
  const m = (lab.l - 0.1055613458 * lab.a - 0.0638541728 * lab.b) ** 3;
  const s = (lab.l - 0.0894841775 * lab.a - 1.291485548 * lab.b) ** 3;

  const rl = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const gl = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  const toByte = (channel: number): number =>
    Math.max(0, Math.min(255, Math.round(linearToSrgb(channel) * 255)));

  return { r: toByte(rl), g: toByte(gl), b: toByte(bl) };
}

export function oklabToOklch(lab: Oklab): Oklch {
  const c = Math.hypot(lab.a, lab.b);
  const h = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
  return { l: lab.l, c, h: h < 0 ? h + 360 : h };
}

/** The inverse of `oklabToOklch`: cartesian form, for the transforms that need it (theme maths). */
export function oklchToOklab({ l, c, h }: Oklch): Oklab {
  const radians = (h * Math.PI) / 180;
  return { l, a: c * Math.cos(radians), b: c * Math.sin(radians) };
}

export function rgbToOklch(r: number, g: number, b: number): Oklch {
  return oklabToOklch(rgbToOklab(r, g, b));
}

/** Lowercase `#rrggbb`; inputs are rounded and clamped like `oklabToRgb`. */
export function rgbToHex(r: number, g: number, b: number): string {
  const byte = (channel: number): string =>
    Math.max(0, Math.min(255, Math.round(channel)))
      .toString(16)
      .padStart(2, "0");
  return `#${byte(r)}${byte(g)}${byte(b)}`;
}

export function oklabToHex(lab: Oklab): string {
  const { r, g, b } = oklabToRgb(lab);
  return rgbToHex(r, g, b);
}

/** Convenience for the theme layer: an OKLCh triplet straight to its clamped hex. */
export function oklchToHex(color: Oklch): string {
  return oklabToHex(oklchToOklab(color));
}

/**
 * ΔE in OKLab — plain Euclidean distance in the cartesian space, which is the metric the design
 * system's "merge threshold ΔE < 0.02" (`DESIGN-SYSTEM.md` §2.1) is written against.
 */
export function deltaEok(a: Oklab, b: Oklab): number {
  return Math.hypot(a.l - b.l, a.a - b.a, a.b - b.b);
}
