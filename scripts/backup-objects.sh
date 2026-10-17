#!/usr/bin/env bash
# Offsite-Kopie des Objektspeichers (Nachweis-Dateien, Tombstones) —
# Backup-Konzept in deploy/README.md („Backup & Restore“).
#
#   scripts/backup-objects.sh
#
# Quelle: rclone-Remote BACKUP_OBJECTS_SOURCE (z. B. hetzner-fsn:klick),
# Ziel: BACKUP_OBJECTS_REMOTE (anderer Standort/Anbieter, z. B.
# hetzner-hel:klick-backup). Die Objekte sind bereits mit dem Org-DEK
# verschlüsselt (Ciphertext) — eine zweite Verschlüsselung ist nicht nötig,
# der KEK liegt nie im Bucket. Überschriebene/gelöschte Objekte wandern nach
# BACKUP_OBJECTS_REMOTE-history/<datum>/ und werden nach BACKUP_KEEP_DAYS
# entfernt. Ziel-Bucket idealerweise mit Versionierung + Object Lock.
set -euo pipefail

: "${BACKUP_OBJECTS_SOURCE:?BACKUP_OBJECTS_SOURCE fehlt (rclone-Remote der Quelle)}"
: "${BACKUP_OBJECTS_REMOTE:?BACKUP_OBJECTS_REMOTE fehlt (rclone-Remote des Ziels)}"
: "${BACKUP_KEEP_DAYS:=30}"

day="$(date -u +%Y-%m-%d)"
history="${BACKUP_OBJECTS_REMOTE}-history/${day}"

rclone sync "$BACKUP_OBJECTS_SOURCE" "$BACKUP_OBJECTS_REMOTE" \
  --backup-dir "$history" \
  --checksum --fast-list --transfers 8 --checkers 16 \
  --stats-one-line --stats 0
echo "✔ Objekte gespiegelt nach $BACKUP_OBJECTS_REMOTE (Änderungen: $history)"

# Historie älter als die Aufbewahrung entfernen (passt zur DB-Backup-Frist
# und zur Purge-Frist der App, lib/jobs/storage.ts).
rclone delete "${BACKUP_OBJECTS_REMOTE}-history" --min-age "${BACKUP_KEEP_DAYS}d" --rmdirs
echo "✔ Historie älter als ${BACKUP_KEEP_DAYS} Tage entfernt"
