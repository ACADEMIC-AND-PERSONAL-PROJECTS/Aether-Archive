/**
 * Downscale before upload: the pure decision, and the one browser-bound step that carries it out
 * (E4-S2B).
 *
 * ## Why downscale at all
 *
 * The archive is local, but a phone's uplink is not free: a 12 MP photo is 3–6 MiB and a modern phone
 * camera can hand over 48 MP. The criterion is "downscaled/compressed client-side before upload when
 * above a threshold (quality preserved for viewing)", so the thresholds are deliberately generous —
 * they remove the files that are wasteful, not the files that are merely large:
 *
 * - **`MAX_LONG_EDGE = 2560` px.** A 390 CSS px wide phone at DPR 3 needs 1170 physical pixels; 2560
 *   leaves room for zoom, a larger display and the archive's own future use of the image, while
 *   staying above what any phone shows at a normal viewing distance. A photo's long edge is what this
 *   caps, so portrait and landscape are treated the same.
 * - **`MAX_BYTES_BEFORE_DOWNSCALE = 6 MiB`.** Some files are heavy without being tall — a 2560 × 2560
 *   PNG is exactly at the edge and can still weigh far more than a photo of the same pixels — so size
 *   alone also triggers a re-encode. The byte threshold is checked against the source file, before any
 *   encoder touches it.
 * - **`JPEG_QUALITY = 0.9`.** At 2560 px a photo stored at 0.9 is visually indistinguishable from the
 *   original at normal viewing distance, and still much smaller. Quality is a request, not a promise:
 *   PNG ignores it (PNG is lossless), and `toBlob`/`convertToBlob` fall back to their own default when
 *   the requested type is unsupported (MDN).
 *
 * ## Which files may be re-encoded
 *
 * Only JPEG/JPG, PNG and WebP. The exclusions are the point:
 *
 * - **GIF is skipped** — a canvas holds one frame, so re-encoding would silently drop the animation.
 * - **AVIF is skipped** — canvas can decode it in current browsers but no universal encoder exists; a
 *   requested `image/avif` from `toBlob` silently falls back to PNG, which the archive would then
 *   receive under an AVIF name. Leaving the file untouched is the honest outcome.
 * - Everything else is refused by the server anyway; there is nothing to improve.
 *
 * ## The output type is the source's, except WebP
 *
 * JPEG and JPG output JPEG; WebP output JPEG (the universally supported lossy encoder); PNG output PNG,
 * because only PNG can carry the source's alpha channel. The returned `File` carries the **encoded
 * blob's own type**, not merely the requested one: MDN records that an unsupported requested type
 * falls back to PNG, and `StorageService.store` refuses an upload whose declared media type
 * contradicts its magic bytes. A browser that silently produces PNG must therefore be sent as PNG.
 * The PNG path ignores the quality argument by design.
 *
 * ## Failure is not a blocked upload
 *
 * `downscaleForUpload` never rejects. A missing canvas (jsdom, an old engine), a decode failure, a
 * missing 2D context, a null `toBlob` callback or an encoder rejection all return the **original
 * `File`**, unchanged. The server remains the boundary — it sniffs the bytes and enforces the size
 * ceiling (E4-S1A) — and a photo that would have uploaded before this story still uploads.
 *
 * The split mirrors `lib/color/decode.ts`: the decision is pure and unit-tested without React or
 * canvas, the browser edges are injected, and the real path is proven by an offline Chromium probe.
 */

/** The long edge an upload keeps, in pixels. Above any phone display at normal viewing distance. */
export const MAX_LONG_EDGE = 2560;

/** Source files above this weight are re-encoded even when their long edge is already within bounds. */
export const MAX_BYTES_BEFORE_DOWNSCALE = 6 * 1024 * 1024;

/** JPEG/WebP quality for the re-encode. PNG ignores it — see the header. */
export const JPEG_QUALITY = 0.9;

/** The two media types this module produces. */
export type DownscaleOutputType = "image/jpeg" | "image/png";

/** What the decision needs to know about one decoded source image. */
export interface DownscaleFacts {
  readonly width: number;
  readonly height: number;
  /** Size of the source file in bytes, before any re-encode. */
  readonly bytes: number;
  /** The file's declared media type; validated/normalised here exactly as the archive normalises it. */
  readonly type: string;
}

