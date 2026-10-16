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
  Every stage stays on the same branch and in the same PR, the full `verify` runs on the final commit, and
  nothing merges before the tests for the change exist — splitting commits must not create a commit whose
  behaviour is untested (`.claude/rules/testing.md`).
- **Measure the change, not just the total.** Every story PR states two numbers: total changed lines, and
  hand-written changed lines, naming the generated files it excludes (Maven wrapper, `package-lock.json`,
  build output). **Both budgets already in this repository apply to the hand-written number**: `CLAUDE.md` §5
  splits a *branch* past ~500 changed lines, `DEFINITION-OF-DONE.md` and the `open-pr` skill want a story *PR*
  ideally under ~400. Sprint 1 averaged ~1,300 *total* because nobody separated them, so both readings looked
  hopeless at once.
- **The atomic-story exception.** A story that cannot be sliced without failing one of its own acceptance
  criteria is not cut into artificial stories: it stays on one branch and is split into *production / tests /
  docs* commits that the review takes in turn (`retrospectives/sprint01.md`, change 2). The PR claims the
  exception by name — the story, why a slice would break an acceptance criterion, and both size numbers; the
  review judges the claim and the sprint notes record the outcome. E2-S1 and E2-S2 claim it under this clause.
  An over-budget PR that does not claim it, or whose claim does not survive review, is a finding to resolve
  before merge.
- **Stage explicit paths, never a directory.** `git add <dir>` cannot tell your files from one another agent
  is writing at the same moment: in Sprint 1 it swept a security report into an unrelated story commit, and
  since history here is append-only the fix was a follow-up untrack commit rather than an amend. Run
  `git status --short` and check the staged list against what you actually changed before committing.

### Who commits

- **The session that owns the branch commits — not a subagent it delegates to.** `backend-engineer`,
  `frontend-engineer` and `qa-verifier` carry "never run a writing git command" in their own definitions;
  read-only git (`status`, `log`, `diff`, `show`) is fine for every agent.
- A subagent reports its work in **stages**, naming which files belong to which, so the owner can turn each
  stage into its own commit.

## Pull requests

- Base is always `develop` (feature PRs) or `main` (sprint release PRs only, created by `/finish-sprint`).
- Title: `<type>(<scope>): <summary> [STORY-ID]`. Body: use `.github/PULL_REQUEST_TEMPLATE.md`.
- Link the issue (`Closes #12`) and paste `/verify` evidence (commands + result).
- Keep PRs small: one story, ideally under ~400 **hand-written** changed lines. Split when a story explodes.
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

**The guard reads the entire Bash command line.** It flattens your command into one string before matching, so
chaining a git command with anything that merely *mentions* `main` or `develop` trips a rule that has nothing
to do with what you are doing — `git push … && git log origin/develop` is refused as a direct push, and so is
a read-only loop whose quoted argument contains the word. **Run one git command per call**, and never combine
a `push`, `commit` or `pr merge` with a command that names a protected branch.

If a hook blocks a command you believe is legitimate: stop and ask the user. Never edit, disable, or
work around `.claude/hooks/guard-commands.sh`.

## Sprint boundaries

- `/start-sprint` opens a sprint: sprint doc + milestone + sprint backlog selection.
- `/finish-sprint` closes it: security audit gate, retro commit, release PR `develop` → `main`, merge,
  tag `sprint-NN`.
- After a merge: `git switch develop && git pull --ff-only`, then delete the merged local branch.
