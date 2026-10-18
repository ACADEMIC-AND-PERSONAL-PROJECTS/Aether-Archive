/**
 * WCAG 2.x contrast math, in the open (DESIGN-SYSTEM §2.2; WebAIM's checker is the reference —
 * DESIGN-REFERENCES §5). Pure math, no canvas, no dependency, jsdom-friendly.
 *
 * One deliberate choice: `compositeOver` keeps fractional channels. Translucent layers are
 * exactly what the glass rules measure, and rounding to bytes before the arithmetic shifts the
 * reported ratio by up to ~0.03 — the E2-S3 report's 16.20 for text on glass-over-bg is the
 * unrounded value (byte rounding reads 16.17).
 */
export interface Rgb {
  /** 0–255; fractional when a composite produced them. */
  r: number;
  g: number;
  b: number;
}

const HEX = /^#([\da-f]{6})$/i;
const RGBA = /^rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)$/;

/** `#rrggbb` → channels. Anything else is a caller bug, so it throws. */
export function hexToRgb(hex: string): Rgb {
  const digits = HEX.exec(hex)?.[1];
  if (digits === undefined) {
    throw new Error(`Not a #rrggbb colour: ${hex}`);
  }
  const value = Number.parseInt(digits, 16);
  return { r: (value >> 16) & 0xff, g: (value >> 8) & 0xff, b: value & 0xff };
}

/**
 * A user-entered `#RRGGBB` — case-insensitive, surrounding spaces allowed — normalised to lowercase;
 * `null` when it is not one. The E4-S4 hex input validates with this before it reaches the theme.
 */
export function normalizeHex(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  return HEX.test(trimmed) ? trimmed : null;
}

/** A token string back to channels + alpha — `#rrggbb` or `rgba(...)`, the forms §2.2 uses. */
export function parseColor(value: string): { rgb: Rgb; alpha: number } {
  if (HEX.test(value)) {
    return { rgb: hexToRgb(value), alpha: 1 };
  }
  const [red, green, blue, alpha] = RGBA.exec(value)?.slice(1) ?? [];
  if (red === undefined || green === undefined || blue === undefined || alpha === undefined) {
    throw new Error(`Unrecognised colour: ${value}`);
  }
  return {
    rgb: { r: Number(red), g: Number(green), b: Number(blue) },
    alpha: Number(alpha),
  };
}

const linearize = (channel: number): number => {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};

/** WCAG 2.x relative luminance (0–1). */
export function relativeLuminance({ r, g, b }: Rgb): number {
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/** WCAG 2.x contrast ratio (1–21). Symmetric in its arguments. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/** A translucent layer over an opaque base — the arithmetic a browser composites with. */
export function compositeOver(layer: Rgb, alpha: number, base: Rgb): Rgb {
  return {
    r: layer.r * alpha + base.r * (1 - alpha),
    g: layer.g * alpha + base.g * (1 - alpha),
    b: layer.b * alpha + base.b * (1 - alpha),
  };
}

/** `rgba(r, g, b, a)` in the stylesheet's own formatting — the string a token carries. */
export function rgbaString({ r, g, b }: Rgb, alpha: number): string {
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`;
}
