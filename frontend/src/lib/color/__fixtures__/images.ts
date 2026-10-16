/**
 * Deterministic bitmap fixtures for the extraction suite: pure builders, no canvas, no files, no
 * unseeded randomness — a failing test reproduces byte-for-byte.
 */
import type { PixelImage } from "../types";

export const ORANGE: readonly [number, number, number] = [214, 122, 52];

/** Fills row-major regions [share, rgb] over a 64×64 canvas; shares must sum to ≤ 1. */
export function bands(
  regions: ReadonlyArray<readonly [number, readonly [number, number, number]]>,
  width = 64,
  height = 64,
  alpha = 255,
): PixelImage {
  const data = new Uint8ClampedArray(width * height * 4);
  const total = width * height;
  let cursor = 0;
  regions.forEach(([share, rgb], index) => {
    const end = index === regions.length - 1 ? total : cursor + Math.round(total * share);
    for (let i = cursor; i < end; i++) {
      data[i * 4] = rgb[0];
      data[i * 4 + 1] = rgb[1];
      data[i * 4 + 2] = rgb[2];
      data[i * 4 + 3] = alpha;
    }
    cursor = end;
  });
  return { data, width, height };
}

export function solid(rgb: readonly [number, number, number], width = 64, height = 64): PixelImage {
  return bands([[1, rgb]], width, height);
}

/** 70% warm orange, 20% deep teal, 10% charcoal — the dominant-hue case. */
export function dominantHue(): PixelImage {
  return bands([
    [0.7, ORANGE],
    [0.2, [31, 122, 122]],
    [0.1, [45, 55, 70]],
  ]);
}

/** Six muted sage tones — high lightness spread, very low chroma. */
export function lowSaturation(): PixelImage {
  return bands([
    [1 / 6, [60, 66, 58]],
    [1 / 6, [90, 98, 86]],
    [1 / 6, [120, 128, 112]],
    [1 / 6, [150, 158, 140]],
    [1 / 6, [180, 188, 168]],
    [1 / 6, [210, 216, 198]],
  ]);
}

/** Seven neutral bands from #282828 to #dcdcdc — the grayscale case. */
export function grayscale(): PixelImage {
  const tone = (value: number): readonly [number, number, number] => [value, value, value];
  return bands([
    [1 / 7, tone(40)],
    [1 / 7, tone(70)],
    [1 / 7, tone(100)],
    [1 / 7, tone(130)],
    [1 / 7, tone(160)],
    [1 / 7, tone(190)],
    [1 / 7, tone(220)],
  ]);
}

/**
 * Left half a real colour, right half fully transparent (and black in the raw buffer) — the
 * transparent-PNG case: extraction must see one colour, at full weight, never black.
 */
export function transparentHalf(): PixelImage {
  const image = bands([[1, ORANGE]]);
  const half = (image.width * image.height) / 2;
  for (let i = half; i < image.width * image.height; i++) {
    image.data[i * 4] = 0;
    image.data[i * 4 + 1] = 0;
    image.data[i * 4 + 2] = 0;
    image.data[i * 4 + 3] = 0;
  }
  return image;
}

/** mulberry32, again — fixture-side, so the fixture never depends on the library's PRNG. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform RGB noise, seeded — the determinism and stress case. */
export function seededNoise(seed: number, width = 64, height = 64): PixelImage {
  const random = mulberry32(seed);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = Math.floor(random() * 256);
    data[i * 4 + 1] = Math.floor(random() * 256);
    data[i * 4 + 2] = Math.floor(random() * 256);
    data[i * 4 + 3] = 255;
  }
  return { data, width, height };
}
