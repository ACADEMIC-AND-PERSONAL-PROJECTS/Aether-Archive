Dominant-colour extraction over downscaled bitmaps — pure, deterministic and unit-tested
(`.claude/rules/design-language.md`). No React imports in this tree.

`extractPalette` runs the `DESIGN-SYSTEM.md` §2.1 pipeline (downscale → cluster → score/filter → 5–8
weighted colours); `decode.ts` is the bytes→pixels edge. Default algorithm, filters and readings:
ADR-018.
