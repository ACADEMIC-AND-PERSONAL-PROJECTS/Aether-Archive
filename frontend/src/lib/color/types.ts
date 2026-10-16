/** A bitmap's pixels, shaped like `ImageData` but dependency-free — jsdom and Node can host it. */
export interface PixelImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** OKLCh, the perceptual space the design system specifies (`DESIGN-SYSTEM.md` §2.1). */
export interface Oklch {
  /** Lightness, 0–1. */
  l: number;
  /** Chroma, 0–~0.37 for sRGB colours. */
  c: number;
  /** Hue in degrees, [0, 360). */
  h: number;
}

/** One extracted colour: the hex the theme layer writes, its OKLCh, and its share of the image. */
export interface PaletteColor {
  hex: string;
  oklch: Oklch;
  /** Normalised weight in (0, 1]; a palette's weights sum to 1. */
  weight: number;
}

export interface Palette {
  /**
   * 5–8 colours for photographic input, ranked by score; fewer only for degenerate images
   * (a solid or single-hue-only bitmap has fewer distinct colours than the range, and inventing
   * colours would lie about the image — see ADR-018).
   */
  colors: PaletteColor[];
}

/** OKLab, the cartesian form of the same space — averaging clusters is correct here, not in OKLCh. */
export interface Oklab {
  l: number;
  a: number;
  b: number;
}
