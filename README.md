# Aether Archive

> A local-first, mobile-first digital sanctuary for aesthetic photos and monthly 6-picture "dumps".
> Images are the product — the interface stays almost invisible.

Aether Archive runs entirely on your own machine and is designed to be opened from a phone on the
same local network (`http://<LAN-IP>:8080`). Nothing is uploaded to the cloud, no third-party
requests are made at runtime, and every image and record stays in a local folder you own.

## Concept

| View | What it is |
| --- | --- |
| **The Immersive Splash** | A single random photo, full-screen, zero UI. Tap anywhere to open the menu. |
| **The Glassmorphism Menu** | Dark glass overlay (`backdrop-filter: blur(15px)`), elegant typography, three entries: The River, Curate, Close. |
| **The Time River** | Infinite vertical feed of everything ever uploaded; the page background melts into each dump's own colour as you scroll. |
| **The Curator's Workshop** | Pick up to 6 images, drag them into order, choose the "aura" colour, publish the dump. |

## Stack

- **Frontend** — React + Vite + TypeScript, Tailwind CSS, Framer Motion, `@dnd-kit`, TanStack Query
- **Backend** — Java 21, Spring Boot 3, Maven, REST under `/api/v1`
- **Database** — embedded SQLite (file-based)
- **Storage** — local filesystem, images served by Spring at `/images/**`
- **Typography** — Fontsource NPM packages (self-hosted, zero external requests)

## Repository layout

```
backend/          Spring Boot application
frontend/         React + Vite application
_docs/            Canonical specs (read-only): product spec + OpenAPI contract
docs/             scrum/ (backlog, playbook, DoD, ADRs) · engineering/ (architecture, design system)
retrospectives/   One sprintNN.md after every sprint
reports/          Generated verification and analysis reports
.claude/          Agent setup: rules, skills, commands, subagents, hooks
```

## Getting started

Backend and frontend are scaffolded in Sprint 1 and Sprint 2 (see `docs/scrum/PRODUCT-BACKLOG.md`).

```bash
# 1. Environment
cp .env.example .env        # then edit AETHER_DATA_DIR and VITE_API_BASE_URL

# 2. Backend (after Sprint 1)
cd backend && ./mvnw spring-boot:run

# 3. Frontend (after Sprint 2)
cd frontend && npm install && npm run dev -- --host   # --host exposes it to your phone
```

Then open `http://<your-LAN-IP>:5173` on your phone.

## How this project is built

The project follows a lightweight SCRUM process driven by an agent:

- `docs/scrum/PRODUCT-BACKLOG.md` — complete, prioritised backlog (epics → user stories → acceptance criteria)
- `docs/scrum/SPRINT-PLAYBOOK.md` — sprint rhythm, ceremonies and branch/merge policy
- `docs/scrum/DEFINITION-OF-DONE.md` — the checklist every story must pass
- `retrospectives/` — a written retrospective after each sprint

Workflow in one line: **backlog → sprint plan → feature branch off `develop` → commit often →
PR → review → merge commit → sprint release PR into `main` → retrospective.**

Hard rules: no direct commits to `main`/`develop`, no rebase, no force-push, no squash merge —
history is append-only so nothing is ever lost.

## License

Personal project. No license granted.
