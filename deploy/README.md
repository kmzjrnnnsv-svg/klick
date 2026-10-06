# Deploy (Hetzner, nginx + systemd)

## Einmalig
1. `deploy/postgres/roles.sql` als `postgres` ausführen; Passwörter setzen.
   Bei bestehender DB: alte App-Rolle zu `klick_migrator` umbenennen
   (`ALTER ROLE <alt> RENAME TO klick_migrator`), damit `0000_pivot` die
   Alt-Tabellen droppen darf. Danach `CREATE SCHEMA pgboss AUTHORIZATION klick_app`.
2. Secrets als systemd-Credentials verschlüsseln (siehe Kopf von `deploy/systemd/klick.service`).
3. `deploy/systemd/klick.service` installieren, `deploy/nginx/raza.work.conf` aktivieren,
   `nft -f deploy/firewall.nft`, fail2ban (sshd + nginx-limit-req), unattended-upgrades, chrony.
4. Backups: `scripts/backup-db.sh` als Timer (täglich), `BACKUP_AGE_RECIPIENT` + `BACKUP_RCLONE_REMOTE` setzen.

## Release
CI grün → Wartungsfenster → `scripts/backup-db.sh` → `git pull && pnpm release`
(migrate → seed → build) → `systemctl restart klick` → `curl -f https://raza.work/api/ready`.

**Rollback:** `scripts/restore-db.sh <dump> <url>` + `git checkout recruiting-final` + `pnpm release`.

## Prüfen
- `systemd-analyze security klick` ≤ 2.0
- `curl -I https://raza.work` zeigt CSP, HSTS, COOP/CORP, Permissions-Policy
- Mozilla Observatory A+, SSL Labs A+
