# Frontend — React + Vite + TypeScript

Scaffolded in Sprint 2 (**E2-S1**). The toolchain runs end to end; the app shell is E2-S2, the design
tokens E2-S3. Structure targets `docs/engineering/ARCHITECTURE.md` §6, styling rules
`docs/engineering/DESIGN-SYSTEM.md` and `.claude/rules/frontend.md`.

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

Not installed on purpose yet: React Router, TanStack Query, Framer Motion, `@dnd-kit` (E2-S2+, one story
each), Fontsource packages (E2-S5). A dependency lands with the story that needs it.

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
    ├── app/              App shell (E2-S2 replaces the placeholder) + its test
    ├── features/         README.md only — splash/ menu/ river/ workshop/ arrive in E2-S2+
    ├── components/       README.md only — GlassPanel and shared primitives (E2-S6)
    ├── lib/              README.md per folder (color/ image/ motion/) — pure TS, no React
    ├── api/              README.md only — typed client + query keys (E2-S2)
    ├── hooks/            README.md only — reusable hooks
    ├── types/            README.md only — mirrors _docs/openapi.yml
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
  among them. When E2-S2 adds the async API client, enabling type-aware linting is the option; measure
  the lint-time cost before switching the whole config.
- **Tailwind v4 scans this file**: its automatic source detection walks the project root, so README prose
  generates utilities (the word "static" shipped `.static{position:static}`). Scoping is E2-S3's — ADR-014.

## Test environment — measured 2026-10-16, not assumed

`document.createElement("canvas").getContext("2d")` and friends, run inside the E2-S1 test process
(jsdom 30.1.3) and, for comparison, inside the system Chromium:

| Probe                          | jsdom 30.1.3 (Vitest)                                                                                              | Chromium 152 (headless)                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `canvas.getContext("2d")`      | **`null`** + `Not implemented: HTMLCanvasElement's getContext() method: without installing the canvas npm package` | `CanvasRenderingContext2D`                                                                                     |
| `ctx.getImageData(0,0,4,4)`    | n/a (no context)                                                                                                   | `ImageData`, 64 bytes                                                                                          |
| `new OffscreenCanvas(1,1)`     | **`ReferenceError: OffscreenCanvas is not defined`**                                                               | works, `getContext("2d")` returns an object                                                                    |
| `typeof createImageBitmap`     | `undefined`                                                                                                        | `function`                                                                                                     |
| `typeof ImageData`             | `undefined`                                                                                                        | `function` (a canvas probe constructed one)                                                                    |
| `typeof Image`                 | `function`                                                                                                         | not probed                                                                                                     |
| `typeof matchMedia`            | **`undefined`**                                                                                                    | `function` — `matchMedia("(prefers-reduced-motion: reduce)").matches` → `false`, `(…: no-preference)` → `true` |
| `typeof requestAnimationFrame` | `function`                                                                                                         | not probed                                                                                                     |

Consequences for E2-S4 (its ADR decides, this is the evidence): the colour pipeline cannot be exercised
through a real canvas in jsdom. The options are to test the pure functions over `ImageData`-shaped plain
objects, to add a canvas implementation (the `canvas` npm package is a native build; a browser-mode runner
is a second test runtime), or to keep the decode step behind an injected port. `matchMedia` being absent
also matters for the `prefers-reduced-motion` hooks in E2-S6: there the query has to be stubbed, whereas
Chromium answers it for real (headless reports no reduced-motion preference unless asked otherwise).

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

Rules: `.claude/rules/frontend.md` · design language: `.claude/rules/design-language.md` · decisions of this
story: `docs/scrum/DECISION-LOG.md` ADR-014 (Tailwind v4, CSS-first) and ADR-015 (TypeScript 6.0.3).
