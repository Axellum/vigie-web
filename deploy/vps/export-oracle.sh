#!/bin/sh
# Export of the API archive (/data/vigie.db) to the Oracle Cloud server, the off-site copy (15/11/2026).
# Only run as the forced command of the "oracle-sauvegardes" key, in ~/.ssh/authorized_keys:
#   restrict,command="/home/vigie/vigie/export-oracle.sh" ssh-ed25519 AAAA... oracle-sauvegardes
# Writes to stdout a consistent copy of the SQLite database (Python's backup API, safe while the API writes in WAL
# mode), compressed with zstd. Public data only: the accounts' database (vigie-db) is NOT exported, so that a
# deleted account is gone from every copy within 7 days, as the privacy page says (see backup.sh).
# The Oracle side checks the copy (zstd -t, PRAGMA integrity_check) and tells Gatus; ssh's arguments are ignored.
set -eu
tmp=/tmp/vigie-export-oracle.db
trap 'podman exec vigie-api rm -f "$tmp" >/dev/null 2>&1 || true' EXIT
podman exec vigie-api python3 -c "
import sqlite3
src = sqlite3.connect('/data/vigie.db')
dst = sqlite3.connect('$tmp')
src.backup(dst)
dst.close()
src.close()
"
podman exec vigie-api cat "$tmp" | zstd -q -3 -T1 -c
