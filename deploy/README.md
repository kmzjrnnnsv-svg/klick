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
4. Backups: siehe „Backup & Restore“ unten (Timer für DB, Objekte, Stichprobe).

## Release
Kurz: `sudo deploy/rollout/rollout.sh klick` (bzw. `both`) aus dem root-eigenen Checkout — Backup,
Checkout auf `--ref`, Release, Units, Neustart, Prüfung (Abschnitt „Rollout-Skript“). Von Hand:
CI grün → Wartungsfenster → `scripts/backup-db.sh` → `git pull && pnpm release`
(migrate → seed → build) → `systemctl restart klick` → `curl -f https://raza.work/api/ready`.
`pnpm release` prüft zuerst den Arbeitsbaum (keine Änderungen) und, sobald
`deploy/release/allowed_signers` einen Schlüssel enthält, einen signierten Tag auf HEAD
(„Server härten“, Schritt 8).

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
# Parser-Bündel root-eigen ablegen (klick-parse@.service liest nur von dort)
install -D -o root -g root -m 0644 dist/parse-worker.mjs /usr/local/lib/klick-parse/parse-worker.mjs
sha256sum /usr/local/lib/klick-parse/parse-worker.mjs
# Backup-Skript ebenso (klick-backup-db.service liest nur von dort)
if [ -d /usr/local/lib/klick-backup ]; then
  install -D -o root -g root -m 0755 scripts/backup-db.sh /usr/local/lib/klick-backup/scripts/backup-db.sh
fi
'
sudo systemctl restart klick && curl -f https://raza.work/api/ready
```

**Rollback:** `scripts/restore-db.sh <dump> <url>` + `git checkout recruiting-final` + `pnpm release`.

### Klick startet nach einem Update nicht (Start-Prüfung)
Zeigt raza.work „Internal Server Error“ und `curl -fsS http://127.0.0.1:3000/api/ready` endet mit 500,
hat meist die Start-Prüfung (`lib/env-checks.ts`) den Start verweigert. Ursache ablesen:
```bash
sudo journalctl -u klick -n 50 --no-pager | grep -i "unsichere produktions"
```
Die Meldung nennt jeden Punkt; hinnehmbar sind nur diese (Kürzel für `PROD_ACCEPT_RISKS`):
„Kein Virenscanner“ = `no_av`, „Kein Admin-Netz“ = `admin_anywhere`, „AUTH_ALLOW_SIGNUP“ =
`signup_open`, „MAIL_ALLOW_RESEND“ = `mail_us`, „PARSER_SOCKET fehlt“ = `parser_in_app`. Alles andere
(`BETTER_AUTH_URL` ohne https, falscher `PASSKEY_RP_ID`, `HOSTNAME` ≠ 127.0.0.1) muss behoben werden.

**Notweg** (typisch nach einem `git pull` mit noch alter Unit ohne `ADMIN_NETWORKS` und ohne clamd): eine
Not-Freigabe als Drop-in mit genau den Kürzeln aus der Meldung. Ein Eintrag in `/etc/klick/klick.env`
reicht dafür nicht, die alte Unit liest die Datei nicht zuverlässig (`EnvironmentFile` kommt mit der neuen).
```bash
sudo mkdir -p /etc/systemd/system/klick.service.d && printf '[Service]\nEnvironment=PROD_ACCEPT_RISKS=no_av,admin_anywhere\n' | sudo tee /etc/systemd/system/klick.service.d/risiken.conf && sudo systemctl daemon-reload && sudo systemctl restart klick && sleep 20 && curl -fsS http://127.0.0.1:3000/api/ready && echo OK
```
**Danach aufräumen** (aus dem root-eigenen Checkout, Abschnitt „Rollout-Skript“):
`sudo deploy/rollout/rollout.sh grundlage virenscanner klick`. Die Phase `klick` spielt die neue Unit
ein (mit Admin-Netz), übernimmt die übrigen Kürzel (z. B. `no_av`) in den verwalteten Block von
`klick.env`, entfernt `risiken.conf` samt `admin_anywhere` und legt beides zurück, falls Klick danach
nicht startet. `rollout.sh pruefen` zeigt eine noch aktive Not-Freigabe, der Bericht von `abschluss` die
Werte, mit denen Klick wirklich läuft. Ab dann ist `/admin` nur noch über WireGuard erreichbar
(Phase `wireguard`).

## Prüfen
- `systemd-analyze security klick` ≤ 2.0
- `curl -I https://raza.work` zeigt CSP, HSTS, COOP/CORP, Permissions-Policy
- Mozilla Observatory A+, SSL Labs A+

## Anmeldung: Mailversand prüfen, Notfall-Link
Anmelde-Links (Notweg) und Einladungen gehen per Mail raus (Brevo → SMTP → Resend nur mit `MAIL_ALLOW_RESEND=true`; scheitert ein
Weg, kommt der nächste konfigurierte dran). Seit „Passkey zuerst“ (ADR-019) hängt der normale
Login nicht mehr an der Mail — Einladungen gibt es zusätzlich als Link zum Kopieren. In Produktion
landet ein Anmelde-Link **nie** im Journal. Beim Start
steht im Journal `Mailversand` (Weg, Host, Absender) oder `Kein Mailversand konfiguriert`.

**Absender:** Klick hat genau eine Adresse, `no-reply@raza.work` (`lib/mail/address.ts`) — Absender
aller Mails und Kontakt in `security.txt`. `MAIL_FROM` in `/etc/klick/klick.env` weglassen (dann gilt
`Klick <no-reply@raza.work>`) oder genau so setzen; beim Provider genau diese Adresse als Absender
bestätigen. Eine andere Adresse in `MAIL_FROM` gewinnt und wird vom Provider abgelehnt, wenn es sie
nicht gibt.

Konfiguration: `MAIL_FROM` (optional, siehe oben) und
`BREVO_API_KEY` **oder** `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER` in
`/etc/klick/klick.env`, `SMTP_PASS` als Credential `smtp_pass`. Hetzner sperrt ausgehend Port 25
und 465 — SMTP über 587. Brevo läuft über HTTPS (443) ohne SMTP-Login. Resend (USA) nur mit `MAIL_ALLOW_RESEND=true` und nach Ergänzung der Datenschutzerklärung.

**Brevo (empfohlen, EU-Anbieter):**
1. Konto bei brevo.com, unter *Absender, Domains & dedizierte IPs → Domains* die Domain
   (`raza.work`) hinzufügen und die angezeigten DNS-Einträge (Brevo-Code, DKIM, DMARC) beim
   DNS-Anbieter eintragen; MX bleibt unverändert (Empfang läuft weiter über das Postfach).
2. *SMTP & API → API-Schlüssel* → neuen Schlüssel erzeugen (`xkeysib-…`).
3. *Sicherheit → Autorisierte IPs*: die IP des Servers freigeben — sonst antwortet die API mit
   401 „unrecognised IP address“ (`pnpm mail:check` nennt das).
4. `BREVO_API_KEY=…` in `/etc/klick/klick.env` (0600), `systemctl restart klick`, dann
   `pnpm mail:check <adresse>` wie unten. Brevo als Dienstleister mit AV-Vertrag im
   Dienstleister-Register von Mandant 0 führen.

```bash
sudo bash -c '
set -euo pipefail
cd /opt/klick/current
d() { systemd-creds decrypt "/etc/credstore.encrypted/$1" - 2>/dev/null; }
set -a; . /etc/klick/klick.env; set +a
export NODE_ENV=production HOME=/opt/klick COREPACK_ENABLE_DOWNLOAD_PROMPT=0 BETTER_AUTH_URL=https://raza.work
export BETTER_AUTH_SECRET="$(d better_auth_secret)" DATABASE_URL="$(d database_url)" SMTP_PASS="$(d smtp_pass || true)"
runuser -u klick -- pnpm mail:check <deine-adresse>   # Testmail + Fehlertext des Providers mit Hinweis
runuser -u klick -- pnpm auth:link <deine-adresse>    # Notfall: Einmal-Link (15 min) im Terminal
'
```
`pnpm auth:link` gibt den Link nur im Terminal aus (keine Mail, kein Journal), nur für bestehende
Konten und offene Einladungen, und protokolliert `auth.login_link_cli` im Plattform-Audit. Danach
gelten 2FA und alle Sitzungsregeln wie gewohnt. Link nicht weitergeben.

## Rechtsangaben: Impressum, Datenschutz, Nutzungsbedingungen
- **Pflichtangaben (§ 5 DDG)** als Env setzen (`LEGAL_NAME`, `LEGAL_FORM`, `LEGAL_ADDRESS` mit „;“
  zwischen den Zeilen, `LEGAL_REPRESENTATIVES`, `LEGAL_REGISTER`, `LEGAL_VAT_ID`, optional
  `LEGAL_PHONE`, `LEGAL_CONTACT_MAIL`). `/impressum` zeigt sie oben an, Mails tragen sie in der
  Fußzeile. Fehlt etwas, steht beim Start „Impressum unvollständig“ im Journal.
- **Kontaktadresse muss Mails annehmen:** `LEGAL_CONTACT_MAIL` (Standard `no-reply@raza.work`) muss
  zustellbar sein und gelesen werden — sonst fehlt der Kontaktweg im Impressum.
- **Texte:** Vorlagen in `docs/legal/` (Entwürfe, anwaltlich prüfen) unter Admin → CMS als
  `impressum`, `datenschutz-erklaerung`, `nutzungsbedingungen` übernehmen. `pnpm db:seed` legt nur
  fehlende Seiten als Platzhalter an und überschreibt nie.
- **Server-Logs:** nginx-Zugriffslogs (volle IP für CrowdSec) 14 Tage, dann gelöscht
  (`deploy/logrotate/nginx` nach `/etc/logrotate.d/nginx`: `daily`, `rotate 14`). CrowdSec-Community-Signale teilen nur, wenn das in
  der Datenschutzerklärung steht (sonst `cscli capi unregister`).

## Passkeys: Einrichtung, Einladungslinks, Zugang zurücksetzen (ADR-019)
Anmeldung läuft über Passkeys, der Mail-Link ist nur der Notweg (`/login/notweg`).
`PASSKEY_RP_ID` muss die Domain sein, unter der Klick läuft (`raza.work`; ohne Angabe der Host
aus `BETTER_AUTH_URL`) — **nicht nachträglich ändern**: Passkeys sind an die RP-ID gebunden, eine
neue RP-ID macht alle vorhandenen Passkeys unbrauchbar (dann hilft nur „Zugang zurücksetzen“).
`PASSKEY_RP_NAME` ist der Name im Passkey-Dialog des Geräts.

- **Einladen ohne Mail:** Team → Einladen zeigt den Link `/einladung#klk_invite_…` zum Kopieren
  (48 h, einmalig; „Neuer Link“ ersetzt ihn). Die Person legt dort direkt einen Passkey an.