export interface DownscaleOptions {
  /** Defaults to {@link MAX_LONG_EDGE}; parameters let tests state their own boundary. */
  readonly maxLongEdge?: number;
  /** Defaults to {@link MAX_BYTES_BEFORE_DOWNSCALE}. */
  readonly maxBytes?: number;
}

/**
 * The planner's verdict. `ineligible-type` is distinct from `within-bounds` on purpose: an animation
 * or an unencodable format is not "small enough", it is a file this module must not touch.
 */
export type DownscalePlan =
  | { readonly downscale: false; readonly reason: "ineligible-type" | "within-bounds" }
  | {
      readonly downscale: true;
      readonly targetWidth: number;
      readonly targetHeight: number;
      readonly outputType: DownscaleOutputType;
      readonly reason: "long-edge" | "bytes";
    };

/** The source types the re-encoder accepts, and the output each one produces. */
const OUTPUT_TYPES: ReadonlyMap<string, DownscaleOutputType> = new Map([
  ["image/jpeg", "image/jpeg"],
  ["image/jpg", "image/jpeg"],
  ["image/png", "image/png"],
  ["image/webp", "image/jpeg"],
]);

/**
 * The archive's normalisation (`ImageFormat.forMediaType`): case-insensitive, parameters dropped.
 * The client must agree with the server about which spelling names which format.
 */
export function normaliseImageType(type: string): string {
  const semicolon = type.indexOf(";");
  const base = semicolon < 0 ? type : type.slice(0, semicolon);
  return base.trim().toLowerCase();
}

/** The type this module would encode `type` to, or `null` when the file must be left alone. */
function outputTypeFor(type: string): DownscaleOutputType | null {
  return OUTPUT_TYPES.get(normaliseImageType(type)) ?? null;
}

/**
 * Decides whether one image is re-encoded, and at what size/type.
 *
 * The long edge is capped and the other axis follows the source aspect ratio, rounded to the nearest
 * pixel (never below 1). When only the byte threshold is crossed, the dimensions are kept: re-encoding
 * is the whole change, which is what lets a heavy but already-small image shed weight without losing
 * resolution. The `long-edge` reason wins when both conditions are true.
 */
export function planDownscale(
  facts: DownscaleFacts,
  options: DownscaleOptions = {},
): DownscalePlan {
  const outputType = outputTypeFor(facts.type);
  if (outputType === null) {
    return { downscale: false, reason: "ineligible-type" };
  }

  const maxLongEdge = options.maxLongEdge ?? MAX_LONG_EDGE;
  const maxBytes = options.maxBytes ?? MAX_BYTES_BEFORE_DOWNSCALE;
  const longEdge = Math.max(facts.width, facts.height);
  const tooLong = longEdge > maxLongEdge;
  const tooHeavy = facts.bytes > maxBytes;

  if (!tooLong && !tooHeavy) {
    return { downscale: false, reason: "within-bounds" };
  }

  if (!tooLong) {
    return {
      downscale: true,
      targetWidth: Math.max(1, facts.width),
      targetHeight: Math.max(1, facts.height),
      outputType,
      reason: "bytes",
    };
  }

  const scale = maxLongEdge / longEdge;
  return {
    downscale: true,
    targetWidth: Math.max(1, Math.round(facts.width * scale)),
    targetHeight: Math.max(1, Math.round(facts.height * scale)),
    outputType,
    reason: "long-edge",
  };
}

/* ---------------------------------------------------------------------------------------------- */
/* The browser edge                                                                                */
/* ---------------------------------------------------------------------------------------------- */

/** The parts of an `ImageBitmap` this module uses; `close` releases its pixels. */
export interface BitmapLike {
  readonly width: number;
  readonly height: number;
  close?(): void;
}

export interface DrawContextLike {
  drawImage(image: BitmapLike, dx: number, dy: number, dw: number, dh: number): void;
}

/** A 2D canvas, whether offscreen or a DOM element. */
export interface CanvasLike {
  readonly width: number;
  readonly height: number;
  getContext(contextId: "2d"): DrawContextLike | null;
}

/** The orientation request is explicit: the file must be drawn upright, EXIF metadata included. */
export interface BitmapOptionsLike {
  readonly imageOrientation: "from-image";
}

