/**
 * Whether one progress event still belongs to the request the screen is showing (E4-S2A2).
 *
 * Two races share one gate:
 *
 * - A request that settled can emit one more `progress` event before its listeners are torn down. If the
 *   queue has already moved on, that event must not move the next file's line.
 * - An event arriving after the view unmounted must not set state on a dead tree. React 19 makes that
 *   update a silent no-op rather than a warning, so the DOM cannot be asked after the fact — the
 *   decision is pinned here, without a renderer, and the queue's progress behaviour is pinned by the
 *   component tests.
 */
export function isCurrentProgress(
  alive: boolean,
  active: AbortController | null,
  request: AbortController,
): boolean {
  return alive && active === request;
}
