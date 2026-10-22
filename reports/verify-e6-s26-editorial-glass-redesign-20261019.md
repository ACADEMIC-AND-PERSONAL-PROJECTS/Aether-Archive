# Verification — E6-S26 / #178

**Branch**: `feature/e6-s26-editorial-glass-redesign` · **Verified**: 2026-10-19
**Verdict**: **PASS WITH LIMITATIONS** — all four views and responsive layouts passed Chromium checks; an initial River scroll-memory failure was fixed and independently re-tested. Physical iOS/Android and full photo-variation checks remain outstanding.

## Scope and evidence

Canonical `_docs/aether_archive_specs.md` stayed unchanged. Chromium 152 tested the running LAN dev app (`http://192.168.1.10:5173`) with a temporary demo API at 390×844, 1440×960, and 320×700. No external HTTP requests, console/page errors, or failed requests were observed in the passing dev run.

| Check | Result and evidence |
|---|---|
| Routes and responsive fit | `/`, `/river`, `/curate`, `/check` returned 200 at all three sizes; no horizontal overflow. |
| Splash and menu | Full-bleed, text-free splash; menu opened on demand. Escape closed it and returned focus; Tab wrapped; touch-emulated River navigation worked. Menu rows measured 64 px. |
| River layout and aura | River `main` stayed bounded (`844/5010`, `960/8496`, `700/4155` client/scroll heights). The visible `#eb6a6a` dump changed `--aura-bg` to `rgb(235, 106, 106)` and it reset after leaving. |
| River scroll memory | Regression test failed before the fix (expected 640, got 0). Afterward, Chromium navigated away and back at 390×844 and 1440×960; `main.scrollTop=1300` restored in a new River element at both sizes. |
| Workshop | Six synthetic photos rendered on phone and desktop; remove, Upload, Add photos, Aura, Title and Save archive controls remained visible. Empty file and invalid aura validation displayed their error states. No upload or publish was sent during QA. |
| Accessibility and palette | Menu focus path and reduced-motion behavior passed. `/check?theme=demo` reported contrast ratios 14.85:1, 13.87:1, 15.61:1, 6.18:1, 5.16:1 — all passed. |
| Frontend gates | `npm run lint`, `npm run test -- --run` (**43 files / 513 tests**), `npm run typecheck`, and `npm run build` passed. Existing jsdom canvas `getContext()` notices were non-failing. Backend `./mvnw -q -B verify`: **307 tests passed**. |
| Local fonts | Production build emitted five Cormorant Garamond/Manrope files totaling **133,376 bytes** (under 200 KB). Both fonts loaded in Chromium; dev run had zero off-origin requests. |

The scroll regression came from passive-effect cleanup reading a detached scroller as `scrollTop=0` and overwriting the saved value. `useLayoutEffect` now captures the final position before detachment; a route-remount regression test covers it. The follow-up browser check measured the actual internal scroller and aura after navigation.

## Limitations

- No physical iOS Safari or Android Chrome device was available; viewport/touch emulation is not a device pass.
- Standalone Vite production preview has no API proxy; its `/api/v1` requests returned 401. The LAN dev app with the demo backend passed.
- The complete pale, dark, colorful, busy and monochrome photo matrix was not forced through every view.

Screenshots use synthetic images, not archive content:

![Workshop at 390 × 844](verify-e6-s26-20261019-workshop-390.png)

![Workshop at 1440 × 960](verify-e6-s26-20261019-workshop-1440.png)

## Design principles and sources

1. Preserve the spec's image-first hierarchy and zero-chrome splash.
2. Recompose for screen size; do not stretch the phone layout.
3. Keep glass over real imagery, with contrast and a solid fallback.
4. Bound fluid sizing and retain whitespace around photos.

