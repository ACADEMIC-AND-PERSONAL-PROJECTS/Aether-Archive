/**
 * Whether the reader asked for reduced motion (E4-S3).
 *
 * The global stylesheet freezes CSS **animations** under `reduce`, but two pieces of the sortable grid
 * are not CSS animations: `useSortable` settles neighbours with an inline `transition`, and dnd-kit
 * drops the overlay with a Web Animations API animation. Both would keep moving under `reduce`, so
 * the grid reads this before it hands either to dnd-kit.
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
