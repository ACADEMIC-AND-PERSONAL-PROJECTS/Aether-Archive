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
>
> **The look — *soft and modern*:** low-contrast elegance (never pure black or white), muted
> desaturated accents, generous negative space, rounded organic geometry, single soft depth, calm
> motion, one focal point per view — with fluid type, adaptive transparency, ambient colour from
> content and tactile micro-interactions. Full definition, anti-patterns, review questions and the
> curated references to consult before UI work: **`docs/engineering/DESIGN-REFERENCES.md`**.

## 1. Principles

1. **Images are the interface.** Chrome disappears; type appears only where it carries meaning.
2. **Colour comes from the user's photos.** No hardcoded brand palette; the app takes on the mood of the
   images it holds.
3. **One material, used consistently.** Glass is the single surface; it never becomes a card, a shadow or a border.
4. **Motion is breath, not spectacle.** Fade and drift; never bounce, never loop, never demand attention.
5. **Zero external requests.** Fonts, icons, images: local. A request leaving the machine is a bug.
6. **Soft, modern, never loud.** Calm surfaces and muted colour; nothing shouts. Anything decorative
   rather than understood gets removed (pre-PR review questions: `DESIGN-REFERENCES.md` §1.4).

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
| `--aura-glass-solid` | The same tint at fallback opacity for engines without `backdrop-filter` — default `rgba(0, 0, 0, 0.72)` |
| `--aura-hairline` | `1px solid rgba(255, 255, 255, 0.08)` highlight edge |
| `--aura-text` | Primary text |
| `--aura-muted` | Secondary text / quiet labels |
| `--aura-accent` | Interactive emphasis (links, active swatch) |
| `--aura-accent-contrast` | Text colour guaranteed to sit on `--aura-accent` |

Rules: contrast of `--aura-text` on `--aura-bg` and on glass ≥ **4.5:1** (≥ 3:1 only for text ≥ 24 px);
monotonic lightness for surfaces; **neutral fallback palette** for extraction failures. A hex literal
outside the theme layer — `lib/color/theme.ts` plus this stylesheet's `:root` block (ADR-020) — is a
review blocker. **For a page whose aura the curator chose, the glass tint follows the text**
(`themeFromBackground`, ADR-023): black under light text, the inverse white tint with a dark hairline
under dark text; the defaults above remain the neutral set.

**A glass notice switches its token, because the generated theme is not the fallback theme.** Measured
(E3-S2): a notice over the menu's veil renders at **4.14:1** in `--aura-muted` — under §8's floor — and
**8.07:1** in `--aura-text`. The neutral fallback palette happens to clear it; a palette derived from a
photo does not. So anything that has to be read *through* glass uses `--aura-text`; `--aura-muted` stays
for quiet labels on an opaque surface. **This is a rule for every glass notice, not a menu detail:** the
quiet error notice (E3-S4) puts both its message and its retry in `--aura-text`, never `--aura-muted`.
Measured on painted pixels over a white photo behind the notice's own scrim: glyph on panel **7.47:1**;
the muted token would composite to **3.92:1** — below §8's floor. Over a dark photo the same pair is
13.41:1 (muted 5.39:1).