- **Passkey verloren:** Owner unter Team → ⋯ → „Zugang zurücksetzen“ (nur für Konten, die
  ausschließlich zu dieser Organisation gehören), Plattform-Admins unter Admin → Nutzer:innen. Alle
  Passkeys, TOTP, Backup-Codes und Sitzungen werden entfernt; der Link `/zugang#klk_recover_…`
  (24 h, einmalig) wird nur angezeigt — persönlich weitergeben. Die Person bekommt eine Hinweis-Mail
  ohne Link. Audit `auth.access_reset`.
- **Konto anlegen (Plattform-Admin):** Admin → Nutzer:innen → „Konto anlegen“ (E-Mail, Name,
  optional Organisation + Rolle). Der Aktivierungslink `/aktivieren#klk_activate_…` (7 Tage,
  einmalig) wird angezeigt und auf Wunsch per Mail geschickt; bis zur Aktivierung gibt es keinen
  Mail-Link und keine Sitzung — nur der Passkey öffnet das Konto. Abgelaufen: ⋯ → „Aktivierungslink
  neu erzeugen“; Tippfehler: ⋯ → „Anlage zurücknehmen“. Audit `admin.create_user`,
  `admin.activation_link`, `auth.account_activated`.
- **Sperren:** ⋯ → „Sperren“ mit Grund und Dauer — beendet alle Sitzungen, Links und Mail-Links
  greifen nicht mehr, Daten und Mitgliedschaften bleiben. Plattform-Admins erst nach Entzug der
  Admin-Rolle. Entsperren verlangt Step-up. Audit `admin.ban_user`/`admin.unban_user`.
- **Notfall, wenn niemand in der Organisation helfen kann** (z. B. die einzige Owner:in): mit dem
  Block oben `runuser -u klick -- pnpm auth:recover <adresse>` — gleiche Wirkung, Link nur im
  Terminal, Audit `auth.recover_link_cli`.
- **Organisation hat sich mit ihrer IP-Liste ausgesperrt** (Einstellungen > Netzwerk, z. B. neue
  Büro-Adresse): mit dem Block oben `runuser -u klick -- pnpm org:network-reset --org <kurzname>
  --reason "<Anlass, Ticket>"` — schaltet die Liste aus (Ausnahmen und Liste für Externe fallen mit),
  Audit `org.network_reset` in der Kette der Organisation und `platform.access`, alle Inhaber:innen
  bekommen sofort eine Mitteilung. Wirkt in der App nach spätestens 30 Sekunden. Vorher die Person
  auf einem zweiten Weg bestätigen (Rückruf an die bekannte Nummer), nie allein auf Mail hin.
- Prüfen nach einem Release: `pnpm exec tsx scripts/qa/passkey-smoke.ts` gegen eine Testinstanz
  (virtueller Authenticator; setzt ein QA-Konto aus `scripts/qa/crawl.ts --login` voraus).

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
Löschbestätigung per Mail. Ein **Tombstone** (`tombstones/organization/<id>.json`) im Objektspeicher
hält die Löschung außerhalb der DB fest. DB-Backups enthalten den (KEK-umhüllten) DEK noch bis zum
Ende ihrer Aufbewahrung (30 Tage) — wird in dieser Zeit ein Backup eingespielt, holt
`scripts/replay-deletions.ts` die Löschung nach (siehe „Backup & Restore“). Danach ist nichts mehr
lesbar. Das Audit-Log der Org bleibt (append-only, ohne FK).

## Backup & Restore (ISO A.8.13, DORA Art. 12, CC-BCM-03)

**Ziele:** RPO Datenbank 24 h (täglicher Dump; optional WAL-Archivierung für ≤ 15 min),
RPO Dateien ≤ 1 h (stündlicher Spiegel) bzw. ≈ 0 mit Versionierung im Bucket, RTO 4 h.
Aufbewahrung **30 Tage** (`BACKUP_KEEP_DAYS`) — überall gleich: DB-Dumps, Objekt-Historie,
Purge-Frist der App. Nur so passen DB-Stand und Dateien bei jedem Restore zusammen.

| Was | Wie | Wo | Wann |
|---|---|---|---|
| Datenbank | `scripts/backup-db.sh` (pg_dump ohne Job-Schema `pgboss` → age, privater Schlüssel offline) | lokal `/var/backups/klick` + rclone offsite | `klick-backup-db.timer` täglich 02:15 |
| Nachweis-Dateien + Tombstones | `scripts/backup-objects.sh` (rclone sync, `--backup-dir` Historie) | zweiter Standort/Anbieter, Bucket mit Versionierung + Object Lock (30 d) | `klick-backup-objects.timer` stündlich |
| Stichprobe | `scripts/verify-backup.ts` (Offsite-Objekt entschlüsseln, SHA-256 vs. DB) | Audit `backup.verified`, Wirksamkeitstest CC-BCM-03 (Mandant 0) | `klick-backup-verify.timer` sonntags |
| KEK | offline, Vier-Augen (zwei versiegelte Kopien, Tresor), Rotationslog | **nie** im Bucket oder Dump | bei jeder Rotation |

**Warum keine zweite Verschlüsselung der Objekte:** sie sind bereits mit dem Org-DEK verschlüsselt
(XChaCha20-Poly1305, AAD an die ID gebunden). Die DEKs liegen KEK-umhüllt in der DB (also im
age-verschlüsselten Dump); der KEK nur in den systemd-Credentials und offline. Ohne KEK ist keine
Sicherung lesbar — deshalb gehört der KEK-Ausdruck zum Notfallhandbuch.

**Konsistenz DB ↔ Dateien:** Die App löscht Nachweis-Objekte nie sofort. `deleteEvidence` entfernt
die Zeile, stellt das Objekt in `storage_purge_queue` (Frist = Aufbewahrung) und schreibt einen
Tombstone; der Job `storage-purge` (03:30) löscht erst danach. `storage-orphans` (sonntags) stellt
Objekte ohne Zeile ebenfalls mit Frist ein. Ein Dump von Tag X findet so jede damals referenzierte
Datei.

**Einrichten:**
1. User `klick-backup` (ohne Login), Verzeichnisse `/var/backups/klick`, `/var/lib/klick-backup` (0700).
2. `/etc/klick/backup.env`: `BACKUP_DIR=/var/backups/klick`, `BACKUP_KEEP_DAYS=30`,
   `BACKUP_AGE_RECIPIENT=age1…`, `BACKUP_RCLONE_REMOTE=offsite:klick-db`,
   `BACKUP_OBJECTS_SOURCE=primary:klick`, `BACKUP_OBJECTS_REMOTE=offsite:klick-objects`,
   `BACKUP_S3_ENDPOINT/…_BUCKET/…_ACCESS_KEY_ID/…_PREFIX` (für die Stichprobe, Lesezugriff),
   `BACKUP_VERIFY_ORG_ID=<Mandant 0>`, `ALERT_MAIL=…`.
3. Credentials: `database_url_backup` (Rolle `klick_backup` aus `roles.sql`: BYPASSRLS, nur lesen —
   die Org-Tabellen tragen FORCE RLS, als `klick_migrator` bricht `pg_dump` ab), `rclone_conf`
   (beide Remotes), `backup_s3_secret` (`systemd-creds encrypt`). Bestehende Server: `roles.sql`
   erneut ausführen (idempotent), dann `ALTER ROLE klick_backup PASSWORD '…'` und
   `postgresql://klick_backup:…@127.0.0.1/klick` als `database_url_backup` ablegen.
4. Ziel-Bucket: Versionierung + Object Lock (Governance, 30 Tage) aktivieren, falls der Anbieter es
   kann (Hetzner Object Storage: vorher prüfen); sonst genügt die rclone-Historie.
5. Skript root-eigen ablegen (`install -D -o root -g root -m 0755 scripts/backup-db.sh
   /usr/local/lib/klick-backup/scripts/backup-db.sh`, bei jedem Release erneut — siehe „Release“),
   Units `deploy/systemd/klick-backup-{db,objects,verify}.{service,timer}` und `klick-alert@.service`
   installieren, `systemctl enable --now klick-backup-db.timer klick-backup-objects.timer klick-backup-verify.timer`.
   **Ohne S3** (Dateien in `evidence_blobs`) genügt `klick-backup-db.timer` — Objekte und Stichprobe entfallen.
   Lokal und offsite löscht das Skript Dumps älter als `BACKUP_KEEP_DAYS`.

**Restore (auch quartalsweiser Test, Pflichten-Lauf):**
1. Wartungsmodus, `systemctl stop klick`.
2. `scripts/restore-db.sh <dump.sql.age> <ziel-url>` (für den Test: leere DB `klick_restore_test`).
3. `scripts/restore-objects.sh <ziel-remote> <datum-des-dumps>` — Objektstand passend zum Dump.
4. `pnpm exec tsx scripts/replay-deletions.ts --dry-run`, dann ohne `--dry-run`: Org- und
   Nachweis-Löschungen seit dem Dump nachholen (Tombstones liegen im Objektspeicher).
5. `pnpm exec tsx scripts/verify-backup.ts --sample 50` gegen das Ziel, Audit-Kette prüfen
   (`/admin/audit`), `curl -f …/api/ready`. Ergebnis als Pflichten-Lauf dokumentieren.

## Rollout-Skript (alles in einem Lauf)
`deploy/rollout/rollout.sh` führt „Server härten“ (unten), die Releases von Klick und both.money,
den Signer und den Bericht der Reihe nach aus. Die Schritte unten bleiben der Handweg und die
Erklärung, was das Skript tut.

**Start** (als root, nie aus `/opt/klick/current` — den kann der Dienst-User `klick` ändern; das
Skript prüft das und bricht sonst ab):
```bash
sudo git clone --depth 1 --branch main https://github.com/kmzjrnnnsv-svg/klick.git /usr/local/src/klick-rollout
sudo tmux new -s rollout                   # Verbindungsabbruch beendet das Skript nicht
cd /usr/local/src/klick-rollout
sudo deploy/rollout/rollout.sh pruefen     # Stand, RAM, Virenscanner-Entscheidung, nichts ändert sich
sudo deploy/rollout/rollout.sh alles --admin <name> --geraet laptop --geraet handy --trocken
sudo deploy/rollout/rollout.sh alles --admin <name> --geraet laptop --geraet handy
```
Später neu holen: `sudo git -C /usr/local/src/klick-rollout pull --ff-only` (bzw. mit Release-Schlüssel
`fetch --tags` + `checkout <tag>`) und dieselbe Phase erneut starten.

