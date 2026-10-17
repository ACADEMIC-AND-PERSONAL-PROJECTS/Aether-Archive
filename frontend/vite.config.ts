import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

/**
 * Single config for the dev server, the production build and the test runner.
 *
 * `server.host` is on deliberately: the product is used from a phone on the LAN
 * (`docs/engineering/ARCHITECTURE.md` §8), so `npm run dev` binds every interface.
 *
 * `server.proxy` mirrors what the container's nginx does (`docs/engineering/DEPLOYMENT.md`: the `web`
 * service "serves the SPA; proxies `/api/**` and `/images/**` to `api`"). That is what makes the API
 * base URL *empty* — same origin — in every environment, so neither the client nor a phone needs an
 * absolute URL: a device that opens `http://<LAN-IP>:5173/` reaches the API through this process
 * instead of needing its own `VITE_API_BASE_URL` (and instead of CORS). `frontend/README.md`,
 * "Where the API lives", is the long version; the decision is ADR-016.
 *
 * The shipped bundle never makes a network request of its own — see `frontend/README.md`.
 */
export default defineConfig(({ mode }) => {
  // The repository-root `.env` is the one local environment file: docker compose reads it, the backend
  // imports it (`spring.config.import`), and `envDir` below makes Vite read it too — so a
  // `VITE_API_BASE_URL` or `VITE_API_PROXY_TARGET` set there is *seen*. Vite read only `frontend/`
  // before the wiring, which made the escape hatch the docs point at a silent no-op; E2-S2's review
  // probe measured both sides of that. Only `VITE_`-prefixed keys are ever exposed to the client
  // bundle, so the backend's own keys in the same file stay out of the frontend
  // (`docs/engineering/DEPLOYMENT.md`).
  const envDir = fileURLToPath(new URL("..", import.meta.url));
  const env = loadEnv(mode, envDir, "VITE_");
  const apiProxyTarget = env.VITE_API_PROXY_TARGET || "http://localhost:8080";

  return {
    envDir,
    plugins: [react(), tailwindcss()],
    server: {
      host: true,
      port: 5173,
      proxy: {
        "/api/v1": { target: apiProxyTarget, changeOrigin: true },
        // Photo URLs are `/images/<uuid>.<ext>` — a sibling of the API on the same origin, not under
        // `/api/v1` (`PhotoResponse`), so it needs its own entry.
        "/images": { target: apiProxyTarget, changeOrigin: true },
      },
    },
    preview: {
      host: true,
      port: 4173,
      // `npm run preview` serves the built bundle, which contains no proxy: the options above are the
      // dev server's. Preview against a real API is the container's job (ADR-010).
    },
    test: {
      environment: "jsdom",
      globals: false,
      setupFiles: ["./src/test/setup.ts"],
      restoreMocks: true,
      // `?raw` imports must return the file's text, not the empty stub: vitest stubs CSS by
      // default, which also blanks `global.css?raw` — the theme drift test reads exactly that
      // file (E2-S6). Processing CSS makes Vite answer the raw import with the source.
      css: true,
      // Hermetic: now that Vite reads the repository-root `.env` (`envDir` above), a machine-set
      // `VITE_API_BASE_URL` or `VITE_MAX_UPLOAD_MB` would otherwise change test outcomes. Both keys are
      // pinned here, so the suite is deterministic whatever the machine or `.env` says; a test that wants
      // a configured value stubs it itself, and `vi.unstubAllEnvs` restores these defaults. The upload
      // mirror is pinned to the documented 15 MB, the value the boundary tests assert.
      env: { VITE_API_BASE_URL: "", VITE_MAX_UPLOAD_MB: "15" },
    },
  };
});
