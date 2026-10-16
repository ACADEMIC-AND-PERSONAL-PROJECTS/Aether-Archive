/** The public surface of the colour library: extraction, decoding, and the palette's types. */
export { decodeToPixels, extractPaletteFromBytes, PaletteExtractionError } from "./decode";
export type { Canvas2DLike, DecodeDependencies, DecodeOptions, PaletteErrorCode } from "./decode";
export { downscale } from "./downscale";
export { DEFAULT_ALGORITHM, MAX_COLORS, MAX_EDGE, MIN_COLORS, extractPalette } from "./palette";
export type { ExtractOptions, QuantizeAlgorithm } from "./palette";
export type { Oklab, Oklch, Palette, PaletteColor, PixelImage } from "./types";
