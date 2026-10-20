#!/bin/sh
# Dump of the accounts' database (vigie-backup.timer, every day). Dumps are removed after 6 days, so that a
# deleted account is gone from them within 7 days, as the privacy page says.
#   Restore: podman exec -i vigie-db pg_restore -U vigie -d vigie --clean --if-exists < ~/vigie/backups/<file>
set -eu
umask 077
dir="$HOME/vigie/backups"
mkdir -p "$dir"
file="$dir/vigie-$(date -u +%Y%m%dT%H%MZ).dump"
podman exec vigie-db pg_dump -U vigie -d vigie --format=custom >"$file.part"
mv "$file.part" "$file"
find "$dir" -name 'vigie-*.dump' -mtime +5 -delete
find "$dir" -name '*.part' -mtime +0 -delete
echo "dump: $file ($(du -h "$file" | cut -f1))"
