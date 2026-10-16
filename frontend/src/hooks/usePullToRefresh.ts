import { useRef, type PointerEvent as ReactPointerEvent } from "react";

import { isDrag, isPull, pullDistance } from "../lib/gesture/pullToRefresh";

/**
 * A full-surface refresh gesture: drag down, let go, and the caller is told to re-roll.
 *
 * **Pointer events, not touch events.** One code path covers a finger, a pen and a mouse; the events
 * reach React in jsdom, so the gesture is exercised by real tests rather than described (probe in the
 * PR). Multi-touch is deliberately not modelled: the splash does one thing, and a second finger simply
 * restarts the drag.
 *
 * **The browser can end a gesture without the finger leaving.** A vertical drag on a surface with
 * `touch-action: auto` is claimed by the browser as a scroll after the first move, which arrives here as
 * `pointercancel` — measured in Chromium on the built bundle: `pointerdown → pointermove → pointercancel`
 * and no re-roll. `onPointerCancel` forgets the drag for that reason, and the surface must carry
 * `PULL_SURFACE_TOUCH_ACTION` (`lib/gesture/pullToRefresh.ts`) so the browser never claims it. jsdom
 * cannot show any of this: it never recognises a gesture, so both halves — the cancel path and the CSS —
 * are only provable in a browser.
 *
 * **It is silent.** The drag moves nothing and draws nothing. Two reasons, both recorded rather than
 * implied: the finger-following transform is motion, and motion tokens plus the `prefers-reduced-motion`
 * switch are E3-S3's story — inventing them here would create a second motion vocabulary a week before
 * the first one exists; and `matchMedia` is absent in the test environment, so a transform would ship
 * as the one part of this gesture that nothing verifies. The photo that arrives is the feedback.
 *
 * **The tap is not the pull.** A browser fires `click` after the pointer is released whatever the
 * finger did, so a drag would open the menu on top of the photo it just re-rolled. The drag is
 * therefore remembered until the click that follows it has been asked about ({@link PullToRefresh.consumePull}),
 * and forgotten at the start of the next gesture so a drag that fired no click cannot swallow the
 * tap after it.
 */

export interface PullToRefresh {
  /** Spread onto the element that owns the gesture. */
  readonly handlers: {
    readonly onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
    readonly onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
    readonly onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
    readonly onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
  };
  /**
   * True when the gesture that just ended was a drag rather than a tap. Answers **once**: the caller
   * asks inside its click handler and turns the click into a no-op, which is the only way the gesture
   * and the tap can share one surface.
   */
  readonly consumePull: () => boolean;
}

export function usePullToRefresh(onRefresh: () => void): PullToRefresh {
  const startY = useRef<number | null>(null);
  const travelled = useRef(0);
  const suppressClick = useRef(false);

  const forget = (): void => {
    startY.current = null;
    travelled.current = 0;
  };

  return {
    handlers: {
      onPointerDown: (event) => {
        startY.current = event.clientY;
        travelled.current = 0;
        // A new gesture starts clean: whatever the last one left behind is no longer this click's business.
        suppressClick.current = false;
      },
      onPointerMove: (event) => {
        if (startY.current === null) {
          return;
        }
        travelled.current = pullDistance(startY.current, event.clientY);
      },
      onPointerUp: () => {
        const distance = travelled.current;
        forget();
        // A pull is a drag, so one test covers both: anything past the refresh threshold is also past
        // the tap's slop, and the click that follows must not open the menu.
        suppressClick.current = isDrag(distance);
        if (isPull(distance)) {
          onRefresh();
        }
      },
      onPointerCancel: forget,
    },
    consumePull: () => {
      const dragged = suppressClick.current;
      suppressClick.current = false;
      return dragged;
    },
  };
}
