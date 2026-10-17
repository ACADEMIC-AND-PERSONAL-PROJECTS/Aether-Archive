/**
 * The theme layer: a palette becomes the DESIGN-SYSTEM §2.2 tokens, with contrast enforced by
 * construction rather than checked afterwards.
 *
 * `paletteToTheme` maps E2-S4's extracted colours to the §2.1 roles — background from the
 * darkest useful mid-chroma pulled into the dark band, surface monotonic above it, text and
 * muted raised in OKLCh until every §2.2 pair clears 4.5:1, accent from `weight × C` with its
 * guaranteed text colour chosen between the two neutral bases. Every adjustment moves OKLCh
 * lightness only: hue and chroma stay the image's, so the theme still looks like the photo.
 *
 * `FALLBACK_THEME` is the neutral set for extraction failures — value for value the one
 * global.css declares on `:root` (a test guards the two against drift). `applyTheme` writes
 * the tokens as inline custom properties on the root at runtime; `clearTheme` hands the page
 * back to the stylesheet. This module is the theme layer §2.2's hex-literal rule points at;
 * the stylesheet keeps one copy because it must stand alone before any JavaScript runs.
 */
import {
  compositeOver,
  contrastRatio,
  hexToRgb,
  normalizeHex,
  parseColor,
  rgbaString,
  type Rgb,
} from "./contrast";
import { oklchToHex, rgbToOklch } from "./oklch";

import type { Oklch, Palette, PaletteColor } from "./types";

export interface AuraTheme {
  readonly bg: string;
  readonly surface: string;
  readonly glass: string;
  readonly glassSolid: string;
  readonly hairline: string;
  readonly text: string;
  readonly muted: string;
  readonly accent: string;
  readonly accentContrast: string;
}

/** The token each theme field is applied as; the order is the check page's presentation order. */
export const THEME_PROPERTIES: ReadonlyArray<readonly [keyof AuraTheme, string]> = [
  ["bg", "--aura-bg"],
  ["surface", "--aura-surface"],
  ["glass", "--aura-glass"],
  ["glassSolid", "--aura-glass-solid"],
  ["hairline", "--aura-hairline"],
  ["text", "--aura-text"],
  ["muted", "--aura-muted"],
  ["accent", "--aura-accent"],
  ["accentContrast", "--aura-accent-contrast"],
];

/** §2.2's floor for every declared pair. */
export const CONTRAST_MINIMUM = 4.5;

/*
 * The two neutral bases the accent-contrast rule chooses between (§2.1). They are the app's
 * dark and light extremes — never pure black or pure white, per the brief.
 */
const DARK_BASE = "#0b0b0d";
const LIGHT_BASE = "#e8e6e3";

/* The glass material's constants (§3): a black tint at two opacities, plus the hairline. */
const GLASS_TINT: Rgb = { r: 0, g: 0, b: 0 };
const WHITE_TINT: Rgb = { r: 255, g: 255, b: 255 };
const GLASS_ALPHA = 0.4;
const GLASS_SOLID_ALPHA = 0.72;
const HAIRLINE = "1px solid rgba(255, 255, 255, 0.08)";
/* The inverse hairline for the light-glass theme (`themeFromBackground` on a light page). */
const LIGHT_HAIRLINE = "1px solid rgba(0, 0, 0, 0.08)";

/* The generator's bands — the §2.1/§2.2 rules made numeric, one comment each in place. */
const BG_L_MIN = 0.1;
const BG_L_MAX = 0.18;
const BG_C_MAX = 0.05;
const SURFACE_STEP = 0.032;
const SURFACE_L_MAX = 0.24;
const SURFACE_C_MAX = 0.06;
const TEXT_L_MIN = 0.86;
const TEXT_L_MAX = 0.93;

/**
 * The two bands a contrast guarantee is only as good as, exported so a test can feed the generator its
 * **current** worst case rather than a copy of it. A test that hard-codes 0.10–0.18 and 0.86–0.93 keeps
 * passing if the generator widens, because it is then measuring a range the code no longer produces.
 */
