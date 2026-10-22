# Restore drill — 2026-10-22

The review found that the documented restore path (`gunzip -c dump | psql` on top of the live schema)
fails on the first existing table. `scripts/deploy/restore.sh` now stops the API, drops and recreates
the `public` schema, restores with `ON_ERROR_STOP=1`, starts the API again and waits for its
healthcheck. This is the drill that proves it on a real PostgreSQL 17 container.

## Setup

- Host: the local development machine, the ordinary Compose stack (`aether-archive-*` containers).
- Archive at the start: **48 photos, 5 dumps** (the local demo is larger than a fresh deploy because
  `make demo` appends).
- Dump: `backups/db-20261022T204941Z.sql.gz` (3.7 KiB), written by `./scripts/deploy/backup.sh`.
- Media: `backups/media-20261022T204941Z.tar.gz` (7.3 MiB), owned by the invoking user after the
  container `chown`; the API files inside are `0600`, which is why tar must run as root.

## Commands

```bash
./scripts/deploy/backup.sh
./scripts/deploy/restore.sh backups/db-20261022T204941Z.sql.gz --yes
```

## Result

```
restore: stopping the API to block writes
restore: dropping and recreating the public schema
DROP SCHEMA
CREATE SCHEMA
restore: applying backups/db-20261022T204941Z.sql.gz
...
 Container aether-archive-db-1 Healthy
 Container aether-archive-api-1 Started
restore: waiting for the API healthcheck
restore: API healthy
exit=0
```

API after the restore:

```
photos 48
dumps 5
```

The block is an excerpt from the live run's output. The `Container …` lines are Compose's progress on
stderr from the final `start api`; the script redirects that command's stdout, not stderr. A second run
at 21:32Z reproduced exit 0 and the same 48/5 counts (with an extra `drop cascades` NOTICE because the
schema had three objects at that point), so the transcript is not a reconstruction. The same counts
before and after the restore, the API healthcheck green, and `ON_ERROR_STOP=1` armed: the path is
repeatable. The media tarball contains 12 PNG files (the locally uploaded photos; the demo photos are
recorded as external attributed URLs) and is restored separately with the documented
`docker run ... tar xzf` command.

## What this does not claim

This is a same-host drill against the local stack. The production restore is the same script and the
same PostgreSQL image; it will be re-run on the VPS after the first public release and its output
attached to this report.
