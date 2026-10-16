/**
 * The public surface of the colour library: extraction, decoding, the palette's types, and the
 * theme layer (E2-S6) that turns a palette into the DESIGN-SYSTEM §2.2 tokens.
 */
export {
  compositeOver,
  contrastRatio,
  hexToRgb,
  parseColor,
  relativeLuminance,
  rgbaString,
} from "./contrast";
export type { Rgb } from "./contrast";
export { decodeToPixels, extractPaletteFromBytes, PaletteExtractionError } from "./decode";
export type { Canvas2DLike, DecodeDependencies, DecodeOptions, PaletteErrorCode } from "./decode";
export { downscale } from "./downscale";
export { DEFAULT_ALGORITHM, MAX_COLORS, MAX_EDGE, MIN_COLORS, extractPalette } from "./palette";
export type { ExtractOptions, QuantizeAlgorithm } from "./palette";
export {
  applyFallbackTheme,
  applyTheme,
  clearTheme,
  CONTRAST_MINIMUM,
  contrastReport,
  FALLBACK_THEME,
  paletteToTheme,
  THEME_PROPERTIES,
} from "./theme";
export type { AuraTheme, ContrastReport } from "./theme";
export type { Oklab, Oklch, Palette, PaletteColor, PixelImage } from "./types";