export const THEME_BANDS = {
  bgLightness: { min: BG_L_MIN, max: BG_L_MAX },
  textLightness: { min: TEXT_L_MIN, max: TEXT_L_MAX },
} as const;
const TEXT_CEILING = 0.97;
const TEXT_C_MAX = 0.02;
const TEXT_STEP = 0.01;
const MUTED_ALPHA = 0.62;
const MUTED_STEP = 0.02;
const ACCENT_L_MIN = 0.05;
const ACCENT_L_MAX = 0.97;
const ACCENT_STEP = 0.02;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** The neutral set (E2-S3) — what the app shows before any image, and after any failure. */
export const FALLBACK_THEME: AuraTheme = {
  bg: DARK_BASE,
  surface: "#121215",
  glass: rgbaString(GLASS_TINT, GLASS_ALPHA),
  glassSolid: rgbaString(GLASS_TINT, GLASS_SOLID_ALPHA),
  hairline: HAIRLINE,
  text: LIGHT_BASE,
  muted: rgbaString(hexToRgb(LIGHT_BASE), MUTED_ALPHA),
  accent: "#b5a98f",
  accentContrast: DARK_BASE,
};

/** Every §2.2 contrast pair a theme declares, as measured ratios. */
export interface ContrastReport {
  readonly textOnBg: number;
  readonly textOnSurface: number;
  readonly textOnGlass: number;
  readonly mutedOnBg: number;
  readonly accentContrastOnAccent: number;
}

/**
 * The §2.2 rules as numbers: text on the page, the opaque surface and the glass composite;
 * muted on the page; accent-contrast on the accent. Translucent tokens are composited over
 * `bg` first — the same arithmetic a browser runs, and the one the E2-S3 measurements used.
 */
export function contrastReport(theme: AuraTheme): ContrastReport {
  const bg = hexToRgb(theme.bg);
  const glass = parseColor(theme.glass);
  const muted = parseColor(theme.muted);
  return {
    textOnBg: contrastRatio(hexToRgb(theme.text), bg),
    textOnSurface: contrastRatio(hexToRgb(theme.text), hexToRgb(theme.surface)),
    textOnGlass: contrastRatio(hexToRgb(theme.text), compositeOver(glass.rgb, glass.alpha, bg)),
    mutedOnBg: contrastRatio(compositeOver(muted.rgb, muted.alpha, bg), bg),
    accentContrastOnAccent: contrastRatio(hexToRgb(theme.accentContrast), hexToRgb(theme.accent)),
  };
}

/**
 * The accent and its guaranteed text colour (§2.2). The source is the palette's highest
 * `weight × C` colour; when neither neutral base clears 4.5:1 against it, its OKLCh lightness
 * steps toward the base currently reading stronger — dark text wants a lighter accent, light
 * text a darker one — while hue and chroma stay put. The band edges clear 4.5:1 across the
 * chroma range — worst measured reading 5.93:1 (review brute-force) — so the step loop always
 * returns; the trailing return is the boundary the type checker needs.
 */
function fitAccent(source: PaletteColor): { accent: string; accentContrast: string } {
  const againstDark = (hex: string): number => contrastRatio(hexToRgb(hex), hexToRgb(DARK_BASE));
  const againstLight = (hex: string): number => contrastRatio(hexToRgb(hex), hexToRgb(LIGHT_BASE));

  const darkPasses = againstDark(source.hex) >= CONTRAST_MINIMUM;
  const lightPasses = againstLight(source.hex) >= CONTRAST_MINIMUM;
  if (darkPasses || lightPasses) {
    const preferDark =
      darkPasses && (!lightPasses || againstDark(source.hex) >= againstLight(source.hex));
    return { accent: source.hex, accentContrast: preferDark ? DARK_BASE : LIGHT_BASE };
  }

  const lighten = againstDark(source.hex) >= againstLight(source.hex);
  const base = lighten ? DARK_BASE : LIGHT_BASE;
  const measure = lighten ? againstDark : againstLight;
  const steps = Math.ceil((ACCENT_L_MAX - ACCENT_L_MIN) / ACCENT_STEP) + 1;

  let l = clamp(source.oklch.l, ACCENT_L_MIN, ACCENT_L_MAX);
  for (let step = 0; step < steps; step += 1) {
    l = clamp(l + (lighten ? ACCENT_STEP : -ACCENT_STEP), ACCENT_L_MIN, ACCENT_L_MAX);
    const candidate = oklchToHex({ l, c: source.oklch.c, h: source.oklch.h });
    if (measure(candidate) >= CONTRAST_MINIMUM) {
      return { accent: candidate, accentContrast: base };
    }
  }

  return {
    accent: oklchToHex({
      l: lighten ? ACCENT_L_MAX : ACCENT_L_MIN,
      c: source.oklch.c,
      h: source.oklch.h,
    }),
    accentContrast: base,
  };
}

