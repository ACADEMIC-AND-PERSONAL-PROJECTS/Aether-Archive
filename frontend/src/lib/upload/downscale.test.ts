import { describe, expect, it, vi } from "vitest";

import {
  JPEG_QUALITY,
  MAX_BYTES_BEFORE_DOWNSCALE,
  MAX_LONG_EDGE,
  downscaleForUpload,
  planDownscale,
  type BitmapOptionsLike,
  type DownscaleDependencies,
  type DownscaleOutputType,
} from "./downscale";

/**
 * The decision and the browser edge of E4-S2B.
 *
 * jsdom implements no canvas, no `createImageBitmap` and no `OffscreenCanvas` (ADR-018, and the
 * environment table in `frontend/README.md`), so the pure planner is exercised directly and the
 * execution path runs against injected ports whose every argument is recorded. The real
 * `createImageBitmap → canvas → encode` path is proven by the Chromium probe.
 */

interface FakeRecord {
  bitmaps: Blob[];
  bitmapOptions: BitmapOptionsLike[];
  canvases: Array<{ width: number; height: number }>;
  draws: Array<readonly [number, number, number, number]>;
  encodes: Array<{ type: DownscaleOutputType; quality: number }>;
}

interface FakeDependencies {
  dependencies: DownscaleDependencies;
  record: FakeRecord;
}

/** A File whose `size` can be stated without allocating the bytes. */
function fileOf(bytes: number, type: string, name = "photo"): File {
  const payload = new Uint8Array(Math.min(bytes, 16));
  const file = new File([payload], name, { type, lastModified: 1_700_000_000_000 });
  if (bytes > payload.byteLength) {
    Object.defineProperty(file, "size", { configurable: true, value: bytes });
  }
  return file;
}

function fakeDependencies(
  bitmap: { readonly width: number; readonly height: number } = { width: 4000, height: 3000 },
  encoded: Blob = new Blob([new Uint8Array(256)], { type: "image/jpeg" }),
): FakeDependencies {
  const record: FakeRecord = {
    bitmaps: [],
    bitmapOptions: [],
    canvases: [],
    draws: [],
    encodes: [],
  };

  const dependencies: DownscaleDependencies = {
    createImageBitmap: async (input, options) => {
      record.bitmaps.push(input);
      record.bitmapOptions.push(options);
      return { width: bitmap.width, height: bitmap.height };
    },
    createCanvas: (width, height) => {
      record.canvases.push({ width, height });
      return {
        width,
        height,
        getContext: () => ({
          drawImage: (_image, dx, dy, dw, dh) => {
            record.draws.push([dx, dy, dw, dh]);
          },
        }),
      };
    },
    encode: async (_canvas, type, quality) => {
      record.encodes.push({ type, quality });
      return encoded;
    },
  };

  return { dependencies, record };
}

