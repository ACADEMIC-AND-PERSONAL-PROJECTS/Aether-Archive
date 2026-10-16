import { useEffect, useRef, useState } from "react";

import {
  browserHeroEnvironment,
  prepareHero,
  type HeroEnvironment,
  type PreparedHero,
} from "../lib/image/hero";

import type { AuraTheme } from "../lib/color/theme";

/**
 * One photo's journey to the screen, as React state: nothing → decoded src (+ the page's tone) →
 * replaced by the next one.
 *
 * The rule the whole hook exists for: **`src` only ever holds a decoded image.** It is set when
 * `prepareHero` resolves and never before, so a view that paints `src` cannot show an empty frame —
 * and when a re-roll brings a new photo, the old src stays until the new one is ready, which is the
 * "avoiding empty images" swap MDN describes, applied to a photo the user replaced on purpose.
 */

export interface HeroImage {
  /**
   * A URL that is decoded and safe to paint; `null` until the first hero is ready.
   *
   * It is deliberately **not** cleared when a *later* photo fails: the previous hero stays painted and
   * `failed` is what reports that the replacement did not arrive. A caller that branches on `src` alone
   * would read that as "all good" (see `SplashView`'s `splashState`, which asks about `failed` first).
   */
  readonly src: string | null;
  /** The hero's generated theme (§2.2), or `null` when its tone could not be derived. */
  readonly theme: AuraTheme | null;
  /** The current photo could not be read or decoded — a quiet state, never a crash. */
  readonly failed: boolean;
}

export interface HeroImageOptions {
  /** Overridden in tests only: jsdom decodes nothing (probe table, `frontend/README.md`). */
  readonly environment?: HeroEnvironment;
}

export function useHeroImage(url: string | undefined, options: HeroImageOptions = {}): HeroImage {
  const environment = options.environment ?? browserHeroEnvironment;
  const [hero, setHero] = useState<PreparedHero | null>(null);

  /**
   * The url that failed, rather than a boolean — so a new photo is not inheriting the old one's
   * failure. Keyed by url, the reset is a derivation instead of a state write in the effect body.
   */
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  /**
   * The tone, as soon as it exists — before the photo can be painted. Keyed by url for the same reason
   * `failedUrl` is: a tone that belonged to the previous photo must never colour the next one's wait.
   */
  const [tone, setTone] = useState<{ url: string; theme: AuraTheme } | null>(null);

  /** What the view is painting right now — held so its URL can be released at the right moment. */
  const painted = useRef<PreparedHero | null>(null);

  useEffect(() => {
    if (url === undefined) {
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    prepareHero(url, environment, controller.signal, {
      onTone: (theme) => {
        if (!cancelled) {
          setTone({ url, theme });
        }
      },
    })
      .then((prepared) => {
        if (cancelled) {
          // This run lost the race with an unmount, a re-roll or StrictMode's second mount: free what
          // it decoded and paint nothing. Releasing here is also what keeps the first mount of a
          // StrictMode pair from leaking a blob URL.
          prepared.release();
          return;
        }
        const previous = painted.current;
        painted.current = prepared;
        setHero(prepared);
        setFailedUrl(null);
        // The previous hero is retired after the swap: it is revoked once its replacement is the one
        // being painted, never while it is still the src on screen.
        previous?.release();
      })
      .catch(() => {
        if (!cancelled) {
          setFailedUrl(url);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [url, environment]);

  // Unmount only: the hero on screen is released when the splash goes away.
  useEffect(
    () => () => {
      painted.current?.release();
      painted.current = null;
    },
    [],
  );

  return {
    src: hero?.src ?? null,
    /*
     * The prepared hero's tone wins whenever there is one: it belongs to the src that is actually on
     * screen, while an early tone may already belong to the photo arriving behind it. The early one is
     * what the screen wears while it waits — and `null` is a real answer, not a missing value, so the
     * caller clears the page back to the stylesheet's neutral set rather than keeping the last hue.
     */
    theme: hero ? hero.theme : tone !== null && tone.url === url ? tone.theme : null,
    failed: url !== undefined && failedUrl === url,
  };
}
