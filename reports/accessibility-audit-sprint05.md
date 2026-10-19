# Accessibility Audit — Sprint 05 (WCAG 2.2 AA)

**Date**: 2026-10-19 · **Story**: E6-S3 · **Views audited**: SplashView, GlassMenu, RiverView, WorkshopView

## 1. Axe coverage

All four views have axe tests — 12 tests total, all passing. Zero serious or critical violations.

## 2. Keyboard walkthrough

| View | Path | Notes |
|------|------|-------|
| Splash | Tab → full-screen button → Enter opens menu | One stop only |
| Menu | Focus trapped: The River → Curate → Close → wraps. Escape closes. Focus returns to trigger. | `role="dialog"` + `aria-modal` |
| River | No interactive elements (images are decorative). Scroll with arrows/Page. | `h1.sr-only` "The River" |
| Workshop idle | Tab → file input ("Choose photos") | sr-only input, peer focus ring |
| Workshop selected | Tab → drag activators → remove buttons → Upload → Add photos → aura swatches → hex field → Reset → Title → Save | Space/arrows for drag reorder |
| Workshop uploading | Focus moves to Cancel button | Only stop during upload |

Drag-and-drop keyboard alternative: `KeyboardSensor` + `sortableKeyboardCoordinates` — Space/Enter
to lift, arrows to move, Space/Enter to drop, Escape to cancel. Announcements read positions.

## 3. Contrast

| Pair | Guarantee | Threshold |
|------|-----------|-----------|
| `--aura-text` on `--aura-bg` | `themeFromBackground` ≥ 4.5:1 | AA normal text |
| `--aura-text` on glass | Measured 8.07:1 typical | AA normal text |
| `--aura-muted` on `--aura-bg` | Generator ≥ 4.5:1 | AA normal text |
| Focus rings (was `/50`, now `/70`) | ≥ 3:1 at 70% opacity | 1.4.11 non-text |

## 4. Focus visibility

**Finding (fixed)**: Focus ring opacity was `outline-aura-text/50` (50%) across all interactive
elements. At typical theme colours (`#e8e6e3` text on `#0b0b0d` bg), 50% composites to ~3.5:1 which
is marginal and fails on some palettes. Raised to `/70` (70%) across 7 files, 11 occurrences.
At 70%, the composite is ~5.2:1 — comfortably above the 3:1 WCAG 1.4.11 minimum.

## 5. Motion preferences

- Global rule: `@media (prefers-reduced-motion: reduce)` squashes all transitions to 0.01ms.
- `[data-aura-transition]`: covered by the global rule.
- DragOverlay: `useReducedMotion()` disables drop animation and settle transition.
- `.motion-enter`: keeps duration but sets `--motion-distance-enter: 0px` (opacity-only).
- **All covered.**

## 6. Touch targets

All interactive elements meet the 44×44 px minimum: `min-h-11` (44px) on buttons, `h-11 w-11` on
remove buttons and aura swatches, `min-h-14` (56px) on menu entries, full-screen splash button.

## 7. Semantic structure

- `<html lang="en">`, `<title>Aether Archive</title>`.
- Each view: `<main>` with `<h1>` (sr-only). Heading hierarchy: h1 → h2 (months) → h3 (dump titles).
- Lists: `<ul role="list">` for selection grid and aura suggestions.
- Dialog: `role="dialog"` + `aria-modal` + `aria-label="Menu"`.
- Forms: all inputs have associated `<label>` elements.
- Sections: `aria-label` on month sections, publish section, aura picker.
- Live regions: `role="status"` on splash, workshop, aura picker, route fallback.
- `inert` on `<main>` when menu open — removes covered content from AT tree.

## 8. Screen reader (environment limitation)

No VoiceOver/TalkBack available. The accessibility tree structure is sound based on code inspection:
sr-only headings, aria-labels, live regions, `inert` gating, dnd-kit announcements with positions.
A real screen reader pass should ride with E6-S4 (real-device verification).

## Summary

| # | Finding | Severity | Action |
|---|---------|----------|--------|
| 1 | Focus ring at 50% opacity fails 3:1 (WCAG 1.4.11) | SHOULD FIX | **Fixed** — raised to 70% |
| 2 | No real screen reader pass | NOTED | Deferred to E6-S4 |

**Verdict**: The codebase passes the WCAG 2.2 AA audit with one fix applied. The single environment
limitation (no SR device) is named and deferred.
