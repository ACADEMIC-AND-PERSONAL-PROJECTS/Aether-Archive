# Design System — Dark Glassmorphism & image-derived colour

> **The mandate** (user requirement, verbatim — treat as acceptance criteria, not inspiration):
>
> 1. *"Use local tooling to conceive a dominant-colour extraction algorithm over the uploaded images,
>    and generate a `Dark Glassmorphism` CSS theme based on those hues."*
> 2. *"Select an elegant serif for the Dump titles and a clean sans-serif for the glass UI menus.
>    Install them strictly locally via Fontsource NPM packages so the application runs with **zero
>    external network requests**, and configure the typographic variables in the global CSS file."*
>
> The implementation procedure lives in `.claude/skills/design-system/SKILL.md`.

## 1. Principles

1. **Images are the interface.** Chrome disappears; type appears only where it carries meaning.
2. **Colour comes from the user's photos.** No hardcoded brand palette; the app takes on the mood of the
   images it holds.
3. **One material, used consistently.** Glass is the single surface; it never becomes a card, a shadow or a border.
4. **Motion is breath, not spectacle.** Fade and drift; never bounce, never loop, never demand attention.
5. **Zero external requests.** Fonts, icons, images: local. A request leaving the machine is a bug.

## 2. Colour

### 2.1 Extraction pipeline (client-side, offline)

```text
Uploaded image
  → decode + EXIF orientation
  → downscale to ≤ 64 px (long edge)              ── ~1 ms
  → sample pixels into linear-light sRGB
  → convert to OKLab → OKLCH                      ── perceptual space, not RGB
  → weighted clustering (k-means++ / median cut)  ── deterministic ordering
  → score & filter:
       drop L < 0.12 (near-black) and L > 0.95 (near-white)
       merge clusters with ΔE < 0.02
       rank by weight × (0.5 + C) × midLightnessBonus(L)
  → Palette: 5–8 × { hex, oklch, weight, role }
```

Roles derived per image: `background` (the darkest useful mid-chroma), `surface`, `accent` (highest
`weight × C`), `text`, `muted`, plus `accentContrast` (black or white, whichever passes contrast).

Requirements: deterministic for identical input, < 50 ms budget for a 64 px downscale, no network, no
main-thread block over 50 ms, unit-tested with fixtures. Clustering choice (k-means++ vs median cut) is
decided with measured numbers in an ADR during E2-S4.

### 2.2 Semantic tokens

All UI colour is read from CSS custom properties applied to `:root` at runtime:

| Token | Role |
| --- | --- |
| `--aura-bg` | The page background (per-view; a dump's `backgroundColor` in the river) |
| `--aura-surface` | Opaque-ish base for content that must not be translucent |
| `--aura-glass` | The glass tint — default `rgba(0, 0, 0, 0.4)` |
| `--aura-hairline` | `1px solid rgba(255, 255, 255, 0.08)` highlight edge |
| `--aura-text` | Primary text |
| `--aura-muted` | Secondary text / quiet labels |
| `--aura-accent` | Interactive emphasis (links, active swatch) |
| `--aura-accent-contrast` | Text colour guaranteed to sit on `--aura-accent` |

Rules: contrast of `--aura-text` on `--aura-bg` and on glass ≥ **4.5:1** (≥ 3:1 only for text ≥ 24 px);
monotonic lightness for surfaces; **neutral fallback palette** for extraction failures. A hex literal
outside the theme layer is a review blocker.

### 2.3 Where colour changes

- **Splash**: background = blurred dominant tone of the hero photo (instant, no flash).
- **River**: `--aura-bg` follows the dump currently in view (`backgroundColor`), transition ≥ 600 ms, interruptible.
- **Workshop**: live preview of the chosen aura colour against the glass components.

## 3. Glass (the single material)

```css
.glass {
  background: var(--aura-glass);            /* rgba(0,0,0,0.4) over the aura background */
  backdrop-filter: blur(15px) saturate(1.2);
  -webkit-backdrop-filter: blur(15px) saturate(1.2);
  border: var(--aura-hairline);
  border-radius: 20px;                      /* generous, editorial */
}
```

- Exactly **one** glass primitive component (`GlassPanel`); everything else composes it.
- Fallback when `backdrop-filter` is unsupported: raise the glass opacity (≥ 0.72) so text stays readable.
- No drop shadows beyond a soft `0 8px 24px rgba(0,0,0,0.24)` when elevation must be communicated.
- Scrim rule: text over an image always sits on a gradient scrim or glass — never directly on pixels.

## 4. Typography

### 4.1 Pair

| Role | Font (baseline) | Package | Usage |
| --- | --- | --- | --- |
| Display serif | **Playfair Display** | `@fontsource/playfair-display` | Dump titles, month/year markers, empty-state sentences |
| UI sans | **Inter variable** | `@fontsource-variable/inter` | Glass menu, buttons, labels, numbers |

Allowed alternatives (must also exist as Fontsource packages): Cormorant Garamond, Fraunces (display);
Work Sans, Manrope (UI). The final pair is fixed by an ADR at E2-S5 and recorded here afterwards.

### 4.2 Installation (local only — no CDN, ever)

```bash
npm install @fontsource/playfair-display @fontsource-variable/inter
```

```ts
// frontend/src/main.tsx — imported BEFORE global.css so variables resolve
import "@fontsource/playfair-display/400.css";
import "@fontsource/playfair-display/500.css";
import "@fontsource-variable/inter/wght.css";
import "./styles/global.css";
```

### 4.3 Variables in the global stylesheet

```css
:root {
  --font-display: "Playfair Display", Georgia, "Times New Roman", serif;
  --font-ui: "Inter Variable", system-ui, -apple-system, "Segoe UI", sans-serif;

  --text-xs: clamp(0.72rem, 0.70rem + 0.10vw, 0.78rem);
  --text-sm: clamp(0.82rem, 0.79rem + 0.15vw, 0.90rem);
  --text-base: clamp(0.95rem, 0.92rem + 0.20vw, 1.05rem);
  --text-lg: clamp(1.15rem, 1.08rem + 0.45vw, 1.35rem);
  --text-xl: clamp(1.50rem, 1.35rem + 1.00vw, 2.00rem);   /* dump titles */
  --text-2xl: clamp(2.00rem, 1.70rem + 2.00vw, 3.20rem);  /* month markers */

  --tracking-display: -0.015em;
  --tracking-ui: 0.01em;
}
```

### 4.4 Rules

- Display: weights **400/500 only** (never bold-heavy), tight tracking, generous line-height (1.1–1.25).
- UI: weights 300/400/500, slight positive tracking on small sizes, line-height 1.4–1.6.
- No component declares a raw `font-family`; everything uses `--font-display` / `--font-ui`
  (or a Tailwind theme alias mapped to them).
- Added font payload budget: **< 200 KB** total; latin subsets only.

## 5. Motion

| Token | Value | Use |
| --- | --- | --- |
| `duration-quick` | 180 ms | micro-feedback (tap, hover, focus) |
| `duration-base` | 320 ms | menus, panels, reveals |
| `duration-slow` | 600 ms | route transitions, ambient background |
| `ease-soft` | `cubic-bezier(0.22, 1, 0.36, 1)` | everything by default |
| `distance-enter` | 12–16 px | vertical drift on entry |

- Route and overlay transitions: fade + drift; interruptible; no layout jump.
- `prefers-reduced-motion: reduce` → opacity-only transitions, no transforms, no auto-scroll animation.
- Nothing loops unless it communicates state (a subtle pulse for loading is the only exception).

## 6. Layout & rhythm

- Mobile-first; design at **390 px**, verify at 320 px and 430 px.
- Full height uses `100dvh`; safe-area insets respected (`env(safe-area-inset-*)`).
- Negative space is a feature: section spacing uses the 8 pt scale (`4 / 8 / 12 / 16 / 24 / 32 / 48 / 64`).
- No visible scrollbars; overscroll-behavior tuned so the app never shows a white band.
- The river is chronological: month/year markers in display serif, dumps as 6-image sections.

## 7. Quiet states

| State | Treatment |
| --- | --- |
| Loading | Opacity pulse, or a blurred dominant-tone placeholder for images. Never a labelled spinner. |
| Empty archive | One sentence in display serif on the dark base — no illustration, no CTA chrome. |
| Error | Discreet glass notice with a retry affordance; never a browser alert or raw message. |

## 8. Accessibility (non-negotiable)

- Contrast: ≥ 4.5:1 for text (≥ 3:1 for ≥ 24 px), enforced by construction in the theme generator.
- Focus visible and consistent; glass overlays trap focus, close on `Esc`, restore focus.
- Drag-and-drop has a keyboard path and announces moves; nothing is touch-only.
- Touch targets ≥ 44 × 44 px; no hover-only affordances.

## 9. Implementation map

| Concern | File(s) |
| --- | --- |
| Extraction | `frontend/src/lib/color/{downscale,quantize,score,palette}.ts` |
| Theme generation | `frontend/src/lib/color/theme.ts` |
| Tokens & typography | `frontend/src/styles/global.css` |
| Glass material | `frontend/src/styles/glass.css` + `components/GlassPanel.tsx` |
| Motion tokens | `frontend/src/lib/motion/` |
| Tests & fixtures | `frontend/src/lib/color/__fixtures__/`, `*.test.ts` |

## 10. How this is verified

- Fixture-based unit tests for extraction (deterministic palettes within tolerance).
- Contrast assertions in the theme generator tests (text/background pairs).
- A visual check page (or story) rendering all tokens, glass states and type styles, screenshot in the PR.
- Network panel check: **zero external requests** on a loaded page (also part of `verify`).
