#!/usr/bin/env bash
set -euo pipefail

# CR-078. Restores a backup.sh-produced custom-format dump into DATABASE_URL.
# --clean --if-exists drops existing objects first, so this works both for a
# disaster-recovery restore into a freshly created empty database and for
# restoring on top of a database that already has the schema (e.g. verifying
# a backup by restoring it into a scratch database). --no-owner/--no-privileges
# avoid failing on role names that may not exist on the target server (a
# restore target is not guaranteed to have the same roles as the source).
#
# Usage:
#   DATABASE_URL=postgresql://... ./restore.sh path/to/coffee_ride_*.dump

: "${DATABASE_URL:?DATABASE_URL is required}"

if [ "$#" -ne 1 ]; then
  echo "Usage: DATABASE_URL=... $0 <backup-file>" >&2
  exit 1
fi

backup_file="$1"

if [ ! -f "$backup_file" ]; then
  echo "Backup file not found: $backup_file" >&2
  exit 1
fi

pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$DATABASE_URL" "$backup_file"

echo "Restored $backup_file into the target database."
