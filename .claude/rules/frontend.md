---
paths:
  - "frontend/**"
---

# Frontend rules — React + Vite + Tailwind (loaded for frontend/**)

## Layout (`frontend/src/`)

```
app/         routing (React Router), providers (QueryClient), App shell
features/    river/  workshop/  splash/  menu/    — one folder per product view
components/  shared primitives (GlassPanel, TapTarget, QuietButton, ...)
lib/         pure TypeScript (color/, image/, motion/), no React imports
hooks/       reusable hooks
api/         typed API client + TanStack Query hooks
types/       shared types mirroring _docs/openapi.yml
styles/      global.css (tokens + base), theme.css, glass.css
```

- TypeScript strict, no `any`, no non-null assertions without a comment. Props typed, exported types
  for public components.
- Pure logic (color extraction, ordering, palette scoring) lives in `lib/` and is unit-tested
  without React. Components stay declarative.
- Server state via TanStack Query (keys in `api/queryKeys.ts`); never duplicate server state in
  `useState`. Local UI state stays local to the component.
- No barrel files (`index.ts` re-export chains) beyond one level.

## Rendering & performance (mobile-first)

- Target: a mid-range phone on the LAN. Budget: first paint < 1.5 s, interaction < 100 ms,
  no layout shift when images load.
- Images: always `loading="lazy"` (except the splash hero), `decoding="async"`, explicit width/height
  or aspect-ratio, `sizes`/`srcset` when thumbnails exist. Preload only the splash hero.
- Long feeds: window/virtualise once a view exceeds ~200 nodes; measure before optimising and record
  the decision in an ADR.
- No blocking work over 50 ms on the main thread; move heavy loops (color extraction) off the render
  path (Web Worker when a story demands it).
- Respect `prefers-reduced-motion` everywhere motion is used.
- Touch: hit targets ≥ 44×44 px, `touch-action` set correctly, safe-area insets honoured
  (`env(safe-area-inset-*)`), `100dvh` instead of `100vh`.

## Code conventions

- Function components + hooks. No class components. No `useEffect` for data fetching.
- Effects only for real side effects (event listeners, observers) with cleanup functions.
- Errors: every query has an error path; the UI shows a quiet state, never a browser alert or raw stack.
- Lint/format: ESLint + Prettier (scaffolded in Sprint 2). `npm run lint` must be clean before a PR.
- Keep the bundle lean: every dependency needs a one-line justification (see `security` rules).
  No UI kit, no icon package when an inline SVG suffices.

## Accessibility (AA target)

- The glass menu traps focus, closes with `Esc`, and returns focus to the trigger.
- All interactive elements are real buttons/links with accessible names.
- Dialogs use `role="dialog"` + `aria-modal`; the drag-and-drop grid must expose a keyboard path
  (arrow keys or an explicit "move" control), not touch only.
- Text over the glass overlay or over images always sits on a scrim guaranteeing ≥ 4.5:1 contrast.

## Styling

- Tailwind utilities first; extract a component/`@apply` only after the third repetition.
- Theme values come from CSS custom properties generated from the active palette
  (`--aura-*`, `--font-*`) — see `.claude/rules/design-language.md` and
  `docs/engineering/DESIGN-SYSTEM.md`. Never hardcode a hex value in a component.
- One glass primitive (`GlassPanel`): `backdrop-filter: blur(15px)` + `rgba(0,0,0,0.4)`; on browsers
  without `backdrop-filter` fall back to a solid tint — never leave text unreadable.

## Testing

- Vitest + React Testing Library. Test user behaviour, not internals. Fixtures for palettes and API
  payloads live in `frontend/src/**/__fixtures__/`.
