import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router";
import { describe, expect, it } from "vitest";

import { App } from "./App";
import { AppProviders } from "./AppProviders";
import { ENTER_DRIFT_SLOW } from "../lib/motion/tokens";

/**
 * The route transition, observed where the user meets it: which navigations replay the entry, and which
 * ones leave the view alone.
 *
 * ## What this file does and does not settle
 *
 * jsdom has no layout and no animation engine: `document.getAnimations` does not exist
 * (measured — `typeof document.getAnimations === "undefined"` in jsdom 30.1.3), and a `@keyframes` rule
 * is not resolved against an element's computed style. So nothing here claims that the fade *ran*, that
 * it moved 16 px, or what it looked like. What it settles is the mechanism the animation hangs off:
 * **a different view is a different element**. A CSS animation replays exactly when its element is
 * remounted, so "the wrapper is a new DOM node" is the testable half of "the transition replays", and
 * "the wrapper is the same node" is the testable half of "it does not".
 *
 * The browser half — the animation's computed `animation-name`, its progress across a frame sequence,
 * interruption mid-flight and both readings of `prefers-reduced-motion` — is measured over CDP against
 * the built bundle, and is in the story's report.
 */

/**
 * The router's own API on plain buttons: the app has no navigation chrome by design, and a test is not
 * a reason to add one. The destinations are the views that fetch nothing, so a navigation here is only
 * a navigation.
 */
function Nav() {
  const navigate = useNavigate();
  const entries: ReadonlyArray<readonly [string, string]> = [
    ["to curate", "/curate"],
    ["to check without a query", "/check"],
    ["to check with a query", "/check?theme=demo"],
    ["to check with another query", "/check?theme=paper"],
    ["to river", "/river"],
    ["to river with a slash", "/river/"],
  ];
  return (
    <div>
      {entries.map(([label, path]) => (
        <button key={label} type="button" onClick={() => navigate(path)}>
          {label}
        </button>
      ))}
    </div>
  );
}

function renderAt(path: string) {
  const view = render(
    <MemoryRouter initialEntries={[path]}>
      <AppProviders>
        {/* `App` first: the harness is the app plus a way to navigate, and App's own first child is
            the transition wrapper under test. */}
        <App />
        <Nav />
      </AppProviders>
    </MemoryRouter>,
  );
  return view;
}

/** App's own first child: the element the view is mounted into, and the one the entry is declared on. */
const wrapper = (container: HTMLElement): HTMLElement => {
  const element = container.firstElementChild;
  if (!(element instanceof HTMLElement)) {
    throw new Error("App rendered no transition wrapper");
  }
  return element;
};

const click = (name: string): void => {
  fireEvent.click(screen.getByRole("button", { name }));
};

describe("RouteTransition", () => {
  it("should own the view it animates, on the vocabulary's slow entry", async () => {
    const { container } = renderAt("/river");
    await screen.findByRole("heading", { level: 1, name: "The River" });

    const element = wrapper(container);
    // The class comes from `lib/motion/tokens.ts` — the vocabulary, not a timing written here.
    expect(element.className).toContain(ENTER_DRIFT_SLOW);
    // The view is inside the animated element, not beside it: an animation on a wrapper that did not
    // contain the view would fade an empty box and then reveal the view unanimated.
    expect(element).toContainElement(screen.getByRole("main"));
  });

  it("should give the view the height the shell leaves it", async () => {
    // `#root` is the flex column carrying the page's height (global.css, block 5). The wrapper sits
    // between root and view since E3-S3, so it is the thing that has to pass that height through.
    const { container } = renderAt("/river");
    await screen.findByRole("heading", { level: 1, name: "The River" });

    expect(wrapper(container)).toHaveClass("flex-1", "min-h-0");
  });

  it("should replay the entry when the view changes", async () => {
    const { container } = renderAt("/river");
    await screen.findByRole("heading", { level: 1, name: "The River" });
    const before = wrapper(container);

    click("to curate");
    await screen.findByRole("heading", { level: 1, name: /Workshop/ });

    // A new node, not the same node with new children: that is what replays a CSS animation.
    expect(wrapper(container)).not.toBe(before);
    expect(wrapper(container).className).toContain(ENTER_DRIFT_SLOW);
  });

  it("should leave the view alone when only the query string changes", async () => {
    const { container } = renderAt("/check");
    await screen.findByRole("heading", { level: 1, name: "Theme check" });
    const before = wrapper(container);

    click("to check with a query");
    await screen.findByRole("heading", { level: 1, name: "Theme check" });

    // Same path, different query: same element, no replay, and — the reason it matters — the view is
    // not remounted, so a query change stays a change *inside* the page rather than a new visit.
    expect(wrapper(container)).toBe(before);
  });

  it("should leave the view alone when the query changes again", async () => {
    // The second navigation is the one that would catch a transition keyed on the full URL: the first
    // one moves from a path with no query to a path with one, the second changes only the query.
    const { container } = renderAt("/check?theme=demo");
    await screen.findByRole("heading", { level: 1, name: "Theme check" });
    const before = wrapper(container);

    click("to check with another query");
    await screen.findByRole("heading", { level: 1, name: "Theme check" });

    expect(wrapper(container)).toBe(before);
  });

  it("should leave the view alone when a trailing slash arrives", async () => {
    const { container } = renderAt("/curate");
    await screen.findByRole("heading", { level: 1, name: /Workshop/ });
    const before = wrapper(container);

    click("to river");
    await screen.findByRole("heading", { level: 1, name: "The River" });
    const atRiver = wrapper(container);
    expect(atRiver).not.toBe(before);

    // `/river/` is the same route as `/river`, matched to the same view, so it must key the same
    // element. A naive `key={pathname}` remounts here — the regression this test exists for.
    click("to river with a slash");
    await screen.findByRole("heading", { level: 1, name: "The River" });

    expect(wrapper(container)).toBe(atRiver);
  });
});
