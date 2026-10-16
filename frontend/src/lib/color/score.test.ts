import { describe, expect, it } from "vitest";
import { rgbToOklab } from "./oklch";
import type { Cluster } from "./quantize";
import { filterClusters, mergeClusters, scoreClusters } from "./score";

const cluster = (rgb: readonly [number, number, number], count: number): Cluster => ({
  centroid: rgbToOklab(rgb[0], rgb[1], rgb[2]),
  count,
});

describe("filterClusters", () => {
  it("drops near-black and near-white clusters", () => {
    const input = [cluster([5, 5, 6], 10), cluster([120, 90, 60], 10), cluster([252, 252, 252], 10)];
    const kept = filterClusters(input);
    expect(kept).toHaveLength(1);
    expect(kept[0]!.centroid).toEqual(input[1]!.centroid);
  });
});

describe("mergeClusters", () => {
  it("merges a sub-threshold pair into its count-weighted mean", () => {
    const heavy = cluster([150, 100, 80], 30);
    const light = cluster([151, 100, 80], 10);
    const distant = cluster([40, 90, 160], 10);
    const merged = mergeClusters([heavy, light, distant]);
    expect(merged).toHaveLength(2);
    const survivor = merged.find((entry) => entry.count === 40)!;
    expect(survivor.centroid.l).toBeCloseTo((heavy.centroid.l * 30 + light.centroid.l * 10) / 40, 12);
  });

  it("with a wide threshold, merges everything into one cluster with the total count", () => {
    const merged = mergeClusters([cluster([10, 20, 30], 5), cluster([200, 100, 50], 7)], 10);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.count).toBe(12);
  });
});

describe("scoreClusters", () => {
  const total = 100;

  it("weights scores by cluster share", () => {
    const [big, small] = scoreClusters([cluster([150, 100, 80], 80), cluster([150, 100, 80], 20)], total);
    expect(big!.score).toBeGreaterThan(small!.score);
  });

  it("ranks mid-lightness above the extremes at equal share and chroma", () => {
    const [mid, bright] = scoreClusters([cluster([128, 128, 128], 50), cluster([228, 228, 228], 50)], total);
    expect(mid!.score).toBeGreaterThan(bright!.score);
  });

  it("boosts saturated colours over grays at equal share and lightness", () => {
    const [red, gray] = scoreClusters([cluster([255, 0, 0], 50), cluster([128, 128, 128], 50)], total);
    expect(red!.score).toBeGreaterThan(gray!.score);
  });
});
