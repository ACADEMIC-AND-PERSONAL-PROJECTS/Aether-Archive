# Design References & Inspiration

> **Who reads this:** the `frontend-engineer` subagent and anyone doing UI work, **at the start of every
> frontend story**. Fetch the references that match the task, extract *principles*, then design.
>
> **Hard boundary:** these sites are **development-time inspiration only**. The shipped app must make
> **zero external requests** — no CDN, no webfont, no image, no analytics, no runtime API call to any of
> these tools. Nothing from this page is ever loaded by the application.

## 1. The target feeling: "soft & modern"

The owner's brief: **a soft, modern design** — a personal sanctuary, calm, high-end editorial. Everything
below is a translation of that brief into rules a reviewer can check.

### 1.1 Soft (how it should *feel*)

| Rule | Concrete expression |
| --- | --- |
| Low-contrast elegance | Never pure black (`#000`) or pure white (`#FFF`). Base around `#0B0B0D`–`#121215`, text around `#E8E6E3`. Let the images carry the brightness. |
| Muted colour | Accents are desaturated derivations of the image palette (chroma kept low). No neon, no saturated brand blue, no "AI purple". |
| Space as a feature | Generous margins; nothing touches the screen edge; section spacing on the 8-pt scale at the *large* end (32–64). |
| Rounded, organic geometry | Panels 20–24 px radius, controls 10–14 px, nothing with sharp 90° corners. |
| Gentle depth | One soft, wide, low-opacity shadow at most (`0 8px 24px rgba(0,0,0,0.24)`). Never stacked shadows. |
| Calm motion | Transitions 300–600 ms (micro-feedback 180 ms), `cubic-bezier(0.22, 1, 0.36, 1)`, 12–16 px travel. Nothing snaps, nothing bounces, nothing loops. |
| Quiet hierarchy | One focal element per view. If two things compete for attention, remove or mute one. |

### 1.2 Modern (how it should *read*)

- **Fluid typography** with `clamp()`; big editorial display serif against small, precise sans.
- **Adaptive transparency** (the 2026 direction): one glass material used consistently, over imagery
  only, never as decoration.
- **Ambient colour from content**: the interface takes its hue from the photo/dump in view — this is our
  signature, and the thing no template has.
- **Micro-interactions that feel physical**: press states, small lifts, tactile feedback — without
  springs that overshoot.
- **Editorial restraint**: images first, chrome last; text appears only where it means something.
- **Mobile-native feel**: safe areas, `100dvh`, thumb-reachable controls, no hover-only affordances.

### 1.3 Anti-patterns — reject on sight

Pure black/white · neon or high-saturation accents · stacked drop shadows · borders on every element ·
cards inside cards inside cards · bento-grid clichés · gradient blobs / "aurora mesh" wallpaper ·
emoji as UI icons · badges, ribbons, counters, upsells · "SaaS landing page" structure in an app ·
generic glass everywhere (glass only earns its place over imagery) · text over a busy photo without a
scrim · animated anything that the user did not trigger.

### 1.4 Review questions (ask these before opening a PR)

1. In a dim room at night, does this feel calm — or is something shouting?
2. Is there exactly one thing competing for my attention per view?
3. Does the design still hold if the photo is pale, dark, busy, or black-and-white?
4. Would the screen feel emptier *and better* with one element removed?
5. Is any element there to look "designed" rather than to be understood?

## 2. Products to study (what to borrow, what to leave)

