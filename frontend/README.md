# Frontend — React + Vite + TypeScript

Scaffolded in Sprint 2 (**E2-S1**), with the app shell — routes, providers, typed API client — added
by **E2-S2**; the design tokens are E2-S3. Structure targets `docs/engineering/ARCHITECTURE.md` §6,
styling rules `docs/engineering/DESIGN-SYSTEM.md` and `.claude/rules/frontend.md`.

## Commands (from `frontend/`)

| Command                                   | What it does                                                                                                                                                                                                                                                    |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm install`                             | Installs the pinned toolchain. Node in the range **`^22.22.2 \|\| ^24.15.0 \|\| >=26`** — `jsdom` 30.1.3 is the strictest dependency (Vite 8 and Vitest 5 accept ≥ 22.12, which still allows 23.x/25.x that jsdom rejects). npm ≥ 10. Network needed here only. |
| `npm run dev`                             | Vite dev server on **:5173**, bound to every interface (`server.host`), so the phone can open `http://<LAN-IP>:5173/`. `npm run dev -- --host` is equivalent.                                                                                                   |
| `npm run test`                            | Vitest, single run (CI mode). `npm run test:watch` for the watch mode.                                                                                                                                                                                          |
| `npm run lint`                            | ESLint 10 flat config, `--max-warnings 0`.                                                                                                                                                                                                                      |
| `npm run format` / `npm run format:check` | Prettier (config in `.prettierrc.json`, 100 columns, LF, final newline — matching `.editorconfig`).                                                                                                                                                             |
| `npm run typecheck`                       | `tsc -b` over both projects (app + node-side config).                                                                                                                                                                                                           |
| `npm run build`                           | `tsc -b && vite build` → static bundle in `dist/` (no source maps).                                                                                                                                                                                             |
| `npm run preview`                         | Serves the built `dist/` on **:4173**, also LAN-bound.                                                                                                                                                                                                          |

## Pinned stack

Exact versions, no `^`: the combination below is the one that was installed and proven to build, lint and
test together. Anything that needs a different major version records the evidence in an ADR first
(`docs/scrum/DECISION-LOG.md`, ADR-014, ADR-015).

| Package                                                       | Version                   | Why it is here                                                                                                                                      |
| ------------------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `react` / `react-dom`                                         | 19.3.1                    | The UI runtime (mandated stack).                                                                                                                    |
| `react-router`                                                | 8.4.0                     | Routing (mandated stack). Peer `react`/`react-dom` ≥ 19.2.7 — satisfied; no `--legacy-peer-deps`.                                                   |
| `@tanstack/react-query`                                       | 5.104.3                   | Server state (mandated stack, ADR-004). Peer `react` `^18 \|\| ^19` — satisfied.                                                                    |
| `vite` + `@vitejs/plugin-react`                               | 8.3.4 + 6.1.2             | Dev server, build, React fast refresh.                                                                                                              |
| `typescript`                                                  | 6.0.3                     | Newest version the lint stack accepts; `latest` is 7.0.2 (ADR-015).                                                                                 |
| `tailwindcss` + `@tailwindcss/vite`                           | 4.3.3                     | Utility CSS, CSS-first configuration (ADR-014).                                                                                                     |
| `vitest` + `jsdom`                                            | 5.0.5 + 30.1.3            | Test runner and DOM implementation.                                                                                                                 |
| `@testing-library/react` (+ `dom`, `jest-dom`)                | 16.3.3 / 10.4.2 / 7.0.1   | Behaviour-level component tests and DOM matchers.                                                                                                   |
| `eslint` + `@eslint/js`                                       | 10.12.0 + 10.0.1          | Linter and its flat-config base rules.                                                                                                              |
| `typescript-eslint`                                           | 8.71.2                    | TypeScript parsing and the `no-explicit-any` / `no-non-null-assertion` / unused-import rules.                                                       |
| `eslint-plugin-import-x`, `eslint-import-resolver-typescript` | 4.17.1 + 4.4.5            | Import order and duplicate detection; the resolver is what lets it resolve extensionless TS specifiers — without it every import rule fails to run. |
| `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`    | 7.1.1 / 0.5.7             | Rules of hooks; keeps modules fast-refresh safe.                                                                                                    |
| `eslint-config-prettier`                                      | 10.1.8                    | Switches off every ESLint rule that would fight Prettier.                                                                                           |
| `prettier`                                                    | 3.9.10                    | Formatting (`.prettierrc.json`).                                                                                                                    |
| `globals`                                                     | 17.13.0                   | Browser/Node global sets for the flat config.                                                                                                       |
| `@types/*` (`react`, `react-dom`, `node`)                     | 19.3.0 / 19.3.0 / 22.20.5 | Types for React, the DOM side of it, and `vite.config.ts`.                                                                                          |

