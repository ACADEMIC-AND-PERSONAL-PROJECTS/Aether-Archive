/**
 * Placeholder view — E2-S2 replaces it with the real shell (router, providers, views).
 * Its only job is to prove the toolchain renders end to end.
 *
 * The colour utilities below are scaffold placeholders from Tailwind's default
 * palette; E2-S3 introduces `--aura-text` / `--aura-muted` and they go away.
 */
export function App() {
  return (
    <main className="grid min-h-dvh place-items-center p-8 text-center">
      <div className="space-y-2">
        <h1 className="text-2xl font-normal tracking-tight text-neutral-200">Aether Archive</h1>
        <p className="text-sm text-neutral-400">Toolchain online — the shell arrives in E2-S2.</p>
      </div>
    </main>
  );
}
