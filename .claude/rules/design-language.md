---
paths:
  - "frontend/src/styles/**"
  - "frontend/src/components/**"
  - "frontend/src/features/**"
  - "frontend/**/*.css"
---

# Design language — editorial archive (loaded for UI files)

Full specification: `docs/engineering/DESIGN-SYSTEM.md`. Procedure to implement or extend it:
`.claude/skills/design-system/SKILL.md`. **Inspiration to consult at the start of every UI story:
`docs/engineering/DESIGN-REFERENCES.md`** (fetch 2–3 references, extract principles, cite them in the
PR; development-time only — nothing from them is ever loaded or requested at runtime).

## Current look — 2026-10-22 recalibration

The four views were recast as an **editorial print object**: ink/paper tokens, full-bleed photography,
Cormorant Garamond display, Manrope UI, small-caps kickers, hairline rules, CSS-numbered slots, a
restrained grain. The menu is a paper index sheet on mobile and a right-hand editorial column on
desktop. Glass is history; the image-derived aura remains the only colour source, and the tested
accessibility/text contracts must not change. Implementation: `frontend/src/styles/global.css`,
`frontend/src/styles/editorial.css`, `frontend/src/components/ArchiveBar.tsx`. The older "soft &
modern / glass" notes below remain for the extraction, typography, motion and anti-pattern rules.
Hard rules:

## The original brief: soft & modern

- **Soft** — low-contrast elegance: never pure black or pure white (base `#0B0B0D`–`#121215`, text
  `#E8E6E3`); muted, desaturated accents; generous negative space; rounded organic geometry
  (panels 20–24 px, controls 10–14 px); at most one wide low-opacity shadow; calm motion
  (transitions 300–600 ms, micro-feedback 180 ms); one focal element per view.
- **Modern** — fluid `clamp()` typography, one consistent glass material over imagery only, ambient
  colour derived from the content in view, tactile micro-interactions without overshoot, mobile-native
  feel (safe areas, `100dvh`, thumb-reachable controls).
- **Reject on sight**: neon or saturated accents, stacked shadows, borders on everything, cards in cards,
  bento clichés, gradient blobs, emoji as icons, badges/counters/upsells, text over a busy photo without
  a scrim, animation the user did not trigger.
- Before a PR, answer §1.4 of `DESIGN-REFERENCES.md` (calm in a dim room? one focal point? holds with a
  pale/dark/busy photo? emptier and better with one element removed?).

## Aesthetic contract

- **Images first, chrome subordinate.** The ArchiveBar is the one persistent chrome element: a single
  hairline row (wordmark, three destinations, counts) that stays out of the photograph's way. No other
  persistent header, footer, navbar, borders, cards or chrome.
  The only text on screen is intentional: month/year markers and Dump titles.
- **One surface system** (current): flat ink-on-paper chrome, paper panels, hairline rules and the
  archive's aura as the field; photography is the material, never a card. The tint follows the text;
  `themeFromBackground` owns the arithmetic. The historical glass recipe (dark tint `rgba(0,0,0,0.4)`,
  `backdrop-filter: blur(15px)`) remains in the token history and ADR-023, not as the current look.
  No heavy drop shadows, no neon, no decorative gradients, no emoji in the UI.
- **Motion is soft and tactile**: fade + small upward drift (12–16 px; transitions 300–600 ms,
  micro-feedback 180 ms), `cubic-bezier(0.22, 1, 0.36, 1)`. No bounce, no attention-seeking loops,
  `prefers-reduced-motion` respected.
- Empty and loading states are silent: opacity pulse or a blurred dominant-colour placeholder,
  never a labelled spinner.

## Colour — derived from the images

- The theme is **generated from the user's own photos**, not hardcoded:
  - **Dominant colour extraction**: implement the algorithm locally in TypeScript
    (`frontend/src/lib/color/`), on downscaled bitmap data. Requirements:
    - input: an uploaded `File`/`ImageBitmap`; output: 5–8 ranked colours with weights,
    - work in a perceptual space (OKLCH) — not raw RGB averaging,
    - ignore near-black/near-white pixels and low-information clusters,
    - deterministic for the same input (stable seeds), and fast (< 50 ms for a 64 px downscale),
    - unit-tested against fixture images with expected palettes.
  - **Theme generation**: map the palette to semantic CSS custom properties
    (`--aura-bg`, `--aura-surface`, `--aura-glass`, `--aura-text`, `--aura-muted`, `--aura-accent`)
    and apply them at runtime on the document root. Every colour in the UI reads from these variables.
  - **Guarantees**: contrast-checked (text ≥ 4.5:1 on its background), monotonic lightness for
    surfaces, and a neutral fallback palette when extraction fails.
- The River drives `--aura-bg` from the `backgroundColor` of the dump currently in view; the
  transition between dumps is smooth (≥ 600 ms) and interruptible (no jank while scrolling).
- The Curator's Workshop shows the extracted palette as tappable "aura" suggestions next to the
  colour picker, with a live preview of the resulting glass theme.

## Typography — local, elegant, zero network

- **Serif for titles** (Dump titles, month/year markers) and **sans-serif for the UI/menu**.
- Fonts are installed **strictly as Fontsource NPM packages** (`@fontsource/<font>` or
  `@fontsource-variable/<font>`) and imported from the frontend entry point so Vite self-hosts them.
  Google Fonts, CDN `<link>`s and any runtime font request are forbidden.
- Typographic variables live in the global stylesheet (`frontend/src/styles/global.css`):
  `--font-display`, `--font-ui`, plus the scale `--text-xs … --text-2xl`, weights and tracking.
  Components use the variables (or Tailwind theme aliases) — never a raw `font-family`.
- Baseline choice (record the final pick as an ADR before implementing): **Playfair Display**
  (`@fontsource/playfair-display`) for display, **Inter** (`@fontsource-variable/inter`) for UI.
  Alternatives allowed by the spec: Cormorant Garamond, Fraunces (display); Work Sans, Manrope (UI).
  The chosen pair must have a Fontsource package, ship latin subsets, and keep total added weight
  under ~200 KB.
- Weights: display 400/500 (never bold-heavy), UI 300/400/500. Tracking tight on display,
  slightly open on small UI text. `font-display: swap` semantics via Fontsource defaults.
