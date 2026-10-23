#!/usr/bin/env bash
# Verschlüsseltes Datenbank-Backup (ISO A.8.13, DORA Art. 12, CC-BCM-03).
#
#   scripts/backup-db.sh                 → ./backups/klick-<ts>.sql.age
#   BACKUP_DIR=/var/backups/klick scripts/backup-db.sh
#
# Verbindung: DATABASE_URL_BACKUP (Rolle klick_backup aus
# deploy/postgres/roles.sql, BYPASSRLS + nur lesen). Die Org-Tabellen tragen
# FORCE RLS; klick_migrator und klick_app sehen ohne Org-Kontext keine Zeile,
# pg_dump bricht mit ihnen ab. Fallback auf DATABASE_URL_MIGRATE nur für Dev
# mit Superuser.
#
# Verschlüsselung mit `age` gegen den öffentlichen Schlüssel BACKUP_AGE_RECIPIENT
# (der private Schlüssel liegt NICHT auf dem Server). Offsite-Kopie per
# rclone, wenn BACKUP_RCLONE_REMOTE gesetzt ist (z. B. hetzner:klick-backups).
# Aufbewahrung: BACKUP_KEEP_DAYS (Default 30). Restore-Test quartalsweise als
# Pflichten-Lauf — siehe scripts/restore-db.sh.
set -euo pipefail

: "${DATABASE_URL_BACKUP:=${DATABASE_URL_MIGRATE:?DATABASE_URL_BACKUP fehlt}}"
: "${BACKUP_DIR:=./backups}"
: "${BACKUP_KEEP_DAYS:=30}"

mkdir -p "$BACKUP_DIR"
ts="$(date -u +%Y%m%dT%H%M%SZ)"
out="$BACKUP_DIR/klick-$ts.sql"

# Schema pgboss bleibt draußen: es gehört klick_app (roles.sql) und enthält
# nur die Job-Warteschlange; pg-boss legt seine Tabellen beim Start selbst
# wieder an (lib/jobs/boss.ts). Ein Restore mit --no-owner gäbe sie sonst der
# falschen Rolle.
pg_dump --no-owner --no-privileges --exclude-schema=pgboss --format=plain "$DATABASE_URL_BACKUP" > "$out"

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
  # Offsite gilt dieselbe Aufbewahrung wie lokal (Löschkonzept, Art. 17 DSGVO)
  rclone delete --min-age "${BACKUP_KEEP_DAYS}d" --include 'klick-*.sql*' "$BACKUP_RCLONE_REMOTE/"
fi

find "$BACKUP_DIR" -name 'klick-*.sql*' -mtime "+$BACKUP_KEEP_DAYS" -delete
