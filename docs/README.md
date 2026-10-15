# Documentation index

| Path | Content | Canonical? |
| --- | --- | --- |
| `_docs/aether_archive_specs.md` | Product specification (the "what" and "why") | **Yes — read-only** |
| `_docs/openapi.yml` | REST contract for `/api/v1` | **Yes — read-only** |
| `docs/scrum/PRODUCT-BACKLOG.md` | Epics, user stories, priorities, estimates | Yes |
| `docs/scrum/SPRINT-PLAYBOOK.md` | Process, cadence, branch/release policy, schedule | Yes |
| `docs/scrum/DEFINITION-OF-DONE.md` | The checklist every story must pass | Yes |
| `docs/scrum/DEFINITION-OF-READY.md` | Entry criteria for the sprint backlog | Yes |
| `docs/scrum/DECISION-LOG.md` | ADRs — every open choice, recorded | Yes |
| `docs/scrum/sprints/` | One plan per sprint (`sprintNN.md`) | Yes |
| `docs/engineering/ARCHITECTURE.md` | Components, data flow, storage layout | Yes |
| `docs/engineering/DESIGN-SYSTEM.md` | Colour extraction, glass tokens, typography, motion | Yes |
| `retrospectives/` | One retrospective per sprint (`sprintNN.md`) | Yes |
| `reports/` | Generated verification/analysis reports (not maintained by hand) | No |
| `.claude/` | Agent configuration — see `.claude/README.md` | Yes |
| `CLAUDE.md` | Entry point for the agent: project, stack, workflow, hard rules | Yes |

## Reading order for a new session

1. `CLAUDE.md` (auto-loaded) — project, stack, workflow, hard rules.
2. `docs/scrum/PRODUCT-BACKLOG.md` — what is planned.
3. The latest `docs/scrum/sprints/sprintNN.md` — what is in flight right now.
4. The relevant rule and engineering doc for the area being touched.

## Writing rules

- English only, everywhere (code, commits, PRs, issues, docs).
- Diagrams in ASCII or Mermaid inside the markdown — no external images.
- When a doc and the code disagree, fix the doc **in the same PR** that changes the behaviour.
