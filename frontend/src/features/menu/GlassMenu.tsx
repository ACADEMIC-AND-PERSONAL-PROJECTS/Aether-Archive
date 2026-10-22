import { useEffect, useRef, type RefObject } from "react";
import { Link } from "react-router";

import { GlassPanel } from "../../components/GlassPanel";
import { focusTargets, nextFocusIndex } from "../../lib/focus/trap";
import { ENTER_DRIFT_BASE, ENTER_FADE_BASE } from "../../lib/motion/tokens";

/**
 * The glass menu — the app's only dialog (E3-S2), and the screen the splash's tap target promises.
 *
 * ## What it is made of
 *
 * One `GlassPanel` — the single material (§3) — floating above a full-screen veil. The veil is the
 * theme's own darkest tone at 60 % (`bg-aura-bg/60`), not decoration: over a *photo*, the material's
 * `rgba(0, 0, 0, 0.4)` alone cannot promise legible text, because the pixels underneath are the user's
 * and may be white (NN/g's finding, DESIGN-REFERENCES §7: glass readability is a foreground-text
 * problem, and "components that appear over varied contexts must account for the many possible
 * backgrounds"). The veil is the scrim §3's rules ask for. It is also the backdrop the third criterion
 * names: it is a *sibling* of the panel, so a tap on the panel never reaches the veil's handler and a
 * tap anywhere else closes.
 *
 * **Every entry is text, none is muted.** `--aura-muted` is generated for the page background, not for
 * every possible photo beneath glass. The menu keeps its controls on `--aura-text`, and the material
 * test composites the current 60 % veil and glass over a white photo for the generator's least
 * favourable text/background pair. The photo remains perceptible through the combined layers without
 * making the words depend on its pixels.
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
 * - **Not `inert` itself — the splash owns that, on `<main>` (E3-S5B).** This dialog is rendered as a
 *   **sibling of `<main>`**, never inside it, and that placement is load-bearing: while the menu is open
 *   `<main>` carries `inert`, which removes the covered page from the tab order, from pointer hit-testing
 *   and from the accessibility tree. A dialog nested inside that subtree would be removed with it —
 *   measured in Chromium: the same dialog moved under the inert `<main>` comes back `ignored: true,
 *   ignoredReasons: ["inertElement"]`, while as a sibling it stays exposed and focusable. So the
 *   placement is a contract between this component and `features/splash/SplashView.tsx`, not a layout
 *   preference. What `inert` does not replace: the focus trap still wraps `Tab` (an AT virtual cursor is
 *   not a tab order), the veil still takes the pointer (inert covers itself, not the dialog), and
 *   `aria-modal` still describes the dialog. jsdom 30.1.3 implements neither the property nor the
 *   effect, so the suite pins the attribute, the sibling relationship and the focus return; Chromium
 *   measures the tree and the focus order. A browser without `inert` ignores the attribute and keeps
 *   E3-S2's trap as the blocking, which is the pre-E3-S5 behaviour.
 * - **Not the route change.** The two destinations are `Link`s, and leaving the splash is the close:
 *   this component unmounts with the view that owns it, which is also what releases the scroll lock.
 * - **Not its own timings.** The entry is §5's vocabulary (`lib/motion/tokens.ts`): the same fade the
 *   route transition uses, one duration step faster. Under `reduce` it fades and does not move — the
 *   app has one reduced-motion rule, not two (E3-S3; the change from "no animation at all" is named in
 *   `docs/scrum/DECISION-LOG.md` ADR-022).
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
 *
 * Its entry is §5's fade-in-place (`ENTER_FADE_BASE`) — the drift is the panel's, so the scrim never
 * uncovers an edge.
 */
const VEIL_CLASS = `fixed inset-0 z-30 bg-aura-bg/60 backdrop-blur-[2px] ${ENTER_FADE_BASE}`;

