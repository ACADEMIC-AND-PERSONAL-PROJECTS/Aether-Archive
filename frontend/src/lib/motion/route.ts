/**
 * When a route entry replays — the one decision the route transition makes, as a pure function.
 *
 * The transition is a CSS animation keyed to a React `key` (`app/RouteTransition.tsx`): a different key
 * remounts the element, and a remount is what replays an animation. So the whole question is *which
 * navigations are a different view*, and the answer has to match what `<Routes>` does — the view is
 * what React Router matched, not what the URL string happens to spell.
 *
 * Two consequences, both pinned by tests:
 *
 * - **A different query string is not a different view.** `/check?theme=demo` and `/check?theme=paper`
 *   are the same route, the same mounted component and the same state; replaying a full-screen fade on
 *   a query change would be animation the user did not trigger (`DESIGN-REFERENCES.md` §1.3), and
 *   worse, it would remount the view and lose its state. React Router matches on the path, so this
 *   function is handed the path.
 * - **A trailing slash is not a different view.** `/river` and `/river/` are one route; a naive
 *   `key={pathname}` would treat them as two and remount the view on a navigation that changed nothing.
 *
 * The pathname is normalised, not sanitised: no decoding, no case folding, no resolution of `.` or
 * `..`. React Router has already resolved the URL by the time this runs, and doing half of that work
 * here would be a second, weaker router.
 */
export function viewIdentity(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}
