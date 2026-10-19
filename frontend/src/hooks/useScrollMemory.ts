import { useEffect, useRef } from "react";

/**
 * Remember a named view's scroll position across remounts — and forget it on page refresh (E5-S1D).
 *
 * Positions live in a module-level Map: a route change unmounts and remounts the view (the Map
 * survives), but a hard refresh or a new tab resets the module (the Map is empty). That is exactly
 * "back restores, a fresh visit starts at the top."
 *
 * `ready` gates restoration: the River's feed loads asynchronously, and restoring into a loading
 * skeleton sets `scrollTop` on a container whose scrollable height is zero.
 */

const positions = new Map<string, number>();

export function useScrollMemory<T extends HTMLElement = HTMLElement>(key: string, ready: boolean) {
  const ref = useRef<T>(null);
  const restored = useRef(false);

  useEffect(() => {
    if (!ready || restored.current) return;
    const el = ref.current;
    if (!el) return;
    const saved = positions.get(key);
    if (saved !== undefined && saved > 0) {
      el.scrollTop = saved;
    }
    restored.current = true;
  }, [key, ready]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let raf = 0;
    function onScroll() {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (el) positions.set(key, el.scrollTop);
      });
    }
    el.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("scroll", onScroll);
      positions.set(key, el.scrollTop);
    };
  }, [key]);

  return ref;
}

export function clearScrollMemory(): void {
  positions.clear();
}

export function setScrollPosition(key: string, pos: number): void {
  positions.set(key, pos);
}

export function getScrollPosition(key: string): number | undefined {
  return positions.get(key);
}
