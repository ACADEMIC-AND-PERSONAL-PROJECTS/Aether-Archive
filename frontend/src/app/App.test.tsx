import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "./App";

describe("App", () => {
  it("should render the archive name as the page's level-1 heading", () => {
    render(<App />);

    expect(screen.getByRole("heading", { level: 1, name: "Aether Archive" })).toBeVisible();
  });

  it("should render its content inside the main landmark", () => {
    render(<App />);

    expect(screen.getByRole("main")).toContainElement(screen.getByRole("paragraph"));
  });
});
