import * as axe from "axe-core";

import type { AxeResults } from "axe-core";

/**
 * The accessibility audit (E3-S5A), in one place so both screens are held to the same threshold.
 *
 * ## The threshold
 *
 * **Zero violations, at every impact.** Not "no serious ones": the splash and the menu currently
 * produce none at all, so any new finding — including `moderate` and `minor` — fails the suite and
 * has to be fixed or routed with a named story. There is no allow-list here on purpose; an entry in
 * one would be a finding nobody owns.
 *
 * ## What a green run proves, and what it does not
 *
 * axe-core 4.14 runs in jsdom 30, but jsdom has no layout, no paint and no canvas. Measured on the
 * splash: `color-contrast` is returned as **incomplete** — axe declines to answer rather than passing
 * it. On the menu the same rule is **inapplicable**, so the menu's green run does not even attempt a
 * contrast check. Both buckets are asserted in the tests. Contrast evidence belongs to the behaviour
 * slice; a green `runAxe` means the structural and naming rules passed.
 */
export async function runAxe(container: HTMLElement): Promise<AxeResults> {
  return axe.run(container);
}

/** `rule-id (impact)` for every violation — the string a failure prints. */
export function violationSummary(results: AxeResults): string[] {
  return results.violations.map((violation) => `${violation.id} (${violation.impact})`);
}

/**
 * Which bucket axe put one rule in. `absent` means the rule did not run at all, which is different
 * from `inapplicable` (the rule ran and found no matching content) and from `incomplete` (it could
 * not decide). Tests name the bucket for `color-contrast` so a green run cannot be read as more than
 * it is.
 */
export function ruleStatus(
  results: AxeResults,
  id: string,
): "pass" | "incomplete" | "inapplicable" | "violation" | "absent" {
  if (results.violations.some((result) => result.id === id)) {
    return "violation";
  }
  if (results.incomplete.some((result) => result.id === id)) {
    return "incomplete";
  }
  if (results.passes.some((result) => result.id === id)) {
    return "pass";
  }
  if (results.inapplicable.some((result) => result.id === id)) {
    return "inapplicable";
  }
  return "absent";
}