**Phasen** (Reihenfolge von `alles`, jede einzeln aufrufbar, `--ab <phase>` setzt fort):
`pruefen` · `grundlage` (Pakete, `/var/log/klick`, `/var/www/letsencrypt`, 4 GB Swap ohne Swap,
Release-Anker) · `updates` (ausstehende Sicherheits-Updates sofort, danach täglich automatisch; Neustart
bei Bedarf nachts um 04:30, die Apps startet needrestart nicht neu) · `firewall` (Übergang: SSH noch
öffentlich, UDP 51820 offen) · `wireguard` (Geräte mit
QR-Code, Konfiguration nur auf dem Bildschirm; wartet auf die Verbindung) · `ssh` (Admin-Konto, SSH nur
über den Tunnel, bisherige Schlüssel) · `firewall-final` (SSH öffentlich zu) · `system` · `nginx` (vHosts
mit `diff` und Rückfrage) · `crowdsec` (Paketquelle mit `signed-by`, Fingerprint bestätigen oder
`CROWDSEC_KEY_FPR=<fpr>` setzen) · `postgres` (Passwörter als SCRAM neu mit **denselben** Werten aus den
Credentials, pg_hba; bei Fehlern zurück) · `virenscanner` (clamd ab ≈ 7,5 GiB RAM mit
`clamav-daemon.service.d/klick.conf`, sonst `no_av` in `PROD_ACCEPT_RISKS`) · `klick` (Backup,
`pnpm release` mit Migrationen, Units, Neustart; unter 3 GB frei hält es erst both.money an) ·
`both` · `signer` (nur mit `--signer-tag <tag> --signer-sha <sha aus CI „Signer bündeln“>`) ·
`ueberwachung` · `abschluss` (AIDE-Basis, Lynis, Bericht `/var/backups/klick-rollout/<lauf>/bericht.md`
mit Firewall, Ports, SSH, Sandbox, CrowdSec, Start-Prüfung, OpenTimestamps, Verlauf, SAML-Anbieter ohne
eigene Entity-ID, Signer — als Nachweis in Klick hochladen). Später, mit FIDO2-Schlüsseln:
`ssh-schluessel`.

**Nicht aussperren:** `firewall`, `ssh` und `firewall-final` stellen vorher einen Rückweg scharf
(`systemd-run`, 10 min) und gelten erst, wenn du aus einer **neuen** Sitzung bestätigst:
`sudo deploy/rollout/rollout.sh bestaetigen <wort>` (das Wort zeigt das Skript; für `ssh` und
`firewall-final` nur aus dem Tunnel 10.9.0.0/24). Ohne Bestätigung setzt der Rückweg von selbst zurück.
Vor `ssh` verlangt das Skript ein root-Passwort (Hetzner-Konsole) und ein verbundenes Gerät.

**Sicherungen und Protokoll:** jede überschriebene Datei unter `/var/backups/klick-rollout/<lauf>/`
(0700), Protokoll `/var/log/klick-rollout/<lauf>.log` ohne Geheimnisse (WireGuard-Konfigurationen und
Env-Inhalte gehen nicht hinein). Das Skript ändert nie die Signer-Richtlinie, nie Credentials und
nie die Hetzner-Firewall (das sagt es an der passenden Stelle).

## Server härten (Plan Härtung, Teil H)
Reihenfolge einhalten; bei jedem Schritt eine **zweite SSH-Sitzung offen lassen** und erst
schließen, wenn die neue Verbindung geht. Rückweg immer: Hetzner Cloud Console (Konsole im
Browser) bzw. Rescue-System. Für die Konsole ein starkes root-Passwort setzen und offline
verwahren (`passwd root`; SSH lässt root trotzdem nicht herein). Jeden Schritt mit dem
Prüfbefehl abschließen und die Ausgabe als Nachweis in Klick hochladen (CC-OPS-04,
ISO A.8.9/A.8.20–22, BSI SYS.1.3).

**1. Admin-Netz (WireGuard `wg-admin`)**
1. `apt install wireguard dnsmasq`; Server-Schlüssel nach `deploy/wireguard/wg-admin.conf.example`,
   je Admin-Gerät ein Peer (eigene Adresse 10.9.0.x und fd10:9::x, eigener PresharedKey).
2. `cp deploy/wireguard/wg-admin.conf.example /etc/wireguard/wg-admin.conf` (ausfüllen, `chmod 600`),
   `systemctl enable --now wg-quick@wg-admin`. Auf dem Gerät `wg-admin-peer.conf.example`.
3. `cp deploy/dnsmasq/klick-admin.conf /etc/dnsmasq.d/ && systemctl restart dnsmasq`.
4. Hetzner-Firewall: UDP 51820 eingehend erlauben.
5. Prüfen am Gerät: `ping 10.9.0.1`, `dig +short raza.work @10.9.0.1` → `10.9.0.1`,
   `curl -sI https://raza.work/api/health` (geht jetzt über den Tunnel).

**2. SSH nur noch im Tunnel, nur mit Sicherheitsschlüssel**
1. Am Gerät: `ssh-keygen -t ed25519-sk -O resident -O verify-required -C "<name>@<gerät>"`,
   öffentlichen Schlüssel beim Admin-Konto in `~/.ssh/authorized_keys` eintragen (zweiten Schlüssel
   als Ersatz gleich mit).
2. `ssh <admin>@10.9.0.1` testen (über den Tunnel, mit PIN und Berühren).
3. `cp deploy/ssh/sshd_config.d/10-klick.conf /etc/ssh/sshd_config.d/`, `<admin>` ersetzen,
   `sshd -t && systemctl reload ssh`. Neue Sitzung über `10.9.0.1` öffnen, erst dann die alte schließen.
4. sudo bleibt beim Passwort des Admin-Kontos: `pam_u2f` (`deploy/pam/sudo-u2f.example`) fragt den
   Schlüssel an der Maschine ab und geht über SSH nicht — nur für Hardware mit Konsole.
5. Prüfen: `sshd -T | grep -Ei 'permitrootlogin|passwordauth|pubkeyaccepted|allowusers'`.

**3. Firewall**
1. `cp deploy/firewall.nft /etc/nftables.conf && nft -c -f /etc/nftables.conf`.
2. Sicherheitsnetz: `systemd-run --on-active=10m nft delete table inet klick` (fällt die Verbindung
   weg, ist die Regel nach 10 Minuten wieder weg), dann `systemctl reload nftables`.
3. Neue SSH-Sitzung über den Tunnel testen, dann das Sicherheitsnetz löschen:
   `systemctl list-timers 'run-*'` → `systemctl stop run-….timer`.
4. Hetzner-Firewall angleichen: eingehend nur TCP 80/443 und UDP 51820.
5. Knoten-Server: `deploy/wireguard/firewall-nodes.nft` (SSH nur aus dem Tunnel, Zugang mit
   `ssh -J <admin>@10.9.0.1 <admin>@10.8.0.2`).
6. Prüfen: `nft list ruleset`, `ss -tulpn` (öffentlich nur 80, 443, 51820), von außen
   `nc -zv <ip> 22` → abgewiesen.

**4. Kernel, Updates, Protokoll, Integrität**
1. `cp deploy/sysctl/99-klick.conf /etc/sysctl.d/ && sysctl --system`.
2. `apt install unattended-upgrades needrestart`; `cp deploy/apt/50unattended-upgrades deploy/apt/20auto-upgrades /etc/apt/apt.conf.d/`,
   `cp deploy/apt/needrestart-klick.conf /etc/needrestart/conf.d/klick.conf`;
   prüfen mit `unattended-upgrade --dry-run --debug`.
3. `apt install auditd audispd-plugins`, `cp deploy/audit/klick.rules /etc/audit/rules.d/`,
   `augenrules --load` (danach `auditctl -s` → `enabled 2`; Regeln ändern = Neustart).
4. `apt install aide`, `cp deploy/aide/99_aide_klick /etc/aide/aide.conf.d/`, `aideinit`,
   `cp /var/lib/aide/aide.db.new /var/lib/aide/aide.db`; Units `klick-aide.{service,timer}` nach
   `/etc/systemd/system`, `systemctl enable --now klick-aide.timer`. Nach jedem Signer-, Parser-
   oder Bestätigungsseiten-Release `aide --update` (siehe Kopf der Datei).
5. AppArmor muss laufen: `aa-status` (Ubuntu-Standard).
6. Lynis: `apt install lynis && lynis audit system --quick`; Hardening-Index und Vorschläge als
   Nachweis hochladen, Abweichungen begründen.

**5. Dienste gegeneinander abschotten**
Units aus `deploy/systemd/` neu kopieren (`klick.service`, `both.service`, Backup-, Sanktions-,
Signer-Backup- und Alarm-Unit), `systemctl daemon-reload`, nacheinander neu starten und prüfen:
`systemd-analyze security klick both klick-signer klick-parse@x` (Ziel: App-Units ≤ 2,5, Signer
und Parser „OK“). Test: `sudo -u klick ls /opt/both` → „Permission denied“ bzw. leer.

**6. nginx und CrowdSec (mit WAF)**
1. `cp deploy/nginx/snippets/klick-admin-net.conf /etc/nginx/snippets/`,
   `cp deploy/nginx/00-default.conf /etc/nginx/sites-available/` + Link in `sites-enabled`
   (vorher `grep -Rn default_server /etc/nginx/sites-enabled/` — andere Sites dürfen keinen tragen),
   vHosts neu kopieren, `nginx -t && systemctl reload nginx`.
2. Prüfen: von außen `curl -sI https://raza.work/admin` → 403, über den Tunnel → 200/307;
   `curl -sI -H 'Host: x.example' http://<ip>` → keine Antwort.
3. CrowdSec: Repo nach crowdsec.net einrichten, `apt install crowdsec crowdsec-firewall-bouncer-nftables crowdsec-nginx-bouncer`;
   `cscli collections install crowdsecurity/nginx crowdsecurity/base-http-scenarios crowdsecurity/http-cve crowdsecurity/linux crowdsecurity/sshd crowdsecurity/appsec-virtual-patching crowdsecurity/appsec-generic-rules`;
   `deploy/crowdsec/acquis.d/*` nach `/etc/crowdsec/acquis.d/`, `scenarios/` und `parsers/` an dieselben
   Pfade unter `/etc/crowdsec/`; Bouncer nach `bouncers/crowdsec-nginx-bouncer.conf.example`;
   `systemctl restart crowdsec nginx`.
4. Prüfen: `cscli metrics` (AppSec-Anfragen zählen), WAF-Test
   `curl -s -o /dev/null -w '%{http_code}' 'https://raza.work/?x=<script>alert(1)</script>'` → 403,
   Bann-Test `cscli decisions add --ip 198.51.100.7 --duration 5m` und wieder löschen.
   Der Firewall-Bouncer legt eine eigene Tabelle an (`nft list table ip crowdsec`); `firewall.nft`
   löscht sie beim Neuladen nicht.

**7. Postgres**
1. Vorher alle Rollen-Passwörter als SCRAM neu setzen (`sudo -u postgres psql`, `\password klick_app`
   usw.; Credentials unverändert lassen, wenn dieselben Passwörter gesetzt werden).
2. `cp deploy/postgres/klick.conf /etc/postgresql/16/main/conf.d/`, `pg_hba.conf.example` nach
   `/etc/postgresql/16/main/pg_hba.conf` (Rollen prüfen), `systemctl restart postgresql`,
   Apps neu starten, `curl -f https://raza.work/api/ready`.
