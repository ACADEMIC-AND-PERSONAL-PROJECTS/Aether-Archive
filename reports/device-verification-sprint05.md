# Real-Device Verification Pass — Sprint 05

**Dates**: 2026-10-19 (first pass) · 2026-10-22 (second pass) · **Story**: E6-S4 · **Sprint**: 05

## Setup

The first pass exercised the four views at a mobile viewport. The second pass re-ran them on the
sprint's final code and added the measurements the first pass left open: the 300-item feed, LCP, CLS,
scroll frame time, reduced motion, orientation, the hex field and the upload progress bar.

- **Host machine**: Linux, LAN IP `192.168.1.10`; host firewall inactive
- **Device**: headless Chromium 149 at a 390 × 844 CSS-pixel viewport (DPR 1, no touch emulation); not a physical phone
- **Dev server URL**: `http://192.168.1.10:5174` (Vite `--mode e6s4`, proxy to `http://localhost:18080`)
- **Backend running**: Spring Boot on `:18080` (default `:8080` was occupied); Vite proxy pointed to it
- **Database**: isolated temporary PostgreSQL on `127.0.0.1:15432`; throwaway image directory, seeded with 300 sample photos and one dump, then one published 6-photo dump (306 photos, 2 dumps)
- **CORS**: allowlist matched `http://localhost:5174` and `http://192.168.1.10:5174`; the app is same-origin through the Vite proxy
- **Network**: no external requests; every API and image request stayed on the app origin

## Pre-flight

- [x] Temporary backend and Vite servers started; Chromium reached the app through the host LAN address
- [ ] Phone connected to the same Wi-Fi and opened the app — no physical phone was available
- [x] The browser loaded the SPA and received JSON from the proxied photos API
- [x] Second pass: the 300-photo / 2-dump fixture rendered in full; 306 images, 0 broken

## Checklist — all four views

### 1. Immersive Splash

- [x] Full-screen random photo loaded from the temporary archive
- [x] Tapping the splash opened the glass menu
- [ ] Browser chrome and safe areas checked on a physical device
- [x] Splash filled the emulated 390 × 844 CSS-pixel viewport, and 844 × 390 in landscape, with zero horizontal overflow
- [x] Reduced-motion: the splash has no entry animation in either mode; under `reduce` the drift token is `0px` and the global freeze rule applies (computed `animation: none`, `1e-05s` durations)

**Issues found**: Physical-device behavior remains unverified.

### 2. Glass Menu

- [x] Computed backdrop filter on the glass panel was `blur(15px) saturate(1.2)`, tint `rgba(0, 0, 0, 0.4)`
- [ ] Dark tint and hairline appearance visually checked on a physical device
- [x] Menu entries measured 56 px high (The River, Curate, Close)
- [x] "The River" navigated to `/river`
- [x] "Curate" navigated to `/curate`
- [x] "Close" returned to the splash and focus returned to its trigger; `Escape` does the same
- [x] Entry animation used `aether-enter` at 320 ms; under `reduce` its transform computed to `matrix(1,0,0,1,0,0)` (fade only)
- [ ] Swipe-back gesture (iOS) or hardware back (Android) closes menu — **fails in Chromium**: no `popstate`/history entry exists, so `goBack()` loaded the previous route instead of closing the sheet (finding 3)

**Issues found**: Finding 3 (menu does not close on history back). Physical-device gestures remain unverified.

### 3. The Time River

- [x] Feed rendered month markers, dump sections, and single photos
- [x] Month marker computed font stack began with Playfair Display; local font loaded (`document.fonts.check` true)
- [x] Dump photos rendered in a 2-column grid at 175 × 175 px (portrait, 390 px viewport)
- [x] Single-photo sizing and layout shift measured: `aspect-[3/4]` reserves the box; CLS 0.00045 on load (budget < 0.1)
- [x] Dump image placeholders used their dump background colours
- [ ] Ambient background did not change from neutral across differently coloured dumps; `--aura-bg` stayed `rgb(11, 11, 13)` at the dump; see #176
- [x] Confirmed the structural cause of #176: `main.scrollHeight === main.clientHeight === 150 581 px`, so the document scrolls and `main.scrollTop` cannot move
- [x] 300-item scroll measured: 360 frames over 6.9 s (400 px/frame fling), **52.1 fps average**, median 16.7 ms, p95 33.4 ms, 17 frames > 33.4 ms, worst 100 ms; 291/300 images loaded, 0 broken (budget ≥ 30 fps)
- [x] Scroll position restored on back/forward by browser-native document restoration (6000 px), and a fresh reload started at 0 — but the hook's own store stayed 0 because `main.scrollTop` is 0; see #176
- [x] River images carried `loading="lazy"`; no image failures were observed