Sources: [Apple HIG — Layout](https://developer.apple.com/design/human-interface-guidelines/layout) · [MDN — `backdrop-filter`](https://developer.mozilla.org/en-US/docs/Web/CSS/backdrop-filter) · [web.dev — CSS sizing functions](https://web.dev/articles/min-max-clamp) · [Site Builder Report — Photography portfolios](https://www.sitebuilderreport.com/inspiration/photography-portfolios). References informed principles; no assets or layouts were copied. Final staged diff (`git diff --cached --numstat HEAD`): 18 files, 320 additions / 91 deletions (411 text lines); 395 hand-written changed lines, excluding generated `frontend/package-lock.json` (+8/−8). The two attached PNG screenshots are binary assets and are not counted as text lines.

## Independent verification — current uncommitted iteration

**Verified**: 2026-10-20 UTC · **Viewports**: exactly 390×844 and 1440×900
**Result**: **FAIL** — the inspector's wash layers make its photo backdrop nearly opaque, so it does not visibly read as translucent glass. The River, ordering, layout, build, and automated checks otherwise behaved as recorded below.

This section covers the *working-tree* changes, not just the earlier committed state described above. `git status --short --branch` showed eight modified frontend files. `git diff --stat` showed 8 files, 401 insertions / 189 deletions; `git diff --check` exited 0 with no output. No product files were changed by this verification; only this report was updated.

| Step | Command / action | Result | Evidence |
|---|---|---|---|
| Frontend lint | `cd frontend && npm run lint --if-present` | PASS | Exit 0; ESLint `--max-warnings 0` emitted no warnings. |
| Frontend tests | `cd frontend && npm run test --if-present -- --run` | PASS | `Test Files 43 passed (43)` · `Tests 515 passed (515)` · `Duration 45.68s`. jsdom printed its known non-failing canvas `getContext()` notices. |
| Frontend build | `cd frontend && npm run build` | PASS | `✓ built in 2.21s`; Vite transformed 193 modules. |
| Production preview | `npm run preview -- --host 127.0.0.1 --port 14173`; Playwright Chromium, API restricted to the seeded dump | PASS | `/`, `/river`, `/curate`; River `state=ready`, 6 photos, first photo `eager`, `96×64`; Curate `idle`; external requests `[]`; console/page errors `[]`. Preview listener was stopped. |
| Backend suite (unchanged backend) | `cd backend && ./mvnw -q -B verify` | PASS | Exit 0; Surefire reports: 27 suites, 302 tests, 0 failures, 0 errors, 0 skipped. Logged exceptions are expected negative-path test cases. |
| Live dev UI, menu and network | Playwright Chromium at `http://192.168.1.10:5173`, 390×844 and 1440×900; only the known seeded dump was supplied to the browser | PASS | Menu had one underlying hero image, `backdrop-filter: blur(15px) saturate(1.2)`, focus order wrapped `The River → Curate → Close → The River`; Escape closed and returned focus to “Open the menu”. Menu targets measured 80 px / 64 px. No external requests or console/page errors. Some same-origin API GETs were `ERR_ABORTED` as SPA routes changed. |
| River flow and scroll | Same browser run; six seeded dump images only | PASS | Main scroller: 390×844 with content 390×1925; desktop 1440×900 with content 1440×3625. `October 2026` precedes `Seed dump 2026-10-19`. First image `loading=eager`; images 2–6 `lazy` (images 5–6 were still incomplete below the desktop fold at first measurement). All six source images measured 96×64; displayed at 358×239 on phone and 768×512 on desktop with `object-fit: contain`, matching the 3:2 measure. Aura transitioned from neutral loading values to `rgb(235, 106, 106)`; after navigating away and back, `scrollTop=760` restored at both sizes. |
| Workshop selection/order/layout | Six browser-canvas-generated 768×512 images; no upload or publish action | PASS | Pointer selection plus Move earlier/later reordered the selected item; keyboard drag swapped the first two items, and mouse drag reordered them again. Visible “Waiting” count was 0. Interactive buttons, swatches, file labels and inputs measured at least 44 px high. Panel content width was 356/356 px on phone and 382/382 px on desktop; no horizontal overflow. |
| Inspector glass over pale/dark photos | Screenshots and computed layers, both viewport sizes | **FAIL** | The inspector wash is 70% aura over a 55% full-photo wash, followed by the panel's 40% black surface. Under ordinary alpha compositing only `0.45 × 0.30 × 0.60 = 8.1%` of the original photo contribution remains. The computed blur is present, but the pale and dark screenshots look like a near-black panel rather than visibly translucent glass. |
| Design references | Local `docs/scrum/DECISION-LOG.md` ADR-028 and this report | PARTIAL | Local files cite Apple HIG Layout, MDN `backdrop-filter`, web.dev sizing functions and Site Builder Report. The remote PR body was not read, so I cannot confirm that the PR description itself repeats those citations. |

### Screenshot evidence (kept in `/tmp`, not added to the repository)

- Splash: `/tmp/e6-s26-splash-390x844.png`, `/tmp/e6-s26-splash-1440x900.png`
- Menu: `/tmp/e6-s26-menu-390x844.png`, `/tmp/e6-s26-menu-1440x900.png`
- River: `/tmp/e6-s26-river-390x844.png`, `/tmp/e6-s26-river-1440x900.png`
- Workshop with pale selected: `/tmp/e6-s26-workshop-390x844.png`, `/tmp/e6-s26-workshop-1440x900.png`
- Workshop with dark selected: `/tmp/e6-s26-workshop-dark-390x844.png`, `/tmp/e6-s26-workshop-dark-1440x900.png`

### Visual review and limitations

- **Calm in a dim room:** the splash is quiet; the River is not calm with this fixture—the full-page `#eb6a6a` aura is bright and visually dominant. That exact color comes from the sole seeded dump, so this is a finding about the supplied seed, not a claim about all user photographs.
- **One focal point:** splash/menu have a clear focal point; on desktop Workshop the six-image sheet and the inspector compete somewhat, although the sheet remains the larger element.
- **Pale/dark/busy/B&W:** pale and dark browser-generated images were exercised in the Workshop only. River samples are all tiny 96×64 generated landscape images; they do not prove quality with user photos. Busy and black-and-white material, portrait aspect ratios, multiple dumps with distinct auras, and a transition out of the only dump were not tested.
- No physical iOS Safari or Android Chrome pass, offline/error UI pass, or production-preview drag pass was performed. No upload or publish request was sent.
- **Archive boundary deviation:** during initial setup I made one read-only `GET /api/v1/photos` probe and viewed its count and the first two metadata records before recognizing that the endpoint might include non-seed archive entries. I did not request or view those records' image bytes. I then stopped using that endpoint; subsequent browser responses were restricted to the known seeded dump's six photos. This was an unintended metadata read beyond the requested boundary and is recorded plainly here.

### Failure and reproduction

1. At either requested viewport, add the six browser-generated images and scroll to the selected-photo inspector. The photo is under the panel, but the two wash layers plus the black panel reduce its contribution to about 8%; the inspector appears almost opaque instead of reading as photo-backed glass. See the pale/dark Workshop screenshots above.
