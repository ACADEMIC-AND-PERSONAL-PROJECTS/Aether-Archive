import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import { AppProviders } from "./AppProviders";
import { RouteFallback } from "./RouteFallback";

/**
 * The route smoke test: each URL resolves to its own view.
 *
 * `App` is rendered under a `MemoryRouter` at a chosen URL, with the real providers — the router and the
 * query cache are what the app itself mounts (`main.tsx`), so this exercises the shell as it ships
 * rather than a simplified copy of it.
 *
 * The views are lazy chunks, so a view appearing means its dynamic import resolved: `findBy*` waits for
 * it, and a broken chunk path fails the test rather than passing on the fallback.
 */

/** What the archive answers for the splash hero (`Photo`, `_docs/openapi.yml`). */
const PHOTO = {
  id: "42b6608a-5e82-4a5d-b95c-2d077b7f5199",
  url: "/images/42b6608a-5e82-4a5d-b95c-2d077b7f5199.png",
  category: "pics",
  uploadedAt: "2026-10-16T03:29:32.289807Z",
};

/**
 * The splash asks the archive for a photo as soon as it mounts (E3-S1), and this environment has no API
 * behind it: an unstubbed `fetch` is measured to throw `TypeError: Failed to parse URL from
 * /api/v1/photos/random` on a relative URL (probe in the PR), which the app's retry policy then waits
 * 500 ms and 1 s to repeat. The tests below are about routing, so the archive answers the quiet state
 * that lets every route assertion be about the route.
 */
beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockImplementation(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          type: "about:blank",
          title: "The archive is empty",
          status: 404,
          detail: "There is no photo to show yet.",
          code: "empty-archive",
        }),
        { status: 404, headers: { "content-type": "application/problem+json" } },
      ),
    ),
  );
});

function renderAt(path: string): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppProviders>
        <App />
      </AppProviders>
    </MemoryRouter>,
  );
}

describe("App", () => {
  it("should show the splash view at /, quietly, when the archive holds no photo", async () => {
    renderAt("/");

    expect(await screen.findByRole("heading", { level: 1, name: "Aether Archive" })).toBeVisible();
    // The archive above is empty (404 `empty-archive`), and the splash says so through its state rather
    // than by crashing — criterion 5's "no crash" half, asserted against the app's real providers. The
    // words for that state are E3-S4's.
    await waitFor(() => expect(screen.getByRole("main")).toHaveAttribute("data-state", "empty"));
  });

  it("should keep the splash shell when the photo cannot be decoded here", async () => {
    // The **un-mocked** hero path, on purpose: the app's real providers and the real
    // `browserHeroEnvironment`. jsdom ships no `HTMLImageElement.decode` (probe:
    // `typeof img.decode === "undefined"`), so the hero rejects after its bytes arrive, and what is left
    // is the shell — named, still tapable, no photo, no crash. The happy path needs a decoder and is
    // covered in `SplashView.test.tsx` with the three browser edges faked; the browser's own guarantee
    // is the offline Chromium probe in the PR.
    let asked: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      asked = [...asked, url];
      return Promise.resolve(
        url.endsWith("/photos/random")
          ? new Response(JSON.stringify(PHOTO), {
              status: 200,
              headers: { "content-type": "application/json" },
            })
          : new Response(new Blob(["photo bytes"]), { status: 200 }),
      );
    });

    renderAt("/");

    await waitFor(() => expect(screen.getByRole("main")).toHaveAttribute("data-state", "error"));
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    // Two requests, not three: the photo's bytes are read once and both the `<img>` and the palette come
    // from that one read (`lib/image/hero.ts`).
    expect(asked).toEqual([
      "/api/v1/photos/random",
      "/images/42b6608a-5e82-4a5d-b95c-2d077b7f5199.png",
    ]);
  });

  it("should show the river feed at /river", async () => {
    renderAt("/river");

    expect(await screen.findByRole("heading", { level: 1, name: "The River" })).toBeVisible();
  });

  it("should show the curator's workshop at /curate", async () => {
    renderAt("/curate");

    expect(await screen.findByRole("heading", { level: 1, name: /Workshop/ })).toBeVisible();
  });

  it("should show the design-system check page at /check", async () => {
    renderAt("/check");

    expect(await screen.findByRole("heading", { level: 1, name: "Theme check" })).toBeVisible();
  });

  it("should render exactly one view per URL", async () => {
    renderAt("/river");
    await screen.findByRole("heading", { level: 1, name: "The River" });

    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(
      screen.queryByRole("heading", { level: 1, name: "Aether Archive" }),
    ).not.toBeInTheDocument();
  });

  it("should keep each view inside a main landmark", async () => {
    renderAt("/curate");

    expect(await screen.findByRole("main")).toBeVisible();
  });
});

describe("RouteFallback", () => {
  it("should announce loading to assistive technology without drawing anything", () => {
    render(<RouteFallback />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading view");
  });
});
