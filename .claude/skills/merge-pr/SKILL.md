---
name: merge-pr
description: Review and merge a pull request — run the code review gate, verify checks, merge with a merge commit, and clean up the branch. Use after a PR is opened and ready.
argument-hint: [pr-number]
allowed-tools: Read, Write, Edit, Grep, Glob, Bash
---

# Review and merge

Input: PR number (default: the PR for the current branch, `gh pr view --json number`).

## 1. Gate checks (all must pass)

```bash
gh pr view <n> --json state,isDraft,mergeable,baseRefName,headRefName,title
gh pr diff <n> --name-only
gh pr checks <n>          # if CI exists; "no checks" is acceptable only before E5-S1 lands
```

1. **Base is `develop`** (a PR targeting `main` is a release PR — use `/finish-sprint` instead).
2. **Story link** present (`Closes #NN`) and the issue is in the current sprint milestone.
3. **Verification evidence** present in the description (commands + results). If it is missing or
   unverifiable, send it back — do not merge on faith.
4. **Review gate**: run the `code-reviewer` subagent on the diff (or invoke `/review`). The verdict is
   incomplete without its `### Adversarial control` section, with the control's result — a verdict missing
   it goes back to the reviewer, not into the merge. Post the verdict as a PR comment:

```bash
gh pr comment <n> --body-file /tmp/review.md
```

Merge only when the verdict is `APPROVE` or `APPROVE WITH NITS` and every blocking item is fixed
by new commits on the branch (never by rewriting existing commits).

## 2. Merge

```bash
gh pr merge <n> --merge --delete-branch
```

- **Merge commit only** — `--squash` and `--rebase` are forbidden (hook-enforced).
- The merge commit message must carry the story id: `merge: [E1-S1] <summary>` (`gh` uses the PR title;
  fix it before merging if it lacks the id).

## 3. After the merge

```bash
git switch develop && git pull --ff-only
git branch -d feature/e1-s1-<slug>        # local cleanup of the merged branch
gh issue close <issue-number> --comment "Delivered in #<pr-number> (merge commit <sha>)."
```

Update the sprint doc status (`docs/scrum/sprints/sprintNN.md`) and the backlog row to `Done` —
via the normal docs branch + PR flow if `develop` is protected, or as part of the next sprint doc update.

## Guardrails

- Never merge a PR whose branch is `develop` or `main` with `--delete-branch`.
- Never merge red checks, unresolved blocking review comments, or a PR with no evidence.
- If the merge conflicts with `develop`, the **branch owner** resolves them with a merge commit
  (`git merge origin/develop`), never with a rebase.