3. Prüfen: `ss -tlnp | grep 5432` → nur 127.0.0.1/::1; `psql -h 127.0.0.1 -U klick_app klick -c 'select 1'`.

**8. Releases nur von signierten Tags**
`deploy/release/allowed_signers` mit den Release-Schlüsseln füllen (Anleitung in der Datei), am
eigenen Rechner `git tag -s v<datum>` und pushen; auf dem Server `git fetch --tags && git checkout v<datum>`
statt `git pull`. `pnpm release` bzw. `release:wallet` bricht bei geänderten Dateien immer ab, mit
Schlüssel zusätzlich ohne gültig signierten Tag (`scripts/release-guard.ts`). CI-Status vor dem
Tag im Browser prüfen.
**Vertrauensanker:** geprüft wird gegen die root-eigene Kopie `/etc/klick-release/allowed_signers`
(`RELEASE_ALLOWED_SIGNERS`, `deploy/signer/install.sh`), nicht gegen die Datei im geprüften Stand —
sonst trüge, wer ins Repo schreiben kann, dort seinen eigenen Schlüssel ein. Die Kopie legt
`rollout.sh grundlage` an (Fingerprints zeigen, bestätigen); spätere Änderungen im Repo übernimmt sie
nur nach Rückfrage. Steht dort ein Schlüssel, prüft auch `install.sh` die Signatur des Signer-Tags.

**9. Zustand überwachen**
`install -D -m 0755 -o root -g root scripts/host-health.sh /usr/local/lib/klick-health/host-health.sh`,
Units `klick-health.{service,timer}` kopieren, `systemctl enable --now klick-health.timer`.
Probe: `systemctl start klick-health && journalctl -u klick-health -n 20`. Meldet Platte ≥ 85 %,
Zertifikate < 14 Tage, Dienste mit Fehler, auditd, nftables, CrowdSec-Sperren und ausstehenden
Neustart; Fehler gehen über `klick-alert@` an `ALERT_MAIL`.

**10. App-Seite: Admin-Netz und Start-Prüfung**
1. Die Units setzen das Admin-Netz schon (`ADMIN_NETWORKS` in `klick.service`,
   `WALLET_ADMIN_NETWORKS` in `both.service`, beide `10.9.0.0/24,fd10:9::/64`); ein anderes Netz
   in `/etc/klick/klick.env` bzw. `/etc/both/both.env` überschreiben. Ohne Wert startet Klick in
   Produktion nicht (`admin_anywhere`).
2. Klick prüft beim Start die Produktions-Konfiguration (`lib/env-checks.ts`): kein clamd
   (`CLAMD_HOST`), kein Admin-Netz, `AUTH_ALLOW_SIGNUP=true`, `MAIL_ALLOW_RESEND=true` oder kein
   `PARSER_SOCKET` verhindern den Start — außer die Abweichung steht bewusst in
   `PROD_ACCEPT_RISKS` (komma-getrennt: `no_av`, `admin_anywhere`, `signup_open`, `mail_us`,
   `parser_in_app`; Warnung im Journal). Nie hinnehmbar: `BETTER_AUTH_URL` ohne https,
   `PASSKEY_RP_ID` passt nicht, `HOSTNAME` ≠ `127.0.0.1`.
3. Prüfen: `journalctl -u klick -n 50 | grep -i start-prüfung`; über den Tunnel `/admin` → 200,
   von außen → 403.

**Ausgesperrt?** Hetzner Console → root-Login → `nft delete table inet klick` (Firewall offen),
`rm /etc/ssh/sshd_config.d/10-klick.conf && systemctl reload ssh` (SSH wie vorher),
`systemctl restart wg-quick@wg-admin`. Danach Ursache beheben und Schritte wiederholen.

## Verlauf mit Bitcoin-Anker (Härtung V, ADR-030)
Die Prüfsummen-Ketten aller Organisationen werden täglich ab 02:30 und nach kritischen Ereignissen
(Zugriffe durch Klick, Sicherheitsänderungen, Notweg der IP-Liste) als Merkle-Wurzel bei
OpenTimestamps eingereicht; nach einigen Stunden steht ein Hash davon in einem Bitcoin-Block. Kein
eigenes Guthaben, keine Inhalte nach außen. Jobs `ledger-anchor` (alle 10 min) und `ledger-upgrade`
(stündlich, :17).

- **Ausgehend nötig:** https zu `a.pool.opentimestamps.org`, `b.pool.opentimestamps.org`,
  `a.pool.eternitywall.com` (Einreichen) und `alice.btc.calendar.opentimestamps.org`,
  `bob.btc.calendar.opentimestamps.org`, `finney.calendar.eternitywall.com`,
  `btc.calendar.catallaxy.com` (Upgrade). Andere Kalender: `LEDGER_CALENDARS=https://…,https://…`
  (Credential/Env), ausschalten mit `LEDGER_ANCHOR=off`.
- **Prüfen:** `psql klick -c "select created_at, reason, status, bitcoin_height, error from ledger_anchors
  order by created_at desc limit 5"` — `failed` = kein Kalender erreicht (Fehler in `error`, neuer
  Versuch frühestens nach 1 h), `pending` = wartet auf Bitcoin, `confirmed` = im Block.
- **Gegenprobe ohne Klick:** Einstellungen > Verlauf > „Verlauf herunterladen“, entpacken,
  `node pruefen.mjs` (rechnet Kette, Köpfe, Merkle-Pfade und liest den Zeitstempel) und den Block mit
  dem eigenen Knoten abgleichen: `bitcoin-cli getblockheader $(bitcoin-cli getblockhash <höhe>) |
  grep merkleroot` — oder mit dem offiziellen Client `ots verify anker/<zeit>/wurzel.bin.ots`.

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
- **CrowdSec statt fail2ban:** jetzt Pflicht und mit WAF, siehe „Server härten“, Schritt 6
  (eigene Szenarien `deploy/crowdsec/scenarios/klick-auth-bf.yaml`, Admin-Netz auf der Weißliste).
- **Eigene Datenbank je Enterprise-Mandant:** zweite Postgres-Instanz mit denselben Rollen
  (`deploy/postgres/roles.sql`), `pnpm db:migrate` mit `DATABASE_URL_MIGRATE` gegen diese DB,
  `ORG_DATABASE_URLS={"<orgId>":"postgres://klick_app:…@host/klick"}`. withOrg/readOrg/mutateOrg
  routen dann je Org; Better Auth, Katalog und Plattform-Jobs bleiben auf der Haupt-DB — für
  Enterprise-DBs einen eigenen Job-Prozess mit gesetzter `DATABASE_URL` betreiben.

## Datei-Speicher: Objektspeicher oder Datenbank
Mit `S3_ENDPOINT`/`S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY` liegen Nachweis-Dateien im
Objektspeicher (`org/<orgId>/nachweise/<id>`). **Ohne** diese Werte speichert Klick denselben
verschlüsselten Umschlag (Org-DEK, AAD an die Nachweis-ID) in der Tabelle `evidence_blobs`
(`storage_key = db:<id>`, RLS + FORCE, Migration 0030). Uploads, Nachweis-Werkstatt, Anhänge und
Prüfungspaket funktionieren damit auch ohne S3; das DB-Backup (`klick-backup-db`) sichert die
Dateien mit, Löschen geht mit dem Nachweis (keine Purge-Queue, keine Tombstones).
- Größe beobachten: `psql -c "select pg_size_pretty(pg_total_relation_size('evidence_blobs'))"`.
- Später auf S3 umstellen: Werte setzen, `systemctl restart klick` — neue Dateien gehen in den
  Objektspeicher, vorhandene `db:`-Dateien bleiben lesbar (kein Umzug nötig).
- Umgekehrt (S3 entfernen) sind ältere S3-Dateien nicht mehr abrufbar (Download 404) — nur tun,
  wenn der Bucket leer ist.

## Uploads isoliert parsen (N6)
Hochgeladene Dateien (Nachweise, Gap-Analyse, Lieferantenportal, SBOM, Scan-Berichte, CI-Ingest)
parst nie der App-Prozess: Typprüfung (Magic Bytes), Text aus PDF/Office/ZIP, DLP-Erkennung, SBOM-
und Scan-Parser laufen je Upload in einem eigenen Prozess `klick-parse@` — ohne Netz
(`PrivateNetwork`, `IPAddressDeny=any`), ohne Zugangsdaten (kein Credential, `/etc/klick`,
`/opt/klick` unsichtbar), ohne Schreibrechte, ohne JIT (`node --jitless`,
`MemoryDenyWriteExecute`), mit 512 MB / 20 s / 32 Tasks je Upload und höchstens vier gleichzeitig
(`klick-parse.slice`: 1,5 GB). Die App prüft jede Antwort mit zod; Absturz, Zeitüberschreitung oder
Unsinn → Upload abgelehnt (`upload_parser_unavailable`, fail closed wie clamd). clamd, DLP-Bewertung,
Verschlüsselung und Ablage bleiben in der App. Hochgeladenes wird nie ausgeführt oder inline
angezeigt (`Content-Disposition: attachment`, `nosniff`, `CSP sandbox`).

Einmalig:
```bash
sudo install -m 0644 deploy/systemd/klick-parse.socket deploy/systemd/klick-parse@.service \
  deploy/systemd/klick-parse.slice deploy/systemd/klick.service /etc/systemd/system/
sudo install -D -o root -g root -m 0644 dist/parse-worker.mjs /usr/local/lib/klick-parse/parse-worker.mjs
sudo systemctl daemon-reload && sudo systemctl enable --now klick-parse.socket
sudo systemctl restart klick
```
Prüfen:
- `ls -l /run/klick-parse.sock` → `srw-rw---- root klick`
- `systemd-analyze security klick-parse@probe.service` ≤ 1.0
- CSV mit einer IBAN als Nachweis hochladen → DLP-Hinweis „IBANs“; `journalctl -u 'klick-parse@*' -n 20`
  zeigt den Lauf (nur die Warnung `--expose_wasm` von `--jitless`, sonst nichts).
- Startet die App ohne `PARSER_SOCKET`, warnt das Log beim Start; der Parser läuft dann als
  Kindprozess mit den Rechten der App (Entwicklung, CI).

Fehlerbild „Prüfdienst nicht erreichbar“: `systemctl status klick-parse.socket`, Bündel vorhanden
(`/usr/local/lib/klick-parse/parse-worker.mjs`), `journalctl -u 'klick-parse@*'` (OOM →
`MemoryMax`, Abbruch nach 20 s → `RuntimeMaxSec`). Später als Container (gVisor/Podman) — Protokoll
und App bleiben gleich, nur der Socket zeigt woanders hin.

