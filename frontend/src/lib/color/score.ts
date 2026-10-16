/**
 * §2.1's "score & filter" stage: drop near-black/near-white clusters, merge clusters closer than
 * the ΔE threshold, and score by weight × chroma × mid-lightness. Pure functions over clusters.
 */
import { deltaEok, oklabToOklch } from "./oklch";
import type { Cluster } from "./quantize";
import type { Oklab } from "./types";

/** Near-black and near-white clusters are filtered out of the palette (§2.1). */
export const MIN_LIGHTNESS = 0.12;
export const MAX_LIGHTNESS = 0.95;

/** Two centroids closer than this are the same colour (§2.1: "merge clusters with ΔE < 0.02"). */
export const MERGE_THRESHOLD = 0.02;

export interface ScoredCluster extends Cluster {
  score: number;
}

/**
 * §2.1's rank: `weight × (0.5 + C) × midLightnessBonus(L)`. The design system names the bonus
 * but not its curve; it is defined here as `1 − |L − 0.5|` — 1 at mid lightness, 0.62 at the
 * darkest permitted tone and 0.55 at the brightest — and ADR-018 records the reading.
 */
export function scoreClusters(clusters: Cluster[], totalCount: number): ScoredCluster[] {
  return clusters.map((cluster) => {
    const { l, c } = oklabToOklch(cluster.centroid);
    const weight = cluster.count / totalCount;
    return { ...cluster, score: weight * (0.5 + c) * (1 - Math.abs(l - 0.5)) };
  });
}

export function filterClusters(clusters: Cluster[]): Cluster[] {
  return clusters.filter(
    (cluster) => cluster.centroid.l >= MIN_LIGHTNESS && cluster.centroid.l <= MAX_LIGHTNESS,
  );
}

/**
 * Merges the closest pair below the threshold, repeat, until no pair is left. The survivor is the
 * count-weighted mean, so merged colours keep the pixels that voted for them. Recomputing the
 * closest pair each round (palettes here hold ≤ 12 clusters) keeps the result independent of the
 * input order; ties resolve to the earliest pair.
 */
export function mergeClusters(clusters: Cluster[], threshold: number = MERGE_THRESHOLD): Cluster[] {
  const merged = clusters.map((cluster) => ({ centroid: { ...cluster.centroid }, count: cluster.count }));

  for (;;) {
    let pair: readonly [number, number] | null = null;
    let closest = threshold;
    for (let i = 0; i < merged.length; i++) {
      for (let j = i + 1; j < merged.length; j++) {
        const distance = deltaEok(merged[i]!.centroid, merged[j]!.centroid);
        if (distance < closest) {
          closest = distance;
          pair = [i, j];
        }
      }
    }
    if (!pair) break;

    const [i, j] = pair;
    const a = merged[i]!;
    const b = merged[j]!;
    const count = a.count + b.count;
    merged[i] = { centroid: blend(a.centroid, b.centroid, a.count, b.count), count };
    merged.splice(j, 1);
  }

  return merged;
}

function blend(a: Oklab, b: Oklab, countA: number, countB: number): Oklab {
  const count = countA + countB;
  return {
    l: (a.l * countA + b.l * countB) / count,
    a: (a.a * countA + b.a * countB) / count,
    b: (a.b * countA + b.b * countB) / count,
  };
}
