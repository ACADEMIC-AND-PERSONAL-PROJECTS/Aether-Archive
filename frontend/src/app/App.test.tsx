import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";

import { App } from "./App";
import { AppProviders } from "./AppProviders";
import { RouteFallback } from "./RouteFallback";

/**
 * The route smoke test: each of the three URLs resolves to its own view.
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

    // First mount of this lazy chunk in this file, so the fallback is what commits while the import
    // resolves: this assertion is what pins `fallback={<RouteFallback />}` on the Suspense boundary
    // (the E2-S2 review measured that removing it left every test green). Later tests reuse the
    // resolved chunk and would have nothing to assert.
    expect(screen.getByRole("status")).toHaveTextContent("Loading view");

    expect(await screen.findByRole("heading", { level: 1, name: "The River" })).toBeVisible();
  });

  it("should show the curator's workshop at /curate", async () => {
    renderAt("/curate");

    expect(await screen.findByRole("heading", { level: 1, name: /Workshop/ })).toBeVisible();
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
