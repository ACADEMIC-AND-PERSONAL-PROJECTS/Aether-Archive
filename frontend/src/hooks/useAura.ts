import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

import { normalizeHex } from "../lib/color/contrast";
import { suggestPalette } from "../lib/color/suggest";
import { applyTheme, clearTheme, themeFromBackground } from "../lib/color/theme";

import type { PaletteColor } from "../lib/color/types";

/**
 * The curator's aura as React state (E4-S4C): the chosen colour, where the suggestions come from and
 * where the preview lands.
 *
 * ## Only the aura persists (ADR-023 decision 4)
 *
 * `chosen` is initialised from one `sessionStorage` key and written back on every change — the hex
 * and nothing else; the picked `File`s never touch storage. A refresh restores the colour over an
 * empty workshop. Storage can be unavailable (private modes): every access is guarded and the aura
 * then simply lives for the view's life.
 *
 * ## Extraction is keyed to membership, not to the array
 *
 * The workshop replaces its `items` array on every upload state change, so keying extraction to its
 * identity would re-decode the photos many times per queue. The effect below depends on the sorted
 * ids instead: reordering never re-extracts (the ranking is order-independent, E4-S4B), adding or
 * removing does, once. The files themselves are read through a ref the commit effect keeps current.
 * While `enabled` is false — the queue is running — extraction rests; the panel shows progress. A
 * gate that reopens on an unchanged membership re-extracts once; accepted — O(n), and invisible
 * beside the queue that just ended.
 *
 * ## The preview is contrast by construction
 *
 * `choose` validates through `themeFromBackground` before holding anything: a refused page (pure
 * black or white, ADR-023 decision 1) never becomes state, and `suggestions` drops refused colours
 * so every swatch offered is applicable. The theme is applied on `targetRef` — the workshop's root —
 * and cleared when the choice changes or the hook unmounts, as the splash does (ADR-023 decision 4).
 */

/** ADR-023 decision 4: one key, one value, for the browsing session only. */
export const AURA_STORAGE_KEY = "aether-archive:aura";

/** The shape the workshop's selection already has: `id` is the membership key, `file` the source. */
export interface AuraSource {
  readonly id: string;
  readonly file: File;
}

/** What `choose` did, so the picker can report without re-validating (it owns only the words). */
export type AuraChoiceResult =
  | { readonly status: "applied"; readonly hex: string }
  | { readonly status: "invalid" }
  | { readonly status: "refused" };

export interface Aura {
  /** The chosen `#rrggbb`, or `null` while the workshop keeps the neutral set. */
  readonly chosen: string | null;
  /** Ranked suggestions, refused colours dropped; empty until the first extraction lands. */
  readonly suggestions: readonly PaletteColor[];
  /** Validates `value` and, on success, becomes the aura: state and preview together. */
  readonly choose: (value: string) => AuraChoiceResult;
  /** Restores the top suggestion; with no suggestions, clears back to the neutral set. */
  readonly reset: () => void;
}

export interface AuraOptions {
  /** False while the queue runs: the panel shows progress, so extraction rests and returns after. */
  readonly enabled?: boolean;
}

/** True when the engine will carry this page — the one predicate the picker's offers obey. */
function isCarriable(hex: string): boolean {
  try {
    themeFromBackground(hex);
    return true;
  } catch {
    return false;
  }
}

/** The stored aura, re-validated: a hand-edited or stale value the engine refuses is ignored. */
function readStoredAura(): string | null {
  try {
    const stored = window.sessionStorage.getItem(AURA_STORAGE_KEY);
    if (stored === null) {
      return null;
    }
    const hex = normalizeHex(stored);
    return hex !== null && isCarriable(hex) ? hex : null;
  } catch {
    return null;
  }
}

/** Persists the chosen hex (or clears it) — one key for the browsing session. */
function writeStoredAura(hex: string | null): void {
  try {
    if (hex === null) {
      window.sessionStorage.removeItem(AURA_STORAGE_KEY);
    } else {
      window.sessionStorage.setItem(AURA_STORAGE_KEY, hex);
    }
  } catch {
    // A blocked Storage is a lost session, not a broken workshop.
  }
}

/** Identity by the fields the picker reads, so an unchanged ranking causes no re-render. */
function sameSuggestions(a: readonly PaletteColor[], b: readonly PaletteColor[]): boolean {
  return (
    a.length === b.length &&
    a.every((colour, index) => colour.hex === b[index]?.hex && colour.weight === b[index]?.weight)
  );
}

export function useAura(
  sources: readonly AuraSource[],
  targetRef: RefObject<HTMLElement | null>,
  options: AuraOptions = {},
): Aura {
  const { enabled = true } = options;
  const [chosen, setChosen] = useState<string | null>(readStoredAura);
  const [suggestions, setSuggestions] = useState<readonly PaletteColor[]>([]);

  const sourcesRef = useRef(sources);
  useEffect(() => {
    sourcesRef.current = sources;
  });

  const membership = sources
    .map((source) => source.id)
    .sort()
    .join("|");

  const runRef = useRef(0);
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const run = ++runRef.current;
    const files = sourcesRef.current.map((source) => source.file);
    if (files.length === 0) {
      setSuggestions((previous) => (previous.length === 0 ? previous : []));
      return;
    }
    void suggestPalette(files).then((colours) => {
      if (run !== runRef.current) {
        return;
      }
      const usable = colours.filter((colour) => isCarriable(colour.hex));
      setSuggestions((previous) => (sameSuggestions(previous, usable) ? previous : usable));
    });
    return () => {
      runRef.current += 1;
    };
  }, [membership, enabled]);

  useEffect(() => {
    const target = targetRef.current;
    if (target === null) {
      return;
    }
    if (chosen !== null) {
      try {
        applyTheme(themeFromBackground(chosen), target);
      } catch {
        // Both entrances validate through the same engine check; this is the belt for a future
        // divergence, not a known shape.
      }
    }
    return () => clearTheme(target);
  }, [chosen, targetRef]);

  const choose = useCallback((value: string): AuraChoiceResult => {
    const hex = normalizeHex(value);
    if (hex === null) {
      return { status: "invalid" };
    }
    if (!isCarriable(hex)) {
      return { status: "refused" };
    }
    writeStoredAura(hex);
    setChosen(hex);
    return { status: "applied", hex };
  }, []);

  const reset = useCallback((): void => {
    const next = suggestions[0]?.hex ?? null;
    writeStoredAura(next);
    setChosen(next);
  }, [suggestions]);

  return { chosen, suggestions, choose, reset };
}
