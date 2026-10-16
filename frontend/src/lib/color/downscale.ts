/**
 * Box-filter downscale so the long edge is ≤ 64 px (the extraction budget, `DESIGN-SYSTEM.md` §2.1).
 *
 * Pure and deterministic: integer source rectangles, one output pixel per rectangle. Alpha is
 * premultiplied inside the average so a transparent region cannot bleed black into a colour; the
 * output keeps the averaged alpha (extraction then ignores pixels below its alpha floor).
 */
import type { PixelImage } from "./types";

export const MAX_EDGE = 64;

export function downscale(image: PixelImage, maxEdge: number = MAX_EDGE): PixelImage {
  const { width, height } = image;
  if (width <= maxEdge && height <= maxEdge) return image;

  const scale = maxEdge / Math.max(width, height);
  const targetWidth = Math.max(1, Math.min(maxEdge, Math.round(width * scale)));
  const targetHeight = Math.max(1, Math.min(maxEdge, Math.round(height * scale)));
  const out = new Uint8ClampedArray(targetWidth * targetHeight * 4);

  for (let ty = 0; ty < targetHeight; ty++) {
    const y0 = Math.floor((ty * height) / targetHeight);
    const y1 = Math.max(y0 + 1, Math.floor(((ty + 1) * height) / targetHeight));
    for (let tx = 0; tx < targetWidth; tx++) {
      const x0 = Math.floor((tx * width) / targetWidth);
      const x1 = Math.max(x0 + 1, Math.floor(((tx + 1) * width) / targetWidth));

      let r = 0;
      let g = 0;
      let b = 0;
      let alphaSum = 0;
      let samples = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * width + x) * 4;
          const alpha = image.data[i + 3]! / 255;
          r += image.data[i]! * alpha;
          g += image.data[i + 1]! * alpha;
          b += image.data[i + 2]! * alpha;
          alphaSum += alpha;
          samples++;
        }
      }

      const o = (ty * targetWidth + tx) * 4;
      out[o] = alphaSum > 0 ? Math.round(r / alphaSum) : 0;
      out[o + 1] = alphaSum > 0 ? Math.round(g / alphaSum) : 0;
      out[o + 2] = alphaSum > 0 ? Math.round(b / alphaSum) : 0;
      out[o + 3] = Math.round((alphaSum / samples) * 255);
    }
  }

  return { data: out, width: targetWidth, height: targetHeight };
}
