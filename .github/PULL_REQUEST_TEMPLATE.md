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

## Acceptance criteria

<!-- Copied from the backlog story. Check honestly; an unchecked box must be explained below. -->

- [ ] criterion 1
- [ ] criterion 2

## Verification evidence

<!-- Output of the `verify` skill on the final commit. Commands + result tails. No "tests pass" without output. -->

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
