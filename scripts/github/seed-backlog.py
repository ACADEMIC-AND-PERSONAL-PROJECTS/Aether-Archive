#!/usr/bin/env python3
"""Mirror docs/scrum/PRODUCT-BACKLOG.md to GitHub — labels, milestones and one issue per epic/story.

The backlog file is canonical; GitHub is a mirror. This script is idempotent: it matches
existing items by exact title, refreshes a story issue whose body has drifted from the file,
and never duplicates or deletes anything.

Usage
    python3 scripts/github/seed-backlog.py [--dry-run]

Requirements
    - run from the repository root
    - `gh` CLI installed and authenticated for the origin repository
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

BACKLOG = Path("docs/scrum/PRODUCT-BACKLOG.md")

# Mirror of the SPRINT-PLAYBOOK.md schedule rows. A sprint's window is re-planned at its own planning,
# so these dues move with the playbook — keep them in step (checked 2026-10-16).
SPRINTS: dict[int, dict[str, str]] = {
    1: {"title": "Sprint 01 — Foundation & Backend", "due": "2026-10-16T23:59:59Z"},
    2: {"title": "Sprint 02 — Design System", "due": "2026-10-30T23:59:59Z"},
    3: {"title": "Sprint 03 — Splash & Workshop", "due": "2026-10-30T23:59:59Z"},
    4: {"title": "Sprint 04 — Workshop & CI", "due": "2026-12-11T23:59:59Z"},
    5: {"title": "Sprint 05 — Time River", "due": "2026-12-25T23:59:59Z"},
    6: {"title": "Sprint 06 — Hardening & v1.0", "due": "2027-01-08T23:59:59Z"},
}

LABELS: list[tuple[str, str, str]] = [
    ("type:epic", "6E2FA6", "Epic (parent of stories)"),
    ("type:story", "1D76DB", "User story"),
    ("type:bug", "B60205", "Defect"),
    ("type:chore", "C5DEF5", "Tooling / maintenance"),
    ("type:docs", "0E8A16", "Documentation"),
    ("type:test", "5319E7", "Tests / quality"),
    ("area:backend", "006B75", "Spring Boot backend"),
    ("area:frontend", "1D76DB", "React frontend"),
    ("area:design", "D4C5F9", "Visual design / UX"),
    ("area:data", "BFDADC", "Storage / database"),
    ("area:devops", "F9D0C4", "CI, repo, release"),
    ("priority:p0", "B60205", "Must ship this sprint"),
    ("priority:p1", "D93F0B", "Should ship soon"),
    ("priority:p2", "FBCA04", "Nice to have"),
    ("status:in-progress", "FBCA04", "Work in progress"),
    ("status:blocked", "E11D21", "Blocked — see issue"),
]

AREA_BY_EPIC = {
    "E1": "area:backend",
    "E2": "area:frontend",
    "E3": "area:frontend",
    "E4": "area:frontend",
    "E5": "area:frontend",
    "E6": "area:devops",
}

AREA_EXTRA = {
    "E1-S3": ["area:data"],
    "E1-S4": ["area:data"],
    "E2-S4": ["area:design"],
    "E2-S5": ["area:design"],
    "E2-S6": ["area:design"],
    "E4-S4": ["area:design"],
    "E4-S5": ["area:backend"],
    "E5-S3": ["area:design"],
    "E6-S4": ["area:frontend"],
    "E6-S5": ["area:backend"],
}

FOOTER = (
    "_Mirror issue — `docs/scrum/PRODUCT-BACKLOG.md` is canonical. "
    "Re-sync with the `backlog-sync` skill._"
)

# Some rows annotate their title with the tracker they were routed to — "(… issue #79)". The
# annotation belongs to the row, not to the mirrored issue's title, so it is stripped for matching.
TITLE_ANNOTATION = re.compile(r"\s*\([^()]*(?:issue|PR) #\d+[^()]*\)\s*$")


def story_title(story: dict) -> str:
    return f"[{story['id']}] {TITLE_ANNOTATION.sub('', story['title'])}"


def gh(*args: str, check: bool = True) -> str:
    result = subprocess.run(["gh", *args], capture_output=True, text=True)
    if check and result.returncode != 0:
        sys.exit(f"gh {' '.join(args)} failed:\n{result.stderr.strip()}")
    return result.stdout.strip()


def gh_json(*args: str) -> object:
    return json.loads(gh(*args))


def parse_backlog(text: str) -> tuple[dict, dict]:
    stories: dict[str, dict] = {}
    for m in re.finditer(
        r"^\|\s*(E\d+-S\d+)\s*\|\s*(.+?)\s*\|\s*(p\d)\s*\|\s*(\d+)\s*\|\s*(\d+|—)\s*\|\s*\w+\s*\|",
        text,
        re.M,
    ):
        sid, title, priority, points, sprint = m.groups()
        stories[sid] = {
            "id": sid,
            "epic": sid.split("-")[0],
            "title": title,
            "priority": priority,
            "points": int(points),
            # "—" means unscheduled: parsed, but never auto-mirrored until a sprint claims it.
            "sprint": int(sprint) if sprint.isdigit() else None,
        }

    # The story headings have drifted between "·" and "|" as the priority separator (26 used "|").
    # Accept both so a mixed file can never silently drop a section again.
    headings = list(re.finditer(r"^### (E\d+-S\d+) — (.+?) · (\d+) pts (?:·|\|) (p\d)$", text, re.M))
    for i, m in enumerate(headings):
        sid = m.group(1)
        end = headings[i + 1].start() if i + 1 < len(headings) else len(text)
        body = text[m.end() : end]
        nxt_epic = re.search(r"^## ", body, re.M)
        if nxt_epic:
            body = body[: nxt_epic.start()]
        if sid in stories:
            stories[sid]["body"] = body.strip()

    epics: dict[str, dict] = {}
    epic_headings = list(re.finditer(r"^## (E\d+) — (.+)$", text, re.M))
    for i, m in enumerate(epic_headings):
        code, name = m.group(1), m.group(2)
        end = epic_headings[i + 1].start() if i + 1 < len(epic_headings) else len(text)
        block = text[m.end() : end]
        goal = re.search(r"^\*\*Goal:\*\* (.+)$", block, re.M)
        epics[code] = {"code": code, "name": name, "goal": goal.group(1).strip() if goal else ""}

    return epics, stories


def story_issue_body(story: dict, epic_issue: int | None) -> str:
    body = story.get("body", "")
    lines = body.splitlines()

    statement = ""
    for i, line in enumerate(lines):
        if line.strip().startswith("*"):
            parts = [line.strip()]
            while not parts[-1].endswith("*") and i + 1 < len(lines) and lines[i + 1].strip():
                i += 1
                parts.append(lines[i].strip())
            statement = " ".join(parts).strip("*").strip()
            break

    # Join wrapped criteria: continuation lines are indented, and a criterion ends on a blank
    # line, the next "- [ ]" item, or any non-indented line.
    criteria: list[str] = []
    in_criterion = False
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("- [ ]"):
            criteria.append(stripped)
            in_criterion = True
        elif in_criterion and stripped and line.startswith(" "):
            criteria[-1] += " " + stripped
        else:
            in_criterion = False
    parts = [
        "**Story** — " + (statement or story["title"]),
        "",
        "**Acceptance criteria**",
        *criteria,
        "",
        f"**Estimate** — {story['points']} points · **Priority** — {story['priority']} "
        f"· **Sprint** — {story['sprint'] if story['sprint'] is not None else '—'}",
    ]
    if epic_issue:
        parts.append(f"**Epic** — #{epic_issue}")
    parts += ["", FOOTER]
    return "\n".join(parts)


def main() -> None:
    dry_run = "--dry-run" in sys.argv

    repo = gh("repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner")
    if not BACKLOG.exists():
        sys.exit(f"{BACKLOG} not found — run from the repository root.")

    epics, stories = parse_backlog(BACKLOG.read_text(encoding="utf-8"))
    print(f"Repository: {repo} · parsed {len(epics)} epics, {len(stories)} stories")

    existing = {
        i["title"]: i
        for i in gh_json(
            "issue", "list", "--state", "all", "--limit", "500", "--json", "number,title,body"
        )
    }

    epic_numbers: dict[str, int] = {}
    epics_to_create: list[tuple[str, dict]] = []
    for code, epic in epics.items():
        title = f"[{code}] {epic['name']}"
        if title in existing:
            epic_numbers[code] = existing[title]["number"]
        else:
            epics_to_create.append((code, epic))

    to_create: list[tuple[str, dict]] = []
    to_update: list[tuple[str, dict, int]] = []
    unscheduled_no_mirror: list[str] = []
    unchanged = 0
    for sid, story in stories.items():
        title = story_title(story)
        if title not in existing:
            if story["sprint"] is None:
                unscheduled_no_mirror.append(sid)
            else:
                to_create.append((sid, story))
            continue
        body = story_issue_body(story, epic_numbers.get(story["epic"]))
        if existing[title]["body"].strip() == body.strip():
            unchanged += 1
        else:
            to_update.append((sid, story, existing[title]["number"]))

    if dry_run:
        print(f"[dry-run] would ensure {len(LABELS)} labels")
        for sprint in SPRINTS.values():
            print(f"[dry-run] would ensure milestone: {sprint['title']} (due {sprint['due']})")
        for code, epic in epics_to_create:
            print(f"[dry-run] would create epic  [{code}] {epic['name']}")
        for sid, story in to_create:
            print(f"[dry-run] would create story {story_title(story)} (sprint {story['sprint']})")
        for sid, story, number in to_update:
            print(f"[dry-run] would update story {story_title(story)} (#{number}) — body differs")
        print(
            f"[dry-run] plan: {len(to_create)} creates, {len(to_update)} updates, "
            f"{unchanged} unchanged, {len(epics_to_create)} epics to create"
        )
        if unscheduled_no_mirror:
            print(
                "[dry-run] unscheduled stories without a mirror issue (not created): "
                + ", ".join(unscheduled_no_mirror)
            )
        return

    # Labels -----------------------------------------------------------------
    for name, color, description in LABELS:
        gh("label", "create", name, "--color", color, "--description", description, "--force")

    # Milestones -------------------------------------------------------------
    existing_milestones = {
        m["title"] for m in gh_json("api", f"repos/{repo}/milestones", "--paginate")
    }
    for sprint in SPRINTS.values():
        if sprint["title"] in existing_milestones:
            continue
        gh(
            "api",
            f"repos/{repo}/milestones",
            "-f",
            f"title={sprint['title']}",
            "-f",
            f"description=Sprint plan: docs/scrum/sprints/",
            "-f",
            f"due_on={sprint['due']}",
        )

    # Issues -----------------------------------------------------------------
    for code, epic in epics_to_create:
        title = f"[{code}] {epic['name']}"
        story_lines = [
            f"- [ ] [{s['id']}] {s['title']}"
            for s in stories.values()
            if s["epic"] == code
        ]
        body = "\n".join(
            [
                f"**Goal** — {epic['goal']}",
                "",
                "**Stories**",
                *story_lines,
                "",
                FOOTER,
            ]
        )
        url = gh(
            "issue", "create", "--title", title, "--body", body, "--label", "type:epic"
        )
        epic_numbers[code] = int(url.rsplit("/", 1)[-1])
        print(f"created epic  {title} (#{epic_numbers[code]})")

    created = 0
    for sid, story in to_create:
        title = story_title(story)
        labels = ["type:story", AREA_BY_EPIC[story["epic"]], f"priority:{story['priority']}"]
        labels += AREA_EXTRA.get(sid, [])
        args = [
            "issue",
            "create",
            "--title",
            title,
            "--body",
            story_issue_body(story, epic_numbers.get(story["epic"])),
            "--label",
            ",".join(labels),
        ]
        if story["sprint"] is not None:
            args += ["--milestone", SPRINTS[story["sprint"]]["title"]]
        url = gh(*args)
        created += 1
        print(f"created story {title} (#{url.rsplit('/', 1)[-1]})")

    updated = 0
    for sid, story, number in to_update:
        gh(
            "issue",
            "edit",
            str(number),
            "--body",
            story_issue_body(story, epic_numbers.get(story["epic"])),
        )
        updated += 1
        print(f"updated story {story_title(story)} (#{number})")

    print(
        f"Done. {created} created, {updated} updated, {unchanged} unchanged, "
        f"{len(epics_to_create)} epics created."
    )
    if unscheduled_no_mirror:
        print(
            "Unscheduled stories without a mirror issue (not created): "
            + ", ".join(unscheduled_no_mirror)
        )


if __name__ == "__main__":
    main()
