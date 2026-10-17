/**
 * The motion vocabulary — `DESIGN-SYSTEM.md` §5, as data.
 *
 * Three durations, one curve and one distance. Every animated surface in the app is expressed with
 * these names, so a new screen cannot arrive with a fourth timing: the values are declared here, the
 * stylesheet mirrors them as `--motion-*` on `:root` (block 4 of `styles/global.css`), and
 * `tokens.test.ts` reads that file and fails if the two ever disagree. This is the theme layer's drift
 * guard, applied to motion.
 *
 * **Nothing here is assembled at runtime.** Tailwind reads this file as text and emits one rule per
 * candidate class name it finds in it, so a name built from a template literal would compile to
 * nothing — the classes below are literal, and the test asserts that every variable and keyframe they
 * name really exists in the stylesheet (a misspelt `var()` makes the whole `animation` declaration
 * invalid at computed-value time: an animation that silently does not run).
 *
 * There is no Framer Motion in this module or anywhere else — the decision and its measurements are
 * ADR-022, and the reason is in the ADR rather than repeated here.
 */

/** §5's table: `duration-quick` · `duration-base` · `duration-slow` · `duration-pulse`, in milliseconds. */
export const DURATION_MS = {
  /** Micro-feedback: tap, hover, focus. */
  quick: 180,
  /** Menus, panels, reveals. */
  base: 320,
  /** Route transitions, ambient background. */
  slow: 600,
  /** The loading pulse — one full breath in, and the same out (§7's only permitted loop). */
  pulse: 2400,
} as const;

/** §5's `ease-soft`. The one curve; nothing in the app eases with anything else. */
export const EASE_SOFT = "cubic-bezier(0.22, 1, 0.36, 1)";

/** §5's `distance-enter`, in pixels — the vertical drift an entering surface travels. */
export const DISTANCE_ENTER_PX = 16;

/**
 * The class the reduced-motion rule in `global.css` exempts from its global freeze.
 *
 * §5 says reduced motion is *opacity-only*, not *motionless*: the entry fades and the drift collapses
 * to zero (the stylesheet sets `--motion-distance-enter: 0px` under `reduce`). The global freeze rule
 * squashes every animation to 0.01 ms so state-communicating loops become a still frame, which would
 * also flatten the fade — so the vocabulary's own entries carry this marker and are named as the
 * exception. A surface that animates without the marker is frozen under `reduce`, deliberately.
 */
export const MOTION_MARKER_CLASS = "motion-enter";

/**
 * Fade + drift — for a view, and for a panel that arrives above a scrim (`GlassMenu`). `to` is
 * `transform: none` and the animation carries **no fill mode**, so the element is not left as a
 * containing block for `position: fixed` descendants once the run is over.
 */
export const ENTER_DRIFT_SLOW = `${MOTION_MARKER_CLASS} animate-[aether-enter_var(--motion-duration-slow)_var(--motion-ease-soft)]`;

/** The same pattern at `duration-base`: the glass menu's sheet. */
export const ENTER_DRIFT_BASE = `${MOTION_MARKER_CLASS} animate-[aether-enter_var(--motion-duration-base)_var(--motion-ease-soft)]`;

/**
 * Fade in place, no drift — for a surface that covers the screen. A full-height veil translated by
 * 16 px would uncover a strip of photo along one edge for the length of the run (E3-S2's measurement,
 * now §5's rule).
 */
export const ENTER_FADE_BASE = `${MOTION_MARKER_CLASS} animate-[aether-fade_var(--motion-duration-base)_var(--motion-ease-soft)]`;

/**
 * The loading pulse — the one loop the vocabulary allows (§5: "Nothing loops unless it communicates
 * state (a subtle pulse for loading is the only exception)"). Opacity only, over
 * `--motion-duration-pulse`, with the shared curve and an infinite iteration.
 *
 * It deliberately carries **no** `MOTION_MARKER_CLASS`: the global reduced-motion rule squashes every
 * animation without that marker to a single 0.01 ms frame, which is exactly what a state-communicating
 * pulse should become under `reduce`. The element's own `opacity-25` is the frame that remains.
 */
export const LOADING_PULSE =
  "animate-[aether-breathe_var(--motion-duration-pulse)_var(--motion-ease-soft)_infinite]";
