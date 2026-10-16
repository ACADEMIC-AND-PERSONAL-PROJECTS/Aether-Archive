import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Single config for the dev server, the production build and the test runner.
 *
 * `server.host` is on deliberately: the product is used from a phone on the LAN
 * (`docs/engineering/ARCHITECTURE.md` §8), so `npm run dev` binds every interface.
 * The shipped bundle never makes a network request — see `frontend/README.md`.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
  },
  preview: {
    host: true,
    port: 4173,
  },
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./src/test/setup.ts"],
    restoreMocks: true,
  },
});
