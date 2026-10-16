/**
 * `GET /river` — the chronological feed, with the background colour following the dump in view.
 *
 * **Placeholder (E2-S2).** The route exists and is lazy-loaded; the view is E5-S1, which fetches
 * `GET /api/v1/photos` and `GET /api/v1/dumps` through the keys in `api/queryKeys.ts`.
 */
export function RiverView() {
  return (
    <main className="grid min-h-dvh place-items-center p-8 text-center">
      <div className="space-y-2">
        <h1 className="text-2xl font-normal tracking-tight text-neutral-200">The River</h1>
        <p className="text-sm text-neutral-400">The feed arrives in E5-S1.</p>
      </div>
    </main>
  );
}
