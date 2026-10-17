import { useLocation } from "react-router";

import { viewIdentity } from "../lib/motion/route";
import { ENTER_DRIFT_SLOW } from "../lib/motion/tokens";

import type { ReactNode } from "react";

/**
 * The route transition: one element that owns the view on screen and replays its entry when the view
 * changes.
 *
 * ## Why a key, and why nothing else
 *
 * The animation is a CSS one (`aether-enter`, `styles/global.css` block 6 — fade plus §5's 16 px drift
 * over `duration-slow`). A CSS animation replays when the element it is declared on is remounted, so
 * the transition is the `key`: React tears the old view down and mounts the new one, and the new one
 * animates. That is also the whole of the interruptibility story — a second navigation replaces the
 * element instead of queueing behind the first, and there is no state a running transition can be
 * stuck in, because there is no running transition: there is an element, and there is the element that
 * replaced it (measured mid-flight in the PR's probe).
 *
 * The alternative — two views mounted at once, the outgoing fading out under the incoming — is what
 * `AnimatePresence` buys and what a CSS-only transition cannot do. It is rejected here for the
 * criterion's own reason: for the length of the overlap the document would hold two full-height views,
 * which is exactly how a second scrollbar appears. One view at a time cannot produce one.
 *
 * ## What it must not break
 *
 * - **Height is still defined once.** `#root` is the flex column (block 5), and this wrapper is a
 *   pass-through with `flex-1 min-h-0` so the view inside keeps filling what the safe-area insets
 *   leave, exactly as it did directly under `#root`.
 * - **`Suspense` stays outside it.** A view is a lazy chunk; the boundary is `App`'s, and this wrapper
 *   sits inside it, so it mounts only once the chunk is there. Wrapping the boundary instead would play
 *   the entry on the empty fallback and then swap in the real view with no animation left to run.
 * - **No fill mode.** `aether-enter` ends at `transform: none`, and the animation does not hold its end
 *   state, so this element is not a containing block for the `position: fixed` glass menu beyond the
 *   600 ms it animates for. Holding it (`animation-fill-mode: both`, E3-S2's spelling) would leave
 *   `translateY(0)` on the wrapper for the life of the view.
 */
export function RouteTransition({ children }: { readonly children: ReactNode }) {
  const location = useLocation();

  return (
    <div
      key={viewIdentity(location.pathname)}
      className={`flex min-h-0 flex-1 flex-col ${ENTER_DRIFT_SLOW}`}
    >
      {children}
    </div>
  );
}
