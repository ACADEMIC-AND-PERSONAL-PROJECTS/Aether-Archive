/**
 * Clustering of downscaled pixels into dominant colours. Two classical algorithms are implemented
 * and kept side by side — k-means++ and median cut — so ADR-018 can choose on measured numbers;
 * both are exercised by the benchmark and the suite.
 *
 * Both work directly on the OKLab pixels (≤ 4,096 after the downscale), not on a coarse histogram:
 * the histogram trick buys speed this input does not need, and it costs fidelity the palette would
 * then have to pay for. Determinism comes from a fixed-order input, a seeded PRNG, and stable sorts.
 */
import { rgbToOklab } from "./oklch";
import type { Oklab, PixelImage } from "./types";

/** Pixels below this alpha are ignored — §2.1's transparent-PNG case. */
export const ALPHA_FLOOR = 128;

/** k-means++ runs from a constant seed: same pixels in, same palette out (ADR-018). */
export const KMEANS_SEED = 0x5eed0001;

export interface Cluster {
  /** Count-weighted mean in OKLab. */
  centroid: Oklab;
  /** Number of pixels in the cluster. */
  count: number;
}

/** Row-major, in-gamut pixels as OKLab. */
export function toOklabPixels(image: PixelImage, alphaFloor: number = ALPHA_FLOOR): Oklab[] {
  const points: Oklab[] = [];
  const { data } = image;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3]! < alphaFloor) continue;
    points.push(rgbToOklab(data[i]!, data[i + 1]!, data[i + 2]!));
  }
  return points;
}

const distanceSquared = (a: Oklab, b: Oklab): number =>
  (a.l - b.l) ** 2 + (a.a - b.a) ** 2 + (a.b - b.b) ** 2;

/** mulberry32 — a 32-bit seeded PRNG; integer ops only, so it is engine-independent. */
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

export interface KmeansOptions {
  seed?: number;
  maxIterations?: number;
}

/**
 * k-means++ (weighted seeding by squared distance) followed by Lloyd iterations. Empty clusters
 * are dropped, so a degenerate input (every pixel identical) yields one cluster rather than k
 * copies of itself.
 */
export function clusterKmeans(
  points: Oklab[],
  k: number,
  options: KmeansOptions = {},
): Cluster[] {
  if (points.length === 0 || k <= 0) return [];
  const target = Math.min(k, points.length);
  const random = mulberry32(options.seed ?? KMEANS_SEED);
  const maxIterations = options.maxIterations ?? 24;

  const centers: Oklab[] = [{ ...points[Math.floor(random() * points.length)]! }];
  const nearest = new Float64Array(points.length).fill(Infinity);
  while (centers.length < target) {
    const last = centers[centers.length - 1]!;
    let total = 0;
    for (let i = 0; i < points.length; i++) {
      const distance = distanceSquared(points[i]!, last);
      if (distance < nearest[i]!) nearest[i] = distance;
      total += nearest[i]!;
    }
    if (total === 0) break; // every point already coincides with a centre

    let pick = random() * total;
    let index = points.length - 1;
    for (let i = 0; i < points.length; i++) {
      pick -= nearest[i]!;
      if (pick <= 0) {
        index = i;
        break;
      }
    }
    centers.push({ ...points[index]! });
  }

  const assignment = new Int32Array(points.length); // 0 = unassigned, otherwise centre index + 1
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    let moved = false;
    for (let i = 0; i < points.length; i++) {
      const point = points[i]!;
      let best = 0;
      let bestDistance = Infinity;
      for (let c = 0; c < centers.length; c++) {
        const distance = distanceSquared(point, centers[c]!);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = c;
        }
      }
      if (assignment[i] !== best + 1) moved = true;
      assignment[i] = best + 1;
    }

    const sums = centers.map(() => ({ l: 0, a: 0, b: 0, n: 0 }));
    for (let i = 0; i < points.length; i++) {
      const point = points[i]!;
      const sum = sums[assignment[i]! - 1]!;
      sum.l += point.l;
      sum.a += point.a;
      sum.b += point.b;
      sum.n += 1;
    }
    for (let c = 0; c < centers.length; c++) {
      const sum = sums[c]!;
      if (sum.n > 0) centers[c] = { l: sum.l / sum.n, a: sum.a / sum.n, b: sum.b / sum.n };
    }
    if (!moved && iteration > 0) break;
  }

  const totals = centers.map(() => ({ l: 0, a: 0, b: 0, n: 0 }));
  for (let i = 0; i < points.length; i++) {
    const point = points[i]!;
    const total = totals[assignment[i]! - 1]!;
    total.l += point.l;
    total.a += point.a;
    total.b += point.b;
    total.n += 1;
  }
  return totals
    .filter((total) => total.n > 0)
    .map((total) => ({
      centroid: { l: total.l / total.n, a: total.a / total.n, b: total.b / total.n },
      count: total.n,
    }));
}

/**
 * Median cut in OKLab: repeatedly split the box with the largest channel range at its median,
 * until `k` boxes. Ties (equal ranges) resolve to the earliest box and the L → a → b channel
 * order, and the sort is stable — so the outcome is a pure function of the input sequence.
 */
export function clusterMedianCut(points: Oklab[], k: number): Cluster[] {
  if (points.length === 0 || k <= 0) return [];
  const target = Math.min(k, points.length);
  const boxes: Oklab[][] = [points.slice()];
  const channels = ["l", "a", "b"] as const;

  while (boxes.length < target) {
    let chosenBox = -1;
    let chosenChannel: (typeof channels)[number] = "l";
    let chosenRange = 0;
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i]!;
      for (const channel of channels) {
        let min = Infinity;
        let max = -Infinity;
        for (const point of box) {
          const value = point[channel];
          if (value < min) min = value;
          if (value > max) max = value;
        }
        const range = max - min;
        if (range > chosenRange) {
          chosenRange = range;
          chosenBox = i;
          chosenChannel = channel;
        }
      }
    }
    if (chosenBox === -1) break; // every box is a single colour — nothing left to split

    const box = boxes[chosenBox]!;
    box.sort((p, q) => p[chosenChannel] - q[chosenChannel]);
    const mid = Math.floor(box.length / 2);
    boxes.splice(chosenBox, 1, box.slice(0, mid), box.slice(mid));
  }

  return boxes
    .filter((box) => box.length > 0)
    .map((box) => {
      let l = 0;
      let a = 0;
      let b = 0;
      for (const point of box) {
        l += point.l;
        a += point.a;
        b += point.b;
      }
      return {
        centroid: { l: l / box.length, a: a / box.length, b: b / box.length },
        count: box.length,
      };
    });
}
