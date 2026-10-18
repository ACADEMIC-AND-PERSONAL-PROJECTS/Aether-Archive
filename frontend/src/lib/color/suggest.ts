/**
 * ADR-023's decision 3, as code: many picked photos, one ranked suggestion list.
 *
 * Each photo's palette (E2-S4, 64 px edge) carries five to eight colours whose weights sum to 1 over
 * that photo. Pooling them is two steps with a decision at each:
 *
 * - **Dedupe by normalised hex.** The same wall of rust in six frames is one suggestion, not six; the
 *   first occurrence carries its OKLCh through, and equal hexes decode equal.
 * - **Rank by summed weight.** A colour's confidence is its mean share across the photos that
 *   produced colours: the summed weight divided by their count. A `Palette` carries no pixel count,
 *   so the average is photo-per-photo, not pixel-per-pixel — the closest computable reading of
 *   "share of the selected pixels" — and the two differ only when the photos' areas do. The list is
 *   capped at `MAX_COLORS`, the same top-eight bound §2.1 gives one photo, so a capped list's shares
 *   sum to less than 1; they are never re-normalised, because the share is the number the picker
 *   will repeat.
 *
 * A failed extraction is skipped, and if every one fails the list is empty: the hex input remains
 * the picker's floor (ADR-023). The order is total — weight descending, then hex ascending — so a tie
 * never depends on the order the photos were passed in, and reordering the selection (E4-S3) never
 * re-ranks the swatches behind the curator's back.
 */
import { normalizeHex } from "./contrast";
import { extractPaletteFromBytes } from "./decode";
import { MAX_COLORS } from "./palette";

import type { Oklch, Palette, PaletteColor } from "./types";

/** The pipeline's only browser edge, injected for the reason `decode.ts` gives: jsdom cannot decode. */
export interface SuggestEnvironment {
  extract(source: Blob): Promise<Palette>;
}

export const browserSuggestEnvironment: SuggestEnvironment = {
  extract: (source) => extractPaletteFromBytes(source),
};

/** The tie-break: code-unit order, so two runs never disagree about which hex came first. */
function compareHex(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Pools palettes into one list: deduped by normalised hex, weights summed and divided by the number
 * of palettes that produced colours (an empty palette read no pixels and does not deflate the
 * shares), capped at `MAX_COLORS`. Inputs are trusted to be extraction's — canonical `#rrggbb`,
 * finite positive weights summing to 1 per palette; the share arithmetic and the total order assume
 * it.
 */
export function mergePalettes(palettes: readonly Palette[]): PaletteColor[] {
  const pooled = new Map<string, { oklch: Oklch; weight: number }>();
  let contributors = 0;
  for (const palette of palettes) {
    if (palette.colors.length === 0) {
      continue;
    }
    contributors += 1;
    for (const color of palette.colors) {
      const hex = normalizeHex(color.hex) ?? color.hex.trim().toLowerCase();
      const seen = pooled.get(hex);
      if (seen) {
        seen.weight += color.weight;
      } else {
        pooled.set(hex, { oklch: color.oklch, weight: color.weight });
      }
    }
  }
  if (contributors === 0) {
    return [];
  }
  return [...pooled.entries()]
    .map(([hex, { oklch, weight }]) => ({ hex, oklch, weight: weight / contributors }))
    .sort((left, right) => right.weight - left.weight || compareHex(left.hex, right.hex))
    .slice(0, MAX_COLORS);
}

/**
 * Extracts every source beside the others — `Promise.allSettled`, so one refusal is a skip, never a
 * failure — and merges the survivors. A synchronous throw from an injected `extract` is a refusal
 * too: the call settles it before it can escape.
 */
export async function suggestPalette(
  sources: readonly Blob[],
  environment: SuggestEnvironment = browserSuggestEnvironment,
): Promise<PaletteColor[]> {
  // `Promise.resolve().then(…)` makes every injected shape settle: a synchronous throw becomes a
  // rejection `allSettled` skips instead of escaping it.
  const settled = await Promise.allSettled(
    sources.map((source) => Promise.resolve().then(() => environment.extract(source))),
  );
  const palettes = settled
    .filter((result): result is PromiseFulfilledResult<Palette> => result.status === "fulfilled")
    .map((result) => result.value);
  return mergePalettes(palettes);
}
