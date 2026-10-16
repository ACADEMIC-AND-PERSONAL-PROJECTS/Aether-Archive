/**
 * Bytes → pixels: the only browser-bound step of the extraction, kept behind a tiny dependency
 * interface. jsdom implements no canvas at all (probe in `reports/verify-e2-s4-20261016.md`), so
 * the error funnel is unit-tested here with injected dependencies while the real path is exercised
 * by the offline Chromium probe with real PNG bytes.
 */
import { MAX_EDGE, extractPalette, type ExtractOptions } from "./palette";

import type { Palette, PixelImage } from "./types";

export type PaletteErrorCode = "unsupported" | "decode-failed";

/** The only error extraction throws: what failed, and whether anything could have decoded it. */
export class PaletteExtractionError extends Error {
  readonly code: PaletteErrorCode;

  constructor(code: PaletteErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PaletteExtractionError";
    this.code = code;
  }
}

export interface BitmapLike {
  readonly width: number;
  readonly height: number;
}

export interface ImageDataLike {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

export interface Canvas2DLike {
  readonly width: number;
  readonly height: number;
  getContext(contextId: "2d"): {
    drawImage(image: BitmapLike, dx: number, dy: number, dw: number, dh: number): void;
    getImageData(sx: number, sy: number, sw: number, sh: number): ImageDataLike;
  } | null;
}

/** Injectable edges; browsers supply `createImageBitmap` + `OffscreenCanvas`. */
export interface DecodeDependencies {
  createImageBitmap(input: Blob): Promise<BitmapLike>;
  createOffscreenCanvas(width: number, height: number): Canvas2DLike;
}

export interface DecodeOptions {
  /** Long edge of the decoded bitmap; default `MAX_EDGE`, the extraction budget. */
  maxEdge?: number;
  /** Overridden in tests; browsers use the globals. */
  dependencies?: DecodeDependencies;
}

function browserDependencies(): DecodeDependencies {
  if (typeof createImageBitmap === "undefined" || typeof OffscreenCanvas === "undefined") {
    throw new PaletteExtractionError(
      "unsupported",
      "This environment provides no image decoding (createImageBitmap/OffscreenCanvas) — extraction needs a browser.",
    );
  }
  return {
    createImageBitmap: (input) => createImageBitmap(input),
    createOffscreenCanvas: (width, height) =>
      new OffscreenCanvas(width, height) as unknown as Canvas2DLike,
  };
}

/** Decodes any browser-decodable image (PNG, JPEG, WebP, …) into ≤ `maxEdge` pixels. */
export async function decodeToPixels(
  input: Blob | ArrayBuffer | Uint8Array,
  options: DecodeOptions = {},
): Promise<PixelImage> {
  const dependencies = options.dependencies ?? browserDependencies();
  const maxEdge = options.maxEdge ?? MAX_EDGE;
  const blob = input instanceof Blob ? input : new Blob([input as BlobPart]);

  let bitmap: BitmapLike;
  try {
    bitmap = await dependencies.createImageBitmap(blob);
  } catch (cause) {
    throw new PaletteExtractionError(
      "decode-failed",
      "The image could not be decoded — the file is corrupted or not an image.",
      { cause },
    );
  }

  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = dependencies.createOffscreenCanvas(width, height);
  const context = canvas.getContext("2d");
  if (!context) {
    throw new PaletteExtractionError(
      "unsupported",
      "This environment provides no 2D canvas context to read pixels from.",
    );
  }
  context.drawImage(bitmap, 0, 0, width, height);
  const imageData = context.getImageData(0, 0, width, height);
  return { data: imageData.data, width: imageData.width, height: imageData.height };
}

/** The bytes → palette funnel: decode failures surface as `PaletteExtractionError` before extraction. */
export async function extractPaletteFromBytes(
  input: Blob | ArrayBuffer | Uint8Array,
  options: DecodeOptions & ExtractOptions = {},
): Promise<Palette> {
  const pixels = await decodeToPixels(input, options);
  return extractPalette(pixels, options);
}
