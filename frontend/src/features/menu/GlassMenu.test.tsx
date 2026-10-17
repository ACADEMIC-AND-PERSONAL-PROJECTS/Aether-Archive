import { fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { GlassMenu } from "./GlassMenu";
import { compositeOver, contrastRatio, hexToRgb, parseColor } from "../../lib/color/contrast";
import { oklchToHex } from "../../lib/color/oklch";
import { paletteToTheme } from "../../lib/color/theme";

/**
 * The app's only dialog, asserted where the user can observe it.
 *
 * ## What jsdom can and cannot settle here — probed, not assumed
 *
 * It *can* settle focus: `.focus()` moves `document.activeElement` for a button, a link and a
 * `tabindex="-1"` container; focusing a disabled control is a no-op that leaves focus where it was; and
 * removing the focused element puts focus back on `body` — which is the state the close path starts
 * from. It can also settle the scroll lock: `document.documentElement.style.overflow` is readable back,
 * and `getComputedStyle` reports the value it was given.
 *
 * It *cannot* settle `Tab`: jsdom performs no default action on a `Tab` keydown at all — focus stays
 * exactly where it was (measured in the probe above this suite). Every assertion below about the
 * keyboard is therefore an assertion about *our* handler, which is the point of handling every `Tab`
 * explicitly instead of only the two edges: the code under test is the code a browser runs. What
 * jsdom still cannot answer is the part that needs layout — that `min-h-14` really is 56 px, that the
 * entries sit inside the sheet's rounded corners, and that the entry animation is skipped under
 * `prefers-reduced-motion: reduce`. Those are the Chromium probe's, and they are not claimed here.
 */

function renderMenu() {
  const onClose = vi.fn();
  // `createRef` is called outside the render, so the object identity — which the component's focus
  // effect depends on — is stable across re-renders, exactly as `useRef` is in the splash.
  const returnFocusTo = createRef<HTMLElement>();
  const view = render(
    <MemoryRouter>
      <GlassMenu onClose={onClose} returnFocusTo={returnFocusTo} />
    </MemoryRouter>,
  );
  return { onClose, returnFocusTo, ...view };
}

const dialog = () => screen.getByRole("dialog", { name: "Menu" });
const entry = (name: string) => screen.getByRole("link", { name });
const closeEntry = () => screen.getByRole("button", { name: "Close" });

describe("GlassMenu — the dialog", () => {
  it("should be a modal dialog with the three named entries", () => {
    renderMenu();

    expect(dialog()).toHaveAttribute("aria-modal", "true");
    expect(entry("The River")).toHaveAttribute("href", "/river");
    expect(entry("Curate")).toHaveAttribute("href", "/curate");
    expect(closeEntry()).toBeInTheDocument();
    // Nothing else is in the dialog: a fourth control would be a fourth thing to tab through.
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });

  it("should give every entry a comfortable target", () => {
    // `min-h-14` is 3.5rem = 56 px, over the 44 px floor (DESIGN-SYSTEM §8); jsdom has no layout, so
    // the *rendered* height is measured in Chromium (probe output in the report) and this pins the
    // declaration the measurement is made of.
    renderMenu();

    for (const target of [entry("The River"), entry("Curate"), closeEntry()]) {
      expect(target).toHaveClass("min-h-14");
      expect(target).toHaveClass("w-full");
    }
  });
});

describe("GlassMenu — focus (criterion 3)", () => {
  it("should move focus to the first entry when it opens", () => {
    renderMenu();

    expect(document.activeElement).toBe(entry("The River"));
  });

  it("should walk the middle of the list, not only its edges", () => {
    renderMenu();

    fireEvent.keyDown(window, { key: "Tab" });

    expect(document.activeElement).toBe(entry("Curate"));
  });

  it("should wrap forward from the last entry to the first, and block the browser's own move", () => {
    renderMenu();
    closeEntry().focus();

    const allowed = fireEvent.keyDown(window, { key: "Tab" });

    expect(document.activeElement).toBe(entry("The River"));
    // `false` is RTL's "the default action was prevented" — the half that keeps focus inside.
    expect(allowed).toBe(false);
  });

  it("should wrap backwards from the first entry to the last", () => {
    renderMenu();
    entry("The River").focus();

    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });

    expect(document.activeElement).toBe(closeEntry());
  });

  it("should catch focus that is on the container rather than on an entry", () => {
    renderMenu();
    dialog().focus();

    fireEvent.keyDown(window, { key: "Tab" });
    expect(document.activeElement).toBe(entry("The River"));

    dialog().focus();
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(closeEntry());
  });
});