describe("planDownscale", () => {
  it("keeps an image exactly at the long-edge bound and exactly at the byte bound", () => {
    expect(
      planDownscale({
        width: MAX_LONG_EDGE,
        height: 1440,
        bytes: MAX_BYTES_BEFORE_DOWNSCALE,
        type: "image/jpeg",
      }),
    ).toEqual({ downscale: false, reason: "within-bounds" });
  });

  it("downscales one pixel past the long edge and caps it at 2560", () => {
    expect(
      planDownscale({ width: MAX_LONG_EDGE + 1, height: 1000, bytes: 1024, type: "image/jpeg" }),
    ).toEqual({
      downscale: true,
      targetWidth: 2560,
      targetHeight: 1000,
      outputType: "image/jpeg",
      reason: "long-edge",
    });
  });

  it("re-encodes a file one byte past the weight threshold without changing its size", () => {
    expect(
      planDownscale({
        width: 1000,
        height: 800,
        bytes: MAX_BYTES_BEFORE_DOWNSCALE + 1,
        type: "image/jpeg",
      }),
    ).toEqual({
      downscale: true,
      targetWidth: 1000,
      targetHeight: 800,
      outputType: "image/jpeg",
      reason: "bytes",
    });
  });

  it("reports the long edge as the reason when both bounds are crossed", () => {
    expect(
      planDownscale({
        width: 4000,
        height: 3000,
        bytes: MAX_BYTES_BEFORE_DOWNSCALE + 1,
        type: "image/jpeg",
      }),
    ).toEqual({
      downscale: true,
      targetWidth: 2560,
      targetHeight: 1920,
      outputType: "image/jpeg",
      reason: "long-edge",
    });
  });

  it("caps a portrait image by its height", () => {
    expect(
      planDownscale({ width: 3000, height: 4000, bytes: 1024, type: "image/jpeg" }),
    ).toMatchObject({
      downscale: true,
      targetWidth: 1920,
      targetHeight: 2560,
      reason: "long-edge",
    });
  });

  it("rounds each axis independently within half a pixel of the exact scale", () => {
    const facts = { width: 4001, height: 2999, bytes: 1024, type: "image/jpeg" };
    const plan = planDownscale(facts);
    expect(plan.downscale).toBe(true);
    if (!plan.downscale) {
      return;
    }

    const scale = MAX_LONG_EDGE / facts.width;
    expect(plan.targetWidth).toBe(MAX_LONG_EDGE);
    expect(Math.abs(plan.targetWidth - facts.width * scale)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(plan.targetHeight - facts.height * scale)).toBeLessThanOrEqual(0.5);
  });

  it.each(["image/gif", "image/avif", "application/octet-stream", "image/tiff", ""])(
    "leaves an ineligible %s untouched however large it is",
    (type) => {
      expect(
        planDownscale({ width: 10000, height: 10000, bytes: 100 * 1024 * 1024, type }),
      ).toEqual({ downscale: false, reason: "ineligible-type" });
    },
  );

  it.each([
    ["image/jpeg", "image/jpeg"],
    ["image/jpg", "image/jpeg"],
    ["image/png", "image/png"],
  ] as const)("maps a %s source to a %s output", (source, output) => {
    const plan = planDownscale({
      width: 1000,
      height: 1000,
      bytes: MAX_BYTES_BEFORE_DOWNSCALE + 1,
      type: source,
    });
    expect(plan).toMatchObject({ downscale: true, outputType: output, reason: "bytes" });
  });

  it("normalises the declared type the way the archive does", () => {
    const plan = planDownscale({
      width: 1000,
      height: 1000,
      bytes: MAX_BYTES_BEFORE_DOWNSCALE + 1,
      type: "IMAGE/JPEG; charset=binary",
    });
    expect(plan).toMatchObject({ downscale: true, outputType: "image/jpeg" });
  });

  it("honours explicit thresholds", () => {
    expect(
      planDownscale(
        { width: 1000, height: 500, bytes: 100, type: "image/jpeg" },
        { maxLongEdge: 512, maxBytes: 1000 },
      ),
    ).toEqual({
      downscale: true,
      targetWidth: 512,
      targetHeight: 256,
      outputType: "image/jpeg",
      reason: "long-edge",
    });

    expect(
      planDownscale(
        { width: 100, height: 100, bytes: 101, type: "image/jpeg" },
        { maxLongEdge: 512, maxBytes: 100 },
      ),
    ).toMatchObject({ downscale: true, reason: "bytes", targetWidth: 100, targetHeight: 100 });
  });
});

