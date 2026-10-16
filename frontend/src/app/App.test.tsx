import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";

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
  it("should show the splash view at /", async () => {
    renderAt("/");

    expect(await screen.findByRole("heading", { level: 1, name: "Aether Archive" })).toBeVisible();
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
