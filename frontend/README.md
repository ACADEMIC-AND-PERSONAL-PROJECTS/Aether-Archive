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
| `axe-core`                                                    | 4.14.0                    | Accessibility audit in jsdom (E3-S5); dev-only, no transitive dependencies, absent from `dist/` (measured below).                                   |
| `eslint` + `@eslint/js`                                       | 10.12.0 + 10.0.1          | Linter and its flat-config base rules.                                                                                                              |
| `typescript-eslint`                                           | 8.71.2                    | TypeScript parsing and the `no-explicit-any` / `no-non-null-assertion` / unused-import rules.                                                       |
| `eslint-plugin-import-x`, `eslint-import-resolver-typescript` | 4.17.1 + 4.4.5            | Import order and duplicate detection; the resolver is what lets it resolve extensionless TS specifiers — without it every import rule fails to run. |
| `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`    | 7.1.1 / 0.5.7             | Rules of hooks; keeps modules fast-refresh safe.                                                                                                    |
| `eslint-config-prettier`                                      | 10.1.8                    | Switches off every ESLint rule that would fight Prettier.                                                                                           |
| `prettier`                                                    | 3.9.10                    | Formatting (`.prettierrc.json`).                                                                                                                    |
| `globals`                                                     | 17.13.0                   | Browser/Node global sets for the flat config.                                                                                                       |
| `@types/*` (`react`, `react-dom`, `node`)                     | 19.3.0 / 19.3.0 / 22.20.5 | Types for React, the DOM side of it, and `vite.config.ts`.                                                                                          |

Not installed on purpose yet: `@dnd-kit` (E4), Fontsource packages (E2-S5). A dependency lands with the
story that needs it. E2-S2's two additions were installed the way this table was proven: `npm ci` from
the lockfile with **no peer warnings and 0 vulnerabilities**, and the registry's own peer ranges checked
against the installed React 19.3.1 (`reports/verify-e2-s2-20261016.md`).

**Framer Motion is deliberately not installed** — a divergence from `_docs/aether_archive_specs.md`
approved by the owner and recorded with its measurements in ADR-022; `CLAUDE.md` §2 carries the same
statement rather than listing a dependency the lockfile does not have. E3-S3 measured four builds of this
app with and without it and shipped the motion layer as CSS instead: the smallest tree-shaken form costs
+83.92 kB raw / +29.22 kB gzip on the shared chunk, the ergonomic one +131.78 / +43.09, against
+0.49 / +0.15 for what shipped. No code here imports it. The View Transitions alternative and the
reduced-motion policy are in the same ADR, and the motion section below does not repeat these numbers.

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
    └── test/             setup.ts (jest-dom + RTL cleanup), axe.ts (the E3-S5 threshold and helper)
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

