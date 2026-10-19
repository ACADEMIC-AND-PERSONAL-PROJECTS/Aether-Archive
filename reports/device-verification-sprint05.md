# Real-Device Verification Pass — Sprint 05

**Date**: 2026-10-19 · **Story**: E6-S4 · **Sprint**: 05

## Setup

- **Host machine**: <!-- OS, hostname, LAN IP -->
- **Device**: <!-- model, OS version, browser + version -->
- **Dev server URL**: `http://<LAN-IP>:5173`
- **Backend running**: `./mvnw spring-boot:run` on `:8080`
- **Database**: `docker compose -f docker-compose.dev.yml up -d`
- **Firewall**: ports 5173 + 8080 open to LAN subnet

## Pre-flight

- [ ] Both servers running, phone connected to same Wi-Fi
- [ ] `curl http://<LAN-IP>:5173/` from the phone's browser returns the app
- [ ] `curl http://<LAN-IP>:5173/api/v1/photos` returns JSON (empty or populated)

## Checklist — all four views

### 1. Immersive Splash

- [ ] Full-screen random photo loads (or empty state if no photos)
- [ ] Tap anywhere opens the glass menu
- [ ] No visible browser chrome conflicts (status bar, safe areas)
- [ ] `100dvh` fills the viewport without address-bar gap
- [ ] Reduced-motion: no entry animation if device has "reduce motion" on

**Issues found**: <!-- none / list -->

### 2. Glass Menu

- [ ] Backdrop blur renders correctly (`backdrop-filter: blur(15px)`)
- [ ] Dark tint visible over the photo
- [ ] Hairline border visible (`1px solid rgba(255,255,255,0.08)`)
- [ ] Menu entries are thumb-reachable (≥44px height)
- [ ] "The River" navigates to `/river`
- [ ] "Curate" navigates to `/workshop`
- [ ] "Close" returns to splash
- [ ] Swipe-back gesture (iOS) or hardware back (Android) closes menu

**Issues found**: <!-- none / list -->

### 3. The Time River

- [ ] Feed loads with month markers, dump sections, single photos
- [ ] Month markers use display serif (Playfair Display)
- [ ] Dump photos in 2-column grid, correct aspect ratio
- [ ] Single photos full-width, 3:4 aspect, no layout shift
- [ ] Colour placeholders visible while images load
- [ ] Ambient background transitions smoothly between dumps
- [ ] Scroll is smooth, no jank at 300+ items
- [ ] Scroll position preserved on back navigation
- [ ] Images lazy-load (visible in DevTools network tab or by scroll speed)

**Issues found**: <!-- none / list -->

### 4. Curator's Workshop

- [ ] "Choose photos" file picker opens device camera roll
- [ ] Selecting 1-6 photos shows the selection grid
- [ ] Drag-and-drop reorder works on touch (long-press to lift)
- [ ] Remove button (×) works on each tile
- [ ] Aura picker: extracted colours shown, tappable
- [ ] Hex input accepts typed colour
- [ ] Title field works
- [ ] "Save archive" publishes the dump
- [ ] Published dump appears in the River
- [ ] Upload progress visible

**Issues found**: <!-- none / list -->

## Cross-cutting checks

- [ ] **No external network requests** — verify in DevTools Network tab (filter non-localhost)
- [ ] **Fonts self-hosted** — Playfair Display + Inter load from `/assets/`, not Google Fonts
- [ ] **CLS**: no visible layout shift when scrolling through images
- [ ] **LCP**: first viewport loads in < 1.5 s over LAN (measure with Lighthouse or DevTools)
- [ ] **Contrast**: text readable on all backgrounds (especially with light/dark dump colours)
- [ ] **Touch targets**: all buttons/links ≥ 44×44 px
- [ ] **Safe areas**: content respects `env(safe-area-inset-*)` on notched devices
- [ ] **Orientation**: landscape usable (not required to be optimised, just not broken)

## iOS Safari quirks

- [ ] `backdrop-filter` renders (some WebKit versions need `-webkit-backdrop-filter`)
- [ ] `100dvh` works correctly with the dynamic toolbar
- [ ] Scroll momentum / rubber-banding doesn't conflict with the aura transition
- [ ] Gesture conflicts: swipe-back doesn't accidentally trigger drag-and-drop

## Android Chrome quirks

- [ ] `backdrop-filter` renders
- [ ] `100dvh` fills correctly with the URL bar
- [ ] Pull-to-refresh doesn't conflict with vertical scrolling in the River
- [ ] `overscroll-behavior` set correctly (no accidental navigation)

## Performance numbers

| Metric | Value | Budget | Pass? |
|--------|-------|--------|-------|
| LCP (first viewport, LAN) | <!-- ms --> | < 1500 ms | <!-- Y/N --> |
| CLS (390 px viewport) | <!-- score --> | < 0.1 | <!-- Y/N --> |
| Time to interactive | <!-- ms --> | < 3000 ms | <!-- Y/N --> |
| Scroll frame rate | <!-- fps --> | ≥ 30 fps | <!-- Y/N --> |

## Findings summary

| # | View | Issue | Severity | Repro | Backlog item |
|---|------|-------|----------|-------|--------------|
| <!-- 1 --> | <!-- River --> | <!-- description --> | <!-- p0/p1/p2 --> | <!-- steps --> | <!-- #NNN or "new" --> |

## Verdict

<!-- PASS / PASS WITH ISSUES / FAIL -->
<!-- One sentence summary -->