/**
 * The dialog fills the viewport so its panel can sit thumb-close to the bottom on a phone and run the
 * full height of the right edge on desktop, leaving the splash photograph visible beside it. The
 * panel owns its safe-area padding, so the sheet itself needs none.
 */
const SHEET_CLASS = `fixed inset-0 z-40 flex items-end justify-center p-0 outline-none md:items-stretch md:justify-end ${ENTER_DRIFT_BASE}`;

/**
 * One entry: at least 64 px tall, full width, no gap between rows (a tap between two entries is still a tap),
 * and on the text token — see the class doc above for the measured reason none of them is muted.
 *
 * The press feedback is §5's `duration-quick`, read as the variable rather than as `180ms`, so a
 * change to the token moves this too.
 */
const ENTRY_BASE_CLASS =
  "group flex min-h-16 w-full items-center gap-4 border-b border-aura-text/10 px-6 text-aura-text transition-colors duration-[var(--motion-duration-quick)] active:bg-aura-text/6 focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-4 focus-visible:outline-aura-text/70 md:px-10";

const RIVER_CLASS = `${ENTRY_BASE_CLASS} min-h-24 py-5 font-display text-2xl tracking-display sm:text-3xl`;
const CURATE_CLASS = `${ENTRY_BASE_CLASS} min-h-20 py-4 font-display text-xl tracking-display md:text-2xl`;
const CLOSE_CLASS = `${ENTRY_BASE_CLASS} min-h-16 py-3 text-xs uppercase tracking-[0.3em]`;
const INDEX_CLASS = "w-6 shrink-0 text-[0.6rem] font-medium tracking-[0.2em] text-aura-text/35";
const ARROW_CLASS =
  "ml-auto text-base font-normal text-aura-text/35 transition-transform duration-[var(--motion-duration-quick)] group-hover:translate-x-1";

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
        <GlassPanel className="glass-menu flex max-h-[88dvh] w-full max-w-xl flex-col justify-between overflow-y-auto px-0 pt-7 pb-[calc(var(--safe-bottom)+1.25rem)] md:h-full md:max-h-none md:max-w-[30rem] md:py-10 lg:max-w-[34rem]">
          <div className="flex flex-col gap-9">
            <div className="flex items-center justify-between gap-4 px-6 md:px-10">
              <p className="aether-kicker text-aura-text/55">Aether Archive</p>
              <p className="aether-kicker text-aura-text/35">Vol. 01</p>
            </div>

            <div className="px-6 md:px-10">
              <p className="max-w-[18rem] font-display text-2xl leading-[1.04] tracking-display text-aura-text sm:text-3xl">
                A quiet place for your photographs.
              </p>
            </div>

            <nav aria-label="Sections" className="border-t border-aura-text/10">
              <Link to="/river" className={RIVER_CLASS}>
                <span aria-hidden="true" className={INDEX_CLASS}>
                  01
                </span>
                <span>The River</span>
                <span aria-hidden="true" className={ARROW_CLASS}>
                  →
                </span>
              </Link>
              <Link to="/curate" className={CURATE_CLASS}>
                <span aria-hidden="true" className={INDEX_CLASS}>
                  02
                </span>
                <span>Curate</span>
                <span aria-hidden="true" className={ARROW_CLASS}>
                  →
                </span>
              </Link>
              <button type="button" onClick={onClose} className={CLOSE_CLASS}>
                <span aria-hidden="true" className={INDEX_CLASS}>
                  03
                </span>
                <span>Close</span>
                <span aria-hidden="true" className={ARROW_CLASS}>
                  ×
                </span>
              </button>
            </nav>
          </div>

          <div className="mt-10 px-6 md:px-10">
            <div className="h-px w-10 bg-aura-text/30" />
            <p className="mt-4 max-w-[19rem] text-xs leading-relaxed text-aura-text/55">
              Local-first. No cloud, no feed — only the photographs you chose, on the machine you
              chose.
            </p>
          </div>
        </GlassPanel>
      </div>
    </>
  );
}
