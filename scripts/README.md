# Scripts

Development and repository tooling. Everything here must be safe to run twice and must never touch
the real data directory (`~/AetherArchive_Data`) unless `--force` is passed explicitly.

| Script | Purpose |
| --- | --- |
| `github/seed-backlog.py` | Mirror `docs/scrum/PRODUCT-BACKLOG.md` to GitHub (labels, milestones, issues) — idempotent |
| `dev/sample-photos.py` | Write deterministic sample photos for the dev scripts (standard library only) |
| `dev/seed.sh` | Post N sample photos and a dump to a running local backend |
| `dev/smoke.sh` | Walk every endpoint of a running local backend — success and refusal paths; non-zero exit on any failure |
| `jvm/` | *(later)* JVM-side utilities (index rebuild, migration checks) |
| `backup.sh` / `restore.sh` | *(E6-S7)* Timestamped backup and safe restore of the database (`pg_dump`) and images |

Conventions: bash scripts start with `set -euo pipefail`, Python scripts are dependency-free
(standard library only), and every script prints what it is about to do before doing it.