Not installed on purpose yet: Framer Motion and `@dnd-kit` (E4/E5, one story each), Fontsource packages
(E2-S5). A dependency lands with the story that needs it. E2-S2's two additions were installed the way
this table was proven: `npm ci` from the lockfile with **no peer warnings and 0 vulnerabilities**, and
the registry's own peer ranges checked against the installed React 19.3.1
(`reports/verify-e2-s2-20261016.md`).

## Where the API lives — one origin, in every environment

The app never talks to a URL it does not share an origin with. The API base is **empty** by default:
requests are relative (`/api/v1/photos`) and `Photo.url` is a path (`/images/<uuid>.<ext>`), so the
browser resolves both against whatever served the SPA. That is what makes the default work everywhere
without per-environment code:

| Environment         | The SPA is served by | `/api/v1` and `/images` reach the backend because…                                        |
| ------------------- | -------------------- | ----------------------------------------------------------------------------------------- |
| Dev on the PC       | Vite (`:5173`)       | `server.proxy` in `vite.config.ts` forwards to `VITE_API_PROXY_TARGET` (default `:8080`). |
| Dev from a phone    | Vite on the LAN IP   | the same proxy — a phone needs no `VITE_API_BASE_URL` of its own.                         |
| Container (ADR-010) | nginx                | nginx proxies `/api/**` and `/images/**` to the `api` service.                            |

Measured in E2-S2: with a backend on `:8099` and `VITE_API_PROXY_TARGET` pointing at it,
`curl http://localhost:5173/api/v1/photos` → **200** and `curl http://localhost:5173/images/<uuid>.png`
→ **200 `image/png`** — through the dev server, so the phone path is the PC path.

`VITE_API_BASE_URL` (declared in `src/vite-env.d.ts`, set in the **repository-root `.env`** — the one
local environment file that compose, the backend and Vite all read, via `envDir` in `vite.config.ts`)
exists for one case only: a client build that must
call an API on **another origin**. It takes an absolute **origin — no `/api/v1` suffix**; the client
adds the prefix itself, so a value that already ends in `/api/v1` doubles it, and E2-S2's probe measured
exactly that: `…/api/v1/api/v1/photos` → 404. (`.env.example` used to suggest the suffixed form; it was
corrected, and a test now pins the composition.) A cross-origin base leaves `Photo.url` pointing at the
SPA's origin, so it is a debugging aid, not a deployment shape — the archive is same-origin by design
(ADR-016).

## How a failure arrives — measured against the running API

`fetch` reports failures through two channels: an HTTP failure **resolves** with `ok === false` and the
archive's problem+json body, while a transport failure **rejects**. `src/api/client.ts` maps both onto
one typed `ApiError` (`kind`, `status`, `code`, `problem`). The shapes below were measured, not modelled
— against a real backend (`spring-boot:run` on `:8099`, throwaway data directory) and the real `fetch`,
with the probe file deleted afterwards and its output recorded in `reports/verify-e2-s2-20261016.md`:

| Event                                    | What `fetch` did                                                                                                                   | `ApiError`                                                                     |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `POST /api/v1/dumps` with `photoIds: []` | resolves; `400`; problem+json `code: "validation-failure"`, `errors: [{field: "photoIds", message: "must name exactly 6 photos"}]` | `kind: "http"`, `status: 400`, `code` kept, `problem` kept                     |
| Unmapped path                            | resolves; `404`; problem+json `code: "not-found"`                                                                                  | `kind: "http"`, `status: 404`                                                  |
| Nothing listening (`ECONNREFUSED`)       | rejects; `TypeError: fetch failed`, cause `ECONNREFUSED`                                                                           | `kind: "network"`, no `status`                                                 |
| Unresolvable host (`ENOTFOUND`)          | rejects; `TypeError: fetch failed`, cause `ENOTFOUND`                                                                              | `kind: "network"`                                                              |
| Deadline (`AbortSignal.timeout`)         | rejects; `DOMException` named `TimeoutError`                                                                                       | `kind: "timeout"`                                                              |
| Caller cancellation                      | rejects; `DOMException` named `AbortError`                                                                                         | rethrown unchanged — cancelling is not failing                                 |
| `200` carrying non-JSON                  | resolves                                                                                                                           | `kind: "parse"` (unit-tested: the archive cannot be made to do this on demand) |

5xx follows the same resolving channel as 4xx (`kind: "http"` with the status and any `code`); no
endpoint fails on demand, so that branch is pinned by the unit tests with a stubbed response.

In the Vitest + jsdom test environment the same paths run end to end — `fetch` is stubbed, but
`AbortSignal.timeout`, `AbortSignal.any` and `Response` are the runtime's. The error **names** are
checked, not `instanceof DOMException`: the thrown error is Node's `DOMException` while the global is
jsdom's, so `instanceof` is false even for a real timeout (client.ts, `classifyTransportFailure`).

## Layout

```text
frontend/
├── index.html            Vite entry (viewport-fit=cover, colour-scheme: dark)
├── vite.config.ts        plugins, LAN host, Vitest config
├── eslint.config.js      flat config
├── tsconfig.json         project references
├── tsconfig.app.json     src/ — DOM + strict flags
├── tsconfig.node.json    vite.config.ts — Node types
└── src/
    ├── app/              App shell: routes, providers, query client, fallback + tests (E2-S2)
    ├── features/         splash/ — the immersive hero (E3-S1A); river/ workshop/ placeholders (E2-S2); menu/ in E3
    ├── components/       README.md only — GlassPanel and shared primitives (E2-S6)
    ├── lib/              README.md per folder (color/ image/ motion/) — pure TS, no React
    ├── api/              typed client, query keys, retry policy, photo queries + tests (E2-S2, E3-S1A)
    ├── hooks/            useHeroImage (E3-S1A) — reusable hooks
    ├── types/            wire types mirroring _docs/openapi.yml (E2-S2)
    ├── styles/           global.css — the `@theme` token layer lives here
    └── test/setup.ts     jest-dom matchers + RTL cleanup
```

## What the toolchain enforces

