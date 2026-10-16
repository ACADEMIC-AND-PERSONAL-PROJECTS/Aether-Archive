import { useEffect, useState } from "react";
import { useLocation } from "react-router";

import { GlassPanel } from "../../components/GlassPanel";
import { oklchToHex } from "../../lib/color/oklch";
import {
  applyTheme,
  clearTheme,
  CONTRAST_MINIMUM,
  contrastReport,
  FALLBACK_THEME,
  paletteToTheme,
  THEME_PROPERTIES,
  type AuraTheme,
} from "../../lib/color/theme";

import type { Oklch, Palette, PaletteColor } from "../../lib/color/types";

/**
 * The design-system check page (DESIGN-SYSTEM §10): every §2.2 token, the type styles, the one
 * glass material over a palette stand-in, and the live contrast readouts — on the neutral set
 * or on a theme derived from the demo palette through the real generator.
 *
 * It is a verification surface, not a product view: the buttons exist so the runtime
 * application (`applyTheme` on `:root`) is visible and screenshot-able, and `?theme=demo`
 * lets the headless probe land on the derived state without a click.
 */

/** A palette colour built from an OKLCh triple — keeps this file free of hex literals (§2.2). */
const demoColor = (oklch: Oklch, weight: number): PaletteColor => ({
  hex: oklchToHex(oklch),
  oklch,
  weight,
});

/**
 * The demo palette: a plausible photo — slate, teal, rust, sand, rose, pale. The rust carries
 * the highest `weight × C`, so it is the accent role; weights sum to 1, like extraction's.
 */
const DEMO_PALETTE: Palette = {
  colors: [
    demoColor({ l: 0.25, c: 0.04, h: 250 }, 0.28),
    demoColor({ l: 0.35, c: 0.06, h: 195 }, 0.18),
    demoColor({ l: 0.62, c: 0.13, h: 45 }, 0.24),
    demoColor({ l: 0.8, c: 0.07, h: 85 }, 0.16),
    demoColor({ l: 0.55, c: 0.09, h: 20 }, 0.08),
    demoColor({ l: 0.92, c: 0.01, h: 60 }, 0.06),
  ],
};

const BUTTON_CLASS = "rounded-[10px] px-3 py-2 text-left";

/** The demo theme is seeded from the URL so the headless probe needs no click. */
const themeFromUrl = (search: string): AuraTheme | null =>
  new URLSearchParams(search).get("theme") === "demo" ? paletteToTheme(DEMO_PALETTE) : null;

export function CheckView() {
  const location = useLocation();
  const [theme, setTheme] = useState<AuraTheme | null>(() => themeFromUrl(location.search));

  /*
   * The page's job *is* the side effect: whenever a theme is chosen — seeded from the URL or
   * picked with a button — it lands on `:root` as the §2.2 custom properties. Reset clears
   * them and hands the page back to the stylesheet.
   */
  useEffect(() => {
    if (theme) {
      applyTheme(theme);
    }
  }, [theme]);

  const applyDemoTheme = (): void => {
    setTheme(paletteToTheme(DEMO_PALETTE));
  };

  const applyNeutralTheme = (): void => {
    setTheme(FALLBACK_THEME);
  };

  const resetToStylesheet = (): void => {
    clearTheme();
    setTheme(null);
  };

  const report = contrastReport(theme ?? FALLBACK_THEME);
  const rows: ReadonlyArray<readonly [string, number]> = [
    ["text on bg", report.textOnBg],
    ["text on surface", report.textOnSurface],
    ["text on glass-over-bg", report.textOnGlass],
    ["muted on bg", report.mutedOnBg],
    ["accent-contrast on accent", report.accentContrastOnAccent],
  ];

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-10 px-6 py-10 text-sm">
      <header className="space-y-2">
        <h1 className="font-display text-2xl tracking-display">Theme check</h1>
        <p className="text-aura-muted">
          DESIGN-SYSTEM §10&apos;s verification page: tokens, type, the single glass material and
          the contrast the generator guarantees. A dev surface — the product views arrive with their
          own stories.
        </p>
      </header>

      <section className="space-y-3" aria-labelledby="check-theme">
        <h2 id="check-theme" className="font-display text-lg tracking-display">
          Theme
        </h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={BUTTON_CLASS}
            style={{ border: "var(--aura-hairline)" }}
            onClick={applyDemoTheme}
          >
            Apply demo palette
          </button>
          <button
            type="button"
            className={BUTTON_CLASS}
            style={{ border: "var(--aura-hairline)" }}
            onClick={applyNeutralTheme}
          >
            Apply fallback theme
          </button>
          <button
            type="button"
            className={BUTTON_CLASS}
            style={{ border: "var(--aura-hairline)" }}
            onClick={resetToStylesheet}
          >
            Reset to stylesheet
          </button>
        </div>
        <p className="text-aura-muted">
          {theme
            ? "A theme is applied to :root as inline custom properties; the values below are its own."
            : "The stylesheet's neutral set is on :root (no inline overrides)."}
        </p>
      </section>

      <section className="space-y-3" aria-labelledby="check-tokens">
        <h2 id="check-tokens" className="font-display text-lg tracking-display">
          Tokens
        </h2>
        <ul className="grid gap-2">
          {THEME_PROPERTIES.map(([key, property]) => (
            <li key={property} className="flex items-center gap-4">
              <span
                aria-hidden="true"
                className="h-10 w-16 shrink-0 rounded-[10px]"
                style={
                  key === "hairline"
                    ? { background: "var(--aura-bg)", border: "var(--aura-hairline)" }
                    : { background: `var(${property})` }
                }
              />
              <code className="text-aura-muted">{property}</code>
              <span className="ml-auto text-xs">{theme?.[key] ?? "stylesheet default"}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3" aria-labelledby="check-type">
        <h2 id="check-type" className="font-display text-lg tracking-display">
          Type
        </h2>
        <p className="font-display text-2xl tracking-display">A dump title</p>
        <p className="text-base">Body text — Inter Variable, the UI face.</p>
        <p className="text-sm text-aura-muted">Secondary text — the muted token.</p>
        <p>
          <a href="#check-tokens" className="text-aura-accent underline underline-offset-4">
            An accent link
          </a>
        </p>
      </section>

      <section className="space-y-3" aria-labelledby="check-glass">
        <h2 id="check-glass" className="font-display text-lg tracking-display">
          Glass
        </h2>
        <div className="relative overflow-hidden rounded-[20px]">
          <div className="grid h-72 grid-cols-3" aria-hidden="true">
            {DEMO_PALETTE.colors.map((color) => (
              <div key={color.hex} style={{ backgroundColor: color.hex }} />
            ))}
          </div>
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <GlassPanel className="max-w-xs p-5">
              <p>A glass panel over the palette stand-in.</p>
              <p className="mt-1 text-xs text-aura-muted">
                blur(15px) saturate(1.2), the hairline, radius 20 — §3&apos;s material, tokens only.
              </p>
            </GlassPanel>
          </div>
        </div>
        <GlassPanel className="p-5">
          <p>A glass panel over the page background.</p>
        </GlassPanel>
      </section>

      <section className="space-y-3" aria-labelledby="check-contrast">
        <h2 id="check-contrast" className="font-display text-lg tracking-display">
          Contrast
        </h2>
        <ul className="grid gap-1">
          {rows.map(([label, value]) => (
            <li key={label} className="flex items-baseline gap-3">
              <span className="text-aura-muted">{label}</span>
              <span className="ml-auto">{value.toFixed(2)}:1</span>
              <span>{value >= CONTRAST_MINIMUM ? "pass" : "FAIL"}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
