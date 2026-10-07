#!/usr/bin/env bash
# Verschlüsseltes Datenbank-Backup (ISO A.8.13, DORA Art. 12, CC-BCM-03).
#
#   scripts/backup-db.sh                 → ./backups/klick-<ts>.sql.age
#   BACKUP_DIR=/var/backups/klick scripts/backup-db.sh
#
# Verschlüsselung mit `age` gegen den öffentlichen Schlüssel BACKUP_AGE_RECIPIENT
# (der private Schlüssel liegt NICHT auf dem Server). Offsite-Kopie per
# rclone, wenn BACKUP_RCLONE_REMOTE gesetzt ist (z. B. hetzner:klick-backups).
# Aufbewahrung: BACKUP_KEEP_DAYS (Default 30). Restore-Test quartalsweise als
# Pflichten-Lauf — siehe scripts/restore-db.sh.
set -euo pipefail

: "${DATABASE_URL_MIGRATE:=${DATABASE_URL:?DATABASE_URL fehlt}}"
: "${BACKUP_DIR:=./backups}"
: "${BACKUP_KEEP_DAYS:=30}"

mkdir -p "$BACKUP_DIR"
ts="$(date -u +%Y%m%dT%H%M%SZ)"
out="$BACKUP_DIR/klick-$ts.sql"

pg_dump --no-owner --no-privileges --format=plain "$DATABASE_URL_MIGRATE" > "$out"

if [ -n "${BACKUP_AGE_RECIPIENT:-}" ]; then
  age -r "$BACKUP_AGE_RECIPIENT" -o "$out.age" "$out"
  rm -f "$out"
  out="$out.age"
else
  echo "WARN: BACKUP_AGE_RECIPIENT nicht gesetzt — Backup liegt unverschlüsselt vor." >&2
fi

sha256sum "$out" > "$out.sha256"
echo "✔ Backup: $out ($(du -h "$out" | cut -f1))"

if [ -n "${BACKUP_RCLONE_REMOTE:-}" ]; then
  rclone copy "$out" "$BACKUP_RCLONE_REMOTE/" && rclone copy "$out.sha256" "$BACKUP_RCLONE_REMOTE/"
  echo "✔ Offsite: $BACKUP_RCLONE_REMOTE"
fi

find "$BACKUP_DIR" -name 'klick-*.sql*' -mtime "+$BACKUP_KEEP_DAYS" -delete
