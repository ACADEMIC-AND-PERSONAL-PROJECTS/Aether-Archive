import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";

import { CheckView } from "./CheckView";
import { clearTheme, FALLBACK_THEME } from "../../lib/color/theme";

function renderAt(url: string): void {
  render(
    <MemoryRouter initialEntries={[url]}>
      <CheckView />
    </MemoryRouter>,
  );
}

/* The page writes inline custom properties onto the document root; hand it back clean. */
afterEach(() => {
  clearTheme();
});

describe("CheckView", () => {
  it("renders every token, the glass description and five passing contrast rows", () => {
    renderAt("/check");

    expect(screen.getByRole("heading", { level: 1, name: "Theme check" })).toBeVisible();
    expect(screen.getByText("--aura-glass-solid")).toBeVisible();
    expect(
      screen.getByText(
        "blur(15px) saturate(1.2), the hairline, radius 20 — §3's material, tokens only.",
      ),
    ).toBeVisible();
    expect(screen.getAllByText("pass")).toHaveLength(5);
  });

  it("applies a derived theme when ?theme=demo is in the URL", () => {
    renderAt("/check?theme=demo");

    const accent = document.documentElement.style.getPropertyValue("--aura-accent");
    expect(accent).not.toBe("");
    expect(accent).not.toBe(FALLBACK_THEME.accent);
  });

  it("applies and clears through the buttons", () => {
    renderAt("/check");

    fireEvent.click(screen.getByRole("button", { name: "Apply fallback theme" }));
    expect(document.documentElement.style.getPropertyValue("--aura-text")).toBe(
      FALLBACK_THEME.text,
    );

    fireEvent.click(screen.getByRole("button", { name: "Reset to stylesheet" }));
    expect(document.documentElement.style.getPropertyValue("--aura-text")).toBe("");
  });
});
