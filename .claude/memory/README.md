# Memory — checked-in notes

Claude Code's **auto memory** is machine-local and lives outside the repository
(`~/.claude/projects/<project>/memory/`). It is not shared and not versioned.

This folder is the deliberate, **checked-in** complement, so that knowledge survives across machines,
sessions and agents:

| File | Purpose | Who updates it |
| --- | --- | --- |
| `project-notes.md` | Current state of the project: what exists, what is in flight, known pitfalls | Anyone, whenever the state changes |
| `decisions.md` | Quick index of decisions taken, pointing at the full ADR in `docs/scrum/DECISION-LOG.md` | The author of the decision |

Rules of thumb:

- Keep both files short and factual — they are read at the start of many sessions.
- Do **not** duplicate what the code or git history already says (build commands, file layout, changelogs).
- Prefer the ADR in `docs/scrum/DECISION-LOG.md` for anything with alternatives and consequences;
  keep only a one-line pointer here.
- Delete notes that are no longer true. A stale memory is worse than no memory.
