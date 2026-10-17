import { describe, expect, it } from "vitest";

import { focusTargets, nextFocusIndex } from "./trap";

/**
 * The trap's two decisions, at their boundaries.
 *
 * jsdom does not move focus on a `Tab` keydown at all (measured in this process: focus stays put and
 * no default action runs), so `nextFocusIndex` is not a helper that happens to be testable — it *is*
 * the trap's movement, in both environments. Every boundary a `Tab` can arrive at is a case below: the
 * first target, the last, the middle, focus that is on no target at all (the dialog container or the
 * page outside it), and a container with nothing to focus.
 *
 * The fixtures are built with the DOM API and not with a renderer: this module is React-free and its
 * test stays that way.
 */

/** A button; `attributes` are the ones a `Tab` press cares about. */
function control(text: string, attributes: Record<string, string> = {}): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = text;
  for (const [name, value] of Object.entries(attributes)) {
    button.setAttribute(name, value);
  }
  return button;
}

/** A link, the other kind of target the dialog renders. */
function link(text: string, href: string): HTMLAnchorElement {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.textContent = text;
  return anchor;
}

function containerOf(...children: HTMLElement[]): HTMLElement {
  const container = document.createElement("div");
  container.append(...children);
  return container;
}

/** What a target is called, for assertions that read like the screen. */
const names = (container: HTMLElement): (string | null)[] =>
  focusTargets(container).map((element) => element.textContent);

describe("nextFocusIndex", () => {
  it("should walk forward and stop at the last target", () => {
    expect(nextFocusIndex(0, 3, false)).toBe(1);
    expect(nextFocusIndex(1, 3, false)).toBe(2);
  });

  it("should wrap forward from the last target to the first", () => {
    expect(nextFocusIndex(2, 3, false)).toBe(0);
  });

  it("should wrap backwards from the first target to the last", () => {
    expect(nextFocusIndex(0, 3, true)).toBe(2);
    expect(nextFocusIndex(2, 3, true)).toBe(1);
  });

  it("should enter the list from the side the keyboard is travelling towards", () => {
    // Focus is not on a target: on the dialog container, or on the page behind it.
    expect(nextFocusIndex(-1, 3, false)).toBe(0);
    expect(nextFocusIndex(-1, 3, true)).toBe(2);
  });

  it("should treat an out-of-range index the same way as no index", () => {
    expect(nextFocusIndex(7, 3, false)).toBe(0);
    expect(nextFocusIndex(7, 3, true)).toBe(2);
  });

  it("should report that there is nothing to focus in an empty container", () => {
    expect(nextFocusIndex(-1, 0, false)).toBe(-1);
    expect(nextFocusIndex(0, 0, true)).toBe(-1);
  });

  it("should handle a single target as both the first and the last", () => {
    expect(nextFocusIndex(0, 1, false)).toBe(0);
    expect(nextFocusIndex(0, 1, true)).toBe(0);
  });
});

describe("focusTargets", () => {
  it("should return the tabbable controls in document order", () => {
    const container = containerOf(link("The River", "/river"), control("Close"));

    expect(names(container)).toEqual(["The River", "Close"]);
  });

  it("should skip what a Tab press cannot reach", () => {
    const container = containerOf(
      control("disabled", { disabled: "" }),
      control("hidden", { hidden: "" }),
      control("aria-hidden", { "aria-hidden": "true" }),
      // A *button* with `tabindex="-1"`: natively focusable, explicitly taken out of the sequence.
      // Caught here while this function was being written — the selector alone let it through.
      control("unsequenced", { tabindex: "-1" }),
      // The dialog container's own markup: a plain element, `tabindex="-1"`, in the list by accident.
      control("container", { tabindex: "-1" }),
      // Both at once — the case the review measured: `button:not([disabled])` refuses it, then
      // `[tabindex]` re-admits it, and the selector alone offers a stop that cannot take focus.
      control("disabled-but-tabindexed", { disabled: "", tabindex: "0" }),
      link("Curate", "/curate"),
    );

    // A trap that walked into any of the first six would move focus to something the user cannot reach
    // with a finger or a Tab: the disabled controls, the invisible ones, and the two `-1`s.
    expect(names(container)).toEqual(["Curate"]);
  });

  it("should include an explicitly tabbable element", () => {
    // `[tabindex]:not([tabindex="-1"])` is the clause that catches a control none of the element names
    // covers — and the reason `tabindex="-1"` is excluded is the dialog container itself.
    const container = containerOf(control("explicit", { tabindex: "0" }));

    expect(names(container)).toEqual(["explicit"]);
  });

  it("should return nothing when the container holds no controls", () => {
    expect(focusTargets(containerOf())).toEqual([]);
  });
});