- **TypeScript strict** plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`,
  `noFallthroughCasesInSwitch`, `noUnusedLocals`, `noUnusedParameters`, `isolatedModules`,
  `verbatimModuleSyntax` and `erasableSyntaxOnly`. Measured on this version: indexed reads are `T | undefined`
  (`TS18048`) and an explicit `undefined` on an optional property is rejected (`TS2375`).
- **ESLint** rejects `any`, non-null assertions, unused imports/vars, import-order violations and hook-rule
  breaks — verified by linting a deliberately bad file during E2-S1, not by assuming.
- **Vitest** runs with `globals: false` (explicit `import { describe, it, expect } from "vitest"`); the setup
  file registers RTL's cleanup because the RTL auto-cleanup needs a global `afterEach`.

### Known gaps this scaffold leaves open

- **`tsconfig.node.json` includes only `vite.config.ts`.** A future `vitest.workspace.ts` or
  `playwright.config.ts` would sit outside `tsc -b` until it is added to that project's `include`.
- **Lint is type-unaware on purpose** (no `projectService`; `tsc -b` owns type errors and ESLint stays
  fast). Rules that need types therefore do not run — `no-floating-promises` and `no-misused-promises`
  among them. E2-S2 added the async API client with linting still type-unaware: `tsc -b` checks its
  types, and switching to `projectService` remains available to a story that needs those rules —
  measure the lint-time cost before switching the whole config.
- **Tailwind v4 scans this file**: its automatic source detection walks the project root, so README prose
  generates utilities (the word "static" shipped `.static{position:static}`). Scoping is E2-S3's — ADR-014.

## Test environment — measured 2026-10-16, not assumed

`document.createElement("canvas").getContext("2d")` and friends, run inside the E2-S1 test process
(jsdom 30.1.3) and, for comparison, inside the system Chromium:

| Probe                                      | jsdom 30.1.3 (Vitest)                                                                                                                                                                       | Chromium 152 (headless)                                                                                        |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `canvas.getContext("2d")`                  | **`null`** + `Not implemented: HTMLCanvasElement's getContext() method: without installing the canvas npm package`                                                                          | `CanvasRenderingContext2D`                                                                                     |
| `ctx.getImageData(0,0,4,4)`                | n/a (no context)                                                                                                                                                                            | `ImageData`, 64 bytes                                                                                          |
| `new OffscreenCanvas(1,1)`                 | **`ReferenceError: OffscreenCanvas is not defined`**                                                                                                                                        | works, `getContext("2d")` returns an object                                                                    |
| `typeof createImageBitmap`                 | `undefined`                                                                                                                                                                                 | `function`                                                                                                     |
| `typeof ImageData`                         | `undefined`                                                                                                                                                                                 | `function` (a canvas probe constructed one)                                                                    |
| `typeof Image`                             | `function`                                                                                                                                                                                  | not probed                                                                                                     |
| `typeof matchMedia`                        | **`undefined`**                                                                                                                                                                             | `function` — `matchMedia("(prefers-reduced-motion: reduce)").matches` → `false`, `(…: no-preference)` → `true` |
| `typeof requestAnimationFrame`             | `function`                                                                                                                                                                                  | not probed                                                                                                     |
| `typeof HTMLImageElement.prototype.decode` | **`undefined`** — `await img.decode()` rejects `TypeError: img.decode is not a function`, on a data URL and on an unreachable one alike                                                     | decodes; the reveal waits for it (E3-S1A)                                                                      |
| `img` pointed at a data URL                | fires **neither** `load` nor `error` (100 ms watched); `complete` goes `true` → `false`; `naturalWidth` stays `0`                                                                           | loads                                                                                                          |
| `URL.createObjectURL(blob)`                | `function` → `blob:nodedata:<uuid>`, assignable to `img.src`, revocable — the one image-adjacent API jsdom fakes                                                                            | `blob:http://…/<uuid>`; `naturalWidth` 1200 measured on E3-S1A's hero                                          |
| `new TouchEvent(…)`                        | **`ReferenceError: Touch is not defined`** (neither `TouchEvent` nor `Touch` exists)                                                                                                        | not probed in this slice                                                                                       |
| Input events reaching React                | `fireEvent.touchStart` **and** `fireEvent.pointerDown/Move/Up/Cancel` all arrive with `clientY` intact                                                                                      | not probed in this slice (E3-S1B measures real input against its tap target)                                   |
| unstubbed `fetch("/api/v1/…")`             | rejects `TypeError: Failed to parse URL from /api/v1/photos/random` — _not_ a network attempt                                                                                               | real request                                                                                                   |
| `new Response(blob).blob()`                | **rejects `TypeError: object.stream is not a function`** — a jsdom `Blob` is not a `BodyInit` the Node `Response` accepts                                                                   | n/a                                                                                                            |
| `new Response("…").blob()`                 | a real `Blob`, whose object URL assigns to `img.src`; the difference decides whether an image test reaches the decode at all                                                                | n/a                                                                                                            |
| `HTMLImageElement.prototype.decode`        | absent, but **installable**: `Object.defineProperty(…, { configurable: true, writable: true })`, removable with `Reflect.deleteProperty` — how `app/App.test.tsx` runs the real decode step | real                                                                                                           |

