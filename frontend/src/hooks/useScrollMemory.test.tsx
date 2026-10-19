import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearScrollMemory,
  getScrollPosition,
  setScrollPosition,
  useScrollMemory,
} from "./useScrollMemory";

/**
 * Scroll memory (E5-S1D): back restores, a fresh visit starts at the top.
 *
 * The hook saves the scroll position of a named view in a module-level Map — it survives remounts
 * (route changes) but is lost on page refresh (module reload). Tests exercise the three promises:
 *
 * 1. A remount with a saved position and `ready=true` restores `scrollTop`.
 * 2. A mount with no saved position starts at 0.
 * 3. The position is saved on unmount (final read of `scrollTop`).
 *
 * jsdom does not lay out or scroll, but `scrollTop` is a writable property on `HTMLElement`, so
 * the save/restore contract is testable without a browser. The `requestAnimationFrame` debounce
 * in the scroll listener is mocked to fire synchronously.
 */

function Scroller({ viewKey, ready }: { readonly viewKey: string; readonly ready: boolean }) {
  const ref = useScrollMemory<HTMLDivElement>(viewKey, ready);
  return (
    <div ref={ref} data-testid="scroller" style={{ height: "200px", overflow: "auto" }}>
      <div style={{ height: "2000px" }} />
    </div>
  );
}

beforeEach(() => {
  clearScrollMemory();
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    cb(0);
    return 0;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useScrollMemory — restore", () => {
  it("should restore a saved position when ready becomes true", () => {
    setScrollPosition("river", 350);

    render(<Scroller viewKey="river" ready={true} />);

    const el = screen.getByTestId("scroller");
    expect(el.scrollTop).toBe(350);
  });

  it("should not restore when there is no saved position", () => {
    render(<Scroller viewKey="river" ready={true} />);

    const el = screen.getByTestId("scroller");
    expect(el.scrollTop).toBe(0);
  });

  it("should not restore while ready is false", () => {
    setScrollPosition("river", 200);

    render(<Scroller viewKey="river" ready={false} />);

    const el = screen.getByTestId("scroller");
    expect(el.scrollTop).toBe(0);
  });

  it("should restore once ready transitions to true", () => {
    setScrollPosition("river", 400);

    const { rerender } = render(<Scroller viewKey="river" ready={false} />);
    expect(screen.getByTestId("scroller").scrollTop).toBe(0);

    rerender(<Scroller viewKey="river" ready={true} />);
    expect(screen.getByTestId("scroller").scrollTop).toBe(400);
  });

  it("should not re-restore after the first ready", () => {
    setScrollPosition("river", 300);

    const { rerender } = render(<Scroller viewKey="river" ready={true} />);
    const el = screen.getByTestId("scroller");
    expect(el.scrollTop).toBe(300);

    // User scrolls to a new position.
    Object.defineProperty(el, "scrollTop", { value: 500, writable: true, configurable: true });

    // A rerender with ready still true must not overwrite the user's scroll.
    rerender(<Scroller viewKey="river" ready={true} />);
    expect(el.scrollTop).toBe(500);
  });
});

describe("useScrollMemory — save", () => {
  it("should save the position on unmount", () => {
    const { unmount } = render(<Scroller viewKey="river" ready={true} />);
    const el = screen.getByTestId("scroller");

    Object.defineProperty(el, "scrollTop", { value: 600, writable: true, configurable: true });

    unmount();

    expect(getScrollPosition("river")).toBe(600);
  });

  it("should save the position on scroll events", () => {
    render(<Scroller viewKey="river" ready={true} />);
    const el = screen.getByTestId("scroller");

    Object.defineProperty(el, "scrollTop", { value: 250, writable: true, configurable: true });
    el.dispatchEvent(new Event("scroll"));

    expect(getScrollPosition("river")).toBe(250);
  });

  it("should keep positions separate per key", () => {
    const { unmount: u1 } = render(<Scroller viewKey="river" ready={true} />);
    const el1 = screen.getByTestId("scroller");
    Object.defineProperty(el1, "scrollTop", { value: 100, writable: true, configurable: true });
    u1();

    const { unmount: u2 } = render(<Scroller viewKey="workshop" ready={true} />);
    const el2 = screen.getByTestId("scroller");
    Object.defineProperty(el2, "scrollTop", { value: 700, writable: true, configurable: true });
    u2();

    expect(getScrollPosition("river")).toBe(100);
    expect(getScrollPosition("workshop")).toBe(700);
  });
});

describe("useScrollMemory — fresh visit", () => {
  it("should start at 0 after clearScrollMemory", () => {
    setScrollPosition("river", 500);
    clearScrollMemory();

    render(<Scroller viewKey="river" ready={true} />);

    expect(screen.getByTestId("scroller").scrollTop).toBe(0);
  });

  it("should not restore when the saved position is 0", () => {
    setScrollPosition("river", 0);

    render(<Scroller viewKey="river" ready={true} />);

    expect(screen.getByTestId("scroller").scrollTop).toBe(0);
  });
});

describe("useScrollMemory — scroll during loading", () => {
  it("should not overwrite a saved position while ready is false", () => {
    setScrollPosition("river", 800);

    const { unmount } = render(<Scroller viewKey="river" ready={false} />);
    const el = screen.getByTestId("scroller");

    Object.defineProperty(el, "scrollTop", { value: 0, writable: true, configurable: true });
    el.dispatchEvent(new Event("scroll"));

    unmount();

    expect(getScrollPosition("river")).toBe(800);
  });
});
