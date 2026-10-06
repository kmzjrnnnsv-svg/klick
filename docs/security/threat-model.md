# Bedrohungsmodell (STRIDE light) — Klick / raza.work

Stand: P0 (Oktober 2026). Die Plattform ist Mandant 0: jede Maßnahme hier ist zugleich ein
`implemented`-Control der Betreiber-Organisation mit Nachweis unter `/baseline`.

## Schutzgüter
1. Mandantendaten (Controls, Risiken, Dokumente, Nachweise, AML-Register) — Vertraulichkeit, Integrität.
2. Audit-Log — Integrität, Vollständigkeit (Prüfungsgrundlage).
3. Identitäten und Sitzungen — Authentizität.
4. Verfügbarkeit der Plattform (DORA Art. 11 für unsere Kunden, wir sind IKT-Drittdienstleister).

## Angreifer
A1 externer Angreifer ohne Konto · A2 authentifizierte:r Nutzer:in einer fremden Org · A3 kompromittierter
Mitarbeiter-Account (Phishing) · A4 kompromittierte Abhängigkeit (Lieferkette) · A5 Angreifer mit DB-Dump ·
A6 böswilliger Plattform-Admin · A7 Netzwerk-Mittelsmann.

## Bedrohungen und Gegenmaßnahmen

| STRIDE | Bedrohung | Gegenmaßnahme | Nachweis |
|---|---|---|---|
| Spoofing | Magic-Link-Diebstahl, Session-Hijacking | Link 15 min, Single-Use, gehasht gespeichert; MFA-Pflicht für alle Rollen (TOTP/Passkey); `__Host-`-Cookies; absolute 12 h / Idle 30 min; Step-up ≤ 10 min für sensible Aktionen | `lib/auth/server.ts`, `lib/auth/session-rules.ts`, Tests `session-rules` |
| Spoofing | Credential-Stuffing / Brute-Force auf 2FA | Lockout 5 Versuche / 15 min (Login und Step-up), Rate-Limits DB-basiert + nginx | `lib/auth/step-up.ts`, `deploy/nginx` |
| Spoofing | User-Enumeration über Magic-Link | identische Antwort und Dauer für bekannte/unbekannte Adressen | `components/auth/login-form.tsx` |
| Tampering | Audit-Einträge ändern/löschen (A5, A6) | append-only: keine UPDATE/DELETE-Policy + Trigger; SHA-256-Kette je Org; tägliche Prüfung mit Alarm | `db/migrations/0000_pivot.sql` Block C, `lib/audit.ts`, `runVerifyAuditChain` |
| Tampering | Lieferkettenangriff über npm (A4) | `minimumReleaseAge` 7 Tage, Lifecycle-Skripte blockiert, frozen lockfile, OSV + pnpm audit + CodeQL + gitleaks, SBOM | `pnpm-workspace.yaml`, `.github/workflows/*` |
| Repudiation | „Das war ich nicht" | Jede Mutation mit Akteur, IP, UA, before/after; Auth-Ereignisse über Hooks; Step-up protokolliert | `lib/auth/audit-events.ts`, `mutateOrg` |
| Information Disclosure | Fremde Org liest Daten (A2) | Postgres RLS + FORCE auf jeder Org-Tabelle, Kontext transaktionslokal, App-Rolle ohne BYPASSRLS, 404 statt 403, Biome verbietet `globalDb` im Fachcode, Isolationstests | `db/rls.ts`, `lib/db/with-org.ts`, `tests/rls.integration.test.ts` |
| Information Disclosure | DB-Dump (A5) | Per-Org-DEK (XChaCha20-Poly1305) für Nachweise; Feldverschlüsselung sensibler Spalten; KEK außerhalb der DB (systemd-Credentials) | `lib/crypto/*` |
| Information Disclosure | Logs/Fehlerseiten leaken Daten | pino-Redaction (Token, URL, Cookie, E-Mail), keine Payloads; generische Fehlerseiten | `lib/log.ts` |
| Information Disclosure | XSS / Clickjacking | CSP (P1: Nonce), `frame-ancestors 'none'`, kein HTML in Markdown, keine externen Skripte | `next.config.ts`, `components/markdown-view.tsx` |
| Information Disclosure | Plattform-Admin greift unbemerkt auf Mandanten zu (A6) | `withPlatform(reason)` — jeder Zugriff mit Begründung im Audit, IP-Allowlist, Impersonation 30 min mit Banner | `lib/db/with-org.ts`, `lib/auth/guards.ts` |
| Denial of Service | Flooding, große Uploads | nginx Rate-Limit-Zonen, `client_max_body_size 26m`, Upload-Limit 25 MB, Health ohne Limit; Hetzner-Firewall | `deploy/nginx`, `lib/uploads/validate.ts` |
| Elevation of Privilege | Rolle hochstufen, Mitglied werden | Berechtigungen serverseitig je Action (Access Control), Einladungen E-Mail-gebunden 48 h, ein User = eine Org, Entfernen widerruft Sessions | `lib/auth/permissions.ts`, `organizationHooks` |
| Elevation of Privilege | Prozess-Kompromittierung (A1 → RCE) | systemd-Sandbox (ProtectSystem=strict, SystemCallFilter, keine Capabilities), dedizierter User, read-only Code | `deploy/systemd/klick.service` |
| Malicious upload | Schadcode in Nachweisen | MIME-Allowlist, Magic-Bytes, Auslieferung als Attachment, SVG nie inline, ClamAV (P5) | `lib/uploads/validate.ts` |

## Bekannte Lücken (offen, mit Phase)
- CSP `'unsafe-inline'` für Skripte bis zum Nonce in P1.
- Kein KMS/HSM auf Hetzner → `LocalKms` + systemd-Credentials bis Lizenzstufe 2.
- Playwright-E2E (URL-Tampering, Vier-Augen) ab P4; bis dahin manuelle Prüfung nach Verifikationsliste.
- ClamAV, CrowdSec, Rate-Limits je Org in P5.
