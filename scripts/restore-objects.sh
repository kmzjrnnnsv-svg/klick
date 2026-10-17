#!/usr/bin/env bash
# Objektspeicher aus der Offsite-Kopie zurückspielen — zusammen mit
# scripts/restore-db.sh (gleicher Zeitpunkt) und danach
# `pnpm exec tsx scripts/replay-deletions.ts` (Löschungen nachholen).
#
#   scripts/restore-objects.sh <ziel-remote> [<stand YYYY-MM-DD>]
#
# Ohne Stand: aktuelle Kopie. Mit Stand: aktuelle Kopie plus die Fassungen
# aus der Historie ab diesem Tag (überschriebene/gelöschte Objekte), damit
# der Objektstand zum DB-Dump passt. Kopiert, löscht nie im Ziel.
set -euo pipefail

target="${1:?Ziel-Remote fehlt (z. B. hetzner-fsn:klick-restore-test)}"
asof="${2:-}"
: "${BACKUP_OBJECTS_REMOTE:?BACKUP_OBJECTS_REMOTE fehlt}"

rclone copy "$BACKUP_OBJECTS_REMOTE" "$target" --checksum --fast-list --transfers 8
if [ -n "$asof" ]; then
  # Historien-Ordner sind nach Datum benannt; ältere Fassungen gewinnen,
  # also vom jüngsten zum ältesten Tag ab $asof überschreiben.
  rclone lsf --dirs-only "${BACKUP_OBJECTS_REMOTE}-history" \
    | sed 's#/$##' | sort -r \
    | while read -r d; do
        if [[ "$d" > "$asof" || "$d" == "$asof" ]]; then
          rclone copy "${BACKUP_OBJECTS_REMOTE}-history/$d" "$target" --checksum
        fi
      done
fi
echo "✔ Objekte nach $target zurückgespielt${asof:+ (Stand $asof)}."
echo "  Weiter: restore-db.sh, dann tsx scripts/replay-deletions.ts --dry-run / ohne."
