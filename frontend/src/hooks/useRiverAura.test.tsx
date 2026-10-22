import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { selectActiveDump, useRiverAura, type DumpAura } from "./useRiverAura";

/**
 * The River's ambient background selector (E5-S2).
 *
 * `selectActiveDump` is the pure logic: given a map of dump-id → intersection ratio, return the
 * id with the highest ratio. The hook wires an IntersectionObserver; its integration is tested
 * through a mock observer that fires controlled entries.
 */

/* ---------------------------------------------------------------- selectActiveDump --- */

describe("selectActiveDump", () => {
  it("should return null when no dumps are visible", () => {
    expect(selectActiveDump(new Map())).toBeNull();
  });

  it("should return the only visible dump", () => {
    const visible = new Map([["dump-1", 0.4]]);
    expect(selectActiveDump(visible)).toBe("dump-1");
  });

  it("should return the dump with the highest ratio", () => {
    const visible = new Map([
      ["dump-1", 0.2],
      ["dump-2", 0.6],
      ["dump-3", 0.3],
    ]);
    expect(selectActiveDump(visible)).toBe("dump-2");
  });

  it("should return a dump even at a tiny ratio", () => {
    const visible = new Map([["dump-1", 0.01]]);
    expect(selectActiveDump(visible)).toBe("dump-1");
  });
});

/* ----------------------------------------------------------------- useRiverAura hook --- */

type ObserverCallback = IntersectionObserverCallback;
type ObserverOptions = IntersectionObserverInit;

let lastCallback: ObserverCallback;
let lastOptions: ObserverOptions | undefined;
const observed = new Set<Element>();
const mockDisconnect = vi.fn();

beforeEach(() => {
  observed.clear();
  mockDisconnect.mockClear();

  vi.stubGlobal(
    "IntersectionObserver",
    class MockIntersectionObserver {
      constructor(callback: ObserverCallback, options?: ObserverOptions) {
        lastCallback = callback;
        lastOptions = options;
      }
      observe(target: Element): void {
        observed.add(target);
      }
      unobserve(target: Element): void {
        observed.delete(target);
      }
      disconnect(): void {
        observed.clear();
        mockDisconnect();
      }
    },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeEntry(
  target: Element,
  isIntersecting: boolean,
  ratio: number,
): IntersectionObserverEntry {
  return {
    target,
    isIntersecting,
    intersectionRatio: ratio,
    boundingClientRect: target.getBoundingClientRect(),
    intersectionRect: target.getBoundingClientRect(),
    rootBounds: null,
    time: performance.now(),
  };
}

const DUMPS: readonly DumpAura[] = [
  { id: "dump-a", backgroundColor: "#1a2b3c" },
  { id: "dump-b", backgroundColor: "#3c2b1a" },
];

function RiverInner({ dumps }: { readonly dumps: readonly DumpAura[] }) {
  const ref = { current: null } as React.RefObject<HTMLDivElement | null>;

  useRiverAura(ref, dumps);

  return (
    <div ref={ref as React.RefObject<HTMLDivElement>} data-testid="container">
      {dumps.map((d) => (
        <article key={d.id} data-dump-id={d.id} data-testid={`dump-${d.id}`}>
          Dump {d.id}
        </article>
      ))}
    </div>
  );
}

describe("useRiverAura — observer setup", () => {
  it("should create an IntersectionObserver with a center-biased rootMargin", () => {
    render(<RiverInner dumps={DUMPS} />);

    expect(lastOptions?.rootMargin).toBe("-35% 0px -35% 0px");
  });

  it("should observe all dump sections in the container", () => {
    const { container } = render(<RiverInner dumps={DUMPS} />);

    const sections = container.querySelectorAll("[data-dump-id]");
    expect(sections.length).toBe(2);
    expect(observed.size).toBe(2);
  });

  it("should disconnect the observer on unmount", () => {
    const { unmount } = render(<RiverInner dumps={DUMPS} />);

    unmount();

    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });

  it("should not create an observer when there are no dumps", () => {
    render(<RiverInner dumps={[]} />);

    expect(observed.size).toBe(0);
  });
});

describe("useRiverAura — theme application", () => {
  it("should apply theme properties when a dump enters the detection zone", () => {
    const { container } = render(<RiverInner dumps={DUMPS} />);
    const el = container.querySelector("[data-testid='container']") as HTMLElement;
    const dumpEl = container.querySelector("[data-dump-id='dump-a']") as HTMLElement;

    lastCallback([makeEntry(dumpEl, true, 0.5)], {} as IntersectionObserver);

    expect(el.style.getPropertyValue("--aura-bg")).not.toBe("");
  });

  it("should clear theme properties when all dumps leave the detection zone", () => {
    const { container } = render(<RiverInner dumps={DUMPS} />);
    const el = container.querySelector("[data-testid='container']") as HTMLElement;
    const dumpEl = container.querySelector("[data-dump-id='dump-a']") as HTMLElement;

    lastCallback([makeEntry(dumpEl, true, 0.5)], {} as IntersectionObserver);
    expect(el.style.getPropertyValue("--aura-bg")).not.toBe("");

    lastCallback([makeEntry(dumpEl, false, 0)], {} as IntersectionObserver);
    expect(el.style.getPropertyValue("--aura-bg")).toBe("");
  });

  it("should switch to the dump with the highest ratio when two are visible", () => {
    const { container } = render(<RiverInner dumps={DUMPS} />);
    const el = container.querySelector("[data-testid='container']") as HTMLElement;
    const dumpA = container.querySelector("[data-dump-id='dump-a']") as HTMLElement;
    const dumpB = container.querySelector("[data-dump-id='dump-b']") as HTMLElement;

    lastCallback([makeEntry(dumpA, true, 0.2)], {} as IntersectionObserver);
    const bgAfterA = el.style.getPropertyValue("--aura-bg");

    lastCallback([makeEntry(dumpB, true, 0.5)], {} as IntersectionObserver);
    const bgAfterB = el.style.getPropertyValue("--aura-bg");

    expect(bgAfterB).not.toBe("");
    expect(bgAfterB).not.toBe(bgAfterA);
  });
});
