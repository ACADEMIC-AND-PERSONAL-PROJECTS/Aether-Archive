/**
 * `GET /` — the immersive entry view.
 *
 * **Placeholder (E2-S2).** The route exists and is lazy-loaded; the view itself is E3-S1, which fetches
 * one random photo (`api/queryKeys.ts` → `randomPhoto`) and draws it full-bleed. This placeholder keeps
 * the shell's contract — one `<main>` per view, one `<h1>` naming it — so the route smoke test asserts
 * something true rather than a marker that has to be deleted later.
 *
 * The colours and tracking read the token layer (`global.css`, E2-S3); a dump's generated
 * palette takes them over in E2-S6.
 */
export function SplashView() {
  return (
    <main className="grid flex-1 place-items-center p-8 text-center">
      <div className="space-y-2">
        <h1 className="text-2xl font-normal tracking-display text-aura-text">Aether Archive</h1>
        <p className="text-sm text-aura-muted">The splash view arrives in E3-S1.</p>
      </div>
    </main>
  );
}
