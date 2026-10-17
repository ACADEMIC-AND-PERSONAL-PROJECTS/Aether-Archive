/**
 * The focus trap's decisions, as one DOM query and one pure function (E3-S2).
 *
 * The trap itself is an effect in `features/menu/GlassMenu.tsx`; what lives here is the part that can
 * be answered without a browser: *which* elements inside the dialog can take focus, and *which* one is
 * next when `Tab` or `Shift+Tab` arrives.
 *
 * **Why the wrap is computed here instead of left to the browser.** jsdom does not move focus on a
 * `Tab` keydown — measured in the test process, not assumed: focus stays where it was and no default
 * action runs. A trap that only intervenes at the edges (the usual implementation) would therefore
 * prove nothing in the suite — every middle transition, which is the part the browser normally does,
 * is untested, and a trap whose test covers only its edges is not a trap. Handling each `Tab`
 * explicitly makes the same code path run in both environments; the order it walks is
 * `querySelectorAll`'s, i.e. document order, so the sequence is the one the DOM already declares.
 *
 * **What it cannot promise: visibility by layout.** jsdom has no layout, so `offsetParent` and
 * `getClientRects()` are empty for every element there — a filter built on them would drop the whole
 * list in the test environment and be unfalsifiable in the real one. The dialog this story renders has
 * three always-visible controls, so the filter is attribute-based (`disabled`, `hidden`,
 * `aria-hidden`), which behaves identically in both. A later dialog with conditionally hidden controls
 * extends this function and its tests; it does not get a second trap.
 */

/**
 * The candidates: natively focusable elements, plus anything that names itself with `tabindex`.
 *
 * Candidates only — an element can be natively focusable *and* explicitly removed from the tab order,
 * and no clause list can express that on its own. That case is the one the suite caught while this
 * function was being written: `button tabindex="-1"` passed the selector. The filter below settles it.
 */
export const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]",
].join(", ");

/** Whether a candidate is really something a `Tab` press should reach. */
function isTabbable(element: HTMLElement): boolean {
  return (
    // `-1` means "focusable by script, never by Tab": the dialog container, and any control a later
    // view keeps out of the sequence. It overrides the element's own tabbability, which is why it is
    // asked here rather than only inside the `[tabindex]` clause above.
    element.getAttribute("tabindex") !== "-1" &&
    !element.hasAttribute("hidden") &&
    element.getAttribute("aria-hidden") !== "true"
  );
}

/** The elements of `container` a `Tab` press can reach, in document order. */
export function focusTargets(container: ParentNode): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isTabbable);
}

/**
 * Which target `Tab` (`backwards: false`) or `Shift+Tab` (`true`) moves to.
 *
 * `current` is the index of the focused element, or a negative value when focus is somewhere the list
 * does not know (the dialog container, or the page outside it): the answer is then the first target,
 * or the last one when travelling backwards — the list is entered from the side the user is moving
 * towards, which is what wrapping means at the boundary.
 *
 * Returns **-1** when there is nothing to focus: the caller's business, not this function's, because
 * only it knows what the fallback is (the dialog container).
 */
export function nextFocusIndex(current: number, count: number, backwards: boolean): number {
  if (count <= 0) {
    return -1;
  }
  if (current < 0 || current >= count) {
    return backwards ? count - 1 : 0;
  }
  return (current + (backwards ? -1 : 1) + count) % count;
}
