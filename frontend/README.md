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
    ├── features/         splash/ — the immersive hero (E3-S1); river/ workshop/ placeholders (E2-S2); menu/ in E3
    ├── components/       README.md only — GlassPanel and shared primitives (E2-S6)
    ├── lib/              README.md per folder (color/ image/ gesture/ motion/) — pure TS, no React
    ├── api/              typed client, query keys, retry policy, photo queries + tests (E2-S2, E3-S1)
    ├── hooks/            useHeroImage + usePullToRefresh (E3-S1) — reusable hooks
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
| `typeof HTMLImageElement.prototype.decode` | **`undefined`** — `await img.decode()` rejects `TypeError: img.decode is not a function`, on a data URL and on an unreachable one alike                                                     | decodes; the reveal waits for it (E3-S1)                                                                       |
| `img` pointed at a data URL                | fires **neither** `load` nor `error` (100 ms watched); `complete` goes `true` → `false`; `naturalWidth` stays `0`                                                                           | loads                                                                                                          |
| `URL.createObjectURL(blob)`                | `function` → `blob:nodedata:<uuid>`, assignable to `img.src`, revocable — the one image-adjacent API jsdom fakes                                                                            | `blob:http://…/<uuid>`; `naturalWidth` 1200 measured on E3-S1's hero                                           |
| `new TouchEvent(…)`                        | **`ReferenceError: Touch is not defined`** (neither `TouchEvent` nor `Touch` exists)                                                                                                        | not needed — the gesture uses pointer events, and `Input.dispatchTouchEvent` reaches them                      |
| Input events reaching React                | `fireEvent.touchStart` **and** `fireEvent.pointerDown/Move/Up/Cancel` all arrive with `clientY` intact                                                                                      | real `Input.dispatchMouseEvent` at (195, 400) hits the full-screen `BUTTON`; real `Escape` closes the menu     |
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
430×800). `--virtual-time-budget` replaces "sleep and hope" **for a page that is already painted** — the
correction below is where that stops being true. For element-level captures and DOM facts there is no
dependency to add: CDP over Node's built-in `WebSocket` does both (measured, E3-S1). `playwright` as a dev
dependency using the already-populated `~/.cache/ms-playwright` remains the upgrade path for scripted
multi-step interaction — justified in the PR of the story that needs it, not installed here.

**E3-S1 correction, measured:** the command above does _not_ capture a page that reveals content after a
streamed image. With the 1.4 MB hero, `--virtual-time-budget=60000` still dumped `data-state="loading"`:
virtual time does not advance while the bytes are in flight, so the budget expires before the photo exists
and every capture is the empty placeholder. What works, with no dependency: Chromium's own DevTools
protocol over Node 22's built-in `WebSocket` (`--remote-debugging-port`, `Page.navigate`, wait on the wall
clock, `Page.captureScreenshot`, `Runtime.evaluate` for the DOM facts at the moment of the capture). The
probe scripts live outside the repository; the capture they produced is `reports/e3s1-splash-390.png`, taken
against the **built** bundle served with `/api/**` and `/images/**` proxied the way the container's nginx
does, and it is the generated 1200×1800 PNG the throwaway archive holds (the development data directory is a
placeholder that does not resolve, so the archive it shows is not a real one). Re-measured at E3-S1's tip,
its DOM facts are `state=ready`, `imgSrc=blob:http://127.0.0.1:8138/<uuid>`, `naturalWidth=1200`,
`--aura-bg=#001421`, `viewport=[390,844]`, `text="Aether Archive"`, `tapTarget="Open the menu"`,
`elementAtCentre=BUTTON`, `touchAction=pan-x pinch-zoom`. The file itself did not change: the fresh capture
is byte-identical (43,053 bytes) to the committed one **and** to a second capture taken with the tap target
`display: none` — which is the "UI invisible" rule measured rather than asserted.

## The splash hero — measured (E3-S1)

Four questions this story could not answer by reading the code, each measured against a running archive
(backend on `:8097`, throwaway data directory **and** throwaway database `aether_e3s1_hero`, one uploaded
1200×1800 PNG). Probe scripts live outside the repository; every number below is copied from the output.