| Probe                                              | jsdom 30.1.3 (Vitest)                                                                                                                                                                       | Chromium 152 (headless)                                                                                        |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `canvas.getContext("2d")`                          | **`null`** + `Not implemented: HTMLCanvasElement's getContext() method: without installing the canvas npm package`                                                                          | `CanvasRenderingContext2D`                                                                                     |
| `ctx.getImageData(0,0,4,4)`                        | n/a (no context)                                                                                                                                                                            | `ImageData`, 64 bytes                                                                                          |
| `new OffscreenCanvas(1,1)`                         | **`ReferenceError: OffscreenCanvas is not defined`**                                                                                                                                        | works, `getContext("2d")` returns an object                                                                    |
| `typeof createImageBitmap`                         | `undefined`                                                                                                                                                                                 | `function`                                                                                                     |
| `typeof ImageData`                                 | `undefined`                                                                                                                                                                                 | `function` (a canvas probe constructed one)                                                                    |
| `typeof Image`                                     | `function`                                                                                                                                                                                  | not probed                                                                                                     |
| `typeof matchMedia`                                | **`undefined`**                                                                                                                                                                             | `function` — `matchMedia("(prefers-reduced-motion: reduce)").matches` → `false`, `(…: no-preference)` → `true` |
| `typeof requestAnimationFrame`                     | `function`                                                                                                                                                                                  | not probed                                                                                                     |
| `typeof HTMLImageElement.prototype.decode`         | **`undefined`** — `await img.decode()` rejects `TypeError: img.decode is not a function`, on a data URL and on an unreachable one alike                                                     | decodes; the reveal waits for it (E3-S1)                                                                       |
| `img` pointed at a data URL                        | fires **neither** `load` nor `error` (100 ms watched); `complete` goes `true` → `false`; `naturalWidth` stays `0`                                                                           | loads                                                                                                          |
| `URL.createObjectURL(blob)`                        | `function` → `blob:nodedata:<uuid>`, assignable to `img.src`, revocable — the one image-adjacent API jsdom fakes                                                                            | `blob:http://…/<uuid>`; `naturalWidth` 1200 measured on E3-S1's hero                                           |
| `new TouchEvent(…)`                                | **`ReferenceError: Touch is not defined`** (neither `TouchEvent` nor `Touch` exists)                                                                                                        | not needed — the gesture uses pointer events, and `Input.dispatchTouchEvent` reaches them                      |
| Input events reaching React                        | `fireEvent.touchStart` **and** `fireEvent.pointerDown/Move/Up/Cancel` all arrive with `clientY` intact                                                                                      | real `Input.dispatchMouseEvent` at (195, 400) hits the full-screen `BUTTON`; real `Escape` closes the menu     |
| unstubbed `fetch("/api/v1/…")`                     | rejects `TypeError: Failed to parse URL from /api/v1/photos/random` — _not_ a network attempt                                                                                               | real request                                                                                                   |
| `new Response(blob).blob()`                        | **rejects `TypeError: object.stream is not a function`** — a jsdom `Blob` is not a `BodyInit` the Node `Response` accepts                                                                   | n/a                                                                                                            |
| `new Response("…").blob()`                         | a real `Blob`, whose object URL assigns to `img.src`; the difference decides whether an image test reaches the decode at all                                                                | n/a                                                                                                            |
| `HTMLImageElement.prototype.decode`                | absent, but **installable**: `Object.defineProperty(…, { configurable: true, writable: true })`, removable with `Reflect.deleteProperty` — how `app/App.test.tsx` runs the real decode step | real                                                                                                           |
| `document.getAnimations` / `Element#getAnimations` | **`undefined`**; with no stylesheet loaded, computed `animation-name` is `none` and `animation-duration` is `auto`                                                                          | `function`; the loading pulse reports one running `aether-breathe` animation (E3-S4)                           |

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

**`prefers-reduced-motion`, emulated rather than assumed** (`Emulation.setEmulatedMedia`). Under `reduce`,
as measured _then_: `animation-name: none` for both the veil and the sheet, and the sheet's `top` is 642 px
in **all 43** frames sampled over 700 ms. Under `no-preference`: `aether-veil-in` / `aether-sheet-in`,
`0.32s cubic-bezier(0.22, 1, 0.36, 1) both`, and the sheet's `top` runs **658 → 642** — the criterion's
12–16 px drift, measured over 42 frames with 9 distinct values. No `matchMedia` is needed: `motion-safe:`
compiles to `@media (prefers-reduced-motion: no-preference)`, which is why the layer is a stylesheet
declaration and not a hook. **E3-S3 replaced this pair**: `motion-safe:` froze every entry under `reduce`
instead of keeping its fade, and the timings were spelled out per component. The keyframes, the tokens and
the policy in force are in the next section.

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

## The route transition — measured (E3-S3)

The vocabulary lives in `lib/motion/` (tokens + the view-identity rule) with the keyframes and the
`--motion-*` properties in `global.css`; the decision is ADR-022 and the vocabulary DESIGN-SYSTEM §5/§14.
Everything below was measured on the built bundle in headless Chromium 152 at 390 × 844
(`Emulation.setDeviceMetricsOverride`), served by a stub for `/api/**` and `/images/**`.

