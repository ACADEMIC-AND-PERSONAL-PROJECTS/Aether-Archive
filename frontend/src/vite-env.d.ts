/**
 * The environment variables this app reads, declared where TypeScript checks them.
 *
 * Vite replaces `import.meta.env.VITE_*` in the bundle with a literal string, so the declaration is the
 * only place the name is known to the compiler. A variable that is not listed here is **not** part of
 * the app's configuration — and only `VITE_`-prefixed keys are ever exposed to the client bundle.
 * Vite reads them from the repository-root `.env` (`envDir` in `vite.config.ts`), the same file
 * compose and the backend read (`docs/engineering/DEPLOYMENT.md`); every other key in it belongs to
 * the backend.
 */

interface ImportMetaEnv {
  /**
   * Absolute API origin, e.g. `http://192.168.1.20:8080`, for a client that must talk to an API on
   * another origin. **Origin only** — the client adds the `/api/v1` prefix itself, and a value that
   * already ends in `/api/v1` doubles it (measured in E2-S2: `…/api/v1/api/v1/photos` answers 404).
   * Unset or empty means **same origin** — the default in dev and in the container, where nginx
   * serves the SPA and proxies `/api/**` and `/images/**` to the API
   * (`docs/engineering/DEPLOYMENT.md`, and `frontend/README.md` § "Where the API lives").
   */
  readonly VITE_API_BASE_URL?: string;
  /**
   * Dev-server only: the origin `vite` forwards `/api/v1` and `/images` to. Unset means
   * `http://localhost:8080`, the backend's documented dev port. Never present in a build.
   */
  readonly VITE_API_PROXY_TARGET?: string;
  /**
   * The client's mirror of the archive's upload ceiling, in whole megabytes. Unset means **15**, the
   * backend's documented default (`aether.storage.max-upload-mb`, `AETHER_MAX_UPLOAD_MB`); a deployment
   * that changes the backend key sets this one to match. The server remains the authority — the client's
   * copy exists so an oversized pick is refused before the bytes are sent — and a value outside the
   * backend's own 1–1024 bounds falls back to the default (`lib/upload/validation.ts`).
   */
  readonly VITE_MAX_UPLOAD_MB?: string;
}
