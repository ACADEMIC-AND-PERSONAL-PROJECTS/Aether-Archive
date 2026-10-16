/**
 * `GET /curate` — the Curator's Workshop: upload, order the six photos, pick the aura, publish.
 *
 * **Placeholder (E2-S2).** The route exists and is lazy-loaded; the view is E4 (upload and
 * `@dnd-kit` ordering), with `POST /api/v1/dumps` following in E4-S5. The folder is `workshop/`
 * (`.claude/rules/frontend.md`) while the path is `/curate`, because the URL is the address and the
 * folder is the product's own name for the view.
 */
export function WorkshopView() {
  return (
    <main className="grid min-h-dvh place-items-center p-8 text-center">
      <div className="space-y-2">
        <h1 className="text-2xl font-normal tracking-tight text-neutral-200">
          Curator&rsquo;s Workshop
        </h1>
        <p className="text-sm text-neutral-400">The workshop arrives in E4.</p>
      </div>
    </main>
  );
}
