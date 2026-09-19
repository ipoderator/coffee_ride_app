#!/usr/bin/env bash
set -euo pipefail

# CR-078. Dumps DATABASE_URL into a timestamped, pg_restore-compatible
# custom-format file. Reads the connection string the same way
# src/migrate.ts does — no assumption about where Postgres actually runs
# (docker-compose.prod.yml/ADR-018 deliberately leaves that undecided), so
# this script works unchanged whether the database is local dev, a managed
# cloud instance, or anything else DATABASE_URL points at.
#
# Backup *destination* (this local directory vs. syncing it to S3/offsite
# storage) is deliberately left to the operator, for the same reason the
# database's own host is undecided — this script's job ends at "a restorable
# file exists on disk".
#
# Usage:
#   DATABASE_URL=postgresql://... ./backup.sh
#   BACKUP_DIR=/var/backups/coffee-ride BACKUP_RETENTION_DAYS=14 ./backup.sh
#
# Env:
#   DATABASE_URL           required — connection string to back up.
#   BACKUP_DIR              optional, default "./backups".
#   BACKUP_RETENTION_DAYS   optional, default 7. Set to 0 to disable pruning.

: "${DATABASE_URL:?DATABASE_URL is required}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"

mkdir -p "$BACKUP_DIR"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
out_file="$BACKUP_DIR/coffee_ride_${timestamp}.dump"

pg_dump --format=custom --file="$out_file" "$DATABASE_URL"

echo "Backup written to $out_file"

if [ "$BACKUP_RETENTION_DAYS" -gt 0 ]; then
  find "$BACKUP_DIR" -name 'coffee_ride_*.dump' -type f -mtime "+${BACKUP_RETENTION_DAYS}" -delete
fi