## Security-Checks: CI-Ingest und Schnellcheck (S5, ADR-017)
- **nginx:** Zone `klick_ingest` (30/min je IP) und `location /api/ingest/` (nur POST, 26 MB) aus
  `deploy/nginx/raza.work.conf` übernehmen, `nginx -t && systemctl reload nginx`. Die App begrenzt
  zusätzlich je Token (30/min) und je Org.
- **Tokens:** Einstellungen → Integrationen (Owner, Step-up). Nur der SHA-256 liegt in der DB; ein
  geleakter Token wird über das Präfix `klk_ingest_` von gitleaks/GitHub-Secret-Scanning erkannt →
  sofort widerrufen. Prüfen:
  `curl -s -o /dev/null -w "%{http_code}" -X POST https://raza.work/api/ingest/scan` → 401.
- **Schnellcheck:** läuft als pg-boss-Job `quick-check` (höchstens zwei gleichzeitig); ohne Jobs
  (`KLICK_DISABLE_JOBS=true`) direkt nach der Antwort. Braucht ausgehend DNS und TCP 80/443 (die
  nftables-`output`-Kette ist offen). Ein Scan, der länger als 15 min „läuft“, gilt als abgebrochen.
  Keine aktiven Tests aus Klick — Pentests laufen extern mit schriftlicher Beauftragung.
- **Migration:** `0008_security` legt `access_tokens` (mit Policy `access_tokens_by_hash`),
  `security_scans`, `security_findings` an (FORCE RLS). Rechte für `klick_app` kommen über die
  Default-Privilegien von `klick_migrator`.

## Sicherheitsaufträge (S7)
- **Migration:** `0009_security_engagements` legt `security_engagements` an (FORCE RLS) und ergänzt
  `security_findings` um `engagement_id`, `cvss_vector`, `retest_status`, `retested_at`,
  `retest_note` (additiv).
- **Betrieb:** keine Jobs, keine Netzanfragen — aktive Tests laufen beim Tester. Erinnerungen
  (Testende ohne Bericht, Nachtest) kommen aus dem `compliance-tick`.
- **Bericht:** `/api/export/sicherheitsauftrag.zip?id=…` (Step-up, Export-ID im Audit-Log).

## Lieferantenportal (S6, ADR-017)
- **Ablauf:** Dienstleister → Bewertungen → „Bewertung starten“ → „Link erzeugen“ (optional per
  Mail). Der Link `https://raza.work/lieferant#klk_portal_…` trägt den Token im Fragment; die Seite
  tauscht ihn gegen das Cookie `klick_portal` (httpOnly, Secure, SameSite=Strict, Pfad `/lieferant`).
- **nginx:** keine eigene Zone nötig — `/api/lieferant/sitzung` begrenzt die App je IP (20/min),
  Antworten und Uploads je Token. Upload-Grenze wie überall 25 MB.
- **Prüfen:** `curl -s -o /dev/null -w "%{http_code}" -X POST -H 'content-type: application/json' -d '{}' https://raza.work/api/lieferant/sitzung` → 401.
- **Leck:** Link weitergeleitet oder verloren → am Dienstleister „Link zurückziehen“ (oder neuen
  erzeugen, der alte wird ungültig). Abschluss der Bewertung widerruft alle Links.
- Keine Migration: Spalten für Entscheidung/Kontakt (`assessments`) und Sorgfaltsprüfung
  (`providers`) existieren seit 0006 bzw. P2.

## Risikoanalyse und Lieferantenbewertung (R1–L2)
- **Migrationen:** `0012_risk_method` (`org_settings.risk_method`, Felder des Risiko-Assistenten an
  `risks`, `risk_treatments.cost_eur`) und `0013_provider_ratings` (`providers.category`,
  `org_settings.supplier_method`, Org-Tabelle `provider_ratings` mit RLS + FORCE) — additiv. Rechte für
  `klick_app` über die Default-Privileges aus `roles.sql`; wer lokal als `postgres` migriert, gibt sie
  danach selbst (`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO …`).
- **Bestand:** Orgs ohne gespeicherte Risikomethodik rechnen wie bisher (EW × SH, Klassen aus dem
  Appetit). Umstellen unter Einstellungen → Risikomethodik („Vorlage laden“ → speichern, Step-up);
  die Vorschau zeigt, wie viele Risiken die Klasse wechseln. Neue Orgs bekommen die Vorlage beim
  Onboarding.
- **Freigabe roter Lieferanten:** Workflow „Dienstleister aufnehmen“ (`provider_onboarding`,
  Auslagerungsbeauftragte:r → Geschäftsleitung) ist ab Stufe 2 aktiv; ohne besetzte Funktionen
  meldet der Abschluss „Niemand erfüllt die Freigaberegel“.

## Preise, Anfragen, Berater-Zugang (T1–T3)
- **Migrationen:** `0010_pricing` (`price_groups`, `price_overrides`, `org_settings.price_group_id`)
  und `0011_inquiries` (`inquiries`) — Plattform-Tabellen ohne `organization_id`, daher ohne RLS;
  Rechte für `klick_app` kommen über die Default-Privileges aus `roles.sql`.
- **Seed:** `pnpm db:seed` legt die Preisgruppen „Standard“ (Marktüblich, Standard), „Kleine
  Unternehmen“ (Einstieg) und „Große Unternehmen“ (Premium) an — nur, wenn noch keine Gruppe
  existiert. Danach Preise unter Admin → Preise prüfen, bevor `/preise` und `/leistungen`
  öffentlich sind.
- **Anfragen:** `POST /api/anfrage` (5 je IP in 10 min in der App; nginx-Zone wie für `/api`).
  Sofort-Mails an Plattform-Admins laufen über den Job `notification-mail` — Mail-Provider muss
  konfiguriert sein. `CONTACT_EMAIL` wird nicht mehr gelesen und kann aus der Env.
  Prüfen: `curl -s -o /dev/null -w "%{http_code}" -X POST -H 'content-type: application/json' -H 'origin: https://evil.example' -d '{}' https://raza.work/api/anfrage` → 403.
- **Datenschutzerklärung** (Admin → Rechtstexte) um die Verarbeitung von Anfragen ergänzen.
- **Berater-Zugang (ADR-018):** keine Migration (Rolle `consultant` ist ein Text-Wert in
  `member.role`). Bestehende befristete Prüfer-Zugänge greifen ab diesem Release wirklich
  (vorher las der Guard `member_access` ohne Org-Kontext) — vor dem Release unter Team prüfen,
  ob Ablaufdaten stimmen.

## SSO einrichten (Entra, Google, Okta, SAML; ADR-015, ADR-026)
`@better-auth/sso` mit eigener Provisionierung (`lib/auth/sso-provisioning.ts`). Die Inhaber:in richtet
den Anbieter unter Einstellungen > SSO ein; der Plattform-Betrieb braucht nichts zu installieren. Adressen
für den IdP (Klick zeigt sie im Formular zum Kopieren, `<id>` = Kennung des Anbieters in Klick):

| Protokoll | Adresse im IdP |
|---|---|
| OIDC (Entra, Google, Okta, andere) | Umleitungs-URI `https://raza.work/api/auth/sso/callback/<id>` |
| SAML 2.0 | ACS `https://raza.work/api/auth/sso/saml2/sp/acs/<id>`, Entity-ID `https://raza.work/api/auth/sso/saml2/sp/metadata?providerId=<id>` |

1. **Microsoft Entra ID:** App-Registrierung (nur dieses Verzeichnis), Umleitungs-URI (Web), Clientgeheimnis,
   unter Tokenkonfiguration den Gruppenanspruch (Sicherheitsgruppen als Gruppen-ID), unter
   Unternehmensanwendungen „Zuweisung erforderlich“. In Klick Mandanten-ID, Client-ID und Geheimnis
   eintragen; der Issuer wird `https://login.microsoftonline.com/<tenant>/v2.0`. Firmen-MFA kommt über
   `amr` (`mfa`, `otp`, `hwk` …).
2. **Google Workspace:** OAuth-Client (Webanwendung), Zustimmungsbildschirm „Intern“. Klick prüft `hd`
   gegen die Domain. Google liefert weder Gruppen noch `amr`: alle Konten bekommen die Standardrolle,
   „Firmen-MFA anerkennen“ greift hier nicht (Passkey bleibt Pflicht).
3. **Okta / andere OIDC:** App-Integration (Authorization Code mit PKCE), Gruppen-Claim `groups`, App den
   Gruppen zuweisen. Issuer = Okta-Domain bzw. Discovery-Adresse; „Verbindung testen“ ruft
   `/.well-known/openid-configuration` über `safeFetch` ab.
4. **SAML (ADFS, Entra-SAML, Keycloak …):** ACS und Entity-ID eintragen, E-Mail als NameID oder Attribut
   `email`, Gruppen als Attribut. Metadaten-XML einfügen oder Entity-ID, SSO-URL und Zertifikat einzeln.
   Firmen-MFA über `authnmethodsreferences` (Entra/ADFS: `…/claims/multipleauthn`) oder
   `AuthnContextClassRef`.
5. **Domain bestätigen:** TXT `_klick-sso.<domain>` mit dem angezeigten Wert, dann „Prüfen“. Ohne bestätigte
   Domain gibt es keine Anmeldung und kein Erzwingen.
6. **Regeln:** Gruppen → Rolle (Mitarbeitende, Lesend, Bearbeiter:in; nie Inhaber:in), Standardrolle ohne
   Treffer (Vorgabe Mitarbeitende). Die Rolle wird bei **jeder** Anmeldung aus den Gruppen neu gesetzt
   (Audit), die Ein-Org-Regel (ADR-018) gilt.
7. **Firmen-MFA anerkennen** (aus als Vorgabe): meldet der IdP MFA, setzt Klick `mfaVerifiedAt` für die
   Sitzung, aber nie den Step-up: Freigaben, Exporte und Einstellungen verlangen weiter Passkey oder Code.
8. **SSO erzwingen:** Konten der bestätigten Domain bekommen Sitzungen nur noch über den SSO-Rückruf;
   Passkey und Mail-Link melden „Bitte mit dem Firmenkonto anmelden“. Inhaber:innen behalten den Notzugang
   per Passkey (Audit `auth.sso_bypass`). Wer im IdP gesperrt ist, kommt nicht mehr hinein; laufende
   Sitzungen enden spätestens nach 30 min Leerlauf bzw. 12 h.

**Was Klick bei SAML prüft (Härtung A7):** Antwort nur zu einer eigenen Anfrage (InResponseTo, keine
IdP-initiierte Anmeldung), genau eine Assertion und diese signiert (Signatur nur auf der Response reicht
nicht), Signatur- und Digest-Verfahren SHA-256 oder stärker (SHA-1 wird abgelehnt — im IdP ggf. umstellen,
ADFS: Relying Party > Erweitert > SHA-256), Audience = Entity-ID dieses Anbieters, Recipient = seine ACS,
Zeitfenster Pflicht (±3 min), jede Assertion nur einmal. Bei OIDC: PKCE, Issuer und Audience gepinnt.
Angemeldet und angelegt werden nur Adressen der bestätigten Domain **dieses** Anbieters; eine fremde
Adresse (auch einer anderen Org) wird abgelehnt (`SSO_DOMAIN_MISMATCH`), es entsteht kein Konto.

