# Real-browser contrast pass — 2026-10-22

The review measured 1.95:1–4.48:1 on small River/Curate text. The cause was alpha-modified text:
`text-aura-text/45` composites towards the background, so a light aura (#eb6a6a) produced 2.43:1 even
though the theme's solid `--aura-text` passes. The jsdom axe suite cannot see this because jsdom has no
layout and reports `color-contrast` as incomplete.

## Fix

- River and Curate secondary text now uses the theme's **`text-aura-muted`** token. `themeFromBackground`
  computes that token against the active background and guarantees ≥ 4.5:1; it replaces the ad-hoc
  `/25`, `/30`, `/40`, `/45`, `/50`, `/60` and `/75` text colours.
- ArchiveBar chrome on ink uses `text-paper/70` (8.46:1) instead of `/45` (3.99:1) and `/35` (2.82:1).
- The ArchiveBar is documented as the one persistent chrome element in the design-language rule.

## Gate

The new Playwright test renders the production bundle in Chromium, stubs `/photos`, `/dumps` and the
image paths, scrolls each dump so its aura theme is active, and runs axe's `color-contrast` rule at
**320, 768 and 1280 px** over River and Curate:

```bash
cd frontend
npm run test:a11y
```

Result on 2026-10-22:

```
Running 1 test using 1 worker
  ✓  1 [chromium] › e2e/a11y.spec.ts › River and Curate keep text at WCAG AA contrast at 320/768/1280 (8.4s)
  1 passed (10.9s)
```

The stub contains two dumps: `#eb6a6a` (the light-theme case that produced 2.43:1) and `#0b0b0d` (the
dark fallback). `.github/workflows/ci.yml` installs the pinned Chromium and runs `npx playwright test`
after the production build, so a future alpha regression fails CI.

## Live confirmation

The same axe rule was run against the live local stack at 1440 px before and after the fix: 15
violations (8 River, 7 Curate) before; **0 violations** after. The remaining axe `incomplete` entries
are elements partially obscured by another element and a non-text node, not contrast failures.
