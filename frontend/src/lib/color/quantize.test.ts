import { describe, expect, it } from "vitest";
import { rgbToOklab } from "./oklch";
import { ALPHA_FLOOR, clusterKmeans, clusterMedianCut, toOklabPixels } from "./quantize";
import type { Oklab, PixelImage } from "./types";

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

function jitteredPoints(center: Oklab, count: number, spread: number, random: () => number): Oklab[] {
  return Array.from({ length: count }, () => ({
    l: center.l + (random() - 0.5) * spread,
    a: center.a + (random() - 0.5) * spread,
    b: center.b + (random() - 0.5) * spread,
  }));
}

const ORANGE = rgbToOklab(214, 122, 52);
const TEAL = rgbToOklab(31, 122, 122);
const BLUE = rgbToOklab(38, 48, 130);

describe("toOklabPixels", () => {
  it("converts row-major and honours the alpha floor", () => {
    const image: PixelImage = {
      data: new Uint8ClampedArray([
        255, 0, 0, 255, // kept
        0, 255, 0, 254, // kept
        0, 0, 255, 0, // discarded: transparent
        0, 0, 0, 127, // discarded: one below the floor
      ]),
      width: 2,
      height: 2,
    };
    const points = toOklabPixels(image);
    expect(points).toHaveLength(2);
    expect(points[0]!.l).toBeCloseTo(rgbToOklab(255, 0, 0).l, 12);
    expect(points[1]!.b).toBeCloseTo(rgbToOklab(0, 255, 0).b, 12);
    expect(ALPHA_FLOOR).toBe(128);
  });
});

const random = mulberry32(0xa1b2c3);
const threeGroups = [
  ...jitteredPoints(ORANGE, 100, 0.04, random),
  ...jitteredPoints(TEAL, 60, 0.04, random),
  ...jitteredPoints(BLUE, 40, 0.04, random),
];

describe("clusterKmeans", () => {
  it("recovers three well-separated colour groups with exact counts", () => {
    const clusters = clusterKmeans(threeGroups, 3);
    expect(clusters).toHaveLength(3);
    const byCount = [...clusters].sort((a, b) => b.count - a.count);
    expect(byCount.map((cluster) => cluster.count)).toEqual([100, 60, 40]);
    expect(byCount[0]!.centroid.l).toBeCloseTo(ORANGE.l, 2);
    expect(byCount[0]!.centroid.a).toBeCloseTo(ORANGE.a, 2);
    expect(byCount[1]!.centroid.l).toBeCloseTo(TEAL.l, 2);
    expect(byCount[2]!.centroid.b).toBeCloseTo(BLUE.b, 2);
  });

  it("is deterministic: identical input, identical output", () => {
    expect(clusterKmeans(threeGroups, 4)).toEqual(clusterKmeans(threeGroups, 4));
  });

  it("drops empty clusters when every pixel is identical", () => {
    const same = Array.from({ length: 10 }, () => ({ ...ORANGE }));
    const clusters = clusterKmeans(same, 5);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.count).toBe(10);
  });

  it("returns one cluster per point when k exceeds the point count", () => {
    const clusters = clusterKmeans([ORANGE, TEAL, BLUE], 8);
    expect(clusters).toHaveLength(3);
    expect(clusters.reduce((sum, cluster) => sum + cluster.count, 0)).toBe(3);
  });

  it("handles empty input", () => {
    expect(clusterKmeans([], 8)).toEqual([]);
  });
});

describe("clusterMedianCut", () => {
  it("splits an evenly populated lightness ramp exactly at the median", () => {
    const points: Oklab[] = Array.from({ length: 100 }, (_, index) => ({
      l: index / 100,
      a: 0,
      b: 0,
    }));
    const clusters = clusterMedianCut(points, 2);
    expect(clusters).toHaveLength(2);
    const byLightness = [...clusters].sort((x, y) => x.centroid.l - y.centroid.l);
    expect(byLightness[0]!.count).toBe(50);
    expect(byLightness[0]!.centroid.l).toBeCloseTo(0.245, 6);
    expect(byLightness[1]!.centroid.l).toBeCloseTo(0.745, 6);
  });

  it("recovers two equal, well-separated groups", () => {
    const seeded = mulberry32(0x0dd51);
    const low = { l: 0.3, a: 0.05, b: 0.02 };
    const high = { l: 0.8, a: 0.05, b: 0.02 };
    const points = [
      ...jitteredPoints(low, 100, 0.04, seeded),
      ...jitteredPoints(high, 100, 0.04, seeded),
    ];
    const clusters = clusterMedianCut(points, 2);
    expect(clusters).toHaveLength(2);
    const byLightness = [...clusters].sort((x, y) => x.centroid.l - y.centroid.l);
    expect(byLightness.map((cluster) => cluster.count)).toEqual([100, 100]);
    expect(byLightness[0]!.centroid.l).toBeCloseTo(low.l, 2);
    expect(byLightness[1]!.centroid.l).toBeCloseTo(high.l, 2);
  });

  it("is deterministic: identical input, identical output", () => {
    expect(clusterMedianCut(threeGroups, 3)).toEqual(clusterMedianCut(threeGroups, 3));
  });

  it("stops splitting when every point is identical", () => {
    const same = Array.from({ length: 10 }, () => ({ ...ORANGE }));
    const clusters = clusterMedianCut(same, 5);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.count).toBe(10);
  });

  it("handles empty input", () => {
    expect(clusterMedianCut([], 8)).toEqual([]);
  });
});