**Why no animation library.** The four-build comparison lives in **ADR-022** and in the dependency note
above, in one place: this section states what shipped rather than repeating the table. At E3-S3's tip
the shipped layer built to **286.69 kB / 90.37 kB gzip** and 18.08 kB / 4.65 kB of CSS — **+0.49 /
+0.15** on the chunk every route loads.

**One transition, frame by frame** — the same run as `reports/e3s3-transition-strip-390.png`:

```text
before the click   /        opacity 1      offset 0 px     menu open over the splash
  0 ms             /river   opacity 0      offset 16 px    the new view exists, nothing painted yet
 60 ms             /river   opacity 0.438  offset 8.99 px
150 ms             /river   opacity 0.718  offset 4.52 px
280 ms             /river   opacity 0.89   offset 1.75 px
600 ms             /river   opacity 1      offset 0 px     settled; 0 running animations
```

Across 74 sampled frames of a cold navigation into a lazy chunk: exactly one `<main>` and `[role=status]`
count **0** — the Suspense fallback never paints, because React Router's `startTransition` keeps the
outgoing view until the chunk resolves. `scrollHeight` runs 860 → 844 against an 844 px viewport (the drift
itself) and returns; `documentElement.clientWidth === innerWidth` with 0 overflowing scrollers in every
frame, so no scrollbar is ever painted. Settled: `transform: none`, `animation-fill-mode: none`.

**Interrupted 90 ms in.** The first entry was at opacity 0.523 / 7.63 px when the second navigation
replaced it; the new view ran 0 → 1 from its own `from` frame, with one `<main>` in the DOM throughout.
"Interruptible" here means _restart_, not _resume_ — nothing is left half-faded and nothing queues.

**Reduced motion, both readings** (`Emulation.setEmulatedMedia`), same navigation: under `reduce` the
entry still runs — 37 distinct opacity values — while every computed transform is `matrix(1,0,0,1,0,0)` or
`none` and `maxScrollHeight` **844 === `clientHeight`**; the menu keeps `aether-fade` on its veil and its
sheet's `top` is a single value (642) throughout. Under `no-preference`: 38 distinct offsets, 16 px → 0,
document overflow 860. The switch is one custom property, not a variant per component.

**Two side effects, both bounded.** While the wrapper carries a transform it is the containing block for
its `position: fixed` descendants, and the glass menu is one of them (`wrapper.contains(sheet)` is `true`):
opening the menu 120 ms after a `history.back()` put the veil at `y 3, bottom 847` in an 844 px viewport
(`y 0, bottom 844` once the entry finished), and the sheet's own 16 px drift adds to the wrapper's current
offset (top 658 → 642). Leaving `/check` at `scrollY 400` lands at 0 because the browser clamps as the
shorter view replaces the taller one — no scroll API is called, and scroll restoration between two
scrollable views is E5-S1's.

## The quiet states — measured (E3-S4)

`components/QuietState.tsx` holds the three treatments, `SplashView` chooses one of `loading | ready |
empty | error`, and DESIGN-SYSTEM §7 carries the rules. jsdom answers none of the questions below — no
`getAnimations`, no `matchMedia`, and this suite loads no stylesheet — so the unit tests pin the
vocabulary (classes, words, tokens, the retry issuing a request) and the pixels were measured on the
built bundle in headless Chromium 152 at 390 × 844, same stub mechanism as above.

**Loading is a pulse, not a spinner.** A full-bleed `--aura-surface` wash at opacity 0.25 carries
`aether-breathe` (2400 ms). Over 2.6 s: 26 frames, 24 distinct opacities, **0.250008 → 0.999961**; the
painted centre moved rgb(18,18,21) → rgb(13,13,14). `document.getAnimations()` reported one running
animation; `[role=progressbar]` count **0**. Under `Emulation.setEmulatedMedia`
`prefers-reduced-motion: reduce`: a single value (**0.250**), `animation-duration: 1e-05s`, and the
animation **never starts** — reviewed and corrected: `getAnimations()` still returns **one** animation, but
it is `pending` with `startTime: null`, not "0 running". The class carries no `motion-enter` marker, so
§11's global freeze leaves the still frame.

