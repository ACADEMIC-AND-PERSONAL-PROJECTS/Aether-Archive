/**
 * The extraction pipeline of `DESIGN-SYSTEM.md` §2.1: downscale → cluster → score & filter →
 * palette of 5–8 colours with weights. Pure and synchronous; decoding bytes to pixels is the
 * browser adapter's job (`decode.ts`), kept apart so this pipeline is testable everywhere.
 */
import { downscale } from "./downscale";
import { oklabToHex, oklabToOklch } from "./oklch";
import { ALPHA_FLOOR, clusterKmeans, clusterMedianCut, toOklabPixels } from "./quantize";
import { filterClusters, mergeClusters, scoreClusters } from "./score";

import type { Oklab, Oklch, Palette, PaletteColor, PixelImage } from "./types";

/** §2.1's palette bounds. */
export const MIN_COLORS = 5;
export const MAX_COLORS = 8;

/** The extraction budget: long edge of the working bitmap (§2.1's 64 px). */
export const MAX_EDGE = 64;

/** Adaptive retries widen k by this much when filters and merges fall under the floor. */
const K_STEP = 2;
const MAX_K = 12;

export type QuantizeAlgorithm = "kmeans" | "median-cut";

/** ADR-018's default, chosen on measured numbers. */
export const DEFAULT_ALGORITHM: QuantizeAlgorithm = "kmeans";

export interface ExtractOptions {
  /** Long edge of the working bitmap; default `MAX_EDGE`. */
  maxEdge?: number;
  /** Pixels below this alpha are ignored; default `ALPHA_FLOOR`. */
  alphaFloor?: number;
  /** `"kmeans"` (default) or `"median-cut"` — both shipped, ADR-018 explains the choice. */
  algorithm?: QuantizeAlgorithm;
  /** Fixed cluster count; by default the pipeline starts at `MAX_COLORS` and adapts upward. */
  k?: number;
}

/**
 * Returns 5–8 colours for photographic input, ranked by §2.1's score, weights normalised over the
 * returned colours. Degenerate inputs (a solid bitmap, one hue) return their few distinct colours
 * instead of invented ones — a theme built on fiction would be worse than a theme built on three
 * real colours (ADR-018).
 */
export function extractPalette(image: PixelImage, options: ExtractOptions = {}): Palette {
  const algorithm = options.algorithm ?? DEFAULT_ALGORITHM;
  const points = toOklabPixels(
    downscale(image, options.maxEdge ?? MAX_EDGE),
    options.alphaFloor ?? ALPHA_FLOOR,
  );
  if (points.length === 0) return { colors: [] };

  let k = Math.min(options.k ?? MAX_COLORS, points.length);
  let palette = buildPalette(points, algorithm, k);

  // Filters and merges can take a palette under the floor; if the image still has distinct
  // colours to give, widen k. Two retries bound the extra cost on the 50 ms budget.
  const adaptive = options.k === undefined;
  for (let attempt = 0; attempt < 2 && adaptive; attempt++) {
    if (palette.colors.length >= MIN_COLORS || k >= MAX_K || k >= points.length) break;
    k = Math.min(k + K_STEP, MAX_K, points.length);
    palette = buildPalette(points, algorithm, k);
  }
  return palette;
}

function buildPalette(points: Oklab[], algorithm: QuantizeAlgorithm, k: number): Palette {
  const clusters =
    algorithm === "median-cut" ? clusterMedianCut(points, k) : clusterKmeans(points, k);
  const kept = filterClusters(mergeClusters(clusters));
  if (kept.length === 0) return { colors: [] };

  const total = kept.reduce((sum, cluster) => sum + cluster.count, 0);
  const scored = scoreClusters(kept, total)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const hexA = oklabToHex(a.centroid);
      const hexB = oklabToHex(b.centroid);
      return hexA < hexB ? -1 : hexA > hexB ? 1 : 0;
    })
    .slice(0, MAX_COLORS);

  const returned = scored.reduce((sum, cluster) => sum + cluster.count, 0);
  const colors: PaletteColor[] = scored.map((cluster) => ({
    hex: oklabToHex(cluster.centroid),
    oklch: roundOklch(oklabToOklch(cluster.centroid)),
    weight: cluster.count / returned,
  }));
  return { colors };
}

/** Rounded for stable output across engines: hex quantises anyway, these keep `oklch` printable. */
function roundOklch({ l, c, h }: Oklch): Oklch {
  const round = (value: number, digits: number): number => {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  };
  return { l: round(l, 4), c: round(c, 4), h: round(h, 1) };
}
