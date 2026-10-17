import { useEffect, useRef, type RefObject } from "react";
import { Link } from "react-router";

import { GlassPanel } from "../../components/GlassPanel";
import { focusTargets, nextFocusIndex } from "../../lib/focus/trap";

/**
 * The glass menu — the app's only dialog (E3-S2), and the screen the splash's tap target promises.
 *
 * ## What it is made of
 *
 * One `GlassPanel` — the single material (§3) — floating above a full-screen veil. The veil is the
 * theme's own darkest tone at 70 % (`bg-aura-bg/70`), not decoration: over a *photo*, the material's
 * `rgba(0, 0, 0, 0.4)` alone cannot promise legible text, because the pixels underneath are the user's
 * and may be white (NN/g's finding, DESIGN-REFERENCES §7: glass readability is a foreground-text
 * problem, and "components that appear over varied contexts must account for the many possible
 * backgrounds"). The veil is the scrim §3's rules ask for. It is also the backdrop the third criterion
 * names: it is a *sibling* of the panel, so a tap on the panel never reaches the veil's handler and a
 * tap anywhere else closes.
 *
 * **Every entry is text, none is muted — measured, not preferred.** `--aura-muted` is the theme's
 * "secondary text / quiet labels" token, and the generator raises it until it clears 4.5:1 *on the
 * background* (§2.2). Over the veil that guarantee does not survive: for the lightest background the
 * generator's bands allow (L 0.18), the veil at 70 % over a *white* photo leaves the panel at
 * `rgb(46, 56, 57)`, where the text token reads 7.97:1 and the muted token **4.11:1** — under AA, and
 * under it for the one entry a user reaches when the other two are wrong (`GlassMenu.test.tsx` pins
 * the pair). So the dialog's words sit on `--aura-text`; the muted token's home is the page, not glass.
 *
 * The dialog element is the positioned wrapper, not the material inside it: `GlassPanel`'s props are
 * React's own div attributes, which carry no `ref` (probed with `tsc`: TS2322 against
 * `GlassPanelProps`), and the trap needs an element to hold. The material stays a pure surface.
 *
 * ## What it owns, and what it deliberately does not
 *
 * - **Focus.** Focus moves to the first entry on open and returns to the trigger on close (criterion
 *   3, the APG's modal-dialog contract). `Tab` is handled explicitly and wraps — see
 *   `lib/focus/trap.ts` for why the browser is not asked to do it.
 * - **The keyboard, entirely.** `Escape` closes here, and there is exactly one listener: the splash
 *   used to run one of its own, and two handlers for one key are two things to keep in agreement. The
 *   dialog is the element with the keyboard contract, so the dialog holds the key.
 * - **The page scroll.** Locked while open (`overflow: hidden` on the document root — the element it
 *   propagates to the viewport from) and restored to whatever it was on close, including when the
 *   close is a route change that unmounts the splash with the menu inside it.
 * - **Not `inert` on the page behind.** Probed in the test process: `HTMLElement.prototype.inert` does
 *   not exist in jsdom 30.1.3 (setting `element.inert` is a plain JS property there, and writes no
 *   attribute), so behaviour built on it would be the one part of this story nothing could test. The
 *   APG allows `aria-modal` only when the code really does block the rest: the trap is that blocking,
 *   and it is tested.
 * - **Not the route change.** The two destinations are `Link`s; leaving the splash is the close, and
 *   there is no exit animation — the entry is this story's criterion, and the motion vocabulary
 *   (tokens, enter/exit pairing, route transitions) is E3-S3's.
 */

export interface GlassMenuProps {
  /** Closes the menu. Called by `Escape`, the veil, and the Close entry. */
  onClose: () => void;
  /**
   * Where focus returns when the menu closes — the trigger that opened it (APG: "focus returns to
   * whatever element invoked the dialog"). A `useRef` object, not the element: the trigger is known
   * when the menu opens and focused when it unmounts.
   */
  returnFocusTo: RefObject<HTMLElement | null>;
}