**SAML-Anbieter, die vor dem 26.10.2026 (Härtung A7) angelegt wurden,** haben als Entity-ID von Klick
versehentlich die des IdP. Prüfen und neu anlegen (SSO-Verbindung entfernen, neu einrichten, im IdP
Entity-ID/ACS aktualisieren):
```bash
runuser -u postgres -- psql klick -c "select provider_id, organization_id from sso_provider
  where saml_config is not null and (saml_config::jsonb -> 'spMetadata' ->> 'entityID') is null"
```

**Prüfen nach dem Einrichten:** mit einem Testkonto anmelden (Rolle in Team prüfen), ein Konto ohne
Gruppe (Standardrolle), ein Konto einer fremden Domain (abgelehnt). Vor dem Erzwingen einen Inhaber-Passkey
testen. **Fehlersuche:** Audit der Org (`member.sso_provisioned`, `member.sso_role_changed`,
`sso.provision_skipped` mit Grund, z. B. fremde Domain oder zweite eigene Mitgliedschaft,
`auth.idp_mfa_accepted`, `auth.sso_bypass`), unerwartete Fehler im Journal (`journalctl -u klick`). Der feste
„Mit Microsoft anmelden“-Knopf (`MICROSOFT_TENANT_ID`) bleibt nur für den Plattform-Betrieb.

## Wallet: Knoten, Sync, Sanktionsliste (Plan Wallet, Phase 0/1)
> **Seit K6 nur both.money:** Klick hat keinen Wallet-Bereich mehr. Knoten, Sync und
> Sanktionsliste gehören zu both.money (Credentials `both_rpc_*`, Drop-in
> `both.service.d/nodes.conf`, Units `both-sanctions.*` — Abschnitt „both.money“ unten).
both.money liest nur eigene Knoten (kein Infura, kein Explorer). Die App kennt nie private
Schlüssel — Konten entstehen aus dem öffentlichen Kontoschlüssel (xpub/zpub/tpub/vpub). Erst
Testnetz (Signet, Sepolia); das echte Netz bleibt gesperrt, bis Phase 3 die signierte Richtlinie
bringt.

1. **Knoten-Server** (eigene Maschine, nicht der App-Server): Signet unter 20 GB, Sepolia-Archiv
   einige hundert GB SSD (PRÜFEN beim Bestellen), später echtes Netz rund 2 TB + 1 TB. Richtwerte,
   Stufen und Gegenprobe: `docs/betrieb/knoten-hardware.md`.
2. **WireGuard** auf beiden Servern: `deploy/wireguard/wg0-app.conf.example` (App, 10.8.0.1) und
   `wg0-nodes.conf.example` (Knoten, 10.8.0.2); `systemctl enable --now wg-quick@wg0`. Firewall
   des Knoten-Servers: `deploy/wireguard/firewall-nodes.nft` (`<APP_PUBLIC_IP>` ersetzen) — RPC
   nur aus dem Tunnel vom App-Server, P2P offen.
3. **Bitcoin Core:** `BITCOIN_VERSION=<aktuell> NODE_WG_IP=10.8.0.2 APP_WG_IP=10.8.0.1
   CHAIN=signet deploy/nodes/setup-bitcoind.sh` — prüft SHA256SUMS mit mindestens drei
   Builder-Signaturen (guix.sigs), setzt `txindex`, `rpcauth` und `rpcwhitelist` (nur die
   Methoden, die Klick nutzt; alles andere → HTTP 403) und gibt die `WALLET_RPC_BITCOIN_SIGNET`-
   URL aus. Fortschritt im Log: `grep UpdateTip /var/lib/bitcoind/signet/debug.log | tail -1`
   (RPC nimmt nur den App-Server über den Tunnel an; `pnpm wallet:check` dort zeigt den Stand).
4. **Ethereum (Sepolia):** Versionen und Signatur-Fingerabdrücke von den Release-Seiten von Reth
   und Lighthouse übernehmen, dann `RETH_VERSION=… LIGHTHOUSE_VERSION=… RETH_GPG_FPR=…
   LIGHTHOUSE_GPG_FPR=… NODE_WG_IP=10.8.0.2 deploy/nodes/setup-ethereum.sh`. Nach dem Sync den
   finalisierten Checkpoint gegen zwei unabhängige Quellen prüfen:
   `SOURCES="https://… https://…" deploy/nodes/verify-checkpoint.sh` (muss „stimmt überein“
   melden, sonst Knoten nicht verwenden).
5. **App anbinden:** je Netz die URL als Credential `both_rpc_<netz>` ablegen und
   `deploy/systemd/both.service.d/nodes.conf.example` nach
   `/etc/systemd/system/both.service.d/nodes.conf` (Abschnitt „both.money“), dann
   `systemctl daemon-reload && systemctl restart both`. Der Job `wallet-sync` läuft jede Minute
   (nur mit gesetzten URLs).
6. **Prüfen:** `WALLET_RPC_BITCOIN_SIGNET="$(systemd-creds decrypt
   /etc/credstore.encrypted/wallet_rpc_bitcoin_signet -)" WALLET_RPC_ETHEREUM_SEPOLIA="…" pnpm
   wallet:check` — Kette, Sync, Finalität, trace-API, rpcwhitelist (403) und die hinterlegten
   USDC-/EURC-Verträge (`decimals`/`symbol`). Vertragsadressen zusätzlich gegen die offizielle
   Liste von Circle prüfen, bevor das echte Netz freigeschaltet wird.
7. **Sanktionsliste:** `pnpm wallet:sanctions --fetch` einmal von Hand, dann
   `deploy/systemd/both-sanctions.{service,timer}` installieren und `systemctl enable --now
   both-sanctions.timer`. Jeder Import steht als `sanctions.list_imported` im
   Plattform-Audit; eine leere oder kaputte Datei bricht ab, ohne die Liste zu leeren. Treffer
   bei einem Eingang: Betrag eingefroren, `security_alert` an alle mit Wallet-Zugriff.
8. **Abnahme im Testnetz:** in both.money unter Konten aus der xpub der Hardware-Wallet/Sparrow
   anlegen, erste Adresse auf dem Gerät vergleichen, Signet-/Sepolia-Coins aus den Faucets
   empfangen, Bestand und Bewegungen prüfen; in Klick erscheinen sie unter `/krypto`, der
   Tagesabschluss belegt die Abstimmung unter `/verwahrung` vor (Blockhöhe/Hash).
9. **Knoten neu aufgesetzt:** Beobachtungs-Wallets entstehen neu, wenn Klick sie für nicht
   eingerichtet hält: `update wallet_accounts set node_ready = false, sync_cursor = null where
   network = 'bitcoin_signet';` (als `klick_migrator`, danach rescannt der Knoten ab
   `history_from`). Ethereum braucht nichts — der Job liest ab `sync_height` weiter.
10. **Störungen:** Abgleichsfehler stehen am Konto („Abgleich gestört: …“) und im Journal
    (`wallet sync failed`). Leitet der Knoten andere Adressen ab als Klick, hält das Konto an
    (`wallet.node_mismatch`, `security_alert`) — Kontoschlüssel und Knoten-Konfiguration prüfen,
    nicht einfach zurücksetzen.

**Lokal ohne Knoten:** `pnpm wallet:devchain` (Nachbau von Bitcoin Core und Reth mit Faucet,
Blöcken, Reorg und Senden wie ein Knoten — Signaturen, Doppelausgabe, RBF, Nonces, Gas,
Circle-Sperre; Steuerung über `POST :18443/dev/{faucet,mine,reorg,fee}` bzw.
`:18545/dev/{faucet,mine,basefee,blacklist}`) und in `.env.local`
`WALLET_RPC_BITCOIN_SIGNET=http://dev:dev@127.0.0.1:18443`,
`WALLET_RPC_ETHEREUM_SEPOLIA=http://127.0.0.1:18545` (für `pnpm dev:wallet` in
`apps/wallet/.env.local`). Die Testkette ersetzt nicht die Abnahme mit echten Knoten.

## Wallet: Signer und Bestätigungsseite (Plan Wallet, Phase 2)
> **Seit both.money:** Signer und Bestätigungsseite gehören zu both.money (`approve.both.money`,
> Socket-Gruppe `both`); Klick ist nicht mehr angebunden (K6). Die Schritte unten gelten
> sinngemäß — statt `freigabe.raza.work` gilt `approve.both.money`, statt Klick die App
> both.money; die Unterschiede stehen im Abschnitt „both.money“. `install.sh` installiert nach
> `/var/www/approve` und trägt `https://both.money` als API ein.

Der Signer ist die einzige Instanz, die Hot-Auszahlungen signiert: eigener Prozess ohne Netz
(`klick-signer.service`, nur AF_UNIX), Zustand im Journal `/var/lib/klick-signer/journal.log`,
Seeds je Netz verschlüsselt unter dem KEK (`seeds.json`). Bestätigt wird nur mit einem
gerätegebundenen Sicherheitsschlüssel auf `https://freigabe.raza.work` (statisch, eigene Herkunft).
Die App kann über `app.sock` bremsen, einrichten und lockern geht nur als root über `admin.sock`.

1. **DNS und Zertifikat:** A/AAAA-Eintrag `freigabe.raza.work` (kein Wildcard), dann
   `deploy/nginx/freigabe.raza.work.conf` nach `sites-available`, verlinken, zuerst nur Port 80
   für certbot: `certbot certonly --webroot -w /var/www/letsencrypt -d freigabe.raza.work`,
   `nginx -t && systemctl reload nginx`. Prüfen: `curl -sI https://freigabe.raza.work | grep -i content-security`.
2. **Installieren** aus einem Tag (nie aus dem Arbeitsordner der App): in CI unter
   „Signer bündeln“ steht der SHA-256 von `dist/signer.mjs`; dann als root
   `deploy/signer/install.sh <tag> <sha256>` — klont den Tag root-eigen, baut ohne
   Lifecycle-Skripte, vergleicht die Prüfsumme, installiert `signer.mjs` (0444), die Seite nach
   `/var/www/freigabe`, die Units, den Befehl `klick-signer-admin` und beim ersten Mal den KEK
   (`systemd-creds encrypt` → `/etc/credstore.encrypted/signer_kek`).
   Prüfen: `systemctl status klick-signer-app.socket`, `systemd-analyze security klick-signer`.
3. **Einrichten (Zeremonie, zwei Personen anwesend):**
   `klick-signer-admin init --org <Org-ID> --rp freigabe.raza.work --networks bitcoin_signet,ethereum_sepolia --dice`
   (Org-ID unter Admin → Organisationen). Je Netz 24 Wörter auf Stahl/Papier, zwei getrennte Orte;
   danach fragt das Skript drei Wörter je Netz ab — erst dann wird gespeichert. In Klick unter
   Verwahrung die Zeremonie eintragen (CC-KEY-01). Die Seeds kommen nie in ein Backup.
