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
'
sudo systemctl restart klick && curl -f https://raza.work/api/ready
```

**Rollback:** `scripts/restore-db.sh <dump> <url>` + `git checkout recruiting-final` + `pnpm release`.

## Prüfen
- `systemd-analyze security klick` ≤ 2.0
- `curl -I https://raza.work` zeigt CSP, HSTS, COOP/CORP, Permissions-Policy
- Mozilla Observatory A+, SSL Labs A+

## Anmeldung: Mailversand prüfen, Notfall-Link
Anmelde-Links (Notweg) und Einladungen gehen per Mail raus (Resend → Brevo → SMTP; scheitert ein
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
`BREVO_API_KEY`, `RESEND_API_KEY` **oder** `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER` in
`/etc/klick/klick.env`, `SMTP_PASS` als Credential `smtp_pass`. Hetzner sperrt ausgehend Port 25
und 465 — SMTP über 587. Brevo und Resend laufen über HTTPS (443) ohne SMTP-Login.

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
