import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "../../api/client";
import { useRandomPhoto } from "../../api/photos";
import { useHeroImage } from "../../hooks/useHeroImage";
import { usePullToRefresh } from "../../hooks/usePullToRefresh";
import { applyTheme, clearTheme } from "../../lib/color/theme";
import { PULL_SURFACE_TOUCH_ACTION } from "../../lib/gesture/pullToRefresh";
import { GlassMenu } from "../menu/GlassMenu";

/**
 * `GET /` — the immersive entry view: one of the archive's photos, full-bleed, and nothing else.
 *
 * ## What this view owns
 *
 * - **The photo.** `/photos/random` is asked on every visit (`api/photos.ts` overrides the app-wide cache
 *   policy for exactly this); its bytes are read once, decoded before anything is painted, and handed to
 *   an `<img>` that fills the viewport. `lib/image/hero.ts` holds that pipeline.
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
 * - **The tap target, and what it opens.** The whole screen is one button (the E3-S1 criterion's
 *   "tap anywhere"), and since E3-S2 it opens the glass menu — the view owns the open state and the
 *   trigger the menu gives focus back to (`features/menu/GlassMenu.tsx` owns the dialog itself:
 *   `role="dialog"` + `aria-modal`, the focus trap, `Escape`, the veil tap, the scroll lock). The menu
 *   is rendered beside `<main>`, not inside it, which is what keeps a drag that starts on the menu off
 *   the pull-to-refresh handlers that live on `<main>`.
 * - **The re-roll.** Pull down past `lib/gesture/pullToRefresh.ts`'s threshold and another photo is asked
 *   for. The shell is untouched: no navigation, no reload, no second app instance. The surface carries
 *   that module's `touch-action`, without which a real browser takes the drag for a scroll and the gesture
 *   never happens (measured; the constant's comment has the trace).
 *
 * ## Not owned here — named, so this file cannot be read as claiming them
 *
 * - **The quiet states' words — E3-S4.** `data-state` says which of the four the splash is in; the
 *   visible sentence, the glass notice and the retry affordance are E3-S4's. Today `loading`, `empty`
 *   and `error` all render the same thing — the tone placeholder and the tap target — which is silent
 *   and never a crash, but is not the finished state.
 * - **Motion — E3-S3, landed.** The photo is still inserted rather than animated in: the reveal is exact
 *   because the pixels are decoded before `src` exists, and the tone placeholder is what it fades from.
 *   The menu's entry now reads `lib/motion/tokens.ts` like everything else — E3-S3 moved it out of
 *   `styles/global.css`'s own timings — and this view is one of the two consumers. The pull's
 *   finger-following transform is still unbuilt: it needs the gesture to own a live offset, which
 *   nothing in this slice does.
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
  /** The dialog's trigger: the menu hands focus back to this element when it closes. */
  const triggerRef = useRef<HTMLButtonElement>(null);

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
   * Closing is the menu's business and the state flip is this view's; the focus that goes back to the
   * trigger is the menu's too (it knows when it unmounts, including on a route change). `useCallback`
   * keeps the identity stable so the dialog does not re-bind its key listener on every photo that
   * arrives behind it.
   *
   * `Escape` is deliberately *not* handled here — one key, one owner. The dialog runs the only
   * keydown listener while it is open (`features/menu/GlassMenu.tsx`), which is the element the APG
   * gives that contract to.
   */
  const closeMenu = useCallback((): void => {
    setMenuOpen(false);
  }, []);

  const state: SplashState = splashState(randomPhoto, hero);

  const tap = (): void => {
    // A drag that re-rolled the photo also fires a click; it must not open the menu on the way past.
    if (pull.consumePull()) {
      return;
    }
    setMenuOpen((open) => !open);
  };

  return (
    <>
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
          // user's own, and there is nothing else to announce. It is not empty: this image *is* the
          // view, and a screen reader that hears nothing would be told the screen is blank.
          <img
            src={hero.src}
            alt="A photo from your archive"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : null}

        {/* The whole screen, one button: ≥ 44 px by several orders of magnitude, and — while the menu
            is closed — the only tab stop. The name stays "Open the menu" while it is open;
            `aria-expanded` is what reports the state (the APG's disclosure pattern), so the name does
            not change under the reader. E3-S2 made this button the dialog's trigger and the element
            focus returns to. */}
        <button
          ref={triggerRef}
          type="button"
          aria-label="Open the menu"
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          onClick={tap}
          className="absolute inset-0 z-10 cursor-pointer select-none focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-4 focus-visible:outline-aura-text/50"
        />
      </main>

      {/* Beside `<main>`, never inside it: the pull-to-refresh handlers are on that element and React
          events bubble through the React tree, so a drag that starts on the open menu would otherwise
          re-roll the photo behind it. `position: fixed` keeps the layout below untouched. */}
      {menuOpen ? <GlassMenu onClose={closeMenu} returnFocusTo={triggerRef} /> : null}
    </>
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
