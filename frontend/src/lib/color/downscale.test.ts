import { describe, expect, it } from "vitest";
import { downscale } from "./downscale";
import type { PixelImage } from "./types";

function solid(rgba: [number, number, number, number], width: number, height: number): PixelImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = rgba[0];
    data[i * 4 + 1] = rgba[1];
    data[i * 4 + 2] = rgba[2];
    data[i * 4 + 3] = rgba[3];
  }
  return { data, width, height };
}

describe("downscale", () => {
  it("returns images already within the budget untouched", () => {
    const image = solid([255, 0, 0, 255], 32, 32);
    expect(downscale(image)).toBe(image);
  });

  it("caps the long edge and preserves the aspect ratio", () => {
    const out = downscale(solid([1, 2, 3, 255], 200, 100), 64);
    expect(out.width).toBe(64);
    expect(out.height).toBe(32);
  });

  it("box-averages whole source rectangles", () => {
    const image: PixelImage = { data: new Uint8ClampedArray(4 * 4 * 4), width: 4, height: 4 };
    const quadrant: Array<[number, number, number]> = [
      [100, 150, 200], // top-left
      [200, 50, 100], // top-right
      [0, 30, 60], // bottom-left
      [255, 255, 255], // bottom-right
    ];
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const q = (y < 2 ? 0 : 2) + (x < 2 ? 0 : 1);
        const [r, g, b] = quadrant[q]!;
        const i = (y * 4 + x) * 4;
        image.data[i] = r;
        image.data[i + 1] = g;
        image.data[i + 2] = b;
        image.data[i + 3] = 255;
      }
    }

    const out = downscale(image, 2);
    expect(out.width).toBe(2);
    expect(out.height).toBe(2);
    expect(Array.from(out.data)).toEqual([
      100, 150, 200, 255, 200, 50, 100, 255, 0, 30, 60, 255, 255, 255, 255, 255,
    ]);
  });

  it("premultiplies alpha: transparent black does not darken a colour", () => {
    const image: PixelImage = {
      data: new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 0]),
      width: 2,
      height: 1,
    };
    const out = downscale(image, 1);
    expect(out.width).toBe(1);
    expect(out.height).toBe(1);
    expect(out.data[0]).toBe(255);
    expect(out.data[1]).toBe(0);
    expect(out.data[2]).toBe(0);
    expect(out.data[3]).toBe(128); // Math.round(0.5 * 255)
  });

  it("keeps a uniform colour exactly uniform", () => {
    const out = downscale(solid([37, 84, 201, 255], 128, 96), 64);
    for (let i = 0; i < out.width * out.height; i++) {
      expect([out.data[i * 4], out.data[i * 4 + 1], out.data[i * 4 + 2], out.data[i * 4 + 3]]).toEqual(
        [37, 84, 201, 255],
      );
    }
  });
});