/**
 * The §2.1 role mapping. Deterministic: ties break on hex, and every loop steps in fixed
 * increments — the same palette always yields the same theme.
 *
 * Throws on an empty palette: a caller with *no* colours holds an extraction failure, and
 * that path is `applyFallbackTheme`, not a theme invented from nothing.
 */
export function paletteToTheme(palette: Palette): AuraTheme {
  const colors = [...palette.colors].sort(
    (a, b) => a.oklch.l - b.oklch.l || a.hex.localeCompare(b.hex),
  );
  const ranked = [...palette.colors].sort(
    (a, b) => b.weight * b.oklch.c - a.weight * a.oklch.c || a.hex.localeCompare(b.hex),
  );
  const darkest = colors[0];
  const lightest = colors.at(-1);
  const accentSource = ranked[0];
  if (darkest === undefined || lightest === undefined || accentSource === undefined) {
    throw new Error("A palette needs at least one colour");
  }

  /*
   * Background: the darkest useful mid-chroma, pulled into the dark band and chroma-capped —
   * never pure black, and still wearing the image's hue. Surface: one fixed step above it,
   * which is what "monotonic lightness for surfaces" means with two surfaces (§2.1/§2.2).
   */
  const bgL = clamp(darkest.oklch.l, BG_L_MIN, BG_L_MAX);
  const bg = oklchToHex({ l: bgL, c: Math.min(darkest.oklch.c, BG_C_MAX), h: darkest.oklch.h });
  const surface = oklchToHex({
    l: Math.min(bgL + SURFACE_STEP, SURFACE_L_MAX),
    c: Math.min(darkest.oklch.c, SURFACE_C_MAX),
    h: darkest.oklch.h,
  });

  /*
   * Text: the palette's lightest colour, near-neutral, raised step by step until it clears
   * 4.5:1 on the page, the surface *and* the glass composite — the §2.2 rule, guarded on all
   * three so a future surface tweak cannot silently break it.
   */
  const bgRgb = hexToRgb(bg);
  const surfaceRgb = hexToRgb(surface);
  const glassOverBg = compositeOver(GLASS_TINT, GLASS_ALPHA, bgRgb);
  const textC = Math.min(lightest.oklch.c, TEXT_C_MAX);
  const passesOnAll = (hex: string): boolean => {
    const rgb = hexToRgb(hex);
    return (
      contrastRatio(rgb, bgRgb) >= CONTRAST_MINIMUM &&
      contrastRatio(rgb, surfaceRgb) >= CONTRAST_MINIMUM &&
      contrastRatio(rgb, glassOverBg) >= CONTRAST_MINIMUM
    );
  };

  let textL = clamp(lightest.oklch.l, TEXT_L_MIN, TEXT_L_MAX);
  let text = oklchToHex({ l: textL, c: textC, h: lightest.oklch.h });
  while (!passesOnAll(text) && textL < TEXT_CEILING) {
    textL = Math.min(textL + TEXT_STEP, TEXT_CEILING);
    text = oklchToHex({ l: textL, c: textC, h: lightest.oklch.h });
  }

  /*
   * Muted: the text colour at reduced alpha — transparency, not a second hue. If 0.62 fails
   * its pair the alpha rises until it passes; at 1 the colour *is* the text, which is
   * guaranteed to pass, so the loop terminates by construction.
   */
  const textRgb = hexToRgb(text);
  let mutedAlpha = MUTED_ALPHA;
  let mutedOverBg = compositeOver(textRgb, mutedAlpha, bgRgb);
  while (contrastRatio(mutedOverBg, bgRgb) < CONTRAST_MINIMUM && mutedAlpha < 1) {
    mutedAlpha = Math.round((mutedAlpha + MUTED_STEP) * 100) / 100;
    mutedOverBg = compositeOver(textRgb, mutedAlpha, bgRgb);
  }

  const { accent, accentContrast } = fitAccent(accentSource);

  return {
    bg,
    surface,
    glass: rgbaString(GLASS_TINT, GLASS_ALPHA),
    glassSolid: rgbaString(GLASS_TINT, GLASS_SOLID_ALPHA),
    hairline: HAIRLINE,
    text,
    muted: rgbaString(textRgb, mutedAlpha),
    accent,
    accentContrast,
  };
}

