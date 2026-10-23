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
# Parser-Bündel root-eigen ablegen (klick-parse@.service liest nur von dort)
install -D -o root -g root -m 0644 dist/parse-worker.mjs /usr/local/lib/klick-parse/parse-worker.mjs
sha256sum /usr/local/lib/klick-parse/parse-worker.mjs
'
sudo systemctl restart klick && curl -f https://raza.work/api/ready
```

**Rollback:** `scripts/restore-db.sh <dump> <url>` + `git checkout recruiting-final` + `pnpm release`.

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
5. Units `deploy/systemd/klick-backup-{db,objects,verify}.{service,timer}` und `klick-alert@.service`
   installieren, `systemctl enable --now klick-backup-db.timer klick-backup-objects.timer klick-backup-verify.timer`.

**Restore (auch quartalsweiser Test, Pflichten-Lauf):**
1. Wartungsmodus, `systemctl stop klick`.
2. `scripts/restore-db.sh <dump.sql.age> <ziel-url>` (für den Test: leere DB `klick_restore_test`).
3. `scripts/restore-objects.sh <ziel-remote> <datum-des-dumps>` — Objektstand passend zum Dump.
4. `pnpm exec tsx scripts/replay-deletions.ts --dry-run`, dann ohne `--dry-run`: Org- und
   Nachweis-Löschungen seit dem Dump nachholen (Tombstones liegen im Objektspeicher).
5. `pnpm exec tsx scripts/verify-backup.ts --sample 50` gegen das Ziel, Audit-Kette prüfen
   (`/admin/audit`), `curl -f …/api/ready`. Ergebnis als Pflichten-Lauf dokumentieren.

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

## SSO je Organisation
`@better-auth/sso` (OIDC). Owner registrieren den IdP unter Einstellungen → SSO; die E-Mail-Domain
muss per DNS-TXT (`_klick-sso.<domain>`) verifiziert werden, bevor Logins möglich sind.
Redirect-URI im IdP: `https://raza.work/api/auth/sso/callback/<providerId>`. Nutzer:innen der
Domain werden als Mitglied (viewer) provisioniert; MFA-Pflicht und Sitzungsregeln gelten.

## Wallet: Knoten, Sync, Sanktionsliste (Plan Wallet, Phase 0/1)
Der Wallet-Bereich liest nur eigene Knoten (kein Infura, kein Explorer). Klick kennt nie private
Schlüssel — Konten entstehen aus dem öffentlichen Kontoschlüssel (xpub/zpub/tpub/vpub). Erst
Testnetz (Signet, Sepolia); das echte Netz bleibt gesperrt, bis Phase 3 die signierte Richtlinie
bringt.

1. **Knoten-Server** (eigene Maschine, nicht der App-Server): Signet unter 20 GB, Sepolia-Archiv
   einige hundert GB SSD (PRÜFEN beim Bestellen), später echtes Netz rund 2 TB + 1 TB.
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
5. **App anbinden:** je Netz die URL als Credential ablegen
   (`printf %s '<url>' | systemd-creds encrypt --name=wallet_rpc_bitcoin_signet -
   /etc/credstore.encrypted/wallet_rpc_bitcoin_signet`, ebenso `wallet_rpc_ethereum_sepolia`),
   `deploy/systemd/klick.service.d/wallet.conf.example` nach
   `/etc/systemd/system/klick.service.d/wallet.conf`, `systemctl daemon-reload && systemctl
   restart klick`. Der Job `wallet-sync` läuft dann jede Minute (nur mit gesetzten URLs).
6. **Prüfen:** `WALLET_RPC_BITCOIN_SIGNET="$(systemd-creds decrypt
   /etc/credstore.encrypted/wallet_rpc_bitcoin_signet -)" WALLET_RPC_ETHEREUM_SEPOLIA="…" pnpm
   wallet:check` — Kette, Sync, Finalität, trace-API, rpcwhitelist (403) und die hinterlegten
   USDC-/EURC-Verträge (`decimals`/`symbol`). Vertragsadressen zusätzlich gegen die offizielle
   Liste von Circle prüfen, bevor das echte Netz freigeschaltet wird.
7. **Sanktionsliste:** `pnpm wallet:sanctions --fetch` einmal von Hand, dann
   `deploy/systemd/klick-sanctions.{service,timer}` installieren und `systemctl enable --now
   klick-sanctions.timer` (täglich 05:20). Jeder Import steht als `sanctions.list_imported` im
   Plattform-Audit; eine leere oder kaputte Datei bricht ab, ohne die Liste zu leeren. Treffer
   bei einem Eingang: Betrag eingefroren, `security_alert` an alle mit Wallet-Zugriff.
8. **Abnahme im Testnetz** (Plan „Ziel: eine funktionierende Wallet“): Konto unter Wallet →
   Konten aus der xpub der Hardware-Wallet/Sparrow anlegen, erste Adresse auf dem Gerät
   vergleichen, Signet-/Sepolia-Coins und Test-USDC/EURC aus den Faucets empfangen, Bestand und
   Bewegungen prüfen, Kundenkonto (Zweck „Kundengelder“) in der täglichen Abstimmung unter
   `/verwahrung` mit vorbelegtem On-Chain-Bestand (Blockhöhe/Hash) speichern.
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
`WALLET_RPC_ETHEREUM_SEPOLIA=http://127.0.0.1:18545`. `scripts/qa/wallet-smoke.ts` spielt damit
Entsperren und Empfangen komplett durch. Die Testkette ersetzt nicht die Abnahme mit echten
Knoten.