4. **Sicherheitsschlüssel:** je Schlüssel `klick-signer-admin enrol --person <User-ID>` → Link
   (1 h gültig) an die Person; sie richtet den Schlüssel auf der Seite ein. Allein (Solo) braucht
   eine Person zwei aktive Schlüssel, getrennt verwahrt. Synchronisierte Passkeys (iCloud, Google,
   Passwort-Manager) lehnt der Signer ab. Sperren: `klick-signer-admin revoke <credId>`
   (`klick-signer-admin status` zeigt die Schlüssel). `<User-ID>` ist die Konto-ID der Person in
   both.money (Mitglieder-Seite): Vier-Augen und „nicht die eigene Vollmacht freigeben“ zählt der
   Signer über diese Kennung, eine falsche ID hebelt beides aus.
5. **App anbinden:** `deploy/systemd/both.service.d/signer.conf.example` nach
   `/etc/systemd/system/both.service.d/signer.conf`, `systemctl daemon-reload && systemctl restart both`.
   Die App (Gruppe both) erreicht nur `app.sock`.
6. **Richtlinie:** Start = Solo, zwei Schlüssel, 30 min Pause vor dem Signieren, 24 h Wartezeit für
   neue Zieladressen, kleine Testnetz-Grenzen, kein Echtgeld. Ändern:
   `klick-signer-admin status > p.json`, `policy`-Teil anpassen und als eigene Datei speichern,
   `klick-signer-admin policy richtlinie.json` (Version und Vorgänger setzt das Skript; Mindestwerte
   prüft der Signer). Die App kann nur verschärfen.
7. **Einfrieren / Auftauen:** in Klick „Alles stoppen“ oder `klick-signer-admin freeze "<Grund>"`;
   auftauen nur `klick-signer-admin unfreeze`, nachdem die Ursache geklärt ist.
8. **KEK wechseln:** neuen KEK als `/etc/credstore.encrypted/signer_kek_next` anlegen, die
   auskommentierte Zeile in `klick-signer.service` aktivieren, neu starten,
   `klick-signer-admin rekey`, dann `signer_kek_next` → `signer_kek` umbenennen, Zeile wieder
   auskommentieren, neu starten.
9. **Wiederherstellungstest (CC-KEY-03, jährlich):** `klick-signer-admin xpubs > xpubs.json`,
   auf einem zweiten Rechner ohne Netz `pnpm signer:recover-check --network <netz> --xpubs xpubs.json`
   und die Wörter eingeben; „übereinstimmend“ in Klick als Wiederherstellungstest eintragen.
10. **Backup und Prüfung:** `klick-signer-backup.timer` sichert das Journal täglich nach
    `/var/backups/klick-signer` (30 Tage). `klick-signer-admin verify` prüft die Hash-Kette.
    Startet der Dienst mit „journal_hash“ o. ä. nicht, wurde das Journal verändert: nicht
    reparieren, sondern Ernstfall.
11. **Ernstfall (Server kompromittiert):** sofort einfrieren, alle Schlüssel sperren lassen, Bestände
    auf neue Seeds (neue Zeremonie, anderer Rechner) bzw. Cold umschichten, sobald geklärt.
    Grenze: root auf diesem Server kann den KEK lesen — die eigentliche Absicherung sind die
    kleinen Grenzen der Richtlinie; eigener Signer-Server mit HSM folgt in Phase 4.

**Lokal:** `pnpm signer:dev` (Dev-Bundle: Wartezeiten 0, ein Schlüssel genügt; Zustand in
`QA_DIR/signer`), `pnpm signer:admin --dev init --org <qaOrg> --rp localhost --origin http://localhost:3201 --networks bitcoin_signet,ethereum_sepolia --auto-confirm`,
`pnpm confirm:dev` (Seite auf :3201 mit denselben Headern),
`WALLET_SIGNER_SOCKET=$QA_DIR/signer/app.sock WALLET_CONFIRM_ORIGIN=http://localhost:3201 pnpm dev:wallet`.
Durchspielen im Browser (virtuelle Sicherheitsschlüssel, Jobs ruft das Skript selbst auf):
`pnpm wallet:devchain`, `pnpm signer:dev`, `CONFIRM_API=http://localhost:3400 pnpm confirm:dev`,
Dev-Server wie oben, dann `pnpm wallet:smoke:send --org <slug>`. Ein Dev-Signer gehört genau einer Org: nach einem
neuen QA-Konto `QA_DIR/signer` beiseitelegen und `pnpm signer:dev` neu starten.

### Auszahlungen im Betrieb

12. **Prüfen:** `pnpm wallet:check` prüft jetzt auch den Signer (erreichbar, eingerichtet, nicht
    eingefroren, Herkunft = `CONFIRM_ORIGIN`, Knoten je Netz, genug Schlüssel laut Richtlinie).
13. **Abnahme im Testnetz** (eigene Org, Wallet-Bereich unter Einstellungen → Organisation an):
    Konten → „Hot-Konto anlegen“ (Bitcoin Signet, Ethereum Sepolia) → erste Adresse mit dem
    Faucet füllen → Adressbuch → Zieladresse vorschlagen, auf der Bestätigungsseite freigeben,
    24 h Wartezeit (Veto-Probe mit einer zweiten Adresse) → Senden → auf der Bestätigungsseite
    bestätigen → nach der Solo-Pause signiert und sendet der Job `wallet-payouts` (jede Minute) →
    Stand „Gesendet“, dann „Bestätigt im Netz“; Bestand und Bewegungen stimmen (Betrag + Gebühr).
    Danach ETH und USDC (Gas-Guthaben auf dem Konto nötig), „Beschleunigen“ bei langsamer
    Gebühr, „Abbrechen“ einer gesendeten Auszahlung, „Alles stoppen“ mit Banner und Auftauen.
14. **Hängt eine Auszahlung:** Detailseite zeigt den letzten Fehler (z. B. Gebühr über dem Deckel,
    zu wenig Gas). „Beschleunigen“ erhöht die Gebühr mit denselben Eingängen bzw. derselben Nonce
    bis zum Deckel der Absicht; „Abbrechen“ ersetzt sie durch eine Zahlung an das eigene Konto.
    Ohne Bestätigung im Fenster der Richtlinie läuft die Absicht ab (neu anlegen).
15. **Signer nicht erreichbar:** nach 5 min Sicherheitsmeldung (einmal am Tag) und Banner im
    Wallet-Bereich; Auszahlungen pausieren. `systemctl status klick-signer klick-signer-app.socket`.
16. **„Unbekannte Ausgabe aus Hot-Konto“:** der Sync hat eine Ausgabe gesehen, die zu keiner
    Auszahlung in Klick gehört — der Signer wurde automatisch eingefroren. Ernstfall nach Punkt 11:
    Transaktion im Knoten prüfen (`bitcoin-cli … gettransaction <txid>`), Journal prüfen
    (`klick-signer-admin verify`), erst nach Klärung auftauen.
17. **„Signer-Journal zurückgesetzt“:** Klick kennt einen neueren Journal-Stand als der Signer
    meldet (Backup eingespielt oder Journal ersetzt). Der Job arbeitet nicht weiter; nicht auftauen,
    sondern klären, welches Journal echt ist (`/var/backups/klick-signer`).

## both.money (Plan both.money, auf dem Klick-Server)

Die Wallet läuft als eigene App (`apps/wallet`) mit eigener Datenbank `wallet`, eigenem User
`both`, eigenen Credentials (Präfix `wallet_`) und eigenem Dienst `both.service` auf Port 3010.
Klick und both.money teilen nur Postgres, nginx, die Knoten und den Signer-Dienst. Später zieht
both.money auf einen eigenen Server — dann ändern sich nur Units, Credentials und DNS.

### Einmalig
1. **DNS:** A/AAAA für `both.money`, `www.both.money`, `approve.both.money` auf diesen Server
   (kein Wildcard). Zertifikate: `certbot certonly --webroot -w /var/www/letsencrypt -d both.money
   -d www.both.money` und `… -d approve.both.money` (vorher die nginx-Dateien mit Port 80 aktiv).
2. **Mail:** Domain `both.money` in Brevo bestätigen (DKIM, DMARC); bis dahin geht der Versand
   über `no-reply@raza.work` (`WALLET_MAIL_FROM` leer lassen).
3. **User und Checkout:** `useradd --system --home-dir /opt/both --shell /usr/sbin/nologin both`,
   `install -d -o both -g both -m 0750 /opt/both /opt/both/.cache`,
   `sudo -u both git clone <repo> /opt/both/current`.
4. **Datenbank:** `sudo -u postgres psql -v ON_ERROR_STOP=1 -f deploy/postgres/wallet-roles.sql`,
   Passwörter setzen (`ALTER ROLE wallet_migrator|wallet_app|wallet_backup PASSWORD '…'`).
   Nach dem ersten Release das Skript erneut ausführen (Rechte auf `drizzle`).
5. **Credentials** (nie die von Klick wiederverwenden):
   `openssl rand -base64 33 | systemd-creds encrypt --name=wallet_auth_secret - /etc/credstore.encrypted/wallet_auth_secret`,
   `head -c 32 /dev/urandom | base64 | systemd-creds encrypt --name=wallet_vault_kek_base64 - …`,
   `wallet_database_url` (`postgres://wallet_app:…@localhost/wallet`),
   `wallet_database_url_migrate` (`wallet_migrator`), `wallet_database_url_backup` (`wallet_backup`),
   optional `wallet_brevo_api_key`. KEK-Backup wie bei Klick getrennt offline ablegen.
6. **Anbieterkennzeichnung:** `/etc/both/both.env` (0640 root:both) mit `LEGAL_*` (wie Klick,
   `docs/legal/impressum.md`) und später `WALLET_MAIL_FROM="both.money <no-reply@both.money>"`.
7. **Release** (unten), dann Units: `deploy/systemd/both.service` nach `/etc/systemd/system/`,
   Drop-ins aus `both.service.d/*.example` nach Bedarf (Mail, Knoten, Signer),
   `both-sanctions.{service,timer}`, `both-backup-db.{service,timer}` (Skript-Kopie wie Klick unter
   `/usr/local/lib/klick-backup`, `install -d -o klick-backup -m 0700 /var/backups/both`),
   `systemctl daemon-reload && systemctl enable --now both both-sanctions.timer both-backup-db.timer`.
8. **nginx:** `deploy/nginx/both.money.conf` und `deploy/nginx/approve.both.money.conf` aktivieren,
   `nginx -t && systemctl reload nginx`. Prüfen: `curl -f https://both.money/api/ready`.