/**
 * A theme from a **chosen** background (E4-S4). Unlike `paletteToTheme`, the page keeps the user's
 * hex exactly; every other token is derived to clear §2.2's floor.
 *
 * Text starts from the nearer neutral base and steps toward its extreme until it passes on the page,
 * the surface and the glass composite. The surface steps **away from the text** (darker under light
 * text, lighter under dark text), so it cannot eat the contrast the page just earned. A background in
 * the narrow mid-tone band where neither near-white nor near-black passes is refused rather than
 * silently darkened: the user picked that colour, and a preview that is not the colour they picked
 * would be lying.
 *
 * The accent is the background's own hue at a usable chroma (the neutral fallback accent when the
 * background has no hue), fitted against the two neutral bases by `fitAccent`.
 *
 * **The glass follows the text.** The app's glass is a black tint, which on a light page would be
 * darker than any text that passes on that page. Each text direction therefore carries its own tint:
 * black under light text, white under dark text (with a dark hairline), so the glass composite stays
 * on the same side of the background as the text it must carry.
 *
 * **Both directions are tried.** The nearer neutral base is only a preference: a colour the first
 * direction cannot carry (the reviewer's `#cc3399` needs white text; `#0066ff` needs white too) is
 * retried with the other base and the other tint before it is refused. Pure black and pure white pages
 * are refused by policy — the brief's bases stop at `#0B0B0D`/`#E8E6E3` — and the search never returns
 * pure black or pure white text.
 */
export function themeFromBackground(value: string): AuraTheme {
  const hex = normalizeHex(value);
  if (hex === null) {
    throw new Error(`Not a #rrggbb colour: ${value}`);
  }
  if (hex === "#000000" || hex === "#ffffff") {
    throw new Error(
      "Pure black and pure white are outside the brief's palette: choose #010101 or #fefefe.",
    );
  }
  const bgRgb = hexToRgb(hex);
  const bgOklch = rgbToOklch(bgRgb.r, bgRgb.g, bgRgb.b);
  const lightBaseContrast = contrastRatio(hexToRgb(LIGHT_BASE), bgRgb);
  const darkBaseContrast = contrastRatio(hexToRgb(DARK_BASE), bgRgb);
  const light = textCandidate(bgRgb, bgOklch, true);
  const dark = textCandidate(bgRgb, bgOklch, false);
  const preferredLight = lightBaseContrast >= darkBaseContrast;
  let chosen = light ?? dark;
  if (light !== null && dark !== null) {
    chosen =
      light.minRatio > dark.minRatio || (light.minRatio === dark.minRatio && preferredLight)
        ? light
        : dark;
  }
  if (chosen === null) {
    throw new Error(`${hex} cannot carry 4.5:1 text in either direction.`);
  }

  const textRgb = hexToRgb(chosen.text);
  let mutedAlpha = MUTED_ALPHA;
  let mutedOverBg = compositeOver(textRgb, mutedAlpha, bgRgb);
  while (contrastRatio(mutedOverBg, bgRgb) < CONTRAST_MINIMUM && mutedAlpha < 1) {
    mutedAlpha = Math.round((mutedAlpha + MUTED_STEP) * 100) / 100;
    mutedOverBg = compositeOver(textRgb, mutedAlpha, bgRgb);
  }

  const fallbackAccentRgb = hexToRgb(FALLBACK_THEME.accent);
  const fallbackAccentOklch = rgbToOklch(
    fallbackAccentRgb.r,
    fallbackAccentRgb.g,
    fallbackAccentRgb.b,
  );
  const accentOklch =
    bgOklch.c < 0.01
      ? fallbackAccentOklch
      : {
          l: chosen.lightText ? 0.72 : 0.42,
          c: Math.max(0.08, Math.min(bgOklch.c, 0.14)),
          h: bgOklch.h,
        };
  const accentSource: PaletteColor = {
    hex: oklchToHex(accentOklch),
    oklch: accentOklch,
    weight: 1,
  };
  const { accent, accentContrast } = fitAccent(accentSource);

  return {
    bg: hex,
    surface: chosen.surface,
    glass: rgbaString(chosen.glassTint, GLASS_ALPHA),
    glassSolid: rgbaString(chosen.glassTint, GLASS_SOLID_ALPHA),
    hairline: chosen.hairline,
    text: chosen.text,
    muted: rgbaString(textRgb, mutedAlpha),
    accent,
    accentContrast,
  };
}

