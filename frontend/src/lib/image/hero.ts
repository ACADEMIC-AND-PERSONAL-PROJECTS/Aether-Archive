import { extractPaletteFromBytes } from "../color/decode";
import { paletteToTheme, type AuraTheme } from "../color/theme";

/**
 * The splash hero: the bytes of one photo, decoded before anything is painted, plus the tone the page
 * wears while they arrive.
 *
 * Three things have to happen to one photo, in an order that matters (DESIGN-SYSTEM §2.3, §7):
 *
 * 1. its bytes are read from the archive's own origin,
 * 2. an `<img>` is handed a URL it can paint them from **and** is decoded,
 * 3. the palette is extracted and turned into the §2.2 tokens — the "blurred dominant tone" the splash
 *    shows before the photo is there.
 *
 * The order is not 1 → 2 → 3. The tone is *cosmetic*: it must never hold the photo back, and a browser
 * that cannot extract it (jsdom, a decoder that refuses the file) is a fallback, not a failure — so it
 * runs beside the decode and its rejection is swallowed here, in one place. The decode is the blocking
 * step, and it is what makes the reveal exact: the view is handed a src only once the pixels exist.
 *
 * Every environment edge is injected, for the reason E2-S4's `decode.ts` gives: jsdom 30.1.3 has no
 * `HTMLImageElement.decode`, no `createImageBitmap` and no image events at all (probe in the PR), so
 * nothing here could be exercised through the real browser path in the test process. The pipeline is
 * real in the tests; only the three leaves are fake.
 */

/** A decoded image: a URL an `<img>` can paint, and the release for whatever that allocated. */
export interface HeroSource {
  /** Same-origin (a `blob:` URL in the browser) — never a request leaving the machine. */
  readonly src: string;
  /** Frees the URL. Called by the caller once nothing can paint `src` any more. */
  readonly release: () => void;
}

/** What preparing a hero needs from the browser. Injected in tests; `browserHeroEnvironment` is the real one. */
export interface HeroEnvironment {
  /** The photo's bytes, from the archive's own origin (`Photo.url`, `/images/<uuid>.<ext>`). */
  fetchBytes(url: string, signal: AbortSignal): Promise<Blob>;
  /** Decodes them and returns the paintable URL. Rejects when the bytes cannot be decoded. */
  decode(bytes: Blob): Promise<HeroSource>;
  /** The bytes' palette as §2.2 tokens. May reject — `prepareHero` treats that as "no tone". */
  tone(bytes: Blob): Promise<AuraTheme | null>;
}

/** A hero that is ready to be painted. */
export interface PreparedHero {
  readonly src: string;
  /** The photo's generated theme, or `null` when no tone could be derived from it. */
  readonly theme: AuraTheme | null;
  readonly release: () => void;
}

export interface HeroSteps {
  /**
   * Called as soon as the tone is known — **usually before the decode finishes**, which is the point:
   * it is what fills the screen while the pixels are prepared. Called at most once, and never after
   * the caller has moved on if the caller checks its own cancellation inside.
   */
  readonly onTone?: (theme: AuraTheme) => void;
}

/**
 * Reads, decodes and tones one photo. The promise resolves only when the src can paint — that is the
 * "preloaded and decoded before reveal" half of the criterion, and it is a property of this function
 * rather than of the view that awaits it.
 *
 * The tone leaves early through {@link HeroSteps.onTone}; it rides alongside the decode rather than
 * before it, and its failure is a fallback (the caller keeps the stylesheet's neutral set) rather than
 * a reason to withhold the photo.
 *
 * Rejects when the bytes cannot be read (the archive refused or the connection died) or cannot be
 * decoded (a corrupted file). Both are the caller's quiet state, never a crash.
 */
export async function prepareHero(
  url: string,
  environment: HeroEnvironment,
  signal: AbortSignal,
  steps: HeroSteps = {},
): Promise<PreparedHero> {
  const bytes = await environment.fetchBytes(url, signal);

  // Started before the decode and awaited after it: the tone is derived from the same bytes, needs no
  // second request, and every extraction failure is one of two codes (ADR-018) that end here.
  const tone = environment
    .tone(bytes)
    .then((theme) => {
      if (theme !== null) {
        steps.onTone?.(theme);
      }
      return theme;
    })
    .catch(() => null);

  const source = await environment.decode(bytes);

  return { src: source.src, theme: await tone, release: source.release };
}

/**
 * The browser's edges. `fetch` + `URL.createObjectURL` mean the photo's bytes are read **once**, and the
 * bytes the palette is derived from are the bytes the `<img>` paints — so the tone can never describe a
 * different file than the one on screen, and there is no window in which two reads of the same photo are
 * in flight.
 *
 * What the read costs, measured against the running archive rather than assumed (probe output in the
 * PR): `/api/v1/photos/random` answers with `Vary`, `Content-Type`, `Transfer-Encoding` and `Date` and
 * **no** `Cache-Control`, `ETag` or `Last-Modified`, while `/images/**` answers
 * `Cache-Control: max-age=31536000, public, immutable` plus `Last-Modified`. So a second request for the
 * photo *would* be served from the browser cache instead of the network (measured: a repeat visit went
 * `ready` in 2.2 s with the connection throttled to 40 kB/s) — the single read is about there being one
 * code path and one source for the pixels, not about saving a round trip.
 */
export const browserHeroEnvironment: HeroEnvironment = {
  async fetchBytes(url, signal) {
    const response = await fetch(url, { signal });
    if (!response.ok) {
      // The archive's own problem body is not read here: the splash shows one quiet state for "no
      // photo to show", and the empty archive is answered by the query, not by the image.
      throw new Error(`The photo could not be read (${response.status}).`);
    }
    return response.blob();
  },

  async decode(bytes) {
    const src = URL.createObjectURL(bytes);
    const image = new Image();
    image.src = src;
    try {
      // Resolves when the pixels are decoded and safe to paint (MDN, `HTMLImageElement.decode`): the
      // element is only handed to the view afterwards, which is what removes the flash of empty frame.
      await image.decode();
    } catch (cause) {
      URL.revokeObjectURL(src);
      throw new Error("The photo could not be decoded.", { cause });
    }
    return { src, release: () => URL.revokeObjectURL(src) };
  },

  async tone(bytes) {
    const palette = await extractPaletteFromBytes(bytes);
    return paletteToTheme(palette);
  },
};