/**
 * The veil: full-screen scrim, and the whole backdrop-tap target. A sibling of the panel rather than
 * its parent, which is what makes "outside" unambiguous — no `stopPropagation`, no comparing
 * `event.target` with `event.currentTarget`.
 */
const VEIL_CLASS =
  "fixed inset-0 z-30 bg-aura-bg/70 motion-safe:animate-[aether-veil-in_320ms_cubic-bezier(0.22,1,0.36,1)_both]";

/**
 * The panel's box: a floating sheet, 16 px clear of the sides and of the home indicator (the safe
 * inset is read as a variable, so the gap survives the notch), centred and capped on wider screens.
 *
 * The drift is declared here, not on the veil: a full-screen veil translated by 16 px would uncover a
 * strip of photo along one edge for the length of the animation.
 */
const SHEET_CLASS =
  "fixed inset-x-4 bottom-[calc(var(--safe-bottom)_+_1rem)] z-40 mx-auto max-w-md outline-none motion-safe:animate-[aether-sheet-in_320ms_cubic-bezier(0.22,1,0.36,1)_both]";

/**
 * One entry: 56 px tall, full width, no gap between rows (a tap between two entries is still a tap),
 * and on the text token — see the class doc above for the measured reason none of them is muted.
 */
const ENTRY_CLASS =
  "flex min-h-14 w-full items-center rounded-xl px-5 text-lg text-aura-text transition-colors duration-[180ms] active:bg-aura-text/6 focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-4 focus-visible:outline-aura-text/50";

export function GlassMenu({ onClose, returnFocusTo }: GlassMenuProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  /*
   * Focus in, focus out, and the page's scroll — once, when the menu opens.
   *
   * The cleanup runs after React has removed the dialog from the document (probed: `document
   * .activeElement` is `body` by then), so focusing the trigger there cannot be pulled back by a trap
   * that is still mounted. It is also the one place the scroll lock is released, which is why leaving
   * the splash with the menu open cannot strand `overflow: hidden` on the next view.
   */
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) {
      return;
    }
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    // Read once, here: the trigger is the element that had focus when the menu opened, and reading the
    // ref again in the cleanup would follow whatever it points at by then (`react-hooks` refuses the
    // alternative for the same reason).
    const trigger = returnFocusTo.current;
    root.style.overflow = "hidden";
    focusTargets(dialog)[0]?.focus();

    return () => {
      root.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [returnFocusTo]);

  /*
   * `Escape` closes; `Tab` wraps. Re-bound if the caller's handler changes identity — deliberately not
   * a mount-only effect, because these two branches are what the dialog promises, and a stale handler
   * would silently close nothing.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") {
        return;
      }
      const dialog = dialogRef.current;
      if (dialog === null) {
        return;
      }
      const targets = focusTargets(dialog);
      const current = targets.findIndex((target) => target === document.activeElement);
      const next = nextFocusIndex(current, targets.length, event.shiftKey);
      // Every Tab is answered here, so the browser's own focus movement — the one that would walk out
      // of the dialog and into the page behind it — never happens.
      event.preventDefault();
      if (next === -1) {
        // No controls to focus (not a state this component renders): the container is the fallback,
        // which is why it carries `tabIndex={-1}`.
        dialog.focus();
        return;
      }
      targets[next]?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <>
      {/* Decorative: the accessible way out is the Close entry, not this surface. */}
      <div data-testid="menu-veil" aria-hidden="true" onClick={onClose} className={VEIL_CLASS} />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        tabIndex={-1}
        className={SHEET_CLASS}
      >
        <GlassPanel className="flex flex-col p-2">
          <Link to="/river" className={ENTRY_CLASS}>
            The River
          </Link>
          <Link to="/curate" className={ENTRY_CLASS}>
            Curate
          </Link>
          <button type="button" onClick={onClose} className={ENTRY_CLASS}>
            Close
          </button>
        </GlassPanel>
      </div>
    </>
  );
}
