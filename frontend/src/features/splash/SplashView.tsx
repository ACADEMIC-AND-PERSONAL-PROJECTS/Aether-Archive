import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "../../api/client";
import { useRandomPhoto } from "../../api/photos";
import { QuietEmpty, QuietError, QuietLoading } from "../../components/QuietState";
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
 * - **The quiet states.** `data-state` reports which of the four the splash is in, and since E3-S4 the
 *   view renders the corresponding silence: the loading placeholder is a breathing wash of the theme's
 *   surface tone (`QuietLoading`), the empty archive is one display-serif sentence on the base
 *   (`QuietEmpty`), and a failure is a bottom glass notice with a retry (`QuietError`). The notice is
 *   positioned **inside this view** — `absolute` against `<main>`, never `fixed` — so it travels with
 *   the photo it describes and the route wrapper's temporary transform (ADR-022) cannot re-anchor it.
 *   Nothing here throws: an empty archive, a refused request and a photo that will not decode all end
 *   on the same silent screen.
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
 * - **The quiet states' announcement (E3-S5).** A live region announces *changes* to content that already
 *   exists, not a node inserted together with its text. So the sentence for the empty and error states is
 *   carried by one visually hidden `role="status"` region that is mounted here, in every state, and
 *   filled when the state changes; the visible sentences in `components/QuietState.tsx` are ordinary
 *   paragraphs. The trade: a screen-reader user who browses the page afterwards finds the same words in
 *   the visible element too — that is the same status message seen twice, not two messages.
 * - **`inert` on what the dialog covers (E3-S5).** While the menu is open this `<main>` is inert: removed
 *   from the tab order, from pointer hit-testing and from the accessibility tree, so an assistive
 *   technology's virtual cursor cannot reach the tap target behind the dialog. Baseline since April 2023;
 *   a browser without it simply ignores the attribute and keeps E3-S2's focus trap as the guarantee.
 *   jsdom implements neither the property nor its effect, so the suite pins the attribute and Chromium
 *   measures that the button leaves the accessibility tree and focus order (probe in the PR).
 *
 * ## Not owned here — named, so this file cannot be read as claiming them
 *
 * - **The quiet states' visual rules.** The words and the material live in `components/QuietState.tsx`
 *   and DESIGN-SYSTEM §7; this view decides *which* state renders and hands the error notice the retry
 *   callback. The state machine is below, deliberately dumb about markup.
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

/**
 * What the persistent live region says for each state. Loading and ready are silent on purpose: §7's
 * loading placeholder is not a labelled spinner, and a photo appearing is not an event that needs
 * announcing. The two sentences are the visible ones in `components/QuietState.tsx`, word for word —
 * a user who browses the page afterwards must not find a different message from the one announced.
 */
const ANNOUNCEMENTS: Record<SplashState, string> = {
  loading: "",
  ready: "",
  empty: "Your archive is empty for now.",
  error: "Couldn't load a photo.",
};

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

  /*
   * The notice's retry: the same query, asked again. The view does not own the outcome — the query's
   * state re-renders this view into loading, ready, empty or error exactly as a first visit would, and
   * the request policy decides whether a second attempt is even worth making (`api/retryPolicy.ts`).
   */
  const retry = (): void => {
    void randomPhoto.refetch();
  };

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
        // E3-S5: while the dialog is open the page it covers is inert. React writes the boolean HTML
        // attribute (`inert=""` — probed: the DOM *property* does not exist in jsdom 30, the attribute
        // does), so the unit test can pin the declaration; Chromium is where the effect is measured.
        inert={menuOpen}
        {...pull.handlers}
      >
        {/* The view's name for assistive technology. Nothing about it is visible: the photo is the view. */}
        <h1 className="sr-only">Aether Archive</h1>

        {/* The one live region (E3-S5), mounted in every state so it has a previous value to change
            from. `.sr-only` keeps it out of the composition; `role="status"` is polite and atomic. Its
            sentence is deliberately empty while loading and ready — see ANNOUNCEMENTS. */}
        <p role="status" className="sr-only">
          {ANNOUNCEMENTS[state]}
        </p>

        {/* Under the photo and the tap target: the placeholder for a photo that is not painted yet. */}
        {state === "loading" ? <QuietLoading /> : null}

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

        {/* Empty and error are mutually exclusive by construction (`splashState`). The error notice is
            painted over the previous photo when a replacement failed, which is why it carries a scrim
            of its own (`components/QuietState.tsx`). Both sit above the photo but below the tap target's
            sibling z-indexes: the notice is z-20, the tap target z-10. */}
        {state === "empty" ? <QuietEmpty /> : null}
        {state === "error" ? <QuietError onRetry={retry} /> : null}

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
 * asking, or still retrying) outranks everything, because nothing else has been observed. On a **first
 * fetch** the empty archive is checked before the generic failure — it is an answer, not a fault. On a
 * **failed refetch** the kept photo means the empty answer cannot arise, because `_docs/openapi.yml` has
 * no delete endpoint: an archive that had a photo still has it, so `isError` is the only question left.
 * If a future story adds deletion, this is the branch that has to ask `isEmptyArchive` before answering
 * `error` — recorded here rather than discovered then.
 *
 * A photo whose bytes arrived but will not decode is an **error even while an earlier photo is still
 * painted**: that src belongs to a photo this visit no longer offers, so reporting `ready` would tell
 * E3-S4 there is nothing to say about a failure the user has just suffered. The previous photo is left
 * on screen (unmounting it would flash the placeholder over a picture that is still perfectly good) and
 * the state is what carries the news.
 *
 * **A failed re-roll's request is the same case one layer up.** TanStack keeps the last successful
 * `data` when a refetch fails, so the old photo is still a valid picture; but answering `ready` would
 * hide the API failure and make §7's "API error → glass notice" true only on a first visit. E3-S4's
 * notice is what makes the failure visible, over the photo it kept.
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
  if (randomPhoto.isError) {
    return "error";
  }
  if (hero.src !== null) {
    return "ready";
  }
  return "loading";
}
