import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SplashView } from "./SplashView";
import { queryKeys } from "../../api/queryKeys";
import { createQueryClient } from "../../app/queryClient";
import { oklchToHex } from "../../lib/color/oklch";
import { FALLBACK_THEME, paletteToTheme, type AuraTheme } from "../../lib/color/theme";

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
 * has its own test in `app/App.test.tsx`.
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
 * Stubs `fetch` with a **new** `Response` per call: a body can be read once, and a test that lets the
 * query answer twice would read two of them. `restoreMocks` in `vite.config.ts` undoes the spy after
 * every test.
 */
function stubApi(respond: () => Response) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(() => Promise.resolve(respond()));
}

function renderSplash(client: QueryClient = createQueryClient()) {
  return render(
    <QueryClientProvider client={client}>
      <SplashView />
    </QueryClientProvider>,
  );
}

const hero = () => screen.queryByRole("img", { name: "A photo from your archive" });

beforeEach(() => {
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

describe("SplashView — a later photo that will not decode", () => {
  it("should report the failure over the photo it could not replace", async () => {
    const client = createQueryClient();
    heroEnvironment.decode
      .mockResolvedValueOnce({ src: DECODED_SRC, release: vi.fn() })
      .mockRejectedValueOnce(new Error("The photo could not be decoded."));
    stubApi(() => jsonResponse(PHOTO));

    renderSplash(client);
    await screen.findByRole("img", { name: "A photo from your archive" });

    // A second photo arrives for the same query — how the app reaches this state is E3-S1B's re-roll;
    // what matters here is the state the view reports once a later hero fails.
    act(() => {
      client.setQueryData(queryKeys.randomPhoto, LATER_PHOTO);
    });

    await waitFor(() => expect(screen.getByRole("main")).toHaveAttribute("data-state", "error"));
    // The previous photo is still what is painted: unmounting it would flash the placeholder over a
    // picture that is still perfectly good. The state, not the markup, carries the news — and if `src`
    // outranked `failed` (as it did before this was pinned) the view would report `ready` and E3-S4
    // would have nothing to render its notice for.
    expect(hero()).toHaveAttribute("src", DECODED_SRC);
  });
});

describe("SplashView — quiet states (E3-S4 renders their words)", () => {
  it("should show the empty state, never a crash, when the archive holds no photo", async () => {
    stubApi(() => problemResponse("empty-archive", 404));
    renderSplash();

    await waitFor(() => expect(screen.getByRole("main")).toHaveAttribute("data-state", "empty"));
    expect(hero()).not.toBeInTheDocument();
    // The screen is still the app: the shell is named and nothing threw.
    expect(screen.getByRole("heading", { level: 1, name: "Aether Archive" })).toBeInTheDocument();
  });

  it("should show the error state, never a crash, when the archive refuses the request", async () => {
    // A 4xx that is not the empty archive. A 5xx or an unreachable archive reaches the same branch
    // after the app's retry policy (two attempts, 500 ms and 1 s) — not exercised here to keep the
    // suite free of real waits; `api/retryPolicy.test.ts` owns that policy.
    stubApi(() => problemResponse("not-found", 404));
    renderSplash();

    await waitFor(() => expect(screen.getByRole("main")).toHaveAttribute("data-state", "error"));
    expect(screen.getByRole("heading", { level: 1, name: "Aether Archive" })).toBeInTheDocument();
  });

  it("should keep the shell when a photo arrives but cannot be decoded", async () => {
    stubApi(() => jsonResponse(PHOTO));
    heroEnvironment.decode.mockRejectedValue(new Error("The photo could not be decoded."));
    renderSplash();

    await waitFor(() => expect(screen.getByRole("main")).toHaveAttribute("data-state", "error"));
    expect(hero()).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Aether Archive" })).toBeInTheDocument();
  });
});
