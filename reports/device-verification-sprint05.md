# Real-Device Verification Pass — Sprint 05

**Date**: 2026-10-19 · **Story**: E6-S4 · **Sprint**: 05

## Setup

- **Host machine**: Linux, LAN IP `192.168.1.10`
- **Device**: Chromium browser automation at a 390 × 844 CSS-pixel viewport; not a physical phone
- **Dev server URL**: `http://192.168.1.10:5174`
- **Backend running**: Spring Boot on `:18080` (default `:8080` was occupied); Vite proxy pointed to it
- **Database**: isolated temporary PostgreSQL on `127.0.0.1:15432`; throwaway image directory, seeded with 12 sample photos and one dump
- **CORS**: temporary test allowlist matched `http://192.168.1.10:5174`
- **Firewall**: Vite bound to all interfaces and reached from the browser service via the LAN IP; phone access and host firewall rules were not tested

## Pre-flight

- [x] Temporary backend and Vite servers started; Chromium reached the app through the host LAN address
- [ ] Phone connected to the same Wi-Fi and opened the app — no physical phone was available
- [x] The browser loaded the SPA and received JSON from the proxied photos API

## Checklist — all four views

### 1. Immersive Splash

- [x] Full-screen random photo loaded from the temporary archive
- [x] Tapping the splash opened the glass menu
- [ ] Browser chrome and safe areas checked on a physical device
- [x] Splash filled the emulated 390 × 844 CSS-pixel viewport
- [ ] Reduced-motion: no entry animation if device has "reduce motion" on

**Issues found**: Physical-device behavior remains unverified.

### 2. Glass Menu

- [x] Computed backdrop filter was `blur(15px) saturate(1.2)`
- [ ] Dark tint and hairline appearance visually checked on a physical device
- [x] Menu entries measured 56 px high
- [x] "The River" navigated to `/river`
- [x] "Curate" navigated to `/curate`
- [x] "Close" returned to the splash and focus returned to its trigger
- [ ] Swipe-back gesture (iOS) or hardware back (Android) closes menu

**Issues found**: Physical-device gestures remain unverified.

### 3. The Time River

- [x] Feed rendered month markers, dump sections, and single photos
- [x] Month marker computed font stack began with Playfair Display; local font loaded
- [x] Dump photos rendered in a 2-column grid at 175 × 175 px
- [ ] Single-photo sizing and layout shift measured
- [x] Dump image placeholders used their dump background colours
- [ ] Ambient background did not change from neutral across differently coloured dumps; see #176
- [ ] 300+ item scroll performance was not measured
- [ ] Scroll position was not preserved: the document scrolled while `main.scrollTop` stayed 0; see #176
- [x] River images carried `loading="lazy"`; no image failures were observed

**Issues found**: #176 (River viewport/scroll root).

### 4. Curator's Workshop

- [ ] Device camera roll selection — the browser file chooser opened, but could not access a physical device
- [x] Six generated PNG files selected into the grid
- [ ] Touch drag-and-drop reorder (not testable in this browser session)
- [x] Remove action removed a selected tile; a replacement was then selected
- [x] Extracted aura suggestions appeared and a suggestion could be selected
- [ ] Hex field typing was not exercised
- [x] Title field accepted `Browser smoke dump`
- [x] Six photo uploads succeeded and "Save archive" published the dump
- [x] New dump appeared in the River; the existing dump was temporarily missing until a full reload, see #177
- [ ] Upload progress indicator was not captured during the fast local upload

**Issues found**: #177 (fresh-client publish omits earlier dumps from the cached River list).

## Cross-cutting checks

- [x] **No external network requests** — browser resource entries stayed on the app origin
- [x] **Fonts self-hosted** — Inter and Playfair Display loaded from the local Vite origin
- [x] **Browser console** — zero errors on rerun after matching the temporary CORS allowlist to the LAN origin; the initial 403s were caused by the test's narrower localhost-only allowlist
- [ ] **CLS** was not measured
- [ ] **LCP** was not measured on a physical device over LAN
- [ ] **Contrast**: text readable on all backgrounds (especially with light/dark dump colours)
- [x] **Touch targets**: menu rows measured 56 px and remove buttons 44 px; not every control was measured
- [ ] **Safe areas** on notched devices were not tested
- [ ] **Orientation** was not tested

## iOS Safari quirks

- [ ] Not tested — no iOS device or Safari session available

## Android Chrome quirks

- [ ] Not tested — no Android device session available

## Performance numbers

| Metric | Value | Budget | Pass? |
|--------|-------|--------|-------|
| LCP (first viewport, LAN) | Not measured | < 1500 ms | Not measured |
| CLS (390 px viewport) | Not measured | < 0.1 | Not measured |
| Time to interactive | Not measured | < 3000 ms | Not measured |
| Scroll frame rate | Not measured | ≥ 30 fps | Not measured |

## Findings summary

| # | View | Issue | Severity | Repro | Backlog item |
|---|------|-------|----------|-------|--------------|
| 1 | River | `main` expands to the full feed; document scrolls, scroll memory stays at 0, and dump aura remains neutral | p1 | Open populated `/river` at 390 × 844; scroll the document; `window.scrollY` changes while `main.scrollTop` remains 0 and `--aura-bg` stays neutral | #176 |
| 2 | River after publish | Fresh query cache contains only the newly published dump, temporarily hiding earlier dumps | p1 | Fresh-load `/`, open Curate without visiting River, upload six photos, publish, then open River; reload to see both dumps | #177 |

## Verdict

**NOT COMPLETE** — Chromium mobile-viewport smoke exercised all four views, but findings #176 and #177 remain, and the required physical-phone, iOS Safari, Android Chrome, and device-performance checks are outstanding. E6-S4 remains open.