/** One direction's answer: its text, its surface, its tint, and the weakest of the three ratios. */
interface TextCandidate {
  readonly text: string;
  readonly surface: string;
  readonly glassTint: Rgb;
  readonly hairline: string;
  readonly lightText: boolean;
  readonly minRatio: number;
}

/**
 * Searches one text direction for the first non-pure candidate that clears all three pairs: the
 * surface steps away from the text, the text starts at the neutral base and steps toward its extreme.
 * `null` means this direction cannot carry the page at 4.5:1.
 */
function textCandidate(bgRgb: Rgb, bgOklch: Oklch, lightText: boolean): TextCandidate | null {
  const glassTint: Rgb = lightText ? GLASS_TINT : WHITE_TINT;
  const surface = oklchToHex({
    l: clamp(bgOklch.l + (lightText ? -SURFACE_STEP : SURFACE_STEP), 0, 1),
    c: Math.min(bgOklch.c, SURFACE_C_MAX),
    h: bgOklch.h,
  });
  const surfaceRgb = hexToRgb(surface);
  const glassOverBg = compositeOver(glassTint, GLASS_ALPHA, bgRgb);
  const ratios = (candidate: string): number[] => {
    const rgb = hexToRgb(candidate);
    return [
      contrastRatio(rgb, bgRgb),
      contrastRatio(rgb, surfaceRgb),
      contrastRatio(rgb, glassOverBg),
    ];
  };

  const base = lightText ? LIGHT_BASE : DARK_BASE;
  const baseRgb = hexToRgb(base);
  const baseOklch = rgbToOklch(baseRgb.r, baseRgb.g, baseRgb.b);
  const step = lightText ? 0.01 : -0.01;
  let textL = baseOklch.l;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const candidate = oklchToHex({
      l: textL,
      c: Math.min(baseOklch.c, TEXT_C_MAX),
      h: baseOklch.h,
    });
    const values = ratios(candidate);
    const minRatio = Math.min(...values);
    // Pure black/white are outside the brief; the search keeps stepping instead of returning them.
    if (candidate !== "#000000" && candidate !== "#ffffff" && minRatio >= CONTRAST_MINIMUM) {
      return {
        text: candidate,
        surface,
        glassTint,
        hairline: lightText ? HAIRLINE : LIGHT_HAIRLINE,
        lightText,
        minRatio,
      };
    }
    if (lightText ? textL >= 0.995 : textL <= 0.005) {
      break;
    }
    textL = clamp(textL + step, 0, 1);
  }
  return null;
}

/**
 * Applies a theme at runtime (§2.2: the tokens live on `:root`): every field becomes an inline
 * custom property on the target, which wins over the stylesheet's neutral set. `clearTheme`
 * removes them again, handing the page back to the stylesheet.
 */
export function applyTheme(theme: AuraTheme, target: HTMLElement = document.documentElement): void {
  for (const [key, property] of THEME_PROPERTIES) {
    target.style.setProperty(property, theme[key]);
  }
}

/** The neutral set, applied through the same path every generated theme takes. */
export function applyFallbackTheme(target: HTMLElement = document.documentElement): void {
  applyTheme(FALLBACK_THEME, target);
}

/** Removes the inline overrides; the stylesheet's values take over again. */
export function clearTheme(target: HTMLElement = document.documentElement): void {
  for (const [, property] of THEME_PROPERTIES) {
    target.style.removeProperty(property);
  }
}