**Fresh per visit, without re-reading what was just read.** `GET /photos/random` answers differently on
purpose, so the app-wide 30 s `staleTime` is wrong for it. Counted requests across an unmount and a
remount inside one query client:

| Policy                                     | After one visit | After leaving and coming back                                  |
| ------------------------------------------ | --------------- | -------------------------------------------------------------- |
| `createQueryClient()` defaults (30 s)      | 1               | **1** — the cached photo, which is the bug the criterion names |
| the splash's (`staleTime: 0`, `gcTime: 0`) | 1               | **2**                                                          |

`gcTime: 0` is the half that is easy to miss: a stale-but-cached entry is still _painted_ first, and the
splash's whole promise is that the photo on screen belongs to this visit. The table is what the unit test
asserts, and it is also what that test fails without — with the policy set back to the app defaults, the
freshness test is the only one in the file that dies. In the **built** bundle the same criterion is
measurable without a reload: navigating to `/river` and back client-side issued `/api/v1/photos/random`
**#2** where the first visit issued #1 (`history.pushState` + a real `popstate`; the app's own router
answered).

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

**The tap target is really on top of the photo.** jsdom cannot answer this — it has no hit testing — so it
was measured with real input events in Chromium: `document.elementFromPoint(195, 400).tagName === "BUTTON"`
with the photo painted, a real `Input.dispatchMouseEvent` press/release at that point flipped
`aria-expanded` `false → true`, and a real `Escape` key event flipped it back. Focus was measured too: after
the synthetic tap `document.activeElement` is the `BUTTON` and it matches `:focus-visible`, so the splash's
only focusable element does paint an indicator (2,440 pixels, a 1 px inset frame at 3,3 → 386,840; the tap
is synthetic — see the residual risk in `reports/verify-e3-s1b-20261016.md`).

**The pull gesture does not survive the browser's default `touch-action` — and jsdom cannot say so.** The
test suite dispatches pointer events, which assumes the very thing worth checking: that a finger produces
them, and that the browser lets the whole gesture through. Chromium, driven with a synthesised touch drag
(`Input.dispatchTouchEvent`) on the **built** bundle, answered both — the first pass is the shipped surface:

```text
computed=pan-x pinch-zoom   requests 2->3   menuOpen=false
  events: pointerdown@300 pointermove@320 pointermove@340 pointermove@360 pointermove@380 pointermove@400 pointermove@420 pointermove@440 pointermove@460 pointerup@460
computed=auto               requests 3->3   menuOpen=false
  events: pointerdown@300 pointermove@320 pointercancel@0
```

the second forces the browser's default `touch-action: auto` back on, and the difference is the defect: the
browser claimed the vertical drag for scrolling after the first move and cancelled the pointer stream, so
pull-to-refresh was dead on a phone while the unit suite was green (172 tests, including the four that
dispatch the same events by hand). `touch-pan-x touch-pinch-zoom` (Tailwind v4 composes the property from
`--tw-pan-x`/`--tw-pan-y`/`--tw-pinch-zoom`, so two standard utilities emit
`touch-action: var(--tw-pan-x,) var(--tw-pan-y,) var(--tw-pinch-zoom,)` — checked in `dist/`) fixes it and
keeps pinch-zoom, which `touch-action: none` would have taken away. The class is pinned by a test in
`SplashView.test.tsx`; the _effect_ is only provable in a browser, which is what the trace above is. Note
also that Chromium fired **no `click`** after this drag — the hook's click-suppression is still needed for
drags a browser would treat as a tap, and it is the tests that cover that half.

