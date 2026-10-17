import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SplashView } from "./SplashView";
import { queryKeys } from "../../api/queryKeys";
import { createQueryClient } from "../../app/queryClient";
import { compositeOver, contrastRatio, hexToRgb, parseColor } from "../../lib/color/contrast";
import { oklchToHex } from "../../lib/color/oklch";
import { FALLBACK_THEME, paletteToTheme, THEME_BANDS, type AuraTheme } from "../../lib/color/theme";
import {
  PULL_SURFACE_TOUCH_ACTION,
  PULL_THRESHOLD_PX,
  TAP_SLOP_PX,
} from "../../lib/gesture/pullToRefresh";
import { LOADING_PULSE } from "../../lib/motion/tokens";
import { ruleStatus, runAxe, violationSummary } from "../../test/axe";

import type { Palette } from "../../lib/color/types";
import type * as HeroModule from "../../lib/image/hero";
import type { Photo } from "../../types/api";

/**
 * The splash's behaviour, asserted where the user can observe it.
 *
 * ## Why the hero environment is mocked, and what stays real
 *
 * jsdom has no image pipeline at all — measured in the test process, not assumed: `typeof
 * HTMLImageElement.prototype.decode` is `undefined`, `createImageBitmap`, `OffscreenCanvas` and
 * `ImageData` are `undefined`, and an `<img>` pointed at a data URL fires neither `load` nor `error`
 * (probe output in the PR). The three browser edges are therefore faked
 * ({@link heroEnvironment}) while everything between them is the shipped code: the real `prepareHero`
 * ordering and error policy, the real `useHeroImage` state machine, the real `SplashView`. The same
 * split E2-S4 chose for the colour pipeline (ADR-018).
 *
 * The consequences for what these tests can and cannot say are named where they bite: the *browser*
 * guarantee ("the pixels really are decoded before the reveal") is proven by the offline Chromium
 * probe, not here, because the decoder is the one leaf that is faked — and the un-mocked edge itself
 * has its own test in `app/App.test.tsx`. The gesture has the same boundary at its own test below:
 * jsdom has pointer events but no gesture recognition, so what is pinned here is that the surface
 * still carries the `touch-action` a real browser needs, and the probe is what shows the drag arriving.
 */

const heroEnvironment = vi.hoisted(() => ({
  fetchBytes: vi.fn(),
  decode: vi.fn(),
  tone: vi.fn(),
}));

vi.mock("../../lib/image/hero", async (importOriginal) => {
  const actual = await importOriginal<typeof HeroModule>();
  return { ...actual, browserHeroEnvironment: heroEnvironment };
});

/** What the archive answers for the splash hero (`Photo`, `_docs/openapi.yml`). */
const PHOTO: Photo = {
  id: "42b6608a-5e82-4a5d-b95c-2d077b7f5199",
  url: "/images/42b6608a-5e82-4a5d-b95c-2d077b7f5199.png",
  category: "pics",
  uploadedAt: "2026-10-16T03:29:32.289807Z",
};

/** A second photo, so "a new photo arrived and this one is different" is a real change of url. */
const LATER_PHOTO: Photo = {
  id: "0f0c9a1e-5c1f-4d1a-9b1e-2f2c6f1a7b31",
  url: "/images/0f0c9a1e-5c1f-4d1a-9b1e-2f2c6f1a7b31.png",
  category: "anime",
  uploadedAt: "2026-10-16T04:02:11.000000Z",
};

/** A photo's palette — deep blue, warm sand, pale — and the theme it generates. */
const PHOTO_THEME: AuraTheme = paletteToTheme({
  colors: [
    {
      hex: oklchToHex({ l: 0.22, c: 0.05, h: 250 }),
      oklch: { l: 0.22, c: 0.05, h: 250 },
      weight: 0.5,
    },
    { hex: oklchToHex({ l: 0.7, c: 0.09, h: 60 }), oklch: { l: 0.7, c: 0.09, h: 60 }, weight: 0.3 },
    { hex: oklchToHex({ l: 0.9, c: 0.01, h: 80 }), oklch: { l: 0.9, c: 0.01, h: 80 }, weight: 0.2 },
  ],
} satisfies Palette);

const DECODED_SRC = "blob:decoded-photo";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** A body the archive writes for a failure, as `ApiExceptionHandler` writes one. */
function problemResponse(code: string, status: number): Response {
  return new Response(
    JSON.stringify({
      type: "about:blank",
      title: code === "empty-archive" ? "The archive is empty" : "Not found",
      status,
      detail: "Nothing to show.",
      code,
    }),
    { status, headers: { "content-type": "application/problem+json" } },
  );
}