9. **Erste Org und dein Konto** (Betreiber-Org: Hot-Konten für eigene Bestände):
   `pnpm wallet:admin org create --name "Raza" --slug raza --operator`, dann
   `pnpm wallet:admin account create --email <adresse> --name "<Name>" --org raza --role owner --admin`
   → Link öffnen, Passkey anlegen. Weitere Personen nur per Einladung (Mitglieder → Einladen).
10. **Knoten:** am Knoten-Server `RPC_USER=both NODE_WG_IP=10.8.0.2 deploy/nodes/add-bitcoin-rpc-user.sh`
    (eigener rpcauth-User, gleiche rpcwhitelist); Ethereum über dieselbe Tunnel-URL wie Klick.
    Credentials `both_rpc_bitcoin_signet`, `both_rpc_ethereum_sepolia`, Drop-in `nodes.conf`.
11. **Sanktionsliste:** `systemctl start both-sanctions.service`, Ergebnis im Journal.
12. **Signer (neue Zeremonie, alter Signer verfällt):** alten Signer einfrieren
    (`klick-signer-admin freeze "Umstellung both.money"`), `systemctl stop klick-signer
    klick-signer-app.socket`, Zustand archivieren (`mv /var/lib/klick-signer
    /var/lib/klick-signer.raza-$(date +%F)`, Journal-Backup aufheben), in Klick die Drop-ins
    `signer.conf` und `wallet.conf` löschen, `systemctl daemon-reload && systemctl restart klick`.
    Dann `deploy/signer/install.sh <tag> <sha256>` (Socket-Gruppe `both`, Seite nach
    `/var/www/approve`), `klick-signer-admin init --org <Org-ID aus wallet:admin org list> --rp
    approve.both.money --networks bitcoin_signet,ethereum_sepolia --dice`, Sicherheitsschlüssel mit
    `klick-signer-admin enrol --person <User-ID>` (Link auf `approve.both.money`), Drop-in
    `signer.conf` für both.money, `systemctl restart both`. Hot-Konto in both.money anlegen, Faucet.
13. **Prüfen:** `pnpm wallet:check` (Knoten, Token-Verträge, Kursfeeds, Signer mit Herkunft
    `https://approve.both.money`), `systemd-analyze security both` ≤ 2.0.
14. **Mit Klick verbinden:** Klick zuerst releasen (Migration 0033). In Klick unter Einstellungen →
    Integrationen → „both.money verbinden“ ein Token ausstellen (Step-up, einmal sichtbar), in
    both.money unter Organisation → Compliance-Export → „Mit Klick verbinden“ mit Adresse
    `https://raza.work` eintragen, Konten „alle“, Nachlieferung ab Jahresbeginn. Prüfen: in Klick
    `/krypto` (Statusleiste „Läuft“, Konten mit Register-Eintrag `W-…`), `/verwahrung` (neue
    Wallets „(both.money)“: Technik, Schlüsselinhaber:innen und Backup-Test ergänzen), in
    both.money Compliance-Export „nichts offen“. Am nächsten Morgen: Tagesabschluss in `/krypto`.
15. **Sicherheitsschlüssel**, sobald sie da sind: je Person `klick-signer-admin enrol --person
    <User-ID>`, Link auf `approve.both.money` öffnen. Danach in Klick unter `/krypto` die Zeremonie
    (Richtlinie, Anzahl Schlüssel) und unter `/verwahrung` das Quorum der Hot-Wallet prüfen.
16. **Alten Wallet-Bereich abbauen (K6),** nach dem Release ohne Wallet-Bereich:
    `systemctl disable --now klick-sanctions.timer`, `rm -f
    /etc/systemd/system/klick-sanctions.{service,timer}
    /etc/systemd/system/klick.service.d/{wallet,signer}.conf`, `systemctl daemon-reload &&
    systemctl restart klick`. Alte Credentials `wallet_rpc_*` unter `/etc/credstore.encrypted`
    braucht Klick nicht mehr. Die alten pg-boss-Zeitpläne der Wallet-Jobs räumt Klick beim Start
    selbst ab; die Wallet-Tabellen in der Klick-DB bleiben (kein DROP).

Befehle am Terminal brauchen dieselben Werte wie der Dienst:

```bash
sudo bash -c '
set -euo pipefail
cd /opt/both/current
d() { systemd-creds decrypt "/etc/credstore.encrypted/$1" - 2>/dev/null; }
set -a; . /etc/both/both.env; set +a
export HOME=/opt/both WALLET_AUTH_URL=https://both.money
export WALLET_AUTH_SECRET="$(d wallet_auth_secret)" WALLET_VAULT_KEK_BASE64="$(d wallet_vault_kek_base64)"
export WALLET_DATABASE_URL="$(d wallet_database_url)" WALLET_DATABASE_URL_MIGRATE="$(d wallet_database_url_migrate)"
runuser -u both -- pnpm wallet:admin org list
'
```

### Release
CI grün → `both-backup-db.service` einmal starten → Dienst stoppen (Speicher für den Build) →
`sudo -u both git -C /opt/both/current pull --ff-only` → im Block oben statt `wallet:admin`:
`NODE_OPTIONS=--max-old-space-size=1536 runuser -u both -- pnpm release:wallet` (install →
`db:wallet:migrate` → `next build apps/wallet`) → `systemctl start both` →
`curl -f https://both.money/api/ready`. Klick und both.money nie gleichzeitig bauen (Speicher,
Swap prüfen: `swapon --show`).

### Verwahrmodus (Sperre für Kundengelder)
Hot-Konten, Zieladressen und Auszahlungen gibt es nur für die Betreiber-Org (`--operator`,
Modus `own`) oder mit eingetragener Erlaubnis. Setzen nur am Terminal, mit Grund im Protokoll
der Org: `pnpm wallet:admin org custody --org <slug> --mode licensed --ref "<Erlaubnis>"
--reason "<Grund>"`. Zurück mit `--mode none`. Cold-Konten aus einer xpub darf jede Org
beobachten; Kundengelder im echten Netz nur mit `licensed`.

### Zugang und Vollmacht (Härtung W, ADR-031)
Migrationen `0003_access` und `0004_mandates` laufen mit `release:wallet`. Inhaber:innen stellen
unter Einstellungen > Zugang ein (Step-up): IP-Liste, nur Sicherheitsschlüssel, erlaubte Assets,
„Bedienung nur mit Vollmacht“. Speichern lehnt ab, was die eigene Adresse oder die eigenen
Schlüssel aussperren würde; Lockern meldet sich bei allen Inhaber:innen.
1. **Plattformweite IP-Liste (optional):** `cp deploy/nginx/snippets/both-allow.conf.example
   /etc/nginx/snippets/both-allow.conf`, Netze eintragen (Admin-Netz bleibt drin, endet mit
   `deny all;`), `nginx -t && systemctl reload nginx`. Gilt für App und Anmeldung; Relay der
   Bestätigungsseite (`/api/confirm|enrol|mandate/`), Link-Tausch und Health bleiben offen.
   Zurück: Datei löschen, neu laden.
2. **Nur Token (z. B. EURC/USDC):** in both.money „Alle Assets“ ausschalten und die Token wählen;
   dann im Signer die Grenzen für BTC und ETH aus der Richtlinie entfernen
   (`klick-signer-admin status > p.json`, `policy.limits` ohne `BTC`/`ETH` als
   `richtlinie.json` speichern, `klick-signer-admin policy richtlinie.json`). ETH bleibt auf dem
   Konto nur für Gebühren. Prüfen: `pnpm wallet:check` meldet unter „Assets“ keine Abweichung.
3. **Vollmacht im Signer:** nach dem Ausstellen zeigt `/mandates` „Im Signer freigeben“; die
   Freigabe läuft auf `approve.both.money/#m=<id>` mit den Sicherheitsschlüsseln wie bei
   Auszahlungen (die bevollmächtigte Person zählt nicht). Danach sind Auszahlungen der Person
   im Rahmen vorab freigegeben; Pause, Fenster und Grenzen der Richtlinie gelten weiter.
   Sofort stoppen: in both.money widerrufen oder am Terminal
   `klick-signer-admin mandate-revoke <mandateId>`.
4. **Sicherheitsschlüssel-Pflicht:** vorher sicherstellen, dass jede Person einen
   gerätegebundenen Schlüssel (z. B. YubiKey) registriert hat — die Seite listet, wer nur
   synchronisierte Passkeys hat. Wer ausgesperrt ist: `pnpm wallet:recover <adresse>` (neuer
   Link, dabei Sicherheitsschlüssel verwenden).

### Compliance-Export nach Klick
both.money schickt Ein- und Ausgänge, Bestände (Tagesabschluss 00:10 Uhr Berlin), Zeremonie-Stand
und Auffälligkeiten an eine oder mehrere Klick-Organisationen (Vertrag `lib/wallet-link`, v1).
Ziele nur aus `WALLET_KLICK_ORIGINS` (Standard `https://raza.work`, komma-getrennt; in
`/etc/both/both.env`). Verbinden: in Klick Einstellungen → Integrationen → „both.money
verbinden“ (Step-up, Token `klk_wallet_…` 365 Tage, nur einmal sichtbar; Empfang
`/api/ingest/wallet`, nginx-Block `/api/ingest/`), in both.money Organisation → Compliance-Export → „Mit Klick verbinden“ (Step-up;
`hello` prüft das Token vor dem Speichern, Token nur verschlüsselt mit dem Org-DEK). Der heutige
Stand wird nachgeliefert, danach sendet der Job `klick-export` jede Minute Stapel bis 200
Ereignisse. Klick lehnt ab → Liste auf der Seite + Hinweis an die Inhaber:innen, der Export läuft
weiter. 401/403 → Verbindung pausiert, neues Token aus Klick über „Token erneuern“ eintragen
(nichts geht verloren). Klick nicht erreichbar → Wiederholung nach 1, 2, 4 … höchstens 60 min,
Hinweis nach 6 Versuchen. Der Ausgang (`export_outbox`) wird erst nach 30 Tagen **und** Quittung
aller Verbindungen gelöscht — eine lange Pause kostet Speicher, aber keine Daten. Stand prüfen:
`select origin, status, acked_seq, last_success_at, attempts, last_error from klick_links;`
(als `wallet_migrator`).

### Lokal
`pnpm dev:wallet` (3400, Env in `apps/wallet/.env.local`), `pnpm db:wallet:migrate`.
Senden durchspielen: `pnpm wallet:devchain`, `pnpm signer:dev`,
`pnpm signer:admin --dev init --org <Org-ID> --rp localhost --origin http://localhost:3201
--networks bitcoin_signet,ethereum_sepolia`, `pnpm confirm:dev`, App mit
`WALLET_DISABLE_JOBS=true WALLET_SIGNER_SOCKET=$QA_DIR/signer/app.sock
WALLET_CONFIRM_ORIGIN=http://localhost:3201 WALLET_RPC_BITCOIN_SIGNET=http://dev:dev@127.0.0.1:18443`,
dann mit derselben Umgebung `pnpm wallet:smoke:send --org <slug>` (`WALLET_SHOTS=<ordner>`).
