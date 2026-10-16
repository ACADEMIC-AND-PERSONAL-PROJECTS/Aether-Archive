import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";

import { App } from "./App";
import { AppProviders } from "./AppProviders";

/**
 * The Suspense fallback, observed while a route chunk is genuinely pending.
 *
 * In its own file on purpose: Vitest gives every test file a fresh module registry, so this file's
 * first render always starts a fresh dynamic import — while a later mount inside a shared file reuses
 * the resolved chunk and sees no fallback. The review measured both failure modes: removing
 * `fallback={<RouteFallback />}` left the route smoke test green, and shuffling test order inside one
 * file can resolve the chunk before the assertion (E2-S2 re-review). Removing the fallback now fails
 * here, deterministically.
 */
describe("App — a pending view", () => {
  it("should show the silent, accessible fallback while the route chunk loads", async () => {
    render(
      <MemoryRouter initialEntries={["/river"]}>
        <AppProviders>
          <App />
        </AppProviders>
      </MemoryRouter>,
    );

    // Synchronously, before the dynamic import resolves: the only moment the fallback exists.
    expect(screen.getByRole("status")).toHaveTextContent("Loading view");

    // Settle so the file ends on a committed tree, not mid-suspense.
    expect(await screen.findByRole("heading", { level: 1, name: "The River" })).toBeVisible();
  });
});
