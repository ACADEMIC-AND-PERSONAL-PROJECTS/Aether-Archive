import { useId } from "react";

import { GlassPanel } from "./GlassPanel";
import { LOADING_PULSE } from "../lib/motion/tokens";

/**
 * The three quiet states of DESIGN-SYSTEM §7 — loading, empty archive and error — as one concern.
 *
 * ## Why these are silent
 *
 * "Empty and loading states are silent: opacity pulse or a blurred dominant-colour placeholder, never
 * a labelled spinner" (`.claude/rules/design-language.md`). There is no icon, no progress bar and no
 * "Loading…" text here, and a test fails if one appears. The loading placeholder is the theme's own
 * surface tone breathing at `--motion-duration-pulse`; the empty archive is one display-serif
 * sentence on the base; the error is the one glass notice, with a retry.
 *
 * ## The error notice assumes it is painted over a photo
 *
 * Since E3-S1A, `data-state="error"` also reports a *failed replacement*: the previous photo stays
 * painted on purpose (unmounting a good picture for a placeholder would break the splash's promise).
 * `.glass` alone is `rgba(0, 0, 0, 0.4)` — measured against a white photo that composites to
 * `rgb(153, 153, 153)`, where `--aura-text` reads **2.30:1** — so the notice carries its own scrim
 * (`bg-aura-bg/70`, the same value as the menu's veil) between the photo and the glass. With it, the
 * painted glyph measures **7.47:1** over a white photo and **13.41:1** over a dark one (`README`,
 * "The quiet states — measured"). The scrim is local, so the photo the user is still looking at is
 * not covered by a full-screen veil.
 *
 * **The words are `--aura-text`, never `--aura-muted`** (DESIGN-SYSTEM §2.2, measured by E3-S2: 8.07:1
 * against 4.14:1 for the muted token over glass). The muted token is raised by the generator until it
 * clears 4.5:1 on the *page background*; a glass notice is not the page background.
 *
 * ## Placement: no portal, and no `position: fixed`
 *
 * The notice is `position: absolute` inside the view's own `<main>` (which is `relative`), not
 * `fixed`. That is the whole answer to the coupling E3-S3 routed here: the route wrapper carries a
 * transform for the 600 ms entry (ADR-022, item 5), and only a **fixed** descendant is re-anchored to
 * it. An absolutely positioned descendant resolves against `<main>`, so the notice travels with the
 * photo — it is part of the view and should move with it — and its offset from `<main>` is constant
 * during the entry (measured). Adopting a portal would put the notice above the route transition for
 * no benefit and would detach it from the photo it describes. Nothing here changes E3-S2's dialog,
 * which remains a `fixed` sibling of `<main>` with its bounded, unchanged coupling.
 *
 * The safe-area inset is applied once, by `body` (DESIGN-SYSTEM §11), so the notice's own `bottom-4`
 * is measured from an edge that already excludes the home indicator — unlike the dialog, whose
 * `fixed` box has to read `--safe-bottom` itself.
 */

/** One sentence, and nothing else: no illustration, no call to action (§7). */
export function QuietEmpty() {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-8">
      <p
        role="status"
        className="max-w-xs text-center font-display text-lg tracking-display text-aura-text"
      >
        Your archive is empty for now.
      </p>
    </div>
  );
}

/**
 * The loading placeholder: the theme's surface tone over the base, breathing between a quarter and
 * full opacity. Opacity only — no transform — and the class deliberately carries no
 * `MOTION_MARKER_CLASS`, so the global reduced-motion rule (global.css block 5) freezes it to the
 * still frame the element's own `opacity-25` describes.
 *
 * It is decorative: the view already has a name, and a spinner's announcement is exactly the
 * labelled loading state §7 forbids. It sits under the photo and under the tap target.
 */
export function QuietLoading() {
  return (
    <div
      data-testid="quiet-loading"
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 bg-aura-surface opacity-25 ${LOADING_PULSE}`}
    />
  );
}

export interface QuietErrorProps {
  /** Ask the archive again. The query reports its own outcome; this view renders it. */
  readonly onRetry: () => void;
}

/**
 * The error notice: a bottom-anchored glass panel, one sentence plus a real retry button.
 *
 * `role="status"` is the polite half of the ARIA guidance (WAI-ARIA APG, alert pattern): the region is
 * exposed politely, focus is **not** moved, and the retry stays in the normal tab order. **What that does
 * not buy, stated rather than implied**: the region mounts together with its text, and a live region
 * announces *changes* to content that already exists — most screen readers will not announce a node
 * inserted with its content. So the exposure is real and the announcement is unverified; **E3-S5** owns
 * the AT pass that decides between a persistent region and this one, and the same applies to
 * {@link QuietEmpty}, whose sentence is on screen from its first render.
 * The button's visible name is "Try again"; `aria-describedby` gives it the sentence as its
 * description, so a screen reader hears the context without the accessible name drifting away from
 * the visible label (WCAG 2.5.3).
 */
export function QuietError({ onRetry }: QuietErrorProps) {
  const messageId = useId();

  return (
    <div className="absolute inset-x-4 bottom-4 z-20">
      {/* The notice's own scrim (§3: text over an image always sits on a scrim or glass). The glass
          tint alone is not enough over a white photo — see the file comment. The panel's radius is
          matched, so the scrim never shows a corner. */}
      <div
        data-testid="quiet-error-scrim"
        aria-hidden="true"
        className="absolute inset-0 rounded-[20px] bg-aura-bg/70"
      />
      <GlassPanel className="relative flex items-center gap-4 px-4 py-2">
        <p id={messageId} role="status" className="text-base text-aura-text">
          Couldn&apos;t load a photo.
        </p>
        <button
          type="button"
          aria-describedby={messageId}
          onClick={onRetry}
          className="ml-auto min-h-11 shrink-0 rounded-[10px] px-3 text-sm text-aura-text underline decoration-aura-text/40 underline-offset-4 transition-colors duration-[var(--motion-duration-quick)] active:bg-aura-text/6 focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-4 focus-visible:outline-aura-text/50"
        >
          Try again
        </button>
      </GlassPanel>
    </div>
  );
}
