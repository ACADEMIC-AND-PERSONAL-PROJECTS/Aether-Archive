<!--
  Aether Archive PR template.
  Base branch: `develop` for feature PRs, `main` only for sprint release PRs (/finish-sprint).
  Keep PRs to one story. Never squash, never rebase, never force-push.
-->

## Story

- Story id: **[E1-S1]**
- Closes #
- Sprint: `docs/scrum/sprints/sprintNN.md`

## What changed

<!-- 2–5 bullets, reviewer-oriented: the why and the shape of the change, not a file list. -->

-

**Size**: total N changed lines · **hand-written M** (excluded: <generated files, named>).
*Both numbers are required; the ~400 budget applies to the hand-written one (`.claude/rules/git-workflow.md`).*

## Acceptance criteria

<!-- Copied from the backlog story. Check honestly; an unchecked box must be explained below. -->

- [ ] criterion 1
- [ ] criterion 2

## Verification evidence

<!-- Output of the `verify` skill on the final commit. Commands + result tails. No "tests pass" without output. -->

**Probes / executed assumptions**: <every framework, database or browser assumption this change rests on,
with the command that shows what actually happens. If a probe could not run, say why.>

| Step | Command | Result |
| --- | --- | --- |
|  |  |  |

**Not covered / SKIPPED**: <!-- what could not be verified and why -->

## Risk & impact

- Data / migration impact:
- Behaviour that could break:
- Rollback plan:

## Review

- [ ] `code-reviewer` pass done — blocking findings fixed or deferred with a backlog entry
- [ ] UI story → mobile screenshot or recording attached
- [ ] API change → `_docs/openapi.yml` respected (or ADR linked)
- [ ] New dependency justified in one line
- [ ] Commits are Conventional Commits with the story id; history untouched (no rebase/force)

## Decisions

<!-- ADR links if any. Remove the section if not relevant. -->

-