**One request per visit, nothing off this origin, on the built bundle.** The page's own account of what it
fetched (`performance.getEntriesByType("resource")`), after two loads of `dist/` through the proxy:
**1 `/api/v1/photos/random` + 1 `/images/<uuid>.png` per visit**, seven resources in total, **0 requests off
this origin**. Re-measured at this story's tip: `assets/index-*.js`, `assets/index-*.css`,
`assets/SplashView-*.js`, `assets/theme-*.js`, `assets/inter-*.woff2` and the two above. A reload resets the
query cache, so this count cannot show the per-visit policy by itself; the policy's evidence is the
freshness table above — pinned by a test that dies without it, and visible in the browser on a client-side
return (request #2).

## The glass menu — measured (E3-S2)

The app's only dialog (`src/features/menu/GlassMenu.tsx`). Same mechanism as E3-S1's correction — Chromium
over CDP against the **built** bundle, `/api/**` and `/images/**` stubbed the way the container's nginx
proxies them, probe scripts outside the repository — with two synthetic photos served in place of the hero
for the contrast questions. Captures: `reports/e3s2-menu-390.png` (the archive's own photo) and
`reports/e3s2-menu-over-white-390.png` (a photo that is white exactly where the sheet lands — the worst case
the component's colour rules are written against). Every number below is copied from the probe output.

**The dialog, as the browser sees it.** One real touch tap on the tap target (`Input.dispatchTouchEvent`):
`role="dialog"`, `aria-modal="true"`, `aria-label="Menu"`, one dialog in the document, `aria-expanded`
`false → true` on the trigger. The sheet is `x 16, y 642, 358×186, bottom 828` — 16 px clear of both sides
and of the home indicator, capped at `max-w-md`; the three entries are `340×56` at y 651 / 707 / 763, so the
44 px floor is met with 12 px to spare (the class is `min-h-14`, pinned by a test; the _rendered_ height is
this measurement). Their font is `"Inter Variable"` at 19.035 px — the fluid `--text-lg` clamp at 390 px, not
a fixed size. The material resolves as designed: `.glass` computed to `backdrop-filter: blur(15px)
saturate(1.2)`, `background: rgba(0, 0, 0, 0.4)`, `border-radius: 20px`,
`border: 1px solid rgba(255, 255, 255, 0.08)`; the veil is the **photo's own tone** at 70 % —
`oklab(0.181217 -0.0215322 -0.0332196 / 0.7)` from an inline `--aura-bg: #001421`, which is the theme layer
writing the extracted palette, not a hex in a component.

**Focus in, Tab wrapping, focus out — with real keys.** The tap leaves focus on "The River" (the first
entry); `Tab` walks `Curate → Close → The River` (the forward wrap) and `Shift+Tab` walks `Close → Curate`
(the backward one), each with `defaultPrevented`, so the browser's own move out of the dialog never happens;
a keyboard-focused entry matches `:focus-visible` and paints the 1 px inset ring
(`outline: solid 1px oklab(… / 0.5)`), while a touch tap paints none. A real `Escape` press closes the dialog
and focus lands back on the tap target (`document.activeElement` = the `absolute inset-0` BUTTON).

**One listener owns the key.** The probe patches `EventTarget.prototype.addEventListener` from
`Page.addScriptToEvaluateOnNewDocument` and reads the census back: with the menu open
`{"live":["window:t"],"adds":1,"removes":0}` — exactly one `keydown` listener, on `window` (`t` is the
minified handler name) — and `[]` once closed. The splash used to run one of its own; since this story it
registers none, so an `Escape` press closes the menu once and nothing else answers it (`Escape` with nothing
open leaves the path, `aria-expanded` and the dialog count unchanged).

**The scroll lock, and what it does not claim.** Opening sets `overflow: hidden` on `document.documentElement`
(inline and computed agree), and the splash has nothing to scroll anyway (`scrollHeight === innerHeight ===
844`); no box changes when the menu opens (`main`, the `<img>`, the viewport and `documentElement.clientWidth`
are identical before and after), so there is no layout shift. Two honest limits, both measured or named:
`overflow: hidden` propagates to the viewport and blocks the _user's_ scrolling, not the script's — on a
deliberately 3000 px-tall document `window.scrollTo(0, 500)` still moved the page while locked — and iOS
Safari's well-known unreliability with `overflow: hidden` on the root is **not** covered here (no iOS device
in this environment). Today the shell is `100dvh` with `overflow-hidden` on `<main>`, so the lock is defence,
not the thing keeping a page still.

**A finger on the open menu changes nothing underneath.** Synthesised touch drags (`Input.dispatchTouchEvent`:
one move every 20 ms, 150 px) starting on the sheet — the _sibling_ of `<main>` the pull-to-refresh handlers
live on — left `/api/v1/photos/random` at 1 request, the dialog open and the route unchanged; a drag starting
on the veil likewise neither re-rolled the photo nor closed the menu; a tap on the sheet's own padding kept it
open; a tap on the veil closed it and returned focus to the trigger. The sibling placement is what makes this
true, and a test dies if the menu is ever nested inside `<main>`.

**`prefers-reduced-motion`, emulated rather than assumed** (`Emulation.setEmulatedMedia`). Under `reduce`:
`animation-name: none` for both the veil and the sheet, and the sheet's `top` is 642 px in **all 43** frames
sampled over 700 ms. Under `no-preference`: `aether-veil-in` / `aether-sheet-in`,
`0.32s cubic-bezier(0.22, 1, 0.36, 1) both`, and the sheet's `top` runs **658 → 642** — the criterion's
12–16 px drift, measured over 42 frames with 9 distinct values. No `matchMedia` is needed: `motion-safe:`
compiles to `@media (prefers-reduced-motion: no-preference)`, which is why the layer is a stylesheet
declaration and not a hook.

**The contrast model the tests use is the browser's own.** With a photo that is white in the lower half (so
the sheet sits over pure white) and the theme coming from the dark half, the screenshot was read back as
pixels _inside the page that painted it_:

```text
panel arithmetic rgb(45.9, 54.3, 59.8) | painted rgb(45,54,59)
veil over white arithmetic rgb(76.5, 90.5, 99.6) | painted over white rgb(76,90,99) | over the dark band rgb(0,20,32)
The River/Curate/Close: painted glyph rgb(197,211,221) → measured 8.07:1 | arithmetic 8.02:1
the muted token this theme carries (rgba(197, 211, 221, 0.62)) on the painted panel: 4.14:1
```

i.e. glass-over-veil-over-photo composited by hand and by Chromium agree to within a rounding step, and the
glyphs paint exactly the theme's text token. **The last line is the finding that changed the component:**
`--aura-muted` is raised by the generator until it clears 4.5:1 _on the page background_ (§2.2), and over the
veil that guarantee does not survive — 4.14:1 measured, 4.11:1 for the arithmetic worst case (the lightest
background the generator's bands allow: L 0.18, veil at 70 %, white photo). So all three entries wear
`--aura-text`; `GlassMenu.test.tsx` pins the token, the veil alpha and the composite for three palettes inside
the generator's bands, with the veil removed as the control (2.29:1 for the same glass on the same white
photo). A run with a solid white photo also showed the fallback path: near-white pixels are ignored by the
extractor, so the tokens fall back to `#0b0b0d` / `#e8e6e3` rather than inventing a theme from a blank.

**Nothing off this origin.** 18 requests across the run's two page loads (the second is the capture reload),
every one to the probe's own origin; `off-origin (none expected): []`. The second load re-asked
`/api/v1/photos/random` (#2) and re-used the cached `/images/**` bytes, as E3-S1 measured.

## Zero external requests — measured on the built bundle

```bash
grep -rohE 'https?://[a-zA-Z0-9.-]+' dist/ | sort | uniq -c | sort -rn
#      18 http://www.w3.org       (SVG/MathML/XML namespace identifiers, not requests)
#       2 https://react.dev       (URLs inside React's production error messages)
#       2 http://localhost        (React Router's URL-resolution base, `new URL("http://localhost")`)
#       1 https://reactrouter.com (a URL inside React Router's "must be used within a data router" message)
```

Re-measured at E3-S1's tip; the list is not stable between builds (the Tailwind licence banner the E2-S6 run
saw is not in this build's CSS, and the router's own strings are new to it), so it is quoted from the
command rather than carried forward.

No `url(https://…)`, `@import` of a remote sheet, `<link href="https://…">`, `<script src="https://…">` or
`fetch("https://…")` exists in `dist/`, and no source maps are emitted. **Correction (E3-S2, measured):** the
clause that used to end this sentence — "no font file is shipped" — was written before E2-S3 wired the
typeface up and had gone false: `ls dist/assets/*.woff*` lists five local Fontsource files (Inter variable,
Playfair Display 400/500 plus their `.woff` fallbacks, 152 kB on disk). They are served from this origin like any
other asset; what the rule forbids is a font _request_ leaving the machine, and there is none.

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
these stories: `docs/scrum/DECISION-LOG.md` ADR-014 and ADR-015 (E2-S1), ADR-016 (E2-S2), ADR-021 (E3-S1).
