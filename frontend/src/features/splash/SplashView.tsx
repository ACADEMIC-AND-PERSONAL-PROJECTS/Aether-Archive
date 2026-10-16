import { useEffect } from "react";

import { ApiError } from "../../api/client";
import { useRandomPhoto } from "../../api/photos";
import { useHeroImage } from "../../hooks/useHeroImage";
import { applyTheme, clearTheme } from "../../lib/color/theme";

/**
 * `GET /` — the immersive entry view: one of the archive's photos, full-bleed, and nothing else.
 *
 * ## What this view owns
 *
 * - **The photo.** `/photos/random` is asked for when the view mounts; its bytes are read once, decoded
 *   before anything is painted, and handed to an `<img>` that fills the viewport. `lib/image/hero.ts`
 *   holds that pipeline.
 * - **The placeholder.** The page wears the hero's own dominant tone — the §2.3 rule for this screen —
 *   through the theme layer's tokens. Where that tone is on screen is worth being exact about, because it
 *   is narrower than "while the photo loads": nothing can know a photo's colour before its bytes exist,
 *   so the tone appears the moment they arrive and covers the decode (measured in Chromium with the image
 *   request held: `loading` + the stylesheet's neutral `#0b0b0d` while the bytes travel, then `ready` +
 *   the photo's own `#001421` 0.3 s after they land — probe output in the PR). The photo's colour is what
 *   the reveal starts from instead of a black frame. The neutral set stands in before that and again if
 *   extraction fails.
 * - **The quiet states.** `data-state` reports which of the four the splash is in, and that attribute is
 *   the seam E3-S4 renders its words into. Nothing here throws: an empty archive, a refused request and a
 *   photo that will not decode all end on the same silent screen.
 *
 * ## Not owned here — named, so this file cannot be read as claiming them
 *
 * - **The tap target and the glass menu — E3-S2**, together with the tap *intent* the entry criterion
 *   names: that arrives in **E3-S1B**, the follow-up slice of this story, which re-adds the whole-screen
 *   button (`aria-haspopup="dialog"`), `menuOpen` and the `Escape` close path along with the per-visit
 *   freshness policy and the pull-to-refresh gesture. This view is not interactive today.
 * - **The quiet states' words — E3-S4.** `data-state` says which of the four the splash is in; the
 *   visible sentence, the glass notice and the retry affordance are E3-S4's. Today `loading`, `empty`
 *   and `error` all render the same thing — the tone placeholder and the view's name — which is silent
 *   and never a crash, but is not the finished state.
 * - **Motion — E3-S3.** The photo is inserted, not animated in: the reveal is exact because the pixels
 *   are decoded before `src` exists, and the tone placeholder is what it fades from. A cross-fade needs
 *   the motion tokens and the reduced-motion switch that story centralises.
 */

/** The archive's code for "there is no photo to show" (ADR-013) — a state, not a failure. */
const EMPTY_ARCHIVE_CODE = "empty-archive";

/** Which of the four things the splash is doing — the seam E3-S4 renders into. */
export type SplashState = "loading" | "ready" | "empty" | "error";

/** The archive answered `404 empty-archive`: the archive holds no photo yet. */
function isEmptyArchive(error: unknown): boolean {
  return error instanceof ApiError && error.code === EMPTY_ARCHIVE_CODE;
}

export function SplashView() {
  const randomPhoto = useRandomPhoto();
  const hero = useHeroImage(randomPhoto.data?.url);

  /*
   * §2.3, the splash's half: while this view is on screen the page's tokens are the photo's, and when
   * it goes away the stylesheet's neutral set takes over again. `applyTheme` writes inline custom
   * properties, so the neutral `:root` block is intact underneath and `clearTheme` is a removal, not a
   * restore of one view's idea of neutral.
   */
  useEffect(() => {
    if (hero.theme === null) {
      return;
    }
    applyTheme(hero.theme);
    return () => clearTheme();
  }, [hero.theme]);

  const state: SplashState = splashState(randomPhoto, hero);

  return (
    <main data-state={state} className="relative flex flex-1 overflow-hidden bg-aura-bg">
      {/* The view's name for assistive technology. Nothing about it is visible: the photo is the view. */}
      <h1 className="sr-only">Aether Archive</h1>

      {hero.src !== null ? (
        // The archive stores no title or description for a photo (`_docs/openapi.yml`: id, url,
        // category, uploadedAt), so the alt says what can honestly be said about it: it is one of the
        // user's own, and there is nothing else to announce. It is not empty: this image *is* the view,
        // and a screen reader that hears nothing would be told the screen is blank.
        <img
          src={hero.src}
          alt="A photo from your archive"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : null}
    </main>
  );
}

/** The four states, decided once here so the view above stays a markup.
 *
 * The order of the questions is the order of what the user can see: no photo *yet* (the query is still
 * asking, or still retrying) outranks everything, because nothing else has been observed. The empty
 * archive is checked before the generic failure — it is an answer, not a fault.
 *
 * A photo whose bytes arrived but will not decode is an **error even while an earlier photo is still
 * painted**: that src belongs to a photo this visit no longer offers, so reporting `ready` would tell
 * E3-S4 there is nothing to say about a failure the user has just suffered. The previous photo is left
 * on screen (unmounting it would flash the placeholder over a picture that is still perfectly good) and
 * the state is what carries the news.
 */
function splashState(
  randomPhoto: { data: unknown; isError: boolean; error: unknown },
  hero: { src: string | null; failed: boolean },
): SplashState {
  if (randomPhoto.data === undefined) {
    if (!randomPhoto.isError) {
      return "loading";
    }
    return isEmptyArchive(randomPhoto.error) ? "empty" : "error";
  }
  if (hero.failed) {
    return "error";
  }
  if (hero.src !== null) {
    return "ready";
  }
  return "loading";
}