Consequences for E2-S4 (its ADR decides, this is the evidence): the colour pipeline cannot be exercised
through a real canvas in jsdom. The options are to test the pure functions over `ImageData`-shaped plain
objects, to add a canvas implementation (the `canvas` npm package is a native build; a browser-mode runner
is a second test runtime), or to keep the decode step behind an injected port. `matchMedia` being absent
also matters for the `prefers-reduced-motion` hooks in E2-S6: there the query has to be stubbed, whereas
Chromium answers it for real (headless reports no reduced-motion preference unless asked otherwise).
E3-S1's `lib/image/hero.ts` took the third option for the image pipeline: the byte fetch, the decode and
the tone are an injected `HeroEnvironment`, so `prepareHero`'s ordering and its error policy are the
shipped code under test while the three browser edges are fakes. Two tests keep the real environment honest
(`app/App.test.tsx`): one answers the photo's bytes with a **string** body, so the failure really happens at
the missing `decode` — with a jsdom `Blob` as the body, `Response.blob()` rejects first
(`object.stream is not a function`, probed) and the test would have proved nothing about the decode it
names — and one installs a decoder the test controls, which is the only place in the suite where the
awaited `decode()` runs.

## Screenshots — mechanism chosen in E2-S1, **no dependency**

The system Chromium renders the built bundle headlessly; verified on the E2-S1 build at all three widths
E2-S3 needs:

```bash
npm run build && npm run preview          # serves dist/ on 127.0.0.1:4173
chromium-browser --headless --disable-gpu --no-sandbox --hide-scrollbars \
  --disable-background-networking --virtual-time-budget=3000 \
  --window-size=390,844 --screenshot=/tmp/aether-390.png http://127.0.0.1:4173/
```

`--window-size=320,800` and `=430,800` produced the same captures (PNG headers measured: 320×800, 390×844,
430×800). `--virtual-time-budget` replaces "sleep and hope". If a later story needs scripted interaction,
element-level captures or DOM assertions, the upgrade path is `playwright` as a dev dependency using the
already-populated `~/.cache/ms-playwright` — justified in that story's PR, not installed here.

**E3-S1 correction, measured:** the command above does _not_ capture a page that reveals content after a
streamed image. With the 1.4 MB hero, `--virtual-time-budget=60000` still dumped `data-state="loading"`:
virtual time does not advance while the bytes are in flight, so the budget expires before the photo exists
and every capture is the empty placeholder. What works, with no dependency: Chromium's own DevTools
protocol over Node 22's built-in `WebSocket` (`--remote-debugging-port`, `Page.navigate`, wait on the wall
clock, `Page.captureScreenshot`, `Runtime.evaluate` for the DOM facts at the moment of the capture). The
probe scripts live outside the repository; the capture they produced is `reports/e3s1-splash-390.png`, taken
against the **built** bundle served with `/api/**` and `/images/**` proxied the way the container's nginx
does. Its DOM facts were `state=ready`, `imgSrc=blob:http://127.0.0.1:4180/<uuid>`, `naturalWidth=1200`,
`--aura-bg=#001421`, `viewport=[390,844]`, `text="Aether Archive"`, `tapTarget=null`. The photo in it is a
generated 1200×1800 PNG, because the development data directory is a placeholder that does not resolve —
the archive it shows is not a real one.

## The splash hero — measured (E3-S1A)

Three questions this slice could not answer by reading the code, each measured against a running archive
(backend on `:8097`, throwaway data directory **and** throwaway database `aether_e3s1_hero`, one uploaded
1200×1800 PNG). Probe files were deleted afterwards; every number below is copied from the command output.

**The photo's bytes are read once.** `lib/image/hero.ts` fetches the bytes, decodes them through a blob
URL and derives the palette from _those_ bytes. The cache headers make the alternative cheap rather than
impossible — measured with curl: `/api/v1/photos/random` answers `Vary`/`Content-Type`/`Date` and **no**
`Cache-Control`, `ETag` or `Last-Modified`, while `/images/**` answers
`Cache-Control: max-age=31536000, public, immutable` + `Last-Modified` + `Accept-Ranges: bytes` — so a
second request for the same photo is served from the browser cache (seen directly: with the connection
throttled to 40 kB/s the hero still went `ready` in 2.2 s on a repeat view). The single read is about one
code path and one source for the pixels, not about saving a round trip.

