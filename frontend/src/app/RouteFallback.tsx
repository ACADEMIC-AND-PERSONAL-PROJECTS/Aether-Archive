/**
 * What is on screen while a view's code is loading.
 *
 * A route is a lazy chunk, so between the tap and the first paint of the next view there is a moment
 * with nothing to show. The design puts no spinner and no skeleton on it (`.claude/rules/design-language.md`,
 * "empty and loading states are silent"), so this draws **nothing at all** — the same full-height box the
 * views occupy, so the arrival of the real one cannot shift the layout.
 *
 * The one thing it does say is to a screen reader: without a live region, a keyboard or screen-reader
 * user gets no signal that the tap did anything. The text is inside an `sr-only` span — announced, never
 * drawn.
 */
export function RouteFallback() {
  return (
    <div className="min-h-dvh" role="status">
      <span className="sr-only">Loading view</span>
    </div>
  );
}
