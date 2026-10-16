import { useEffect, useState } from "react";

import { ApiError } from "../../api/client";
import { useRandomPhoto } from "../../api/photos";
import { useHeroImage } from "../../hooks/useHeroImage";
import { usePullToRefresh } from "../../hooks/usePullToRefresh";
import { applyTheme, clearTheme } from "../../lib/color/theme";
import { PULL_SURFACE_TOUCH_ACTION } from "../../lib/gesture/pullToRefresh";

/**
 * `GET /` — the immersive entry view: one of the archive's photos, full-bleed, and nothing else.
 *
 * ## What this view owns
 *
 * - **The photo.** `/photos/random` is asked on every visit (`api/photos.ts` overrides the app-wide
 *   cache policy for exactly this), its bytes are read once, decoded before anything is painted, and
 *   handed to an `<img>` that fills the viewport. `lib/image/hero.ts` holds that pipeline.
 * - **The placeholder.** The page wears the hero's own dominant tone — the §2.3 rule for this screen —
 *   through the theme layer's tokens. Where that tone is on screen is worth being exact about, because it
 *   is narrower than "while the photo loads": nothing can know a photo's colour before its bytes exist,
 *   so the tone appears the moment they arrive and covers the decode (measured in Chromium with the image
 *   request held: `loading` + the stylesheet's neutral `#0b0b0d` while the bytes travel, then `ready` +
 *   the photo's own `#001421` 0.3 s after they land — probe output in the PR). The photo's colour is what
 *   the reveal starts from instead of a black frame. The neutral set stands in before that and again if
 *   extraction fails.
 * - **The tap target.** The whole screen is one button. It is the only interactive element the splash
 *   has; everything it is missing is listed below.
 * - **The re-roll.** Pull down past `lib/gesture/pullToRefresh.ts`'s threshold and another photo is
 *   asked for. The shell is untouched: no navigation, no reload, no second app instance. The surface
 *   carries that module's `touch-action`, without which a real browser takes the drag for a scroll and
 *   the gesture never happens (measured; the constant's comment has the trace).
 *
 * ## What this view deliberately does not own (forward references, named)
 *
 * - **The glass menu itself — E3-S2.** This view owns the open *intent* (`menuOpen`) and both ways to
 *   close it: tapping the same target again, and `Escape`. Nothing is drawn for the open state yet, so
 *   `aria-expanded` currently turns true over an empty screen: E3-S2 renders `role="dialog"` +
 *   `aria-modal`, traps focus there and returns it to this button. The criteria for E3-S2 — overlay,
 *   focus trap, backdrop tap — are untouched here.
 * - **The quiet states' words — E3-S4.** `data-state` says which of the four the splash is in; the
 *   visible sentence, the glass notice and the retry affordance are E3-S4's. Today `loading`, `empty`
 *   and `error` all render the same thing — the tone placeholder and the tap target — which is silent
 *   and never a crash, but is not the finished state.
 * - **Motion — E3-S3.** The photo is inserted, not animated in: the reveal is exact because the pixels
 *   are decoded before `src` exists, and the tone placeholder is what it fades from. A cross-fade and
 *   the pull's finger-following transform need the motion tokens and the reduced-motion switch that
 *   story centralises.
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
  const [menuOpen, setMenuOpen] = useState(false);

  const pull = usePullToRefresh(() => {
    // Fire and forget: the query reports its own failure through its state, which this view renders.
    void randomPhoto.refetch();
  });

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

  /*
   * `Escape` closes the menu (E3-S3/S2 keep this path). Only registered while it is open, so the
   * splash is not sitting on the keyboard when there is nothing to close.
   */
  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

  const state: SplashState = splashState(randomPhoto, hero);

  const tap = (): void => {
    // A drag that re-rolled the photo also fires a click; it must not open the menu on the way past.
    if (pull.consumePull()) {
      return;
    }
    setMenuOpen((open) => !open);
  };

  return (
    <main
      data-state={state}
      className={`relative flex flex-1 overflow-hidden bg-aura-bg ${PULL_SURFACE_TOUCH_ACTION}`}
      {...pull.handlers}
    >
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

      {/* The whole screen, one button: ≥ 44 px by several orders of magnitude, and the only tab stop.
          The name stays "Open the menu" while it is open — `aria-expanded` is what reports the state
          (the APG's disclosure pattern), so the name does not change under the reader. E3-S2 keeps this
          button as the dialog's trigger and is the story that returns focus to it on close. */}
      <button
        type="button"
        aria-label="Open the menu"
        aria-haspopup="dialog"
        aria-expanded={menuOpen}
        onClick={tap}
        className="absolute inset-0 z-10 cursor-pointer select-none focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-4 focus-visible:outline-aura-text/50"
      />
    </main>
  );
}

/** The four states, decided once here so the view below stays a markup.
 *
 * The order of the questions is the order of what the user can see: no photo *yet* (the query is still
 * asking, or still retrying) outranks everything, because nothing else has been observed. The empty
 * archive is checked before the generic failure — it is an answer, not a fault — and a photo that
 * answered but will not decode is the third: an answer the screen cannot use.
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
  if (hero.src !== null) {
    return "ready";
  }
  return hero.failed ? "error" : "loading";
}