**The placeholder's window is the decode, not the transfer.** With the image request held for 8 s
(`Fetch.requestPaused`) and the page polled every 250 ms:

```text
0.3s  {"state":null,"auraBg":"#0b0b0d","img":"no"}      ← the app shell, stylesheet neutral
0.6s  {"state":"loading","auraBg":"#0b0b0d","img":"no"}  ← the photo asked for, bytes in flight
      [intercept] holding http://localhost:5173/images/<uuid>.png for 8000 ms
8.9s  {"state":"ready","auraBg":"#001421","img":"yes"}    ← bytes landed, tone extracted, decode done
```

Nothing can know a photo's colour before its bytes exist, so the tone is on screen for the last ~0.3 s of
the wait, not the whole of it — the neutral `#0b0b0d` covers the transfer. The criterion's "no flash of
empty screen" is therefore met in the sense that the reveal starts from the photo's own colour rather than
from black; covering the transfer as well would need the tone to come from somewhere other than the bytes
(a remembered tone, or a per-photo field — neither is in `_docs/openapi.yml`; raised as an open question in
ADR-021 rather than invented here).

**One request per visit, nothing off this origin, on the built bundle.** The page's own account of what it
fetched (`performance.getEntriesByType("resource")`), after two loads of `dist/` through the proxy:
**1 `/api/v1/photos/random` + 1 `/images/<uuid>.png` per visit**, seven resources in total, **0 requests off
this origin**. Re-measured at this slice's tip: `assets/index-*.js`, `assets/index-*.css`,
`assets/SplashView-*.js`, `assets/theme-*.js`, `assets/inter-*.woff2` and the two above. A reload resets the
query cache, so this count holds whatever the cache policy is; the policy is about a _return_ inside one
running app, and that is E3-S1B's.

**Not in this slice.** The per-visit cache policy (`staleTime: 0` + `gcTime: 0`), the tap target and the
pull-to-refresh gesture — including the measurement that caught a real browser claiming the drag as a scroll
until `touch-action` was narrowed — belong to **E3-S1B**, the follow-up slice of this story. ADR-021 keeps
those decisions and their numbers so that slice restores them instead of rediscovering them.

## Zero external requests — measured on the built bundle

```bash
grep -rohE 'https?://[a-zA-Z0-9.-]+' dist/ | sort | uniq -c | sort -rn
#      18 http://www.w3.org      (SVG/MathML/XML namespace identifiers, not requests)
#       2 https://react.dev      (URLs inside React's production error messages)
#       1 https://tailwindcss.com (the licence banner comment in the CSS)
```

No `url(https://…)`, `@import` of a remote sheet, `<link href="https://…">`, `<script src="https://…">` or
`fetch("https://…")` exists in `dist/`, no source maps are emitted, and no font file is shipped.

Loading the built page in headless Chromium with every non-loopback host mapped to `NOTFOUND` produced **six
URLs — three same-origin, three browser-level**: `/`, `/assets/index-*.js` and `/assets/index-*.css` from the
page, plus requests to `clients2.google.com`, `accounts.google.com` and `www.google.com` that
`--disable-background-networking` does not suppress. Attribution is by control, not by assumption: a run of
`about:blank` under the same flags emits exactly those same three Google URLs, and the page renders
byte-identically with that traffic blocked. `index.html` carries `<link rel="icon" href="data:," />`, so the
browser's `/favicon.ico` probe no longer appears — before that line it did, and the run showed seven URLs.

## Non-negotiables

Images first and UI almost invisible; Dark Glassmorphism only; mobile-first (390 px design target, `100dvh`,
safe-area insets, ≥ 44 px targets); theme colours from the extracted palette (`--aura-*`), never a hex in a
component; fonts only via Fontsource NPM packages; **a request leaving the machine is a bug**.

Rules: `.claude/rules/frontend.md` · design language: `.claude/rules/design-language.md` · decisions of
these stories: `docs/scrum/DECISION-LOG.md` ADR-014 and ADR-015 (E2-S1), ADR-016 (E2-S2), ADR-021 (E3-S1A).