**Issues found**: #176 (River viewport/scroll root).

### 4. Curator's Workshop

- [ ] Device camera roll selection — the browser file chooser opened, but could not access a physical device
- [x] Six generated PNG files selected into the grid (second pass: 6 tiles, 8 aura suggestions)
- [ ] Touch drag-and-drop reorder (not testable in this browser session)
- [x] Remove action removed a selected tile; a replacement was then selected
- [x] Extracted aura suggestions appeared and a suggestion could be selected
- [x] Hex field accepted `#3a7bd5` with no validation message; the workshop surface became `rgb(58, 123, 213)`
- [x] Title field accepted `Browser smoke dump`; the second pass accepted `Second pass dump`
- [x] Six photo uploads succeeded and "Save archive" published the dump (six `201 Created` + one dump `201`)
- [x] Upload progress indicator captured under a throttled uplink: `role="progressbar"` appeared with `aria-valuenow` 0 → 100 per file
- [x] Fresh-client publish reproduced #177: the River showed only the new dump (1) until a reload showed both (2)

**Issues found**: #177 (fresh-client publish omits earlier dumps from the cached River list).

## Cross-cutting checks

- [x] **No external network requests** — browser resource entries stayed on the app origin
- [x] **Fonts self-hosted** — Inter and Playfair Display loaded from the local Vite origin
- [x] **Browser console** — zero errors and zero warnings in the second pass
- [x] **CLS** measured: splash 0, River 0.00045 (budget < 0.1)
- [x] **LCP** measured in Chromium (not on a physical device over LAN): splash 752 ms, River 1 216 ms (budget < 1 500 ms); DOM interactive 30 ms, load 165 ms
- [x] **Contrast**: the dump's generated theme gave text-on-background 6.37:1 and text-on-surface 7.53:1 for `#eb6a6a` (WCAG AA 4.5:1); `themeFromBackground` guarantees it for every dump colour
- [x] **Touch targets**: menu rows 56 px; every visible control on the Workshop measured ≥ 44 px (label text and the hidden file input excepted); remove buttons measured 44 px in the first pass
- [ ] **Safe areas** on notched devices were not tested
- [x] **Orientation**: 844 × 390 landscape, splash filled the viewport, zero horizontal overflow; the River had zero overflow in both orientations

## iOS Safari quirks

- [ ] Not tested — no iOS device or Safari session available

## Android Chrome quirks

- [ ] Not tested — no Android device session available

## Performance numbers

| Metric | Value | Budget | Pass? |
|--------|-------|--------|-------|
| LCP (splash, LAN, Chromium) | 752 ms | < 1500 ms | Pass (emulated) |
| LCP (River, LAN, Chromium) | 1 216 ms | < 1500 ms | Pass (emulated) |
| CLS (splash / River) | 0 / 0.00045 | < 0.1 | Pass |
| Time to interactive (DOM interactive) | 30 ms | < 3000 ms | Pass (dev server) |
| Scroll frame rate (300 items, 400 px/frame) | 52.1 fps avg · p95 33.4 ms | ≥ 30 fps | Pass (emulated) |

Measured on headless Chromium 149 at DPR 1 with a desktop GPU, on the dev server, against 96 × 64
generated PNGs. A physical phone with camera-sized images will differ; the phone pass must confirm
these budgets on hardware.

## Findings summary

| # | View | Issue | Severity | Repro | Backlog item |
|---|------|-------|----------|-------|--------------|
| 1 | River | `main` expands to the full feed; document scrolls, scroll memory stays at 0, and dump aura remains neutral | p1 | Open populated `/river` at 390 × 844; scroll the document; `window.scrollY` changes while `main.scrollTop` remains 0 and `--aura-bg` stays neutral | #176 |
| 2 | River after publish | Fresh query cache contains only the newly published dump, temporarily hiding earlier dumps | p1 | Fresh-load `/`, open Curate without visiting River, upload six photos, publish, then open River; reload to see both dumps | #177 |
| 3 | Glass menu | History back navigates away instead of closing the open menu (no `popstate` handler or history entry) | p2 | Open `/`, tap the splash to open the menu, then press browser/hardware back; the previous route loads (`/river` in the test) and the sheet disappears with the page | E6-S27 (#179) |

## Verdict

**NOT COMPLETE — physical-device checks only.** The Chromium pass now covers all four views, the
deferred performance numbers, reduced motion, orientation, the hex field, upload progress and scroll
memory, and re-confirms #176/#177. What remains is exactly what automation cannot provide: a phone on
the same Wi-Fi, iOS Safari + Android Chrome quirks, browser chrome/safe areas, the native camera roll
and touch drag-and-drop. E6-S4 stays open until the owner runs the checklist on a physical device.