**Fallback values (the token layer's neutral set, E2-S3).** `--aura-bg #0b0b0d` · `--aura-surface
#121215` · `--aura-glass rgba(0, 0, 0, 0.4)` · `--aura-glass-solid rgba(0, 0, 0, 0.72)` ·
`--aura-hairline 1px solid rgba(255, 255, 255, 0.08)` ·
`--aura-text #e8e6e3` · `--aura-muted rgba(232, 230, 227, 0.62)` · `--aura-accent #b5a98f` ·
`--aura-accent-contrast #0b0b0d`. Contrast, measured (WCAG 2.x, E2-S3 report): text on bg **15.79:1**,
text on surface 15.01:1, text on glass-over-bg 16.20:1, muted on bg **6.40:1**, accent-contrast on
accent **8.46:1** — every pair ≥ 4.5:1 (§8).

### 2.3 Where colour changes

- **Splash**: background = blurred dominant tone of the hero photo (instant, no flash).
- **River**: `--aura-bg` follows the dump currently in view (`backgroundColor`), transition ≥ 600 ms, interruptible.
- **Workshop**: live preview of the chosen aura colour against the glass components.

## 3. Glass (the single material)

```css
.glass {
  background: var(--aura-glass);            /* rgba(0,0,0,0.4) over the aura background */
  -webkit-backdrop-filter: blur(15px) saturate(1.2);   /* prefix first — the bundler keeps the
                                                          last declaration of the pair (ADR-020) */
  backdrop-filter: blur(15px) saturate(1.2);
  border: var(--aura-hairline);
  border-radius: 20px;                      /* generous, editorial */
}
```

- Exactly **one** glass primitive component (`components/GlassPanel.tsx`); everything else composes it.
- **The tint is per theme.** The literals above are the neutral set; a curator-chosen page uses the
  tokens from `themeFromBackground` (ADR-023), which flips to the inverse white tint and dark hairline
  under dark text so the glass keeps carrying 4.5:1 text.
- Fallback when `backdrop-filter` is unsupported: the `@supports` branch in `glass.css` swaps
  `--aura-glass` for `--aura-glass-solid` (`rgba(0, 0, 0, 0.72)`) so text stays readable.
- No drop shadows beyond a soft `0 8px 24px rgba(0,0,0,0.24)` when elevation must be communicated.
- Scrim rule: text over an image always sits on a gradient scrim or glass — never directly on pixels.

## 4. Typography

### 4.1 Pair

| Role | Font (baseline) | Package | Usage |
| --- | --- | --- | --- |
| Display serif | **Playfair Display** | `@fontsource/playfair-display` | Dump titles, month/year markers, empty-state sentences |
| UI sans | **Inter variable** | `@fontsource-variable/inter` | Glass menu, buttons, labels, numbers |

Allowed alternatives (must also exist as Fontsource packages): Cormorant Garamond, Fraunces (display);
Work Sans, Manrope (UI). The pair above was **confirmed at E2-S5** — measured payload, weights and
why each alternative stayed on the shelf are in ADR-019. Replacing the pair is a new ADR, not a
silent edit.

### 4.2 Installation (local only — no CDN, ever)

```bash
npm install @fontsource/playfair-display @fontsource-variable/inter
```

```ts
// frontend/src/main.tsx — imported BEFORE global.css
import "@fontsource/playfair-display/latin-400.css";
import "@fontsource/playfair-display/latin-500.css";
import "./styles/global.css";
```

- The `latin-*.css` entrypoints: the latin subset is the only one the app can render (§4.4), and the
  import is what ships — each face brings one woff2 plus one legacy woff.
- **Inter Variable has no per-subset entrypoint** (every packaged CSS file carries all seven
  subsets; `wght.css` alone weighs 218.5 kB of woff2 — measured at E2-S5). Its packaged latin woff2
  is therefore declared as a single `@font-face` in `global.css`, block 2: one 48.3 kB file for the
  whole 100–900 axis, Vite-fingerprinted like any other asset.
- Measured added payload (E2-S5 report): **148.2 kB** in `dist/` — inside the budget. The
  all-subsets reading of the old snippet weighed 453.4 kB; all-static latin weighed 209.8 kB.

### 4.3 Variables in the global stylesheet

```css
/* The families are declared once, in the theme layer, so the utilities compile from the same
   declaration; `static` records that these values are fixed (emission is unconditional by
   construction — with the pinned Tailwind the output is identical either way, measured in the
   E2-S5 review). */
@theme static {
  --font-display: "Playfair Display", Georgia, "Times New Roman", serif;
  --font-ui: "Inter Variable", system-ui, -apple-system, "Segoe UI", sans-serif;
}

@theme {
  --text-xs: clamp(0.72rem, 0.70rem + 0.10vw, 0.78rem);
  --text-sm: clamp(0.82rem, 0.79rem + 0.15vw, 0.90rem);
  --text-base: clamp(0.95rem, 0.92rem + 0.20vw, 1.05rem);
  --text-lg: clamp(1.15rem, 1.08rem + 0.45vw, 1.35rem);
  --text-xl: clamp(1.50rem, 1.35rem + 1.00vw, 2.00rem);   /* dump titles */
  --text-2xl: clamp(2.00rem, 1.70rem + 2.00vw, 3.20rem);  /* month markers */

  --tracking-display: -0.015em;
  --tracking-ui: 0.01em;
}

body {
  font-family: var(--font-ui);
  letter-spacing: var(--tracking-ui);
}
```

### 4.4 Rules

- Display: weights **400/500 only** (never bold-heavy), tight tracking, generous line-height (1.1–1.25).
- UI: weights 300/400/500, slight positive tracking on small sizes, line-height 1.4–1.6.
- No component declares a raw `font-family`; everything uses `--font-display` / `--font-ui`
  (or a Tailwind theme alias mapped to them).
- Added font payload budget: **< 200 KB** total; latin subsets only. (Shipped at E2-S5: 148.2 kB,
  74% of the budget — ADR-019.)

## 5. Motion

One vocabulary, declared once as custom properties in `styles/global.css` and read from
`lib/motion/tokens.ts` (decision, alternatives and measurements: ADR-022 and §14).

| Token | Value | Use |
| --- | --- | --- |
| `--motion-duration-quick` | 180 ms | micro-feedback (tap, hover, focus) |
| `--motion-duration-base` | 320 ms | menus, panels, reveals |
| `--motion-duration-slow` | 600 ms | route transitions, ambient background |
| `--motion-duration-pulse` | 2400 ms | the loading pulse — the one permitted loop |
| `--motion-ease-soft` | `cubic-bezier(0.22, 1, 0.36, 1)` | everything by default |
| `--motion-distance-enter` | 16 px | vertical drift on entry (the brief's 12–16 px, pinned at 16) |

**Two entry patterns, and no others.** Both end at `transform: none` and neither uses a fill mode.

| Keyframe | Shape | Used by |
| --- | --- | --- |
| `aether-enter` | `opacity 0 → 1` + `translateY(var(--motion-distance-enter)) → 0` | a view entering (`duration-slow`); a sheet entering (`duration-base`) |
| `aether-fade` | `opacity 0 → 1`, no transform | a full-screen veil; anything that must not move |

A component names one of the three class strings in `lib/motion/tokens.ts` — `ENTER_DRIFT_SLOW`,
`ENTER_DRIFT_BASE`, `ENTER_FADE_BASE` — and writes no duration, curve or keyframe of its own. The
strings are literal because Tailwind scans the file as text: a class built from a template literal
compiles to nothing at all.

**The one loop** is E3-S4's loading pulse: `aether-breathe`, `opacity 0.25 → 1 → 0.25` over
`duration-pulse` (2400 ms), named only by `LOADING_PULSE`. It carries **no** `motion-enter` marker, so the
global `reduce` freeze (§11) shrinks it to a still frame at 0.25 — the intended reduced-motion reading.
It animates opacity only, never a transform, so it cannot become a containing block. Measured in
Chromium over 2.6 s: 26 frames, 24 distinct opacities, **0.250008 → 0.999961**; under emulated `reduce`,
one value (**0.250**), `animation-duration: 1e-05s`, and the animation never starts (`pending`,
`startTime: null` — it is not "0 animations", which a later reviewer measured and corrected).

- **Route transitions are entry-only.** `app/RouteTransition.tsx` keys one wrapper on the view's
  identity (`lib/motion/route.ts`), so React replaces the view and the entry replays on the new
  element. The outgoing view is deliberately **not** kept on screen: two full-height views in the DOM
  is how a second scrollbar appears, and that is the criterion the transition has to satisfy.
- **No fill mode, on purpose.** `animation-fill-mode: both` would leave `translateY(0)` behind, and a
  non-`none` transform makes an element the containing block for every `position: fixed` descendant.
  The glass menu is one; measured during an entry, its veil sits 3 px off a 844 px viewport. Settled,
  the wrapper is `transform: none` with no running animation — the rule, not a side effect.
- **The sheet-over-veil pattern** (E3-S2, now expressed in this vocabulary): a full-screen veil of
  `--aura-bg` at 70 % carrying `aether-fade`, and the sheet above it carrying `aether-enter` at
  `duration-base`. The veil must not drift — a full-bleed surface that moves reads as the page moving.
- **Interruptibility is "restart", not "resume".** A view replaced mid-entry starts again from its own
  `from` frame; nothing is left half-faded and nothing queues. Measured: with a second navigation 90 ms
  into a run, the first entry was at opacity 0.523 / 7.63 px when it was replaced, and the new one ran
  from 0 / 16 px to completion.
- `prefers-reduced-motion: reduce` → **opacity only, no movement**: `--motion-distance-enter`
  collapses to `0px`, so one keyframe serves both readings, and the global freeze rule (§11) exempts
  the entry classes so a screen still fades instead of appearing. Auto-scroll animation stays off.
  Two measured details this phrasing has to carry rather than round off: the transform does not become
  `none` — it resolves to the identity matrix, because the keyframe still declares `translateY(0)` — and
  a non-`none` transform is still a containing block, so a `position: fixed` element inside the wrapper is
  positioned against it for the entry's duration under `reduce` exactly as under `no-preference`.
  "No movement" is the accurate claim; "no transforms" is not.
- Nothing loops unless it communicates state — the loading pulse above is the only exception.

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

Implemented in `frontend/src/components/QuietState.tsx` (E3-S4) and rendered by the splash. The details
that are rules, not taste:

- **The empty sentence** is one paragraph in `font-display` / `--aura-text`, centred on `--aura-bg` — an
  ordinary paragraph, not a live region. No retry, no spinner, no illustration. Measured painted: glyph
  `#e8e6e3` on base `#0b0b0d` — **15.79:1** at the brightest glyph pixel; a representative pixel in the
  same capture reads `#e5e3e0` and **15.35:1** (E3-S4 sampled that one, E3-S5 the brightest). Both are
  correct and both are far above AA; the sampling point is stated so the two never look like a drift.
- **The loading pulse** is a full-bleed wash of `--aura-surface` at `opacity-25` carrying
  `aether-breathe` (§5). It is `aria-hidden`; there is no text and no progress bar. jsdom cannot observe
  animation, so the unit suite pins the class token and Chromium measures the frames.
- **The error notice** is `GlassPanel` over its **own scrim**: `--aura-bg` at 70 %, the menu veil's
  value. Glass alone is not enough over a pale photo — measured over white, the tint alone is **2.29:1**,
  while scrim + glass + `--aura-text` is **7.47:1** (13.41:1 over a dark photo). The photo stays visible
  outside the notice, so the scrim is local, not a full-screen veil — `error` does not imply an empty
  screen (the E3-S1A finding).
- **The retry** is a real `<button type="button">` named "Try again", 44 px tall, `aria-describedby` the
  notice's message, in `--aura-text`; focus-visible draws a 1 px inset outline. Measured keyboard path:
  one `Tab` reaches it with `:focus-visible` true; `Enter` issues the request.
- **The announcement is one persistent live region, not the sentences (E3-S5B).** A live region announces
  *changes* to content that already exists; a node inserted together with its text is not reliably
  announced. The splash therefore mounts one visually hidden `role="status"` region in every state —
  empty in `loading` / `ready`, filled with the visible words in `empty` / `error` — and the visible
  sentences are ordinary paragraphs. The region is a **sibling of `<main>`**, not a child: `<main>` is
  inert while the menu is open, and a fetch can settle in that window, so a child region would leave the
  accessibility tree exactly when it has something to say (measured: with the dialog open, `<main>` is
  `ignored: true, ignoredReasons: ["inertElement"]` while the sibling region is `ignored: false` and
  carries the new text). A test pins the visible words and the announced copy equal.
- **Placement is `absolute` against `<main>`, never `fixed`.** The route wrapper transforms during its
  entry, making it the containing block for fixed descendants (§5, ADR-022), which re-anchors a fixed
  notice for the entry's duration. Absolute keeps the notice with the photo it describes: measured
  across an entry, `notice.bottom − main.bottom` stayed **−16 px in every frame** while the wrapper
  carried `translateY(16px → 0)`. No portal, and no change to E3-S2's structure.

## 8. Accessibility (non-negotiable)

- Contrast: ≥ 4.5:1 for text (≥ 3:1 for ≥ 24 px), enforced by construction in the theme generator.
- Focus visible and consistent; glass overlays trap focus, close on `Esc`, restore focus.
- **`inert` removes the covered page while the dialog is open (E3-S5B).** The splash's `<main>` carries
  `inert` while the menu is open — out of the tab order, out of pointer hit-testing and out of the
  accessibility tree, so an assistive technology's virtual cursor cannot reach the tap target behind the
  dialog. The dialog is its **sibling**; nested inside `<main>` it would be ignored with it (measured:
  `ignored: true, ignoredReasons: ["inertElement"]`). Baseline since April 2023; a browser without it
  ignores the attribute and E3-S2's focus trap remains the guarantee. jsdom implements neither the
  property nor the effect, so the unit suite pins the attribute and the sibling relationship, and
  Chromium measures the tree and the focus order.
- **The automated gate is axe-core 4.14, zero violations at every impact** — not only `serious` — on the
  splash in all four states (loading, ready, empty, error) and the menu (open, and alone). It is a dev
  dependency with no transitive dependencies, absent from `dist/`. In jsdom it is a **structural** gate:
  `color-contrast` comes back `incomplete` on the splash and `inapplicable` on the menu (no layout, no
  paint); contrast is proved by the token arithmetic in the component tests and by painted pixels
  measured in Chromium (`frontend/README.md`, "The accessibility pass").
- Drag-and-drop has a keyboard path and announces moves; nothing is touch-only.
- Touch targets ≥ 44 × 44 px; no hover-only affordances.

## 9. Implementation map

| Concern | File(s) |
| --- | --- |
| Extraction | `frontend/src/lib/color/{downscale,quantize,score,palette}.ts` |
| Theme generation | `frontend/src/lib/color/{theme,contrast}.ts` |
| Tokens & typography | `frontend/src/styles/global.css` |
| Glass material | `frontend/src/styles/glass.css` + `components/GlassPanel.tsx` |
| Quiet states | `frontend/src/components/QuietState.tsx` (+ the splash's state machine) |
| Motion tokens & route transition | `frontend/src/lib/motion/{tokens,route}.ts` + `frontend/src/app/RouteTransition.tsx` |
| Tests & fixtures | `frontend/src/lib/color/__fixtures__/`, `*.test.ts` |
| Verification page | `frontend/src/features/check/CheckView.tsx` (`/check`) |

## 10. How this is verified

- Fixture-based unit tests for extraction (deterministic palettes within tolerance).
- Contrast assertions in the theme generator tests (text/background pairs).
- The visual check page at `/check` (`features/check/CheckView.tsx`; §13/ADR-020) renders every token
  with its live value, the glass over a palette stand-in and the five contrast readouts; screenshots
  in the PR (`reports/e2s6-check-*.png`).
- Network panel check: **zero external requests** on a loaded page (also part of `verify`) — the E2-S6
  probe reports every request same-origin.
- Motion is the one area jsdom cannot see (`getAnimations`, `matchMedia`, computed `transform`): the
  unit suite pins the *vocabulary* (which class a component carries, what the tokens are, that the
  keyframes exist and match the tokens) and every claim about what a transition *looks like* comes from
  a Chromium probe over the built bundle (§14, `reports/e3s3-transition-strip-390.png`).
- Quiet states (E3-S4): the unit suite pins the state machine (empty vs error vs ready, including a
  failed re-roll over the kept photo), the exact words, the tokens, and the retry's request; Chromium
  measures what remains — the pulse's frames and its reduced-motion still frame, painted contrast on
  the empty base and on the notice over white and dark photos, the notice's placement through an entry,
  and the Tab/Enter path (`reports/e3s4-*.png`). The probe's network audit reports every request
  same-origin and none off-origin.
- Accessibility audit (E3-S5A): RTL pins roles, names, the focus trap, `Esc` and the focus return on
  the splash and the menu; six axe-core runs (loading, ready, empty and error on the splash; the menu
  open on the splash; the menu alone) assert zero violations at every impact, with the `color-contrast`
  buckets named.
- The accessibility pass (E3-S5B): the unit suite pins the `inert` attribute and the sibling contract,
  the persistent status region (same node, empty before the change, filled after) and the contrast
  arithmetic for the empty sentence and the notice over a white photo; Chromium measures the effects —
  the accessibility tree while inert, painted contrast per text style, the announcement on the same
  node, the keyboard path and layout at 320/390/430 px (`reports/e3s5-*.png`).

## 11. The CSS foundation (E2-S3)

`frontend/src/styles/global.css` is the single source for everything below (decision: ADR-017; probes
and measurements: `reports/verify-e2-s3-20261016.md`).

- **Build inputs are declared, never discovered.** `source(none)` + explicit `@source` globs — the
  source tree's `.ts`/`.tsx` and `index.html`. A document is not a build input: editing a README no
  longer moves the CSS hash, and prose cannot ship a rule. A new top-level input that can carry class
  names must be registered in `global.css` (`.claude/rules/frontend.md`).
- **Colour is the runtime palette only.** The default palette is emptied, so `bg-red-500` cannot
  compile; utilities map to `var(--aura-*)` (inline), and the §2.2 values above are the fallback theme
  until a dump's palette takes over (E2-S4/S6).
- **Type and rhythm are defined once.** `--text-xs … --text-2xl` (§4.3 clamps) and `--tracking-*` live
  in `@theme`: `text-xl` and `var(--text-xl)` are the same value, and off-scale sizes cannot compile.
  `--space-*` is the raw-CSS spelling of the 4 px rhythm the numeric utilities already carry.
- **Full height is defined once, at the root.** `html`/`body` carry `100dvh`; body is padded once by
  the safe insets (`env(safe-area-inset-*, 0px)`, `border-box`); `#root` and every view fill what the
  insets leave (`flex-1`) — no view repeats `100dvh`, and insets never add scroll.
- **The app owns its edges.** `html` carries the background and `overscroll-behavior: none`; every
  scroller has its scrollbar hidden.
- **Motion degrades globally (§5).** Under `prefers-reduced-motion: reduce` animations freeze at their
  end state (a state-communicating pulse becomes a still frame), smooth scrolling is off, and
  `--motion-distance-enter` collapses to `0px` — so movement is removed *by the token*, not by a
  variant per component. The one exception is the entry class (`*:not(.motion-enter)`), which keeps
  its fade; E3-S3 replaced E2-S3's `motion-safe:`/`motion-reduce:` pairing, which left every entry
  frozen solid under `reduce` and duplicated the decision in each component (§14, ADR-022).
- **Tailwind emits `@theme` variables lazily** — only used steps ship; a `var(--token)` reference in
  any compiled CSS counts as a use, which keeps raw-CSS consumers (`glass.css`, later) working.

The full visual check page (§10) arrived with the glass material in E2-S6 (§13); E2-S3's visual
evidence is the three-width screenshot set plus the 9-cell overflow measurement, both in the report.

## 12. Colour extraction (E2-S4)

`frontend/src/lib/color/` implements the §2.1 pipeline (decision: ADR-018; measurements and browser
probe: `reports/verify-e2-s4-20261016.md`).

- **One pure pipeline, one browser edge.** `palette.ts` (`extractPalette`) runs downscale → cluster →
  score/filter → 5–8 colours with normalised weights; `decode.ts` is the only environment-bound file
  (`createImageBitmap` + `OffscreenCanvas` behind injectable dependencies), so the core is testable
  anywhere and the real path is proven in Chromium.
- **k-means++ is the default; median cut ships as the measured alternative**
  (`extractPalette(image, { algorithm: "median-cut" })`). ADR-018 records both, with numbers.
- **Weights are the honest share of returned colours** — renormalised over the 5–8 kept, not over all
  pixels, so filtering a 40% near-black region never leaves a palette summing below 1; `oklch` fields
  are rounded for stable output, and hex is the identity assertions use.
- **Errors have a vocabulary of two.** `PaletteExtractionError` with `code: "decode-failed"` (bytes no
  decoder accepts — the corrupted-file funnel) or `"unsupported"` (no canvas in the environment).
  Nothing else throws.
- **Roles are not here.** §2.1's role derivation (`background` / `surface` / `accent` / `text` /
  `muted` / `accentContrast`) and contrast enforcement live in `theme.ts` (§13); E2-S4 ships the
  scored palette only.

## 13. Theme generation & the glass material (E2-S6)

`frontend/src/lib/color/theme.ts` turns a palette into the §2.2 tokens (decision: ADR-020; probe and
measurements: `reports/verify-e2-s6-20261016.md`).

- **The §2.1 role mapping is deterministic.** Background = the palette's darkest colour pulled into
  OKLCh l ∈ [0.10, 0.18] (C ≤ 0.05, hue kept); surface = background + a fixed step (capped); text =
  the lightest colour (C ≤ 0.02) raised step by step until it clears **4.5:1 on the background, the
  surface and the glass composite**; muted = text at alpha 0.62 raised until 4.5:1 on the background;
  accent = the colour with the largest `weight × C` (ties broken on hex), contrasted with a neutral
  dark or light base, lightness stepped until the pair passes. The same palette always yields the
  same theme.
- **Contrast is enforced by construction, not resolved.** The loops only stop at a passing value, so a
  generated theme cannot ship an under-contrast pair; ratios use float sRGB compositing (WebAIM
  arithmetic — byte rounding turns the measured 16.20:1 glass pair into 16.17:1).
- **Runtime application is nine custom properties.** `applyTheme(theme)` writes the §2.2 tokens inline
  on `document.documentElement`; `clearTheme()` removes them and the stylesheet's `:root` block takes
  over again. Extraction failure is not a generated theme: it is `applyFallbackTheme()`, the neutral
  set above — `paletteToTheme` throws on an empty palette.
- **One material, one fallback token.** `styles/glass.css` implements §3's `.glass`; when
  `backdrop-filter` is unsupported, `@supports not (…)` swaps `--aura-glass` for `--aura-glass-solid`
  (`rgba(0, 0, 0, 0.72)`). Build note: the bundler deduplicates the prefixed and standard
  `backdrop-filter` declarations keeping the *last* one, so the `-webkit-` line sits first and both
  forms ship.
- **The theme layer owns every colour literal.** The theme layer is `theme.ts` plus the stylesheet's
  `:root` block — a drift-guard test reads `global.css` and asserts `FALLBACK_THEME` matches it value
  for value. The audit, run at the branch tip from `frontend/`:

  ```
  grep -rn "#[0-9a-fA-F]\{3,8\}" src --include="*.ts" --include="*.tsx" --include="*.css" \
    | grep -v "\.test\." | grep -v "lib/color/__fixtures__/" \
    | grep -v "lib/color/theme.ts" | grep -v "styles/global.css"
  ```
  → no matches. Every other view composes tokens (`text-aura-*` utilities, `var(--aura-*)`) only.
- **The check page is the sitting evidence.** `/check` (`features/check/CheckView.tsx`) renders every
  token with its live value, the type styles, one `GlassPanel` over a palette stand-in and over the
  page background, and the five contrast readouts (pass/FAIL against 4.5:1); buttons apply the demo
  palette, the fallback theme, or clear back to the stylesheet, and `?theme=demo` seeds the derived
  state so the headless probe screenshots it without a click.

## 14. Motion & route transitions (E3-S3)

`lib/motion/` holds the §5 vocabulary (decision: ADR-022; probes and measurements:
`reports/verify-e3-s3-20261017.md`).

- **The tokens are declared once, in CSS, and read from TypeScript.** `global.css`'s `:root` block
  carries the five `--motion-*` values; `tokens.ts` carries the class strings three components build
  from them. A drift-guard test reads `global.css?raw` and fails when a `var(--motion-*)` a class
  references is undeclared, when an `animate-[…]` names no `@keyframes`, or when `aether-enter` stops
  matching the shape §5 declares — a misspelt `var()` inside an `animate-[…]` makes the whole
  declaration invalid at computed-value time, which is an animation that silently never runs.
- **The view's identity is a pure function.** `viewIdentity(pathname)` folds a trailing slash and
  ignores the query string: `/river` and `/river/` are the same view, and picking a filter is not a
  navigation. A naive `key={pathname}` would remount — and re-animate — on both.
- **`Suspense` sits outside the transition wrapper**, so the entry animates the real view rather than
  the fallback. Measured across a cold navigation into a lazy chunk: the fallback never appears
  (`[role=status]` count 0 in all 74 frames) because React Router's `startTransition` keeps the
  outgoing view painted until the chunk resolves.
- **What "no layout jump" was measured to mean.** Across the run the document's scrollable overflow
  grows by the drift distance and returns (`scrollHeight` 860 → 844 against a 844 px viewport) and no
  scrollbar is ever painted (`clientWidth === innerWidth` in every frame, 0 overflowing scrollers).
  Leaving a scrolled page (`/check` at `scrollY 400`) lands at 0 because the new view is simply not
  scrollable — the browser clamps, no scroll API is called. Scroll *restoration* between two
  scrollable views is not implemented here and is not claimed: it belongs to the River (E5-S1).
- **Reduced motion, measured both ways** under `Emulation.setEmulatedMedia`. Under `reduce`: the entry
  still runs with 37 distinct opacity values and every computed transform is `matrix(1,0,0,1,0,0)` or
  `none` (zero vertical offset in every frame), `maxScrollHeight` 844 = `clientHeight`. Under
  `no-preference`: 38 distinct offsets, 16 px → 0. The menu's own entry follows the same switch — its
  sheet's `top` is a single value (642) throughout under `reduce`, and `aether-fade` on the veil is
  unchanged because it never moved.
- **The cost of the motion layer is one measured line.** No animation library ships (ADR-022): the
  shared chunk every route loads is 286.69 kB / 90.37 kB gzip against 286.18 / 90.21 before — **+0.51 kB
  raw, +0.16 kB gzip** — and the stylesheet 18.08 kB / 4.65 gzip, +0.96 / +0.12.
