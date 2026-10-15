---
name: design-system
description: Implement or extend the visual foundation — dominant-colour extraction from uploaded images, the Dark Glassmorphism theme generated from those hues, and the Fontsource typography. Use for colour, theme, glass, or typography work in the frontend.
allowed-tools: Read, Write, Edit, Grep, Glob, Bash
---

# Design system — extraction, theme, typography

The mandate (user requirement, do not substitute):

> Use local tooling to design a **dominant-colour extraction algorithm** over uploaded images and
> generate a **"Dark Glassmorphism" CSS theme** based on those hues.
>
> Select an **elegant serif** for Dump titles and a **clean sans-serif** for the glass UI menus.
> Install them strictly locally via **Fontsource NPM packages** so the application runs with **zero
> external network requests**, and wire the **typographic variables into the global CSS file**.

Read `docs/engineering/DESIGN-SYSTEM.md` (tokens, scales, targets) and `.claude/rules/design-language.md`
(hard rules) before starting. The full-mandate paragraphs above are the acceptance criteria, not suggestions.

## Part A — Colour extraction (story E2-S4)

Deliverables in `frontend/src/lib/color/` (pure TypeScript, no React):

| File | Responsibility |
| --- | --- |
| `downscale.ts` | Draw the image on an OffscreenCanvas/documentCanvas at ≤ 64 px on the long edge; return `ImageData`. Handle EXIF orientation and non-image files with a typed error. |
| `quantize.ts` | Cluster the pixels in **OKLCH** (convert sRGB → linear → OKLab → OKLCH). Implement the clustering yourself (weighted k-means with k-means++ seeding, or median-cut). No dependency without an ADR. |
| `score.ts` | Drop near-black (L < 0.12) and near-white (L > 0.95) clusters; rank by `weight × (0.5 + chroma) × midLightnessBonus`; merge perceptually identical clusters (ΔE < 0.02). |
| `palette.ts` | Public API: `extractPalette(blob: Blob): Promise<Palette>` → 5–8 `{ hex, oklch, weight, role }`. |
| `theme.ts` | `paletteToTheme(palette): ThemeTokens` — map to semantic roles and enforce contrast. |

Rules:

- **Deterministic**: same input → same palette (fixed seed / stable sort with tie-breakers).
- **Fast**: < 50 ms for a 64 px downscale on a mid-range phone; no main-thread blocking over 50 ms.
- **Offline**: nothing leaves the browser; no API, no worker fetching, no library CDN.
- **Tested**: fixtures under `frontend/src/lib/color/__fixtures__/` with expected palettes
  (tolerance-based assertions, not exact float equality). Cover: photo with a dominant hue, low-saturation
  photo, black-and-white photo, transparent PNG, corrupted file.
- Record the algorithm choice in an ADR (k-means vs median cut) with the measured numbers from the fixtures.

## Part B — Dark Glassmorphism theme generated from the palette (stories E2-S3, E3-S3)

- Semantic tokens applied to `document.documentElement` at runtime:
  `--aura-bg`, `--aura-surface`, `--aura-glass`, `--aura-hairline`, `--aura-text`, `--aura-muted`,
  `--aura-accent`, `--aura-accent-contrast`.
- Recipe: `--aura-glass: rgba(0,0,0,0.4)` over `--aura-bg`; `backdrop-filter: blur(15px)`;
  hairline `1px solid rgba(255,255,255,0.08)`; surfaces stepped in lightness (no opaque cards).
- **Contrast enforcement**: `--aura-text` on `--aura-bg` and on glass ≥ 4.5:1 (4.5 for small text,
  3:1 for ≥ 24 px display). If the extracted palette fails, lighten/darken in OKLCH until it passes —
  never ship unreadable text.
- **Fallback**: a neutral, hand-tuned palette when extraction fails (unsupported file, canvas error).
- The River sets `--aura-bg` from the in-view dump's `backgroundColor` with a ≥ 600 ms transition;
  the Workshop previews the theme live while the user picks the aura colour.
- One glass primitive component (`GlassPanel`), with a solid-tint fallback when `backdrop-filter`
  is unsupported. Every colour in components reads from `--aura-*` — no hex literals in components.

## Part C — Typography, strictly local (story E2-S5)

1. Choose a pair (record as an ADR before installing): display serif from
   **Playfair Display** (default), Cormorant Garamond, Fraunces; UI sans from
   **Inter variable** (default), Work Sans, Manrope.
2. Install **Fontsource packages only** — never a Google Fonts link, never a CDN:

   ```bash
   npm install @fontsource/playfair-display @fontsource-variable/inter
   ```

3. Import in the frontend entry file so Vite self-hosts and hashes the assets (no manual copying):

   ```ts
   import "@fontsource/playfair-display/400.css";
   import "@fontsource/playfair-display/500.css";
   import "@fontsource-variable/inter/wght.css";
   import "./styles/global.css";
   ```

4. Declare the variables in `frontend/src/styles/global.css` (the global stylesheet the user asked for):

   ```css
   :root {
     --font-display: "Playfair Display", Georgia, "Times New Roman", serif;
     --font-ui: "Inter Variable", system-ui, -apple-system, "Segoe UI", sans-serif;
     --text-xs: 0.75rem; --text-sm: 0.875rem; --text-base: 1rem;
     --text-lg: 1.25rem; --text-xl: 1.75rem; --text-2xl: 2.5rem;   /* clamp() for fluid sizing */
   }
   ```

5. Apply: Dump titles and month/year markers use `--font-display` (weights 400/500, tight tracking);
   the glass menu and all UI text use `--font-ui`. No component declares a raw `font-family`.

Verification for part C: `npm run build` succeeds, the built output contains the font files,
and a network log of a loaded page shows **zero external requests** (assert in the QA pass and in
`reports/`). Subset weight: total added font payload < ~200 KB.

## Completion checklist

- [ ] Extraction algorithm implemented, deterministic, documented, and unit-tested with fixtures.
- [ ] Theme generated from the palette, contrast-checked, with a neutral fallback.
- [ ] Fontsource pair installed, imported in the entry file, variables in `global.css`, no CDN anywhere.
- [ ] `npm run lint`, `npm run test -- --run`, `npm run build` all green; evidence in the PR.
- [ ] ADR(s) recorded in `docs/scrum/DECISION-LOG.md`; `docs/engineering/DESIGN-SYSTEM.md` updated with
      the final tokens and the chosen pair.