describe("downscaleForUpload", () => {
  it("draws the aspect-capped size and encodes at the documented quality", async () => {
    const encoded = new Blob([new Uint8Array(256)], { type: "image/jpeg" });
    const { dependencies, record } = fakeDependencies({ width: 4000, height: 3000 }, encoded);
    const file = fileOf(1024, "image/jpeg", "photo.jpg");

    const result = await downscaleForUpload(file, { dependencies });

    expect(record.bitmaps).toEqual([file]);
    expect(record.bitmapOptions).toEqual([{ imageOrientation: "from-image" }]);
    expect(record.canvases).toEqual([{ width: 2560, height: 1920 }]);
    expect(record.draws).toEqual([[0, 0, 2560, 1920]]);
    expect(record.encodes).toEqual([{ type: "image/jpeg", quality: JPEG_QUALITY }]);

    // A new File: the source's name and timestamp, the encoded bytes and type.
    expect(result).not.toBe(file);
    expect(result.name).toBe("photo.jpg");
    expect(result.lastModified).toBe(file.lastModified);
    expect(result.type).toBe("image/jpeg");
    expect(result.size).toBe(encoded.size);
  });

  it("encodes a PNG source as PNG, keeping alpha possible", async () => {
    const encoded = new Blob([new Uint8Array(64)], { type: "image/png" });
    const { dependencies, record } = fakeDependencies({ width: 3000, height: 2000 }, encoded);
    const file = fileOf(1024, "image/png", "alpha.png");

    const result = await downscaleForUpload(file, { dependencies });

    expect(record.encodes).toEqual([{ type: "image/png", quality: JPEG_QUALITY }]);
    expect(result.type).toBe("image/png");
  });

  it("leaves a WebP alone — it may be animated or carry alpha, which a canvas would lose", async () => {
    const { dependencies, record } = fakeDependencies({ width: 3000, height: 2000 });
    const file = fileOf(1024, "image/webp", "mood.webp");

    await expect(downscaleForUpload(file, { dependencies })).resolves.toBe(file);
    expect(record.bitmaps).toEqual([]);
    expect(record.encodes).toEqual([]);
  });

  it("returns the original when the re-encode would be no smaller", async () => {
    // Measured in review: a 6.5 MB PNG re-encoded to 10.2 MB, and a q50 JPEG to 1.77× — a "compress"
    // that grows the upload could push it past the server's ceiling for no gain.
    const bigger = new Blob([new Uint8Array(4096)], { type: "image/jpeg" });
    const { dependencies } = fakeDependencies({ width: 4000, height: 3000 }, bigger);
    const file = fileOf(1024, "image/jpeg", "already-tight.jpg");

    await expect(downscaleForUpload(file, { dependencies })).resolves.toBe(file);
  });

  it("returns the original when preparation does not settle before its deadline", async () => {
    vi.useFakeTimers();
    try {
      const file = fileOf(1024, "image/jpeg", "wedged.jpg");
      const dependencies: DownscaleDependencies = {
        createImageBitmap: () => new Promise(() => {}),
        createCanvas: () => {
          throw new Error("unreachable");
        },
        encode: () => new Promise(() => {}),
      };

      const promise = downscaleForUpload(file, { dependencies, timeoutMs: 50 });
      await vi.advanceTimersByTimeAsync(50);
      await expect(promise).resolves.toBe(file);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the dimensions when only the byte threshold is crossed", async () => {
    const encoded = new Blob([new Uint8Array(64)], { type: "image/jpeg" });
    const { dependencies, record } = fakeDependencies({ width: 2000, height: 1000 }, encoded);
    const file = fileOf(MAX_BYTES_BEFORE_DOWNSCALE + 1, "image/jpeg", "heavy.jpg");

    const result = await downscaleForUpload(file, { dependencies });

    expect(record.canvases).toEqual([{ width: 2000, height: 1000 }]);
    expect(result).not.toBe(file);
  });

  it("returns the original without touching a canvas when the image is within bounds", async () => {
    const { dependencies, record } = fakeDependencies({ width: 1000, height: 800 }, undefined);
    const file = fileOf(1024, "image/jpeg", "small.jpg");

    const result = await downscaleForUpload(file, { dependencies });

    expect(result).toBe(file);
    expect(record.canvases).toHaveLength(0);
    expect(record.encodes).toHaveLength(0);
  });

  it("returns the original for an ineligible type without decoding it", async () => {
    const { dependencies, record } = fakeDependencies();
    const file = fileOf(1024, "image/gif", "loop.gif");

    const result = await downscaleForUpload(file, { dependencies });

    expect(result).toBe(file);
    expect(record.bitmaps).toHaveLength(0);
  });

  it("returns the original when the browser cannot decode the file", async () => {
    const { dependencies } = fakeDependencies();
    dependencies.createImageBitmap = async () => {
      throw new Error("decoder refused the bytes");
    };
    const file = fileOf(1024, "image/jpeg", "broken.jpg");

    await expect(downscaleForUpload(file, { dependencies })).resolves.toBe(file);
  });

  it("returns the original when the environment has no 2D context", async () => {
    const { dependencies } = fakeDependencies();
    dependencies.createCanvas = (width, height) => ({
      width,
      height,
      getContext: () => null,
    });
    const file = fileOf(1024, "image/jpeg", "canvas-less.jpg");

    await expect(downscaleForUpload(file, { dependencies })).resolves.toBe(file);
  });

  it("returns the original when the encoder reports failure with null", async () => {
    const { dependencies } = fakeDependencies();
    dependencies.encode = async () => null;
    const file = fileOf(1024, "image/jpeg", "encode-failed.jpg");

    await expect(downscaleForUpload(file, { dependencies })).resolves.toBe(file);
  });

  it("returns the original when the encoder rejects", async () => {
    const { dependencies } = fakeDependencies();
    dependencies.encode = async () => {
      throw new Error("encoder exploded");
    };
    const file = fileOf(1024, "image/jpeg", "encoder-threw.jpg");

    await expect(downscaleForUpload(file, { dependencies })).resolves.toBe(file);
  });

  it("falls back to the original where the browser globals are absent — the jsdom finding", async () => {
    expect(typeof createImageBitmap).toBe("undefined");
    expect(typeof OffscreenCanvas).toBe("undefined");
    const file = fileOf(1024, "image/jpeg", "no-browser.jpg");

    await expect(downscaleForUpload(file)).resolves.toBe(file);
  });

  it("labels the File with the encoded blob's type, not the requested one", async () => {
    // MDN: an unsupported requested type falls back to PNG. The archive compares the declared type
    // with the magic bytes, so a fallback must travel as PNG.
    const encoded = new Blob([new Uint8Array(64)], { type: "image/png" });
    const { dependencies } = fakeDependencies({ width: 4000, height: 3000 }, encoded);

    const result = await downscaleForUpload(fileOf(1024, "image/jpeg", "fallback.jpg"), {
      dependencies,
    });

    expect(result.type).toBe("image/png");
  });
});
