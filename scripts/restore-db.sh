#!/usr/bin/env bash
# Restore eines Backups in eine (leere) Zieldatenbank — auch für den
# quartalsweisen Restore-Test: in klick_restore_test einspielen und
# anschließend `pnpm tsx scripts/verify-audit-chain.ts` darauf laufen lassen.
#
#   scripts/restore-db.sh backups/klick-<ts>.sql.age postgres://klick_migrator:...@localhost/klick_restore_test
set -euo pipefail

src="${1:?Pfad zum Backup fehlt}"
target="${2:?Ziel-DATABASE_URL fehlt}"

case "$src" in
  *.age)
    : "${BACKUP_AGE_IDENTITY:?BACKUP_AGE_IDENTITY (privater age-Schlüssel) fehlt}"
    age -d -i "$BACKUP_AGE_IDENTITY" "$src" | psql -v ON_ERROR_STOP=1 -q "$target"
    ;;
  *)
    psql -v ON_ERROR_STOP=1 -q "$target" < "$src"
    ;;
esac
echo "✔ Restore nach $target abgeschlossen."
