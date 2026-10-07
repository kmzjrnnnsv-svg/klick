# Deploy (Hetzner, nginx + systemd)

## Einmalig
1. `deploy/postgres/roles.sql` als `postgres` ausführen; Passwörter setzen.
   Bei bestehender DB: alte App-Rolle zu `klick_migrator` umbenennen
   (`ALTER ROLE <alt> RENAME TO klick_migrator`), damit `0000_pivot` die
   Alt-Tabellen droppen darf. `roles.sql` legt auch das Schema `pgboss` (Owner `klick_app`) an;
   die pg-boss-Tabellen installiert die App beim ersten Start selbst (`lib/jobs/boss.ts`).
   **Nach** dem ersten `pnpm release` `roles.sql` erneut ausführen: `0000_pivot` droppt ein
   altes `pgboss`-Schema des Migrators, der zweite Lauf legt es für `klick_app` neu an.
2. Secrets als systemd-Credentials verschlüsseln (siehe Kopf von `deploy/systemd/klick.service`).
3. `deploy/systemd/klick.service` installieren, `deploy/nginx/raza.work.conf` aktivieren,
   `nft -f deploy/firewall.nft` (macht `flush ruleset` — vorher SSH-Port und andere Dienste
   auf dem Host prüfen), fail2ban (sshd + nginx-limit-req), unattended-upgrades, chrony.
4. Backups: `scripts/backup-db.sh` als Timer (täglich), `BACKUP_AGE_RECIPIENT` + `BACKUP_RCLONE_REMOTE` setzen.

## Release
CI grün → Wartungsfenster → `scripts/backup-db.sh` → `git pull && pnpm release`
(migrate → seed → build) → `systemctl restart klick` → `curl -f https://raza.work/api/ready`.

`pnpm release` läuft als User `klick` und braucht dieselben Secrets wie der Dienst
(`db:seed` validiert die Env: `BETTER_AUTH_SECRET`, `VAULT_KEK_BASE64`, `BETTER_AUTH_URL`).
Node muss systemweit liegen (`/usr/local/bin`, nicht nvm im Home — `ProtectHome=yes`):

```bash
sudo -u klick git -C /opt/klick/current pull --ff-only
sudo bash -c '
set -euo pipefail
cd /opt/klick/current
d() { systemd-creds decrypt "/etc/credstore.encrypted/$1" - 2>/dev/null; }
set -a; . /etc/klick/klick.env; set +a
unset NODE_ENV
export HOME=/opt/klick COREPACK_ENABLE_DOWNLOAD_PROMPT=0 BETTER_AUTH_URL=https://raza.work
export BETTER_AUTH_SECRET="$(d better_auth_secret)" VAULT_KEK_BASE64="$(d vault_kek_base64)"
export DATABASE_URL="$(d database_url)" DATABASE_URL_MIGRATE="$(d database_url_migrate)"
runuser -u klick -- pnpm release
'
sudo systemctl restart klick && curl -f https://raza.work/api/ready
```

**Rollback:** `scripts/restore-db.sh <dump> <url>` + `git checkout recruiting-final` + `pnpm release`.

## Prüfen
- `systemd-analyze security klick` ≤ 2.0
- `curl -I https://raza.work` zeigt CSP, HSTS, COOP/CORP, Permissions-Policy
- Mozilla Observatory A+, SSL Labs A+

## KEK-Rotation (ISO A.8.24, MiCAR Art. 70)
Die Org-DEKs bleiben; nur ihre Umhüllung wird neu geschrieben. Nachweise und
Feldverschlüsselung hängen am DEK — kein Re-Encrypt der Nutzdaten.
1. Neuen KEK erzeugen: `openssl rand -base64 32`.
2. Credentials: alten KEK als `VAULT_KEK_BASE64_V<alt>` behalten, neuen als `VAULT_KEK_BASE64`,
   `VAULT_KEK_VERSION` hochzählen (`systemd-creds encrypt`, Unit neu laden).
3. `pnpm kek:rotate --dry-run` → betroffene Orgs; `pnpm kek:rotate` → schreibt um, auditiert je Org
   (`crypto.kek_rotated`); `pnpm kek:rotate --verify` → jede Org mit aktuellem KEK lesbar.
