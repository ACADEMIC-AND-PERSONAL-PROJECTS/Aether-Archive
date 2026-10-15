# Security finding — symlinked staging directory led to data loss outside the archive

- **Found**: 2026-10-15, review of PR #62 (E1-S2), by the `code-reviewer` subagent, **by execution**.
- **Status**: **fixed in the same unmerged branch** (`fix(e1-s2)` commit on `feature/e1-s2-storage-config`).
  It was never merged into `develop`, so no released code was affected.
- **Severity**: Medium — data loss, but the precondition is local write access to the data directory
  (an attacker who can already create `symlinks` there can delete files directly). Not remotely reachable,
  and the upload path is untouched.

## Impact

Every boot recursively empties `<dataDir>/tmp` (ARCHITECTURE §5: staging only, never user data). If
`<dataDir>/tmp` is itself a **symbolic link**, the deletion follows it and removes the contents of whatever
directory it points at — anything on the machine that the process can delete, not just archive data. A
mis-created link (e.g. `tmp -> ~/Documents`) would have destroyed unrelated files at the next start.

## Reproduction (as performed by the reviewer)

```bash
# in a scratch copy of the backend
mkdir -p "$DATA/aether-data" "$OUTSIDE/elsewhere"
echo keep > "$OUTSIDE/elsewhere/keep.txt"
ln -s "$OUTSIDE/elsewhere" "$DATA/aether-data/tmp"
AETHER_DATA_DIR="$DATA/aether-data" java -jar backend/target/aether-archive-backend-0.1.0-SNAPSHOT.jar
# before the fix:  keep.txt existed after boot = false
#                  0 entries left in "$OUTSIDE/elsewhere"
```

## Cause

`StorageInitializer.emptyTmp` listed the staging directory with `Files.list(tmpDir)`, and
`createDirectory` accepted it because `Files.isDirectory(path)` follows links. Individual *entries* were
already handled safely (`LinkOption.NOFOLLOW_LINKS`), so the delete-recursion itself could not escape — only
the `tmp` root could.

## Suggested fix (implemented)

Refuse to continue when the staging directory is a symbolic link — fail the boot with an actionable message
instead of deleting through it. Deleting the link and recreating a real directory was rejected as a silent
destructive act on the operator's filesystem. A symlinked **data directory** stays supported on purpose
(`~/AetherArchive_Data -> /mnt/archive` is a legitimate layout); only the directory whose contents are
deleted is refused.

## Tests added

- a symlinked `tmp/` fails initialisation **and** the target file still exists afterwards;
- the same test skips cleanly where the platform refuses to create symbolic links.

## Follow-up worth keeping in mind

The same "follow the link" reasoning applies to the *other* subdirectories, where the consequence is milder
(writes land outside the archive rather than deletions): `images/` and `thumbnails/` may be symlinks today.
E1-S4 (`StorageService`) owns path containment and must resolve every write with
`toRealPath()` under the data root before writing; that story should decide whether those two directories must
also be real directories, and the decision recorded there.
