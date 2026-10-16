# Git workflow (always loaded)

The full process lives in `docs/scrum/SPRINT-PLAYBOOK.md`. This file is the short, enforceable version.

## Branch model

```
main      ← released, protected, PR-only, tag sprint-NN at each sprint end
  └ develop ← integration, protected, PR-only, PRs from feature branches land here
      └ feature/e1-s7-dump-endpoint   ← one user story per branch
```

- Branch names: `feature/<epic>-<story>-<slug>`, `fix/<epic>-<story>-<slug>`, `chore/<slug>`, `docs/<slug>`.
  Example: `feature/e2-s4-color-extraction`, `docs/sprint01-retro`.
- Always branch from an up-to-date `develop`: `git switch develop && git pull --ff-only && git switch -c <branch>`.
- Task-level commits inside a branch are welcome; branch-level scope is never mixed (one story per branch).

## Commits — often, small, traceable

- **Commit after every logical unit of work**, not at the end of a session. Aim for a commit at least
  every 30–60 minutes of work. WIP commits on a feature branch are fine; they are squash-free history.
- Format: [Conventional Commits](https://www.conventionalcommits.org/) with the story id:

  ```
  feat(api): add POST /dumps with 6-photo ordering [E1-S7]

  Why the change is needed, decisions taken, anything a reviewer must know.
  Refs: #12
  ```
  Types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `perf`, `build`, `ci`, `style`.
  Scopes: `api`, `web`, `db`, `storage`, `design`, `deps`, `ci`, `docs`, `scrum`.
- Never leave a session with meaningful work uncommitted. If a piece is unfinished, commit it as
  `wip(<scope>): <what remains>` on the feature branch — an unpushed WIP commit may be amended or
  rewritten freely; a pushed one may not.
- One concern per commit. Do not mix formatting, refactors and features in a single commit.
- **Within a story, commit per logical unit — production code, tests, docs — not once at the end.** A story
  that lands as one 1,500-line commit cannot be reviewed in parts, and its diffs cannot be explained. In
  Sprint 1 the first story was one commit and the last was four; the four-commit shape is the target.
- **Measure the change, not just the total.** Every story PR states two numbers: total changed lines, and
  hand-written changed lines with the generated files named (Maven wrapper, `package-lock.json`, build
  output). The ~500-line guidance applies to the second number — Sprint 1 averaged ~1,300 total because
  nobody separated them.
- **Stage explicit paths, never a directory, when an agent may be writing concurrently.** `git add <dir>`
  cannot tell a subagent's in-flight file from yours: in Sprint 1 it swept a security report that another
  agent was writing into an unrelated story commit, which then had to be untracked in a follow-up (history
  is append-only, so a pushed commit cannot be amended). Run `git status --short` and check the staged list
  against what you actually changed before committing.

### Who commits

- **The parent session commits. Subagents do not run writing git commands** (`add`, `commit`, `switch`,
  `stash`, `merge`, `push`) — they are told so in their own definitions. Read-only git is fine for them.
- A subagent reports its work in **stages**, naming which files belong to which, so the parent can turn each
  stage into its own commit.

## Pull requests

- Base is always `develop` (feature PRs) or `main` (sprint release PRs only, created by `/finish-sprint`).
- Title: `<type>(<scope>): <summary> [STORY-ID]`. Body: use `.github/PULL_REQUEST_TEMPLATE.md`.
- Link the issue (`Closes #12`) and paste `/verify` evidence (commands + result).
- Keep PRs small: one story, ideally under ~400 changed lines. Split when a story explodes.
- Review before merge: run the `code-reviewer` subagent on the diff and address findings, or record
  explicitly in the PR why a finding is deferred (with a backlog note).
- Merge command: `gh pr merge <number> --merge --delete-branch` for feature PRs.
  **Never** `--squash`, **never** `--rebase`, **never** `--delete-branch` on a `develop` → `main` release PR.

## Forbidden (hook-enforced, do not attempt to bypass)

- Direct commits or pushes to `main` or `develop`.
- `git rebase`, `git filter-branch`, `git filter-repo`, `git commit --amend` on a pushed commit,
  `git push --force` / `--force-with-lease`, `git reset --hard` on shared branches.
- Deleting or force-updating `main`, `develop`, or `sprint-NN` tags.
- Squash or rebase merges from the GitHub UI or CLI.

If a hook blocks a command you believe is legitimate: stop and ask the user. Never edit, disable, or
work around `.claude/hooks/guard-commands.sh`.

## Sprint boundaries

- `/start-sprint` opens a sprint: sprint doc + milestone + sprint backlog selection.
- `/finish-sprint` closes it: security audit gate, retro commit, release PR `develop` → `main`, merge,
  tag `sprint-NN`.
- After a merge: `git switch develop && git pull --ff-only`, then delete the merged local branch.