| Reference | Why it is relevant | Borrow | Do NOT copy |
| --- | --- | --- | --- |
| [glass.photo](https://glass.photo) | The closest product: a quiet, photo-first archive with a paid-taste aesthetic | Restraint, image-first hierarchy, invisible controls | Its exact layout, its branding |
| [linear.app](https://linear.app) | Dark interfaces done with restraint; precise type; calm depth | Type scale discipline, muted surfaces, subtle borders | Density and feature chrome (we have no lists/toolbars) |
| [raycast.com](https://raycast.com) | Glass-ish surfaces, gradients used sparingly, strong focus states | How little is needed for depth; keyboard/focus care | Marketing-page gradients |
| [vercel.com/geist](https://vercel.com/geist) | A design system with a documented scale and tokens | Token discipline, neutral ramps | Its monochrome coldness — ours is warm and image-led |
| [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines) | Mobile conventions the user's phone already trains them on | Safe areas, gestures, motion timing, touch targets | iOS-native chrome (we have no nav bars) |
| [Material 3 — motion](https://m3.material.io/styles/motion/overview) | Motion vocabulary (durations, easing, emphasis) | Duration/easing logic for transitions | Material components and elevation model |

## 3. Galleries & moodboards (find patterns, not layouts to clone)

| Reference | Best for | Notes |
| --- | --- | --- |
| [Mobbin](https://mobbin.com) | Real mobile app screens & flows (largest library) | Search "photo gallery", "onboarding", "bottom sheet", "dark mode" |
| [Refero](https://refero.design) | Real product screenshots by pattern | Good for "empty state", "menu overlay", "photo viewer" |
| [Godly](https://godly.website) | Elite, interaction-forward site design | Inspiration for motion *taste*, not for app structure |
| [Hoverstat.es](https://hoverstat.es) | Hover/interaction details, micro-interactions | The best source for "small move, big feel" |
| [Dark.design](https://dark.design) | Curated dark-mode design | Reference for dark surfaces that are not flat black |
| [SiteInspire](https://siteinspire.com) | Editorial, type-led design | Type pairing and negative space |
| [Page Flows](https://pageflows.com) | Recorded user flows from real apps | Study transitions between views |
| [Savee](https://savee.it) | Visual moodboards | Pure mood reference for "soft, dim, luxurious" |
| [Muzli](https://www.muz.li) | Curated daily design feed | Trend scanning (filter hard: most of it is not our taste) |
| [Checklist Design](https://www.checklist.design) | UX patterns per screen type | Use for empty/error/loading-state patterns |

## 4. Interaction & motion

| Reference | Use it for |
| --- | --- |
| [Easings.net](https://easings.net) | Choosing the right curve; sanity-checking our `cubic-bezier(0.22, 1, 0.36, 1)` |
| [Cubic-bezier.com](https://cubic-bezier.com) | Building and comparing curves visually |
| [Motion (Framer Motion) docs](https://motion.dev) | The library we ship: variants, `AnimatePresence`, reduced motion |
| [Animations.dev](https://animations.dev) (Emil Kowalski) | The reference thinking on *tasteful* UI animation — read before E3-S3 |
| [Web Interface Guidelines](https://interfaces.rauno.me) | A checklist of interaction/interaction-detail rules worth failing a PR over |

## 5. Colour & contrast

| Reference | Use it for |
| --- | --- |
| [OKLCH Color Picker](https://oklch.com) | The space our extraction algorithm works in; verify palettes by hand |
| [Atmos OKLCH playground](https://atmos.style/playground) | Building perceptual palettes with predictable contrast |
| [Evil Martians — OKLCH ecosystem](https://evilmartians.com/chronicles/exploring-the-oklch-ecosystem-and-its-tools) | Why OKLCH beats HSL for generated themes; tooling landscape |
| [Radix Colors](https://www.radix-ui.com/colors) | How to structure accessible dark ramps (we do not install the package) |
| [Huemint](https://huemint.com) | Sanity-check a generated palette against a UI mock |
| [Realtime Colors](https://realtimecolors.com) | Quickly *see* a palette applied to type and surfaces |
| [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/) | The 4.5:1 check required by the design system and `.claude/rules/design-language.md` |
| [WCAG 2.2 Quick Reference](https://www.w3.org/WAI/WCAG22/quickref/) | The AA criteria we target for interactive UI |

## 6. Typography

| Reference | Use it for |
| --- | --- |
| [Fontsource](https://fontsource.org) | The **only** font source we install from (NPM packages, self-hosted) |
| [Typescale](https://typescale.com) | Deriving the fluid `clamp()` scale for `--text-*` |
| [Typewolf](https://typewolf.com) | Real-world serif/sans pairings and rationale |
| [Fontjoy](https://fontjoy.com) | Quick pairing exploration (then verify the pair exists on Fontsource) |
| [Butterick's Practical Typography](https://practicaltypography.com) | Timeless rules: measure, leading, tracking, hierarchy |

## 7. Glass & depth

| Reference | Use it for |
| --- | --- |
| [NN/g — Glassmorphism](https://www.nngroup.com/articles/glassmorphism/) | When glass helps and when it hurts (readability traps) |
| [CSS Glass generator](https://css.glass) | Comparing blur/tint/opacity values (output is a reference, not a dependency) |
| [Material 3 — motion & elevation](https://m3.material.io/styles/motion/overview) | Depth language that does not rely on shadows |

## 8. Component galleries — **inspiration only, do not install**

These show what modern glass/gradient UI looks like when executed well. We ship **no** UI kit: every
component is ours, in our tokens, with our accessibility rules.

[Aceternity UI](https://ui.aceternity.com) · [Magic UI](https://magicui.design) · [21st.dev](https://21st.dev)

Rule: if a technique seems worth borrowing, re-implement it with our primitives and record the decision
in the PR. Never copy a snippet, never add the dependency, never fetch anything from them at runtime.

## 9. Search recipes (for WebSearch / WebFetch during a story)

```
"dark glassmorphism" mobile app UI 2026 reference
"photo gallery app" dark minimal UI pattern
ios "bottom sheet" blur glass interaction guidelines
"empty state" dark minimal app design pattern
"fluid type scale" clamp css best practice
"oklch" palette generation contrast algorithm
"view transitions" mobile web subtle motion
accessible colour contrast glass blur text scrim
```

Prefer official documentation and real product screenshots over blog listicles. When a search result
is a template marketplace or an AI-generated mockup gallery, close it — it is not our taste.

## 10. Working method (how inspiration becomes code)

1. **Read this page**, then fetch **2–3 references** matching the story (Mobbin/Refero for structure,
   Hoverstat/Dark.design for feel, official docs for technique) — the domains listed here are
   pre-allowed in `.claude/settings.json`.
2. Write down **3–5 extracted principles** in the PR description ("glass only over imagery",
   "menu drifts up 16 px, never slides from the side", "markers are the only serif on the feed").
3. Implement with our tokens and primitives only (`GlassPanel`, `--aura-*`, `--font-*`).
4. Verify: screenshot at 390 px, contrast check, reduced-motion check, network log with **zero external
   requests**.
5. Review against the questions in §1.4 before opening the PR, and cite the references that informed
   the work — that is how taste stays traceable.