**Empty is one sentence.** Painted: "Your archive is empty for now." in Playfair Display, 19.035 px,
glyph `rgb(229,227,224)` on base `rgb(11,11,13)` — **15.35:1**. No pulse, no retry; the tap target is
still there.

**Error is a notice over the photo, not instead of it.** Driven through a real pull whose second request
404s (`error-photo` in the stub): request count 1 → 2, the first photo still painted (`naturalWidth`
1200, blob `src`), `data-state="error"`, notice `position: absolute`. Over the white half of the photo
the painted panel `rgb(50,59,66)` carries glyphs `rgb(197,211,221)` at **7.47:1** (message and retry
both); the same glyph in `--aura-muted` would composite to **3.92:1**, which is why §2.2 forbids it.
Over the dark half: panel `rgb(3,4,7)`, **13.41:1** (muted 5.39:1). The retry measures 83.5 × 44 px.
Keyboard: one `Tab` lands on "Try again" with `:focus-visible` true and a 1 px outline; `Enter` raised
the request count 2 → 3. Reduced motion is a CSS media query, not a JS branch — `matchMedia` is never
called.

**Placement survives the route entry.** Measured with a script injected before navigation: across 53
frames the wrapper carried `translateY(16px → 0)`; `notice.bottom − main.bottom` was **−16 px in every
frame** (the first frame had no notice — the state was still `loading`). Because the notice is `absolute`
against `<main>`, the transform that re-anchors fixed descendants (E3-S3's menu, §5) has nothing to
re-anchor. No portal was added.

Captures at 390 × 844: `reports/e3s4-loading-390.png`, `reports/e3s4-empty-390.png`,
`reports/e3s4-error-390.png`, `reports/e3s4-error-over-dark-390.png`.

## The accessibility pass — measured (E3-S5)

Scope: the splash's four states and the glass menu. jsdom + RTL settle roles, names, the focus trap,
`Esc` and the focus return; axe settles structure; Chromium settles what neither can — the `inert`
effect, painted contrast, and layout at 320/390/430 px. Everything below was run against the built
bundle served by the same stub as the sections above, in Chromium 152 headless.

### axe-core: dev-only, and absent from `dist/`

```bash
npm ls axe-core --all                          # └── axe-core@4.14.0
npm pkg get devDependencies.axe-core            # "4.14.0"
node -e "… axe-core/package.json …"             # dependencies: null, license: MPL-2.0
du -sh node_modules/axe-core                   # 3.4M
ls -l node_modules/axe-core/axe.min.js         # 636.9K
gzip -c node_modules/axe-core/axe.min.js | wc -c   # 182586
grep -rl "axe-core" dist/                      # no match
grep -rl "axe.run" dist/                       # no match
```

`axe-core` directly, not a wrapper: the registry reports `vitest-axe@0.1.0` with six dependencies
(its own `axe-core`, `lodash-es`, `aria-query`, `dom-accessibility-api`, `chalk`, `redent`) and
`jest-axe@11.0.0` with four, against none here. The whole integration is `src/test/axe.ts` — run,
violation summary, rule bucket — which is smaller than what a wrapper would add. MPL-2.0, unmodified,
dev-only, never shipped: the production bundle is built from `src/` without `test/`, and both markers
are absent from it.

**The threshold: zero violations at every impact** — not "no serious ones". The four splash runs
(loading/ready, empty, error, menu open) and the menu's run each assert an empty list, so a `moderate`
or `minor` finding added later fails rather than being waved through. Today they find none. What the
green run does **not** prove: jsdom has no layout, no paint and no canvas, so `color-contrast` is
returned **incomplete** on the splash (`impact: serious`) and **inapplicable** on the menu. Those
buckets are asserted, so an axe upgrade that starts answering — or stops running the rule — is
visible. Contrast itself is proved by the token arithmetic in `SplashView.test.tsx` /
`GlassMenu.test.tsx` and by the painted pixels below.

### `inert` on what the dialog covers — decided, measured

Decision: the splash's `<main>` carries `inert={menuOpen}`, and the dialog stays its **sibling**
(`features/menu/GlassMenu.tsx`). Chromium, menu open at 390 × 844, `Accessibility.getPartialAXTree`:

```json
menuClosed.trigger        {"role":"button","name":"Open the menu","ignored":false}
withInert.trigger         {"role":"none","ignored":true,"ignoredReasons":["inertElement"]}
withInert.main            {"role":"none","ignored":true,"ignoredReasons":["inertElement"]}
withInert.dialog          {"role":"dialog","name":"Menu","ignored":false}
withInert.focus           {"activeTag":"A","activeText":"The River","isTrigger":false}
withoutInert.trigger      {"role":"button","name":"Open the menu","ignored":false}
withoutInert.focus        {"activeTag":"BUTTON","activeLabel":"Open the menu","isTrigger":true}
withoutInertOrAriaModal   {"role":"button","name":"Open the menu","ignored":false}
dialogNestedInert.dialog  {"role":"none","ignored":true,"ignoredReasons":["inertElement"]}
afterClose                {"inert":false,"dialogs":0,"activeTag":"BUTTON","activeLabel":"Open the menu","expanded":"false"}
```

Reading: `inert` is what removes the covered surface — with it, the trigger and `<main>` are `ignored`
with the browser's own reason `inertElement`, while the dialog stays exposed, and a programmatic
`.focus()` on the trigger is a no-op (focus remains on the dialog's first link). Remove `inert` — and
`aria-modal` too — and the same trigger is exposed and focus reaches it, so this is not `aria-modal`
doing the work silently. Moving the dialog _inside_ `<main>` while inert shows the sibling structure is
load-bearing: the dialog itself becomes `ignoredElement`. Closing removes the attribute and unmounts
the dialog; focus lands back on the trigger (`afterClose` above). jsdom implements neither the property
nor the effect, so the suite pins the attribute, the sibling relationship and the focus return; this
probe is the effect.

Method note, because the first cut was wrong: removing `inert`, focusing and restoring it inside one
`Runtime.evaluate` made the following AX query measure the restored state — the "without inert" row
still said `inertElement`. The measurements above keep the attribute off across the query and restore
it afterwards. An accepted fact has to be measured in the state that produced it.

### The quiet states' announcement — decided, measured

Decision: **one persistent region**, not `role="status"` on the sentences. Measured in Chromium: at
`ready` the region exists with `textContent === ""`; after a failed re-roll it is the **same DOM node**
(`sameNode: true`) with `textNow: "Couldn't load a photo."`, equal to the visible sentence. The
accessibility tree contains `[{"role":"status","name":""}]` plus **two** `StaticText` copies of the
sentence — the visible paragraph and the hidden region. The empty state behaves identically
(`statusText` equals the visible words). The trade is that duplicate: one message seen twice in browse
mode, not two messages. A region inserted together with its text is the pattern live regions do not
reliably announce; that is why the visible sentences are ordinary paragraphs and a test pins the two
copies' words equal.

### Painted contrast, per text style

Method: screenshots of the built bundle, each text rectangle from `Range.getClientRects()`, the
brightest glyph pixel inside it against a 5 × 5 median of the panel, WCAG 2.x relative luminance.

| Surface / text                                                | Painted panel   | Glyph              | Ratio       |
| ------------------------------------------------------------- | --------------- | ------------------ | ----------- |
| Menu entries over white, fallback theme (19.035 px)           | `rgb(50,50,51)` | `rgb(232,230,227)` | **10.28:1** |
| Menu entries over white, theme from the dark half (19.035 px) | `rgb(45,53,60)` | `rgb(198,211,221)` | **8.16:1**  |
| Error message over white, theme from the dark half (15.5 px)  | `rgb(45,53,60)` | `rgb(198,211,221)` | **8.16:1**  |
| Retry "Try again" over white, same notice (13.225 px)         | `rgb(45,53,60)` | `rgb(198,211,221)` | **8.16:1**  |
| Empty sentence on the base (19.035 px, Playfair Display)      | `rgb(11,11,13)` | `rgb(232,230,227)` | **15.79:1** |

The sampler's first error-notice read was wrong, and the reason is worth keeping: the fixed sample
point at (368, 772) falls in the panel's rounded corner and returned the white photo through it
(`rgb(103,109,116)` → 3.43:1). Six interior points — (200,772), (200,780), (100,772), (300,772),
(200,822), (60,772) — all return `rgb(45,53,60)` → **8.16:1**. The menu's panel sample at (195,646) is
interior. The arithmetic controls are in the component tests; the painted values are the browser's.

### Keyboard path and retry, end to end

Measured on the built bundle with real key events:

```text
Tab from the page        → BUTTON "Open the menu"
Enter                    → menu opens, focus on A "The River"
Tab                      → A "Curate"
Tab                      → BUTTON "Close"
Tab                      → A "The River"   (wraps)
Shift+Tab from The River → BUTTON "Close"
Tab, Enter               → /river, heading "The River", dialog count 0
```

The retry: one `Tab` lands on "Try again" (`:focus-visible` true, 1 px outline, 83.5 × 44 px);
`Enter` raised the stub's request count 11 → 12.

### Layout at 320, 390 and 430 px

- Splash: the tap target is exactly the viewport at each width (320 × 800, 390 × 844, 430 × 800), no
  horizontal overflow, `scrollHeight` equals the viewport height.
- Menu at 390: sheet `x16 y642 358 × 186`, bottom 828 inside 844; entries 340 × 56 px — the 44 px
  floor cleared by 12 px. At 320: `288 × 186` at `y598`, entries 270 × 56; at 430: `398 × 186` at
  `y598`, entries 380 × 56. `fits` is true on all three axes at all three widths.
- Captures: `reports/e3s5-splash-320.png`, `e3s5-splash-390.png`, `e3s5-splash-430.png`,
  `e3s5-menu-390.png`, `e3s5-menu-over-white-390.png`, `e3s5-menu-over-half-390.png`,
  `e3s5-empty-390.png`, `e3s5-empty-contrast-390.png`, `e3s5-error-over-white-390.png`.

### Network, re-measured with this build

`performance.getEntriesByType("resource")` on a loaded splash: **7 entries, all same-origin** — the
JS/CSS chunks, the Inter face, `/api/v1/photos/random` and `/images/photo.png`; `offOrigin: []`. The
`dist/` URL audit is unchanged: 18 `www.w3.org` namespace strings, 2 `react.dev`, 2 `localhost`, 1
`reactrouter.com`, and no request behind any of them.

### What this pass does not cover

- axe in jsdom cannot judge contrast, focus visibility or animation; the buckets are asserted, not the
  verdicts.
- A real screen reader was not driven. The persistent region, its changed text and its AX exposure are
  verified; the **announcement itself** (whether a reader speaks it) is not. The duplicate-words trade
  is recorded above.
- `inert` is measured in Chromium 152. A browser without it ignores the attribute and keeps E3-S2's
  focus trap and veil, which the suite pins.
- Drag-and-drop's keyboard path belongs to E4-S3, not to this story.
- `app/RouteFallback.tsx` still mounts `role="status"` together with its "Loading view" text — the
  same insert-with-text pattern this story replaced on the splash. It is outside the two screens this
  pass covers and is unchanged; it needs the same decision in the story that owns the route shell.

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
these stories: `docs/scrum/DECISION-LOG.md` ADR-014 and ADR-015 (E2-S1), ADR-016 (E2-S2), ADR-021 (E3-S1),
ADR-022 (E3-S3).
