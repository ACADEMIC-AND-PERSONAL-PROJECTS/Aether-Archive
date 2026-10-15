# `.claude/` — agent configuration

Everything the agent needs to work on Aether Archive. Committed to the repository so the setup is
shared, reviewable, and versioned with the code.

```
.claude/
├── settings.json     Shared project settings: permissions, hooks, status line, attribution
├── settings.local.json  Personal overrides (gitignored, never committed)
├── README.md         This file
├── rules/            Instructions loaded into context
│   ├── git-workflow.md   (always loaded) branch model, commits, PRs, merges
│   ├── testing.md        (always loaded) test strategy and quality gates
│   ├── security.md       (always loaded) local-first threat model and non-negotiables
│   ├── backend.md        (paths: backend/**)
│   ├── frontend.md       (paths: frontend/**)
│   └── design-language.md (paths: frontend UI files)
├── skills/           Workflows the agent runs (lazy-loaded, invocable as /name)
│   ├── start-sprint/     Plan a sprint: selection, sprint doc, milestone
│   ├── start-feature/    Branch per user story, DoR check
│   ├── open-pr/          Push + open the PR into develop with evidence
│   ├── merge-pr/         Review gate + merge commit + cleanup
│   ├── finish-sprint/    Retro + release PR develop→main + tag
│   ├── backlog-sync/     Mirror docs/scrum/PRODUCT-BACKLOG.md to GitHub issues/labels/milestones
│   ├── design-system/    Reference-driven colour extraction + Dark Glassmorphism + Fontsource typography
│   └── verify/           Project verification recipe (also runs before commits automatically)
├── commands/         Lightweight, human-typed slash commands
│   ├── sprint-status.md  Where are we right now?
│   └── standup.md        Done / next / blocked
├── agents/           Specialised subagents (own context windows)
│   ├── backend-engineer.md   Spring Boot implementation
│   ├── frontend-engineer.md  React/Vite/design implementation
│   ├── code-reviewer.md      Read-only review against DoD + conventions
│   ├── qa-verifier.md        Runs verification, writes evidence reports
│   ├── security-auditor.md   Web-researched security audit each sprint close (release gate)
│   └── scrum-master.md       Backlog, sprint docs, retrospectives
├── hooks/            Deterministic guardrails (shell scripts wired in settings.json)
│   ├── guard-commands.sh     Blocks rebase/force-push/direct pushes/squash merges/destructive ops
│   ├── session-context.sh    Injects branch + sprint + recent commits at session start
│   ├── format-edited-file.sh Formats edited files with local tooling only
│   └── statusline.sh         Status line: sprint · branch · changed files
└── memory/           Checked-in notes (auto memory lives in ~/.claude/projects/<repo>/memory/)
```

## Notes

- `.claude/rules/*.md` load every session (or when a matching file is touched, with `paths:`).
  Keep them short and factual; procedures belong in a skill.
- `settings.json` permissions apply after you accept the workspace trust prompt on first launch.
- Project MCP servers live in the repo-root `.mcp.json`: `MCP_DOCKER` and `web-search` (Docker MCP
  gateway, profile `research` — Docker must be running). `enabledMcpjsonServers` in `settings.json`
  pre-approves them (once the workspace is trusted), so no per-session approval prompt appears. They
  are development-time tools only — the shipped app never calls them.
- The `verify` skill is special: Claude Code's built-in commit instructions run a project skill named
  `verify` right before each commit, which is exactly what we want here.
- `statusLine` is set in project settings; if your version ignores it there, copy the block into
  `~/.claude/settings.json`.
- Personal preferences go in `.claude/settings.local.json` (gitignored) or `CLAUDE.local.md`.
