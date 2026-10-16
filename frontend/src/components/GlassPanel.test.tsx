import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GlassPanel } from "./GlassPanel";

describe("GlassPanel", () => {
  it("renders its children inside the glass material", () => {
    render(<GlassPanel>Caption</GlassPanel>);

    const panel = screen.getByText("Caption");
    expect(panel).toBeVisible();
    expect(panel).toHaveClass("glass");
  });

  it("composes the caller's utilities without dropping the material", () => {
    render(<GlassPanel className="p-4">Caption</GlassPanel>);

    expect(screen.getByText("Caption")).toHaveClass("glass", "p-4");
  });

  it("passes through the div attributes it does not consume", () => {
    render(
      <GlassPanel data-testid="panel" aria-label="Glass card">
        Caption
      </GlassPanel>,
    );

    expect(screen.getByTestId("panel")).toHaveAttribute("aria-label", "Glass card");
  });
});
