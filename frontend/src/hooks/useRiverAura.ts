import { useEffect, useRef } from "react";

import { applyTheme, clearTheme, themeFromBackground, type AuraTheme } from "../lib/color/theme";

/**
 * The River's ambient background (E5-S2): the aura tokens follow the dump currently in view.
 *
 * An IntersectionObserver watches `[data-dump-id]` elements inside the scrollable container.
 * Only the center 30 % of the viewport is the detection zone (`rootMargin: -35% 0px`), so at
 * most one dump section is active at a time. When the active dump changes, its pre-computed
 * theme is applied on the container and the registered `@property` declarations + the
 * `[data-aura-transition]` rule (global.css §4/§5b) make the transition smooth.
 *
 * Contrast is guaranteed by construction: `themeFromBackground` validates every token against
 * the §2.2 floor before returning.
 */

export interface DumpAura {
  readonly id: string;
  readonly backgroundColor: string;
}

export function selectActiveDump(visible: ReadonlyMap<string, number>): string | null {
  let bestId: string | null = null;
  let bestRatio = 0;
  for (const [id, ratio] of visible) {
    if (ratio > bestRatio) {
      bestRatio = ratio;
      bestId = id;
    }
  }
  return bestId;
}

export function useRiverAura(
  containerRef: React.RefObject<HTMLElement | null>,
  dumps: readonly DumpAura[],
): void {
  const activeRef = useRef<string | null>(null);
  const cacheRef = useRef(new Map<string, AuraTheme>());

  useEffect(() => {
    const target = containerRef.current;
    if (!target || dumps.length === 0 || typeof IntersectionObserver === "undefined") return;
    const el: HTMLElement = target;

    const cache = cacheRef.current;
    for (const dump of dumps) {
      if (!cache.has(dump.id)) {
        try {
          cache.set(dump.id, themeFromBackground(dump.backgroundColor));
        } catch {
          // Invalid or refused colour — this dump won't trigger an aura change.
        }
      }
    }

    const visible = new Map<string, number>();

    function applyActive(): void {
      const bestId = selectActiveDump(visible);
      if (bestId === activeRef.current) return;
      activeRef.current = bestId;

      if (bestId !== null) {
        const theme = cache.get(bestId);
        if (theme) {
          applyTheme(theme, el);
        }
      } else {
        clearTheme(el);
      }
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.dumpId;
          if (!id) continue;
          if (entry.isIntersecting) {
            visible.set(id, entry.intersectionRatio);
          } else {
            visible.delete(id);
          }
        }
        applyActive();
      },
      {
        root: el,
        rootMargin: "-35% 0px -35% 0px",
        threshold: [0, 0.3, 0.5],
      },
    );

    const sections = el.querySelectorAll<HTMLElement>("[data-dump-id]");
    for (const section of sections) {
      observer.observe(section);
    }

    return () => {
      observer.disconnect();
      clearTheme(el);
      activeRef.current = null;
    };
  }, [containerRef, dumps]);
}
