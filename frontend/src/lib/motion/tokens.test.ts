import { describe, expect, it } from "vitest";

import * as motion from "./tokens";
import {
  DISTANCE_ENTER_PX,
  DURATION_MS,
  EASE_SOFT,
  LOADING_PULSE,
  MOTION_MARKER_CLASS,
} from "./tokens";
import globalCss from "../../styles/global.css?raw";

/**
 * The drift guard between `lib/motion/tokens.ts` and `styles/global.css` — the same shape as
 * `lib/color/theme.test.ts`'s guard over the palette: the TypeScript side is the vocabulary the rest of
 * the code reads, the stylesheet is what the browser applies, and a test is the only thing that keeps
 * them equal.
 *
 * Written this way because the failure it prevents is silent. A class string that names a variable or a
 * keyframe the stylesheet does not define does not throw, does not warn and does not animate: the
 * `animation` shorthand becomes invalid at computed-value time and the property is dropped, so the
 * surface simply appears. `npm run build` is happy. Only a browser — or this test — notices.
 */

/** Comments are stripped so a value mentioned in prose cannot satisfy an assertion about a value. */
const SOURCE = globalCss.replace(/\/\*[\s\S]*?\*\//g, "");

/**
 * The text of a braced block, found by a pattern and closed by counting braces. The pattern is what
 * makes a *name* match a name: `@keyframes aether-enter` as a plain string is also found inside
 * `@keyframes aether-enter-x`, so a keyframe renamed to a longer one would pass a guard that used
 * `indexOf`. Measured with a mutant: renaming the keyframe left all eight tests green until this
 * matched on the trailing `{`.
 */
function bracedBlockAt(source: string, pattern: RegExp): string {
  const match = pattern.exec(source);
  if (!match) {
    throw new Error(`global.css has no ${pattern}`);
  }
  const start = match.index;
  let depth = 0;
  for (let index = start + match[0].length - 1; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`Unbalanced braces after ${pattern}`);
}

function bracedBlock(source: string, prelude: string): string {
  return bracedBlockAt(source, new RegExp(prelude.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

/** `@keyframes <name> {` and nothing longer — the exact-name lookup the tests below need. */
function keyframeBlock(source: string, name: string): string {
  return bracedBlockAt(source, new RegExp(`@keyframes\\s+${name}\\s*\\{`));
}

const ROOT = bracedBlock(SOURCE, ":root");
const REDUCED = bracedBlock(SOURCE, "@media (prefers-reduced-motion: reduce)");

function valueOf(block: string, property: string): string {
  const value = new RegExp(`${property}\\s*:\\s*([^;]+);`).exec(block)?.[1];
  if (value === undefined) {
    throw new Error(`Missing ${property} in the block`);
  }
  return value.trim();
}

/**
 * Every class string the vocabulary offers — **derived from the module, not listed here**.
 *
 * A hand-maintained list is the hole this guard exists to close: measured, adding a fourth entry
 * constant that named a phantom keyframe (or an undeclared `var(--motion-duration-nope)`) left all eight
 * tests green, because the guard's scope was the array rather than the module. Reading the exports means
 * a new constant is covered the moment it lands, which is what the sentence above this used to claim.
 *
 * The test is `animate-[` rather than the entry marker: the loading pulse deliberately carries no
 * `motion-enter`, and a guard keyed on that marker would have left the one loop in the app unread —
 * exactly the constant most likely to name a variable nobody declared.
 */
const CLASS_STRINGS = Object.entries(motion).flatMap(([, value]) =>
  typeof value === "string" && value.includes("animate-[") ? [value] : [],
);

describe("motion tokens — the stylesheet mirrors them", () => {
  it("should declare every §5 duration as the token says", () => {
    expect(valueOf(ROOT, "--motion-duration-quick")).toBe(`${DURATION_MS.quick}ms`);
    expect(valueOf(ROOT, "--motion-duration-base")).toBe(`${DURATION_MS.base}ms`);
    expect(valueOf(ROOT, "--motion-duration-slow")).toBe(`${DURATION_MS.slow}ms`);
    expect(valueOf(ROOT, "--motion-duration-pulse")).toBe(`${DURATION_MS.pulse}ms`);
  });

  it("should declare §5's curve and distance as the token says", () => {
    expect(valueOf(ROOT, "--motion-ease-soft")).toBe(EASE_SOFT);
    expect(valueOf(ROOT, "--motion-distance-enter")).toBe(`${DISTANCE_ENTER_PX}px`);
  });

  it("should keep the durations under reduced motion and take the distance to zero", () => {
    // The criterion is "reduced motion disables transforms", not "disables motion": the fade is the
    // feature, so the durations must survive the `reduce` block untouched and only the drift collapse.
    expect(valueOf(REDUCED, "--motion-distance-enter")).toBe("0px");
    expect(REDUCED).not.toContain("--motion-duration");
  });

  it("should exempt the vocabulary's own entries from the freeze rule, and only them", () => {
    // The global rule squashes every animation under `reduce` to a still frame. `.motion-enter` is the
    // opt-in that keeps the entry's fade; if this selector and the constant drift apart, every entry
    // animation in the app silently stops fading on a user's phone and nothing else in the suite fails.
    expect(REDUCED).toContain(`:not(.${MOTION_MARKER_CLASS})`);
    expect(SOURCE).toContain(`animation-duration: 0.01ms !important`);
  });

  it("should name only variables the stylesheet defines", () => {
    const referenced = new Set(
      CLASS_STRINGS.flatMap((className) =>
        [...className.matchAll(/var\((--motion-[a-z-]+)\)/g)].map((match) => match[1]),
      ),
    );

    expect(referenced.size).toBeGreaterThan(0);
    for (const name of referenced) {
      expect(
        () => valueOf(ROOT, name as string),
        `${name} is referenced but not declared`,
      ).not.toThrow();
    }
  });

  it("should name only keyframes the stylesheet declares", () => {
    const referenced = new Set(
      CLASS_STRINGS.flatMap((className) =>
        [...className.matchAll(/animate-\[([a-z-]+)_/g)].map((match) => match[1]),
      ),
    );

    expect(referenced.size).toBeGreaterThan(0);
    for (const name of referenced) {
      expect(
        () => keyframeBlock(SOURCE, name as string),
        `${name} is referenced but has no @keyframes`,
      ).not.toThrow();
    }
  });

  it("should carry the drift in the keyframe and the end state as `none`", () => {
    // Two facts the classes cannot express. The drift is read from the variable (never a literal 16px),
    // which is what makes `reduce` a variable change rather than a second keyframe; and the end state is
    // `none` rather than `translateY(0)` so that no fill mode can leave the element transformed.
    const enter = keyframeBlock(SOURCE, "aether-enter");

    expect(enter).toContain("translateY(var(--motion-distance-enter))");
    expect(enter).not.toMatch(/translateY\(0\)/);
    expect(enter).toMatch(/to\s*\{[^}]*transform:\s*none/);
  });

  it("should leave the scrim out of the drift entirely", () => {
    // A full-height surface that moves uncovers an edge; the veil's keyframe is opacity only.
    const fade = keyframeBlock(SOURCE, "aether-fade");

    expect(fade).not.toContain("transform");
  });

  it("should keep the loading pulse a still frame under reduced motion", () => {
    // The pulse is the one permitted loop (§5, §7), and under `reduce` it must become a still frame.
    // The global freeze rule keys on the *absence* of the entry marker, so a pulse carrying it would
    // keep breathing on a user's phone; a transform in the keyframe would be movement the rule cannot
    // remove. Both are asserted here because neither is visible in a jsdom render.
    expect(LOADING_PULSE).not.toContain(MOTION_MARKER_CLASS);
    expect(LOADING_PULSE).toContain("infinite");

    const breathe = keyframeBlock(SOURCE, "aether-breathe");
    expect(breathe).not.toContain("transform");
    expect(breathe).toContain("opacity");
  });
});
