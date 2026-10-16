import { describe, expect, it } from "vitest";

import {
  PaletteExtractionError,
  decodeToPixels,
  extractPaletteFromBytes,
  type Canvas2DLike,
  type DecodeDependencies,
} from "./decode";

interface FakeDependencies extends DecodeDependencies {
  readonly draws: Array<readonly [number, number, number, number]>;
}

function fakeDependencies(): FakeDependencies {
  const draws: Array<readonly [number, number, number, number]> = [];
  return {
    draws,
    createImageBitmap: async () => ({ width: 200, height: 100 }),
    createOffscreenCanvas: (width: number, height: number): Canvas2DLike => ({
      width,
      height,
      getContext: () => ({
        drawImage: (_image, dx, dy, dw, dh) => {
          draws.push([dx, dy, dw, dh]);
        },
        getImageData: (_sx, _sy, sw, sh) => ({
          data: new Uint8ClampedArray(sw * sh * 4).fill(200),
          width: sw,
          height: sh,
        }),
      }),
    }),
  };
}

describe("decodeToPixels", () => {
  it("pre-sizes the bitmap to the extraction budget, preserving aspect", async () => {
    const dependencies = fakeDependencies();
    const pixels = await decodeToPixels(new Uint8Array([1, 2, 3]), { dependencies });
    expect(pixels.width).toBe(64);
    expect(pixels.height).toBe(32);
    expect(dependencies.draws).toEqual([[0, 0, 64, 32]]);
  });

  it("never upscales a bitmap smaller than the budget", async () => {
    const dependencies = fakeDependencies();
    dependencies.createImageBitmap = async () => ({ width: 16, height: 16 });
    const pixels = await decodeToPixels(new Uint8Array([1]), { dependencies });
    expect(pixels.width).toBe(16);
    expect(pixels.height).toBe(16);
    expect(dependencies.draws).toEqual([[0, 0, 16, 16]]);
  });

  it("surfaces a decode failure as PaletteExtractionError('decode-failed')", async () => {
    const dependencies = fakeDependencies();
    dependencies.createImageBitmap = () => Promise.reject(new Error("boom"));
    const attempt = decodeToPixels(new Uint8Array([0xff, 0xd8, 0xff]), { dependencies });
    await expect(attempt).rejects.toMatchObject({
      name: "PaletteExtractionError",
      code: "decode-failed",
    });
    await expect(attempt).rejects.toThrowError(PaletteExtractionError);
  });

  it("surfaces a missing 2D context as PaletteExtractionError('unsupported')", async () => {
    const dependencies = fakeDependencies();
    dependencies.createOffscreenCanvas = (width: number, height: number): Canvas2DLike => ({
      width,
      height,
      getContext: () => null,
    });
    await expect(decodeToPixels(new Uint8Array([1, 2, 3]), { dependencies })).rejects.toMatchObject(
      {
        name: "PaletteExtractionError",
        code: "unsupported",
      },
    );
  });

  it("reports 'unsupported' where the globals are absent — the probe's jsdom finding", async () => {
    expect(typeof createImageBitmap).toBe("undefined");
    expect(typeof OffscreenCanvas).toBe("undefined");
    await expect(decodeToPixels(new Uint8Array([1, 2, 3]))).rejects.toMatchObject({
      name: "PaletteExtractionError",
      code: "unsupported",
    });
  });
});

describe("extractPaletteFromBytes", () => {
  it("decodes then extracts: the fake bitmap's pixels reach the pipeline", async () => {
    const palette = await extractPaletteFromBytes(new Uint8Array([1, 2, 3]), {
      dependencies: fakeDependencies(),
    });
    const [color] = palette.colors;
    expect(color?.hex).toBe("#c8c8c8");
    expect(color?.weight).toBeCloseTo(1, 9);
  });
});
