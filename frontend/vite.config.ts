import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
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
  // Only `VITE_`-prefixed keys are read, so the backend's own keys in the root `.env` stay out of the
  // frontend's build and dev server (`docs/engineering/DEPLOYMENT.md`).
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const apiProxyTarget = env.VITE_API_PROXY_TARGET || "http://localhost:8080";

  return {
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
    },
  };
});