/** Injectable edges; browsers supply `createImageBitmap` plus `OffscreenCanvas` or a DOM canvas. */
export interface DownscaleDependencies {
  createImageBitmap(input: Blob, options: BitmapOptionsLike): Promise<BitmapLike>;
  createCanvas(width: number, height: number): CanvasLike;
  /** `OffscreenCanvas.convertToBlob` or `HTMLCanvasElement.toBlob`; `null` is `toBlob`'s failure. */
  encode(canvas: CanvasLike, type: DownscaleOutputType, quality: number): Promise<Blob | null>;
}

export interface DownscaleForUploadOptions extends DownscaleOptions {
  /** Overridden in tests; browsers use the globals. */
  readonly dependencies?: DownscaleDependencies;
}

/**
 * The browser's edges. `OffscreenCanvas.convertToBlob` is preferred when it exists (it can run off the
 * main thread and needs no element); the DOM canvas + `toBlob` path is the fallback the story asks for,
 * and a `null` blob from `toBlob` is the encode failure the caller turns into "send the original".
 */
function browserDependencies(): DownscaleDependencies {
  if (typeof createImageBitmap === "undefined") {
    throw new Error(
      "This environment provides no image decoding (createImageBitmap) — downscaling needs a browser.",
    );
  }

  const decode = (input: Blob, options: BitmapOptionsLike): Promise<BitmapLike> =>
    createImageBitmap(input, options);

  if (
    typeof OffscreenCanvas !== "undefined" &&
    typeof OffscreenCanvas.prototype.convertToBlob === "function"
  ) {
    return {
      createImageBitmap: decode,
      createCanvas: (width, height) => new OffscreenCanvas(width, height) as unknown as CanvasLike,
      encode: (canvas, type, quality) =>
        (canvas as unknown as OffscreenCanvas).convertToBlob({ type, quality }),
    };
  }

  if (typeof document === "undefined") {
    throw new Error("This environment provides no canvas to downscale with.");
  }

  return {
    createImageBitmap: decode,
    createCanvas: (width, height) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      return canvas as unknown as CanvasLike;
    },
    encode: (canvas, type, quality) =>
      new Promise<Blob | null>((resolve) => {
        (canvas as unknown as HTMLCanvasElement).toBlob(resolve, type, quality);
      }),
  };
}

/**
 * The browser edge: decodes, decides, draws, encodes, and returns a **new `File`** — or the original.
 *
 * The original is returned without decoding for an ineligible type, and on every failure after that.
 * Nothing here throws: the only contract callers rely on is that the promise resolves to an uploadable
 * `File`. The preview is deliberately not involved — the caller keeps showing the source bytes.
 *
 * The orientation option is passed explicitly even though `"from-image"` is the documented default:
 * a browser default is a thing that can change, and a sideways portrait is a visible regression. The
 * decoded bitmap's dimensions are the oriented ones, so the planner sees what the user sees.
 */
export async function downscaleForUpload(
  file: File,
  options: DownscaleForUploadOptions = {},
): Promise<File> {
  // An ineligible file never needs decoding: deciding from the declared type alone spares a GIF's
  // large decode and an AVIF's pointless one.
  if (outputTypeFor(file.type) === null) {
    return file;
  }

  let bitmap: BitmapLike | null = null;
  try {
    const dependencies = options.dependencies ?? browserDependencies();
    bitmap = await dependencies.createImageBitmap(file, { imageOrientation: "from-image" });

    const plan = planDownscale(
      { width: bitmap.width, height: bitmap.height, bytes: file.size, type: file.type },
      options,
    );
    if (!plan.downscale) {
      return file;
    }

    const canvas = dependencies.createCanvas(plan.targetWidth, plan.targetHeight);
    const context = canvas.getContext("2d");
    if (context === null) {
      return file;
    }
    context.drawImage(bitmap, 0, 0, plan.targetWidth, plan.targetHeight);

    const encoded = await dependencies.encode(canvas, plan.outputType, JPEG_QUALITY);
    if (encoded === null) {
      return file;
    }

    return new File([encoded], file.name, {
      // The blob's own type, not the requested one: an unsupported request falls back to PNG, and the
      // archive refuses a declared type that contradicts the bytes (StorageService.store).
      type: encoded.type === "" ? plan.outputType : encoded.type,
      lastModified: file.lastModified,
    });
  } catch {
    // A failure to improve the upload is not a failure to upload. The server sniffs the bytes either
    // way, and the original file is exactly what this story found.
    return file;
  } finally {
    bitmap?.close?.();
  }
}
