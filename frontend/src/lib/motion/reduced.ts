/**
 * Whether the reader asked for reduced motion (E4-S3C).
 *
 * The global stylesheet freezes CSS **animations and transitions** under `reduce`, but one piece of
 * the sortable grid is neither: dnd-kit drops the overlay with a Web Animations API animation
 * (`Element.prototype.animate`), which no stylesheet rule can reach. The grid therefore reads this
 * before it hands the drop animation to dnd-kit.
 *
 * `matchMedia` is absent in jsdom (measured: `typeof window.matchMedia === "undefined"`), and the same
 * absence reads as "no preference" here — the fallback the rest of the app relies on. The environment
 * is injectable so the rule is a pure function a test can state without a browser.
 */

/** The smallest surface this rule needs: a `matchMedia` that may be missing. */
export interface ReducedMotionEnvironment {
  readonly matchMedia?: (query: string) => { readonly matches: boolean };
}

/** True when the environment reports `prefers-reduced-motion: reduce`. */
export function prefersReducedMotion(
  environment: ReducedMotionEnvironment = typeof window === "undefined" ? {} : window,
): boolean {
  return environment.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}