4. Alten KEK aus den Credentials entfernen, `systemctl restart klick`.
Backups vor dem Entfernen des alten KEK bleiben nur mit diesem lesbar — Rotation im Backup-Log vermerken.

## Organisation löschen (Crypto-Shredding)
Owner löschen ihre Organisation unter Einstellungen → Organisation (Step-up, Kurzname abtippen,
Export bestätigen). Ablauf: Audit `org.delete_requested` → Nachweis-Dateien im Objektspeicher
löschen → Sitzungen der Mitglieder beenden → Organisation über Better Auth löschen (Kaskade löscht
alle Org-Tabellen inkl. `org_settings` = einziger Ort des DEK) → Plattform-Audit `org.deleted` →
Löschbestätigung per Mail. Reste in Backups sind ohne DEK Ciphertext und fallen nach 30 Tagen weg.
Das Audit-Log der Org bleibt (append-only, ohne FK).

## Härtung III (optional, per Env aktiv)
- **clamd:** `apt install clamav-daemon`, `freshclam` als Timer, `TCPSocket 3310` + `TCPAddr 127.0.0.1`
  in `/etc/clamav/clamd.conf`, `StreamMaxLength 30M`. App: `CLAMD_HOST=127.0.0.1`. Fail closed —
  ohne erreichbaren Scanner werden Uploads abgelehnt; Treffer stehen als `evidence.upload_blocked`
  (`denied`) im Audit-Log. Test: EICAR-Datei als `.txt` hochladen → abgelehnt.
- **Rate-Limit je Organisation:** `ORG_RATE_LIMIT_PER_MIN` (Default 600) für Exporte, Nachweis-Downloads
  und Uploads; Antwort 429 mit `Retry-After`. Zähler leben im Prozess (ein Server); bei mehreren
  Instanzen nach nginx (`limit_req_zone $cookie_…`) oder Redis verlagern. nginx-Zonen je IP bleiben.
- **GlitchTip (self-hosted, Hetzner):** Docker-Compose nach glitchtip.com/documentation, Projekt
  anlegen, DSN als `GLITCHTIP_DSN` (systemd-Credential). Die App sendet nur gescrubbte Events über
  die Store-API (kein SDK, keine Bodies, keine E-Mails/Tokens), Release-Tag über `KLICK_RELEASE`.
- **CrowdSec statt fail2ban:** `crowdsec` + `crowdsec-firewall-bouncer-nftables` installieren,
  Collections `crowdsecurity/nginx`, `crowdsecurity/base-http-scenarios`, `crowdsecurity/http-cve`;
  Acquisition auf `/var/log/nginx/*.log` und journald `_SYSTEMD_UNIT=sshd.service`; Bouncer-Chain in
  `deploy/firewall.nft` vor den Accept-Regeln einhängen (`crowdsec-blacklists`). Eigene Szenarien:
  > 10 × 401 auf `/api/auth/*` in 5 min, > 20 × 429 in 5 min → Ban 4 h. `cscli metrics` prüfen.
- **Eigene Datenbank je Enterprise-Mandant:** zweite Postgres-Instanz mit denselben Rollen
  (`deploy/postgres/roles.sql`), `pnpm db:migrate` mit `DATABASE_URL_MIGRATE` gegen diese DB,
  `ORG_DATABASE_URLS={"<orgId>":"postgres://klick_app:…@host/klick"}`. withOrg/readOrg/mutateOrg
  routen dann je Org; Better Auth, Katalog und Plattform-Jobs bleiben auf der Haupt-DB — für
  Enterprise-DBs einen eigenen Job-Prozess mit gesetzter `DATABASE_URL` betreiben.

## SSO je Organisation
`@better-auth/sso` (OIDC). Owner registrieren den IdP unter Einstellungen → SSO; die E-Mail-Domain
muss per DNS-TXT (`_klick-sso.<domain>`) verifiziert werden, bevor Logins möglich sind.
Redirect-URI im IdP: `https://raza.work/api/auth/sso/callback/<providerId>`. Nutzer:innen der
Domain werden als Mitglied (viewer) provisioniert; MFA-Pflicht und Sitzungsregeln gelten.
