# Frontend — React + Vite

Scaffolding lands in **Sprint 2, E2-S1** (`docs/scrum/PRODUCT-BACKLOG.md`).

Planned structure (see `docs/engineering/ARCHITECTURE.md` and `docs/engineering/DESIGN-SYSTEM.md`):

```text
frontend/
├── package.json          React · Vite · TypeScript · Tailwind · Framer Motion · @dnd-kit · TanStack Query
└── src/
    ├── app/              routing, providers, shell
    ├── features/         splash/ menu/ river/ workshop/
    ├── components/       GlassPanel and shared primitives
    ├── lib/
    │   ├── color/        dominant-colour extraction (offline, deterministic, tested)
    │   ├── image/        downscale, placeholders
    │   └── motion/       tokens and variants
    ├── api/              typed client + query keys
    ├── hooks/            reusable hooks
    ├── types/            shared types (mirrors _docs/openapi.yml)
    └── styles/           global.css (tokens + Fontsource typography), theme.css, glass.css
```

Non-negotiables: zero external network requests (fonts via Fontsource NPM packages), images first,
Dark Glassmorphism only, mobile-first (390 px design target).
Rules: `.claude/rules/frontend.md` · design language: `.claude/rules/design-language.md`.

Commands once scaffolded: `npm install` · `npm run dev -- --host` · `npm run test` · `npm run lint` · `npm run build`.