describe("GlassMenu — closing (criteria 3 and 4)", () => {
  it("should close on Escape, exactly once per press", () => {
    // The one-listener rule, pinned: the splash used to run an Escape handler of its own, and a second
    // one here would make the menu close twice — harmless today, a race the moment a close has a side
    // effect that is not idempotent. One press, one call.
    const { onClose } = renderMenu();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("should leave non-Escape keys alone", () => {
    const { onClose } = renderMenu();

    fireEvent.keyDown(window, { key: "a" });
    fireEvent.keyDown(window, { key: "Enter" });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("should close on a tap on the veil", () => {
    const { onClose } = renderMenu();

    fireEvent.click(screen.getByTestId("menu-veil"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("should stay open for a tap on the panel itself", () => {
    // The veil is a *sibling* of the panel, so a tap inside never reaches it — no stopPropagation, no
    // `event.target === event.currentTarget` check to get wrong.
    const { onClose } = renderMenu();

    fireEvent.click(dialog());

    expect(onClose).not.toHaveBeenCalled();
  });

  it("should close on the Close entry", () => {
    const { onClose } = renderMenu();

    fireEvent.click(closeEntry());

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("GlassMenu — the page while it is open (criterion 4)", () => {
  it("should lock the page scroll and release it when the menu closes", () => {
    const { unmount } = renderMenu();

    expect(document.documentElement.style.overflow).toBe("hidden");

    unmount();

    expect(document.documentElement.style.overflow).toBe("");
  });

  it("should put back the scroll value it found, not a remembered constant", () => {
    // The stylesheet sets none, but a future view might — and the menu must not be the reason it
    // changes. This is also the shape of the leak the route change would leave: the menu unmounts with
    // the splash, so this cleanup is the only thing that releases the lock.
    document.documentElement.style.overflow = "clip";

    const { unmount } = renderMenu();
    unmount();

    expect(document.documentElement.style.overflow).toBe("clip");
    document.documentElement.style.overflow = "";
  });
});

describe("GlassMenu — the material over a photo (the scrim rule)", () => {
  /**
   * The palettes the assertion has to hold for. The generator's bands are the design system's, made
   * numeric in `theme.ts` (§2.2): a background of OKLCh lightness 0.10–0.18 with chroma ≤ 0.05, and a
   * text token starting at lightness 0.86 with chroma ≤ 0.02. The *lightest* background with the
   * *dimmest* text is the pair that leaves the least room under the veil, so it is the case to assert;
   * the others are there so a generator that moves within its bands cannot pass by accident.
   */
  const palette = (bgLightness: number, textLightness: number) => ({
    colors: [
      {
        hex: oklchToHex({ l: bgLightness, c: 0.05, h: 200 }),
        oklch: { l: bgLightness, c: 0.05, h: 200 },
        weight: 0.5,
      },
      {
        hex: oklchToHex({ l: textLightness, c: 0.02, h: 200 }),
        oklch: { l: textLightness, c: 0.02, h: 200 },
        weight: 0.5,
      },
    ],
  });
  const WHITE = { r: 255, g: 255, b: 255 };
  const VEIL_ALPHA = 0.7;

  it("should keep every entry legible over a white photo, for the lightest theme the generator allows", () => {
    /*
     * The splash's background is the user's photo, and a photo can be white. An entry sits on the veil
     * (`bg-aura-bg/70`) plus the panel's glass (`rgba(0, 0, 0, 0.4)`), composited here the way a browser
     * composites it, through the repo's own generator and contrast functions.
     */
    renderMenu();
    const veil = screen.getByTestId("menu-veil");
    // The drift guard for the arithmetic below: change the scrim's alpha in the component and this
    // fails before the numbers do.
    expect(veil).toHaveClass("bg-aura-bg/70");
    // ...and the token every entry wears. `--aura-muted` over this veil measures **4.11:1** for the
    // lightest legal theme — under AA — which is why "Close" is not the quiet one (measured in the
    // report; the generator guarantees muted against the page background, not against glass).
    for (const target of [entry("The River"), entry("Curate"), closeEntry()]) {
      expect(target).toHaveClass("text-aura-text");
    }

    for (const [bgLightness, textLightness] of [
      [0.1, 0.86],
      [0.14, 0.9],
      [0.18, 0.86],
    ] as const) {
      const theme = paletteToTheme(palette(bgLightness, textLightness));
      const glass = parseColor(theme.glass);
      const panel = compositeOver(
        glass.rgb,
        glass.alpha,
        compositeOver(hexToRgb(theme.bg), VEIL_ALPHA, WHITE),
      );

      expect(
        contrastRatio(hexToRgb(theme.text), panel),
        `${theme.text} on the panel over ${theme.bg}, veil ${VEIL_ALPHA}`,
      ).toBeGreaterThanOrEqual(4.5);
    }

    // The control: without the veil, the same glass over the same white photo is *not* legible. It is
    // what makes the assertions above a statement about the veil rather than about the tokens.
    const worst = paletteToTheme(palette(0.18, 0.86));
    const bareGlass = parseColor(worst.glass);
    const glassOnWhite = compositeOver(bareGlass.rgb, bareGlass.alpha, WHITE);
    expect(
      contrastRatio(hexToRgb(worst.text), glassOnWhite),
      `${worst.text} on the bare glass over white`,
    ).toBeLessThan(4.5);
  });
});

describe("GlassMenu — motion (criterion 1)", () => {
  it("should declare its entry as motion-safe with the criterion's timing", () => {
    /*
     * The declaration half. `motion-safe:` compiles to `@media (prefers-reduced-motion: no-preference)`,
     * so under `reduce` the animation is never applied and the menu is simply on screen — the §5 rule,
     * and the reason no `matchMedia` is needed (absent in this environment, measured in E2-S1). The
     * *effect* — animation-name present under `no-preference`, absent under `reduce` — needs a browser
     * and is measured over CDP by emulating the media feature; this test cannot make that claim.
     */
    renderMenu();
    const panel = screen.getByRole("dialog", { name: "Menu" });

    expect(screen.getByTestId("menu-veil").className).toContain(
      "motion-safe:animate-[aether-veil-in_320ms_",
    );
    expect(panel.className).toContain("motion-safe:animate-[aether-sheet-in_320ms_");
  });
});
