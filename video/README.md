# Aether Archive marketing film

This Remotion project contains two silent English films. `AetherArchiveMarketing` is the 36-second
product film built from evidence captures. `AetherArchiveBrandFilm` is the new 44-second brand film:
pure motion design with no product screenshots, no generated audio and no runtime network dependency.

```bash
cd video
npm install
npm run typecheck
npm run studio
npm run render
npm run render:brand
```

The final render is `out/aether-archive-marketing.mp4` and is uploaded to the `v1.0.0` release.
Source screenshots are copied from `reports/` and `reports/evidence/`; the local Fontsource files are
copied into `public/fonts/`. The final MP4 deliberately contains no audio track.

The composition follows Remotion's frame-driven model with `useCurrentFrame`, `spring`,
`interpolate`, `Sequence` and `Img`. It uses the project's ink/paper editorial direction with more
deliberate motion: parallax crops, animated grid lines, masked page reveals, paper-panel entrances,
kinetic type, staggered aura swatches and split-screen evidence.

The brand film adds an entirely synthetic visual language: a moving camera-roll field, layered aura
planes, orbital colour marks, six animated memory cards, a local-first seal and a final brand lockup.
Render it with `npm run render:brand`; the output is `out/aether-archive-brand-film.mp4`.