/**
 * Stubs `fetch` with a **new** `Response` per call: a body can be read once, and the re-roll tests read
 * two of them. `restoreMocks` in `vite.config.ts` undoes the spy after every test.
 */
function stubApi(respond: () => Response) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(() => Promise.resolve(respond()));
}

/**
 * The view under the providers it really runs under. The router joined in E3-S2: the glass menu's two
 * destinations are `Link`s, and a `Link` outside a router throws (probed: "Cannot destructure property
 * 'basename' of 'React.useContext(...)' as it is null"), so the splash is rendered the way
 * `main.tsx` renders it instead of the menu being bent to fit a test.
 */
function renderSplash(client: QueryClient = createQueryClient()) {
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <SplashView />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const hero = () => screen.queryByRole("img", { name: "A photo from your archive" });

const tapTarget = () => screen.getByRole("button", { name: "Open the menu" });

beforeEach(() => {
  // Each test starts from the base state: `restoreMocks` restores `vi.spyOn` spies, but these hoisted
  // `vi.fn()`s keep whatever `…Once` values a previous test queued. Measured while mutating this file:
  // an unconsumed `mockRejectedValueOnce` from the re-roll test made the *next* test's photo fail to
  // decode, so one mutation looked like two unrelated deaths. Resetting first keeps each test's
  // failure its own.
  heroEnvironment.fetchBytes.mockReset();
  heroEnvironment.decode.mockReset();
  heroEnvironment.tone.mockReset();
  heroEnvironment.fetchBytes.mockResolvedValue(new Blob(["photo bytes"]));
  heroEnvironment.decode.mockResolvedValue({ src: DECODED_SRC, release: vi.fn() });
  heroEnvironment.tone.mockResolvedValue(PHOTO_THEME);
});

describe("SplashView — the photo", () => {
  it("should fill the viewport with the archive's photo and show no other text", async () => {
    stubApi(() => jsonResponse(PHOTO));
    renderSplash();

    const photo = await screen.findByRole("img", { name: "A photo from your archive" });
    expect(photo).toHaveAttribute("src", DECODED_SRC);
    expect(photo).toHaveClass("object-cover");
    expect(photo).toHaveClass("absolute", "inset-0", "h-full", "w-full");
    expect(screen.getByRole("main")).toHaveAttribute("data-state", "ready");

    // "Headerless, zero visible UI": the only text in the view is the one visually hidden heading.
    // Asserted as text rather than as markup, so a caption, a label or a stray sentence in the wrong
    // place fails here.
    expect(screen.getByRole("main").textContent).toBe("Aether Archive");
    expect(screen.getByRole("heading", { level: 1, name: "Aether Archive" })).toHaveClass(
      "sr-only",
    );
  });

  it("should ask the archive for a photo on every visit, never for one it already has", async () => {
    const fetchSpy = stubApi(() => jsonResponse(PHOTO));
    // One client for both visits: leaving the splash and coming back inside one app session is what
    // the criterion is about, and a fresh cache per render would prove nothing (measured probe: with
    // the app's default 30 s `staleTime`, the second visit issued **no request at all**).
    const client = createQueryClient();

    const firstVisit = renderSplash(client);
    await screen.findByRole("img", { name: "A photo from your archive" });
    firstVisit.unmount();

    // `staleTime: 0` alone does not give this criterion, and the request count cannot tell the two
    // apart: a stale-but-*cached* entry still answers the returning visit, so the previous photo is
    // painted and then swapped for the new one — the wrong photo, visibly, on the one screen whose
    // promise is a new one. `gcTime: 0` is what removes the entry, and this is the assertion that
    // separates the two variants: drop the constant and the entry is still here, so `waitFor` times
    // out (measured: `data-state="ready"` with the previous visit's `blob:` src on screen).
    await waitFor(() => expect(client.getQueryData(queryKeys.randomPhoto)).toBeUndefined());

    renderSplash(client);
    expect(screen.queryByRole("img", { name: "A photo from your archive" })).toBeNull();
    expect(screen.getByRole("main")).toHaveAttribute("data-state", "loading");
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    expect(fetchSpy.mock.calls.map(([url]) => url)).toEqual([
      "/api/v1/photos/random",
      "/api/v1/photos/random",
    ]);
  });

  it("should release the decoded photo and hand the page back to the stylesheet on leaving", async () => {
    const release = vi.fn();
    heroEnvironment.decode.mockResolvedValue({ src: DECODED_SRC, release });
    stubApi(() => jsonResponse(PHOTO));

    const { unmount } = renderSplash();
    await screen.findByRole("img", { name: "A photo from your archive" });
    unmount();

    // The blob URL is freed once nothing paints it — the splash does not leak one per visit…
    expect(release).toHaveBeenCalledTimes(1);
    // …and the neutral set the stylesheet declares is what the next view inherits.
    expect(document.documentElement.style.getPropertyValue("--aura-bg")).toBe("");
  });
});

describe("SplashView — the dominant tone (no flash of empty screen)", () => {
  it("should paint the photo's own tone while the photo is still decoding", async () => {
    // Guards the assertion below from passing vacuously: if the generated tone were the stylesheet's
    // neutral value, "the tone was applied" and "nothing was applied" would look identical.
    expect(PHOTO_THEME.bg).not.toBe(FALLBACK_THEME.bg);

    stubApi(() => jsonResponse(PHOTO));
    // A decode that never finishes: the state the placeholder exists for.
    heroEnvironment.decode.mockImplementation(() => new Promise(() => {}));
    renderSplash();

    await waitFor(() =>
      expect(document.documentElement.style.getPropertyValue("--aura-bg")).toBe(PHOTO_THEME.bg),
    );
    expect(screen.getByRole("main")).toHaveAttribute("data-state", "loading");
    // The reveal has not happened: no image, because the pixels are not decoded yet.
    expect(hero()).not.toBeInTheDocument();
    // The tone is the theme layer's, not a colour this view invented (§2.2 hex-literal rule).
    expect(heroEnvironment.tone).toHaveBeenCalledWith(expect.any(Blob));
  });

  it("should reveal the photo with the neutral set when no tone could be derived", async () => {
    stubApi(() => jsonResponse(PHOTO));
    heroEnvironment.tone.mockRejectedValue(new Error("unsupported"));
    renderSplash();

    await screen.findByRole("img", { name: "A photo from your archive" });
    expect(document.documentElement.style.getPropertyValue("--aura-bg")).toBe("");
  });
});

describe("SplashView — a re-roll that will not decode", () => {
  it("should report the failure over the photo it could not replace", async () => {
    let answers = 0;
    stubApi(() => {
      answers += 1;
      return jsonResponse(answers === 1 ? PHOTO : LATER_PHOTO);
    });
    heroEnvironment.decode
      .mockResolvedValueOnce({ src: DECODED_SRC, release: vi.fn() })
      .mockRejectedValueOnce(new Error("The photo could not be decoded."));

    renderSplash();
    await screen.findByRole("img", { name: "A photo from your archive" });

    // The state is reached the way the user reaches it: a pull past the threshold, and the second
    // photo answers and then refuses to decode.
    drag(PULL_THRESHOLD_PX);

    await waitFor(() => expect(screen.getByRole("main")).toHaveAttribute("data-state", "error"));
    // The previous photo is still what is painted: unmounting it would flash the placeholder over a
    // picture that is still perfectly good. The state, not the markup, carries the news — and if `src`
    // outranked `failed` (as it did before this was pinned) the view would report `ready` and E3-S4
    // would have nothing to render its notice for.
    expect(hero()).toHaveAttribute("src", DECODED_SRC);
    // The notice is rendered *over* that photo, with its own scrim — `error` does not imply a bare
    // background (the E3-S1A finding this story was routed). The scrim is what makes the glass
    // readable on the photo underneath; the painted contrast is measured in the browser.
    expect(screen.getByRole("status")).toHaveTextContent(/^Couldn't load a photo\.$/);
    expect(screen.getByTestId("quiet-error-scrim")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});

describe("SplashView — the tap target", () => {
  it("should open the menu on a tap anywhere, and close it on the next one", async () => {
    stubApi(() => jsonResponse(PHOTO));
    renderSplash();
    await screen.findByRole("img", { name: "A photo from your archive" });

    expect(tapTarget()).toHaveAttribute("aria-expanded", "false");
    expect(tapTarget()).toHaveAttribute("aria-haspopup", "dialog");

    fireEvent.click(tapTarget());
    expect(tapTarget()).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(tapTarget());
    expect(tapTarget()).toHaveAttribute("aria-expanded", "false");
  });

  it("should close the menu on Escape", async () => {
    stubApi(() => jsonResponse(PHOTO));
    renderSplash();
    await screen.findByRole("img", { name: "A photo from your archive" });

    fireEvent.click(tapTarget());
    expect(tapTarget()).toHaveAttribute("aria-expanded", "true");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(tapTarget()).toHaveAttribute("aria-expanded", "false");
  });

  it("should still open the menu for a tap that wobbled up to the slop", async () => {
    stubApi(() => jsonResponse(PHOTO));
    renderSplash();
    await screen.findByRole("img", { name: "A photo from your archive" });

    drag(TAP_SLOP_PX);
    fireEvent.click(tapTarget());

    expect(tapTarget()).toHaveAttribute("aria-expanded", "true");
  });
});

describe("SplashView — the glass menu (E3-S2)", () => {
  it("should open the archive's dialog on the tap target", async () => {
    stubApi(() => jsonResponse(PHOTO));
    renderSplash();
    await screen.findByRole("img", { name: "A photo from your archive" });

    fireEvent.click(tapTarget());

    // The open state `aria-expanded` has been claiming since E3-S1B is finally a screen. (The words
    // are not final: the entries are E3-S2's, and the quiet states' sentences remain E3-S4's.)
    expect(screen.getByRole("dialog", { name: "Menu" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "The River" })).toHaveAttribute("href", "/river");
    expect(screen.getByRole("link", { name: "Curate" })).toHaveAttribute("href", "/curate");
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
    expect(tapTarget()).toHaveAttribute("aria-expanded", "true");
  });

  it("should give focus back to the tap target when the menu closes", async () => {
    stubApi(() => jsonResponse(PHOTO));
    renderSplash();
    await screen.findByRole("img", { name: "A photo from your archive" });

    // A real tap leaves the button focused in a browser (measured in E3-S1B); jsdom's `click` does not
    // focus at all (probed), so the starting state is set explicitly rather than assumed.
    tapTarget().focus();
    fireEvent.click(tapTarget());
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "The River" }));

    fireEvent.keyDown(window, { key: "Escape" });

    expect(tapTarget()).toHaveAttribute("aria-expanded", "false");
    expect(document.activeElement).toBe(tapTarget());
  });

  it("should take the covered page out of the accessibility tree while the menu is open", async () => {
    stubApi(() => jsonResponse(PHOTO));
    renderSplash();
    await screen.findByRole("img", { name: "A photo from your archive" });

    // The declaration is the testable half: React renders `inert={true}` as the boolean attribute
    // `inert=""` (probed; the DOM *property* is what jsdom lacks). The effect — the tap target gone
    // from the accessibility tree and unfocusable while the dialog is open, back in both once it
    // closes — is measured in Chromium (`frontend/README.md`, "The accessibility pass").
    expect(screen.getByRole("main")).not.toHaveAttribute("inert");
    fireEvent.click(tapTarget());
    expect(screen.getByRole("main")).toHaveAttribute("inert");
    // ...and the dialog is a *sibling* of the covered surface. Nested inside `<main>` it would sit in
    // the inert subtree and be ignored with it — measured in Chromium: a dialog moved under an inert
    // `<main>` comes back `ignored: true, ignoredReasons: ["inertElement"]`, while the sibling dialog
    // stays exposed (`frontend/README.md`, "The accessibility pass").
    expect(screen.getByRole("dialog", { name: "Menu" }).closest("main")).toBeNull();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("main")).not.toHaveAttribute("inert");
    // ...and the focus return above still lands: closing removes the attribute and unmounts the
    // dialog, and focus ends on the trigger (measured in Chromium: `afterClose`).
    expect(document.activeElement).toBe(tapTarget());
  });

  it("should leave the photo alone when the drag starts on the open menu", async () => {
    const fetchSpy = stubApi(() => jsonResponse(PHOTO));
    renderSplash();
    await screen.findByRole("img", { name: "A photo from your archive" });

    fireEvent.click(tapTarget());
    // React events bubble through the React tree, and the menu is a sibling of `<main>` — where the
    // pull handlers live. Render it *inside* the surface instead and this drag re-rolls the photo
    // behind the open menu, which is exactly the defect this pins.
    const dialog = screen.getByRole("dialog", { name: "Menu" });
    fireEvent.pointerDown(dialog, { clientY: 100, pointerType: "touch" });
    fireEvent.pointerMove(dialog, { clientY: 100 + PULL_THRESHOLD_PX + 20, pointerType: "touch" });
    fireEvent.pointerUp(dialog, { clientY: 100 + PULL_THRESHOLD_PX + 20, pointerType: "touch" });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(tapTarget()).toHaveAttribute("aria-expanded", "true");
  });

  it("should own Escape alone, and hand the key back when the menu closes", async () => {
    stubApi(() => jsonResponse(PHOTO));
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    // Only `keydown` matters here: it is the key this story decided to have exactly one owner of. The
    // splash's own listener was deleted rather than kept beside the dialog's, because two listeners for
    // one key close twice or not at all — and *nothing else in the suite could tell the difference*:
    // measured, reinstating the old listener leaves every other test green. This census is what makes
    // the decision checkable (the same probe run in Chromium gives the same numbers).
    const openKeydown = (): number =>
      add.mock.calls.filter(([type]) => type === "keydown").length -
      remove.mock.calls.filter(([type]) => type === "keydown").length;

    renderSplash();
    await screen.findByRole("img", { name: "A photo from your archive" });
    const idle = openKeydown();

    fireEvent.click(tapTarget());
    expect(openKeydown() - idle).toBe(1);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(openKeydown() - idle).toBe(0);
  });

  it("should leave no scroll lock behind when the splash is left with the menu open", async () => {
    stubApi(() => jsonResponse(PHOTO));
    const { unmount } = renderSplash();
    await screen.findByRole("img", { name: "A photo from your archive" });

    fireEvent.click(tapTarget());
    expect(document.documentElement.style.overflow).toBe("hidden");

    // Leaving the splash is a route change in the app; the menu unmounts with the view, and this is the
    // cleanup that has to run — a stranded `overflow: hidden` would freeze the next view's scroll.
    unmount();

    expect(document.documentElement.style.overflow).toBe("");
  });
});

describe("SplashView — pull to refresh", () => {
  it("should re-roll the photo on a pull past the threshold without opening the menu", async () => {
    const fetchSpy = stubApi(() => jsonResponse(PHOTO));
    renderSplash();
    await screen.findByRole("img", { name: "A photo from your archive" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    drag(PULL_THRESHOLD_PX);
    // The browser fires a click after the release whatever the finger did; this one must be swallowed,
    // or the menu would open over the photo the pull just replaced.
    fireEvent.click(tapTarget());

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    expect(tapTarget()).toHaveAttribute("aria-expanded", "false");
  });

  it("should leave the photo alone when the drag stopped short of the threshold", async () => {
    const fetchSpy = stubApi(() => jsonResponse(PHOTO));
    renderSplash();
    await screen.findByRole("img", { name: "A photo from your archive" });

    drag(PULL_THRESHOLD_PX - 1);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("should leave the photo alone when the gesture was cancelled", async () => {
    const fetchSpy = stubApi(() => jsonResponse(PHOTO));
    renderSplash();
    await screen.findByRole("img", { name: "A photo from your archive" });

    const main = screen.getByRole("main");
    fireEvent.pointerDown(main, { clientY: 100 });
    fireEvent.pointerMove(main, { clientY: 100 + PULL_THRESHOLD_PX + 20 });
    fireEvent.pointerCancel(main);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("should claim the pull from the browser's own scroll gesture", async () => {
    /*
     * The one CSS fact this story needs, and the one jsdom cannot evaluate: it has no gesture
     * recognition, so nothing here can assert the *effect*. What is pinned is that the surface still
     * declares it. Measured in Chromium on the built bundle, with a synthesised touch drag: with the
     * default `touch-action: auto` the stream is `pointerdown → pointermove → pointercancel` and no
     * re-roll happens (the browser took the drag for a scroll); with `pan-x pinch-zoom` the whole stream
     * arrives and the photo re-rolls. Probe output in the PR.
     */
    stubApi(() => jsonResponse(PHOTO));
    renderSplash();
    await screen.findByRole("img", { name: "A photo from your archive" });

    expect(screen.getByRole("main")).toHaveClass(PULL_SURFACE_TOUCH_ACTION);
  });

  it("should not let a drag swallow the tap that follows it", async () => {
    stubApi(() => jsonResponse(PHOTO));
    renderSplash();
    await screen.findByRole("img", { name: "A photo from your archive" });

    drag(PULL_THRESHOLD_PX);
    fireEvent.click(tapTarget());
    // The suppressed click answered for the drag; the next gesture starts clean.
    drag(TAP_SLOP_PX);
    fireEvent.click(tapTarget());

    expect(tapTarget()).toHaveAttribute("aria-expanded", "true");
  });
});

describe("SplashView — quiet states (E3-S4)", () => {
  it("should breathe the theme's tone while loading, never a labelled spinner", async () => {
    stubApi(() => jsonResponse(PHOTO));
    // A decode that never finishes: the window the placeholder exists for.
    heroEnvironment.decode.mockImplementation(() => new Promise(() => {}));
    renderSplash();

    await waitFor(() => expect(screen.getByRole("main")).toHaveAttribute("data-state", "loading"));

    const pulse = screen.getByTestId("quiet-loading");
    expect(pulse).toHaveAttribute("aria-hidden", "true");
    // What a unit test can honestly pin is the vocabulary. jsdom has no `getAnimations` and no
    // `matchMedia`, and this suite loads no stylesheet (measured — `frontend/README.md`, "The quiet
    // states — measured"), so the class is asserted here and the frames are a Chromium measurement.
    expect(pulse).toHaveClass(LOADING_PULSE);
    expect(pulse).not.toHaveClass("motion-enter");
    expect(pulse).toHaveClass("bg-aura-surface", "opacity-25");
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByText(/loading/i)).toBeNull();
  });

  it("should say the empty archive in one display-serif sentence on the base", async () => {
    stubApi(() => problemResponse("empty-archive", 404));
    renderSplash();

    // E3-S5B moved `role="status"` off this paragraph and onto the splash's persistent region. The
    // words are asserted twice, once per surface, so the visible sentence and the announced one cannot
    // drift apart.
    const sentence = await screen.findByTestId("quiet-empty");
    expect(sentence).toHaveTextContent(/^Your archive is empty for now\.$/);
    expect(screen.getByRole("status")).toHaveTextContent(/^Your archive is empty for now\.$/);
    // The criterion's type rule, and §2.2's token rule: display serif, the text token, not the muted
    // one (the muted token is guaranteed on the page, not through glass — §2.2).
    expect(sentence).toHaveClass("font-display");
    expect(sentence).toHaveClass("text-aura-text");
    expect(sentence).not.toHaveClass("text-aura-muted");
    // One sentence, no chrome: no retry, no spinner, and the loading placeholder is gone.
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByTestId("quiet-loading")).toBeNull();
    // The screen is still the app: the view is named and the tap target is still there.
    expect(screen.getByRole("heading", { level: 1, name: "Aether Archive" })).toBeInTheDocument();
    expect(tapTarget()).toBeInTheDocument();
  });

  it("should show a glass notice with a named retry, and never the server's words", async () => {
    const fetchSpy = stubApi(() => problemResponse("not-found", 404));
    renderSplash();

    // The visible sentence and the persistent live region say the same thing (E3-S5B); the region is
    // what a screen reader hears on the change, the paragraph is what the retry is described by.
    const message = await screen.findByTestId("quiet-error-message");
    expect(message).toHaveTextContent(/^Couldn't load a photo\.$/);
    const announced = screen.getByRole("status");
    expect(announced).toHaveTextContent(/^Couldn't load a photo\.$/);
    // The problem+json body in this test carries `detail: "Nothing to show."`; criterion 3 forbids
    // echoing it, and a raw message is exactly what a copied server string looks like.
    expect(message).not.toHaveTextContent("Nothing to show.");
    expect(announced).not.toHaveTextContent("Nothing to show.");
    expect(screen.queryByRole("alert")).toBeNull();

    const retry = screen.getByRole("button", { name: "Try again" });
    expect(retry).toHaveAttribute("type", "button");
    expect(retry).toHaveAttribute("aria-describedby", message.id);
    expect(retry).toHaveClass("text-aura-text");
    expect(retry).not.toHaveClass("text-aura-muted");
    // The single glass material, and the notice's own scrim. Measured over a white photo: the glass
    // tint alone is 2.30:1, scrim + glass + text is 7.47:1 (README, "The quiet states — measured").
    expect(retry.closest(".glass")).not.toBeNull();
    expect(screen.getByTestId("quiet-error-scrim")).toHaveClass("bg-aura-bg/70");
    expect(screen.queryByTestId("quiet-loading")).toBeNull();

    fireEvent.click(retry);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
  });

  it("should recover the photo when the retry is answered", async () => {
    let answers = 0;
    stubApi(() => {
      answers += 1;
      return answers === 1 ? problemResponse("not-found", 404) : jsonResponse(PHOTO);
    });
    renderSplash();

    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));

    const photo = await screen.findByRole("img", { name: "A photo from your archive" });
    expect(photo).toHaveAttribute("src", DECODED_SRC);
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("should keep the shell when a photo arrives but cannot be decoded", async () => {
    stubApi(() => jsonResponse(PHOTO));
    heroEnvironment.decode.mockRejectedValue(new Error("The photo could not be decoded."));
    renderSplash();

    await waitFor(() => expect(screen.getByRole("main")).toHaveAttribute("data-state", "error"));
    expect(hero()).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/^Couldn't load a photo\.$/);
    expect(screen.getByRole("heading", { level: 1, name: "Aether Archive" })).toBeInTheDocument();
    expect(tapTarget()).toBeInTheDocument();
  });

  it("should raise the notice over the photo a failed re-roll request kept", async () => {
    let answers = 0;
    const fetchSpy = stubApi(() => {
      answers += 1;
      return answers === 1 ? jsonResponse(PHOTO) : problemResponse("not-found", 404);
    });

    renderSplash();
    await screen.findByRole("img", { name: "A photo from your archive" });

    // A real pull, a real failed request — not a state flip. TanStack keeps the last successful
    // `data` when the refetch fails, so `data !== undefined` alone would answer `ready` and the API
    // failure would be silent; the notice is the only thing that reports it.
    drag(PULL_THRESHOLD_PX);

    await waitFor(() => expect(screen.getByRole("main")).toHaveAttribute("data-state", "error"));
    expect(hero()).toHaveAttribute("src", DECODED_SRC);
    expect(screen.getByRole("status")).toHaveTextContent(/^Couldn't load a photo\.$/);
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

describe("SplashView — the quiet states' announcement (E3-S5B)", () => {
  it("should fill a live region that already existed, never mount one with its text", async () => {
    // The fetch is held open so the assertion about the *first* render is made before any state can
    // change: this is the moment the region has to exist, because a live region announces changes.
    let answer: (() => void) | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          answer = () => resolve(problemResponse("not-found", 404));
        }),
    );
    renderSplash();

    const region = screen.getByRole("status");
    expect(screen.getByRole("main")).toHaveAttribute("data-state", "loading");
    expect(region).toBeEmptyDOMElement();
    // The region is a sibling of `<main>`, not a child: a fetch can settle while the menu is open,
    // and `<main>` is inert then. Chromium measures that half (README, "The accessibility pass");
    // here the structural fact is pinned, because a region inside the covered surface is the failure.
    expect(region.closest("main")).toBeNull();

    await waitFor(() => expect(answer).toBeTypeOf("function"));
    await act(async () => {
      answer?.();
    });

    await waitFor(() => expect(screen.getByRole("main")).toHaveAttribute("data-state", "error"));
    // Same node, now filled. That is the property an announcement needs and an inserted region lacks:
    // the region was exposed while empty, and its content changed under it.
    expect(screen.getByRole("status")).toBe(region);
    expect(region).toHaveTextContent(/^Couldn't load a photo\.$/);
  });
});

describe("SplashView — the accessibility audit (E3-S5A)", () => {
  /*
   * The threshold is in `test/axe.ts`: **zero violations at every impact**. The `color-contrast` bucket
   * is asserted too, because a green axe run in jsdom is not a contrast check — measured on this
   * screen, axe returns it as `incomplete` (no layout, no paint, no canvas), and on the menu as
   * `inapplicable`. The arithmetic evidence is `SplashView — text over glass and images` below; the
   * painted pixels are a Chromium measurement (`frontend/README.md`, "The accessibility pass").
   */
  it("should produce no axe violations in the ready state, with contrast named incomplete", async () => {
    stubApi(() => jsonResponse(PHOTO));
    renderSplash();

    await screen.findByRole("img", { name: "A photo from your archive" });
    const results = await runAxe(document.body);

    expect(violationSummary(results)).toEqual([]);
    expect(ruleStatus(results, "color-contrast")).toBe("incomplete");
  });

  it("should produce no axe violations in the loading state", async () => {
    // The response is held open: the state under audit is the loading wash, so the query must not
    // settle between the render and the run. This was the one user-reachable splash state the gate
    // did not audit — the review probed it clean and asked for it here rather than later.
    const fetchSpy = stubApi(() => jsonResponse(PHOTO));
    fetchSpy.mockImplementation(() => new Promise<Response>(() => {}));
    renderSplash();

    expect(screen.getByRole("main")).toHaveAttribute("data-state", "loading");
    const results = await runAxe(document.body);

    expect(violationSummary(results)).toEqual([]);
    expect(ruleStatus(results, "color-contrast")).toBe("incomplete");
  });

  it("should produce no axe violations in the empty state, with contrast named incomplete", async () => {
    stubApi(() => problemResponse("empty-archive", 404));
    renderSplash();

    // Since E3-S5B the persistent status region exists in every state, so `findByRole("status")`
    // resolves before the answer arrives and the audit could run on `loading`. The state attribute is
    // what makes the test's name true, and it is the wait as well as the assertion.
    await waitFor(() => expect(screen.getByRole("main")).toHaveAttribute("data-state", "empty"));
    const results = await runAxe(document.body);

    expect(violationSummary(results)).toEqual([]);
    expect(ruleStatus(results, "color-contrast")).toBe("incomplete");
  });

  it("should produce no axe violations in the error state, with contrast named incomplete", async () => {
    stubApi(() => problemResponse("not-found", 404));
    renderSplash();

    await waitFor(() => expect(screen.getByRole("main")).toHaveAttribute("data-state", "error"));
    const results = await runAxe(document.body);

    expect(violationSummary(results)).toEqual([]);
    expect(ruleStatus(results, "color-contrast")).toBe("incomplete");
  });

  it("should produce no axe violations with the menu open, and not mistake inapplicable for a pass", async () => {
    stubApi(() => jsonResponse(PHOTO));
    renderSplash();
    await screen.findByRole("img", { name: "A photo from your archive" });

    fireEvent.click(tapTarget());
    // The dialog is the state this run claims to audit; without this assertion it would audit the
    // splash again and still pass, which is the failure mode a test name cannot catch.
    expect(screen.getByRole("dialog", { name: "Menu" })).toBeInTheDocument();
    const results = await runAxe(document.body);

    expect(violationSummary(results)).toEqual([]);
    // Measured: with the dialog open axe does not evaluate the rule at all — `inapplicable`, not
    // `pass`. The menu's arithmetic evidence is in `GlassMenu.test.tsx`; the painted pixels are a
    // Chromium measurement (`frontend/README.md`, "The accessibility pass").
    expect(ruleStatus(results, "color-contrast")).toBe("inapplicable");
  });
});

describe("SplashView — text over glass and images (the scrim rule, E3-S5B)", () => {
  /** The generator's bands (§2.2), made numeric in `theme.ts`; the lightest background is the worst case. */
  const palette = (bgLightness: number, textLightness: number): Palette => ({
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
  // Derived from the generator's own bands rather than copied from them: a hard-coded triple keeps
  // passing if the bands widen, because it would then measure a range the generator no longer produces.
  // The three samples are the two extremes and the middle of the current bands.
  const { bgLightness: BG, textLightness: TEXT } = THEME_BANDS;
  const BANDS = [
    [BG.min, TEXT.min],
    [(BG.min + BG.max) / 2, (TEXT.min + TEXT.max) / 2],
    [BG.max, TEXT.min],
  ] as const;
  const WHITE = { r: 255, g: 255, b: 255 };
  const VEIL_ALPHA = 0.7;

  it("should keep the empty sentence on the base legible, fallback and generated alike", async () => {
    stubApi(() => problemResponse("empty-archive", 404));
    renderSplash();

    const sentence = await screen.findByTestId("quiet-empty");
    expect(sentence).toHaveClass("text-aura-text");
    expect(
      contrastRatio(hexToRgb(FALLBACK_THEME.text), hexToRgb(FALLBACK_THEME.bg)),
    ).toBeGreaterThanOrEqual(4.5);

    // The empty sentence sits directly on `--aura-bg`, not on glass: the generator's own guarantee.
    for (const [bgLightness, textLightness] of BANDS) {
      const theme = paletteToTheme(palette(bgLightness, textLightness));
      expect(
        contrastRatio(hexToRgb(theme.text), hexToRgb(theme.bg)),
        `${theme.text} on ${theme.bg}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("should keep the notice's two text styles legible over a white photo", async () => {
    stubApi(() => problemResponse("not-found", 404));
    renderSplash();

    const message = await screen.findByTestId("quiet-error-message");
    const retry = screen.getByRole("button", { name: "Try again" });
    // Both styles — the message (`text-base`) and the retry (`text-sm`) — wear the text token, never
    // the muted one; this is the rule §2.2 derived from E3-S2's 4.14:1 finding.
    for (const element of [message, retry]) {
      expect(element).toHaveClass("text-aura-text");
      expect(element).not.toHaveClass("text-aura-muted");
    }
    // Drift guard for the composite below: the scrim is the menu veil's value, local to the notice.
    expect(screen.getByTestId("quiet-error-scrim")).toHaveClass("bg-aura-bg/70");

    const compositeOnWhite = (bgLightness: number, textLightness: number): number => {
      const theme = paletteToTheme(palette(bgLightness, textLightness));
      const glass = parseColor(theme.glass);
      const panel = compositeOver(
        glass.rgb,
        glass.alpha,
        compositeOver(hexToRgb(theme.bg), VEIL_ALPHA, WHITE),
      );
      return contrastRatio(hexToRgb(theme.text), panel);
    };

    for (const [bgLightness, textLightness] of BANDS) {
      expect(
        compositeOnWhite(bgLightness, textLightness),
        `text ${textLightness} on panel from bg ${bgLightness}, scrim ${VEIL_ALPHA} over white`,
      ).toBeGreaterThanOrEqual(4.5);
    }

    // The control that makes the scrim the subject: the same glass on the same white photo without it.
    const worst = paletteToTheme(palette(0.18, 0.86));
    const bareGlass = parseColor(worst.glass);
    const glassOnWhite = compositeOver(bareGlass.rgb, bareGlass.alpha, WHITE);
    expect(contrastRatio(hexToRgb(worst.text), glassOnWhite)).toBeLessThan(4.5);
  });
});

/** A complete downward drag and release of `distance` px, starting from the top of the screen. */
function drag(distance: number): void {
  const main = screen.getByRole("main");
  fireEvent.pointerDown(main, { clientY: 100, pointerType: "touch" });
  fireEvent.pointerMove(main, { clientY: 100 + distance, pointerType: "touch" });
  fireEvent.pointerUp(main, { clientY: 100 + distance, pointerType: "touch" });
}
