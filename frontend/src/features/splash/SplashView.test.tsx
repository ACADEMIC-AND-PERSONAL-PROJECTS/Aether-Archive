import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SplashView } from "./SplashView";
import { queryKeys } from "../../api/queryKeys";
import { createQueryClient } from "../../app/queryClient";
import { oklchToHex } from "../../lib/color/oklch";
import { FALLBACK_THEME, paletteToTheme, type AuraTheme } from "../../lib/color/theme";
import {
  PULL_SURFACE_TOUCH_ACTION,
  PULL_THRESHOLD_PX,
  TAP_SLOP_PX,
} from "../../lib/gesture/pullToRefresh";

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

describe("SplashView — quiet states (E3-S4 renders their words)", () => {
  it("should show the empty state, never a crash, when the archive holds no photo", async () => {
    stubApi(() => problemResponse("empty-archive", 404));
    renderSplash();

    await waitFor(() => expect(screen.getByRole("main")).toHaveAttribute("data-state", "empty"));
    expect(hero()).not.toBeInTheDocument();
    // The screen is still the app: the view is named and the tap target is still there.
    expect(screen.getByRole("heading", { level: 1, name: "Aether Archive" })).toBeInTheDocument();
    expect(tapTarget()).toBeInTheDocument();
  });

  it("should show the error state, never a crash, when the archive refuses the request", async () => {
    // A 4xx that is not the empty archive. A 5xx or an unreachable archive reaches the same branch
    // after the app's retry policy (two attempts, 500 ms and 1 s) — not exercised here to keep the
    // suite free of real waits; `api/retryPolicy.test.ts` owns that policy.
    stubApi(() => problemResponse("not-found", 404));
    renderSplash();

    await waitFor(() => expect(screen.getByRole("main")).toHaveAttribute("data-state", "error"));
    expect(screen.getByRole("heading", { level: 1, name: "Aether Archive" })).toBeInTheDocument();
    expect(tapTarget()).toBeInTheDocument();
  });

  it("should keep the shell when a photo arrives but cannot be decoded", async () => {
    stubApi(() => jsonResponse(PHOTO));
    heroEnvironment.decode.mockRejectedValue(new Error("The photo could not be decoded."));
    renderSplash();

    await waitFor(() => expect(screen.getByRole("main")).toHaveAttribute("data-state", "error"));
    expect(hero()).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Aether Archive" })).toBeInTheDocument();
    expect(tapTarget()).toBeInTheDocument();
  });
});

/** A complete downward drag and release of `distance` px, starting from the top of the screen. */
function drag(distance: number): void {
  const main = screen.getByRole("main");
  fireEvent.pointerDown(main, { clientY: 100, pointerType: "touch" });
  fireEvent.pointerMove(main, { clientY: 100 + distance, pointerType: "touch" });
  fireEvent.pointerUp(main, { clientY: 100 + distance, pointerType: "touch" });
}
