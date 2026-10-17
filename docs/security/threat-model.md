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
| Information Disclosure | XSS / Clickjacking | Nonce-CSP je Request (`strict-dynamic`), `frame-ancestors 'none'`, kein HTML in Markdown, keine externen Skripte | `proxy.ts`, `next.config.ts`, `components/markdown-view.tsx` |
| Information Disclosure | Plattform-Admin greift unbemerkt auf Mandanten zu (A6) | `withPlatform(reason)` — jeder Zugriff mit Begründung im Audit, IP-Allowlist, Impersonation 30 min mit Banner | `lib/db/with-org.ts`, `lib/auth/guards.ts` |
| Denial of Service | Flooding, große Uploads, Noisy Neighbour | nginx Rate-Limit-Zonen je IP, Rate-Limit je Organisation für Exporte/Downloads/Uploads (`ORG_RATE_LIMIT_PER_MIN`), `client_max_body_size 26m`, Upload-Limit 25 MB, Health ohne Limit; Hetzner-Firewall, CrowdSec (Runbook) | `deploy/nginx`, `lib/rate-limit.ts`, `lib/uploads/validate.ts` |
| Elevation of Privilege | Rolle hochstufen, Mitglied werden | Berechtigungen serverseitig je Action (Access Control), Einladungen E-Mail-gebunden 48 h, höchstens eine eigene Org je Konto (weitere nur als Berater:in), Entfernen widerruft Sessions | `lib/auth/permissions.ts`, `lib/auth/memberships.ts`, `organizationHooks` |
| Elevation of Privilege | Berater:in mit mehreren Mandanten trägt Rechte oder Daten von Org A nach Org B (ADR-018) | RLS je aktiver Org wie bisher (Kontext transaktionslokal), Rolle je Mitgliedschaft; Step-up verfällt bei Wechsel, Beitritt und `organization/set-active`; Zugang befristet (90 Tage) und im Guard geprüft; Rolle `consultant` ohne Löschen, Freigaben, Risikoakzeptanz, Hinweisgeber-Fälle; vertrauliche Detailbereiche nur mit Grant; Wechsel im Audit der Ziel-Org (`org.switched`) | `lib/auth/{memberships,org,guards}.ts`, `app/actions/memberships.ts`, `lib/auth/audit-events.ts`, `tests/member-access.integration.test.ts` |
| Elevation of Privilege | Abgelaufener Prüfer-/Berater-Zugang bleibt nutzbar | `member_access` (FORCE RLS) wird im Org-Kontext gelesen (`memberAccessFor`); vorher lieferte der Join ohne Kontext keine Zeile, Ablauf und Grants griffen nie | `lib/auth/org.ts`, `tests/member-access.integration.test.ts` |
| Elevation of Privilege | Prozess-Kompromittierung (A1 → RCE) | systemd-Sandbox (ProtectSystem=strict, SystemCallFilter, keine Capabilities), dedizierter User, read-only Code | `deploy/systemd/klick.service` |
| Malicious upload | Schadcode in Nachweisen | MIME-Allowlist, Magic-Bytes, Auslieferung als Attachment, SVG nie inline, optional clamd-Scan fail closed (`CLAMD_HOST`), Treffer als `denied` im Audit | `lib/uploads/validate.ts`, `lib/uploads/clamav.ts` |
| Information Disclosure | Fehler-Tracking leakt PII | GlitchTip über Store-API ohne SDK, Scrubbing von E-Mails, Tokens, Query-Strings, Cookies; nie Bodies | `lib/observability/glitchtip.ts` |
| Spoofing | Gestohlener CI-Token (Ingest) | nur SHA-256 gespeichert, Präfix `klk_ingest_` für Secret-Scanning, Scopes je Token, Ablauf ≤ 365 Tage, Widerruf mit Step-up, Grenzen je IP/Token/Org, jede Übertragung im Audit (`via: api_token`) | `lib/security/tokens.ts`, `lib/security/ingest.ts`, `app/actions/integrations.ts` |
| Information Disclosure | Token-Auflösung ohne Org-Kontext umgeht RLS (ADR-017) | eigene SELECT-Policy nur auf `access_tokens` und nur für die Zeile mit `app.token_hash`; kein Schreiben, keine anderen Tabellen; danach normaler Org-Kontext | `db/schema/security.ts`, `lib/db/with-token.ts`, `tests/security.integration.test.ts` |
| Spoofing | Weitergeleiteter oder abgefangener Lieferanten-Link | Token nur im URL-Fragment (nie in Server-Logs/Referrer), sofortiger Tausch gegen httpOnly-Cookie (SameSite=Strict, Pfad `/lieferant`) und Entfernen aus Adresse/Verlauf; Token gilt für genau einen Fragebogen, ≤ 60 Tage, neuer Link widerruft den alten, Abschluss widerruft alle; jeder Zugriff mit `via: supplier_portal` im Audit, `lastUsedAt`/IP am Token | `app/api/lieferant/sitzung/route.ts`, `lib/auth/guards.ts` (`requirePortal`), `app/actions/supplier-assessments.ts` |
| Information Disclosure | Lieferant sieht Daten der Organisation | Portal-Actions lesen die Fragebogen-ID nur aus dem Token; Ansicht zeigt eigene Antworten und eigene Uploads, keine Bewertungsnotizen, keine anderen Nachweise; kein Download; eigenes Layout ohne App-Navigation, `noindex`, `no-referrer` | `lib/compliance/queries-suppliers.ts` (`getPortalAssessment`), `app/(extern)/lieferant/page.tsx` |
| Tampering | Fremde Seite setzt Portal-Cookie (Login-CSRF) oder schreibt Antworten | Sitzungs-Tausch nur mit `application/json` und gleicher `Origin`; Server Actions mit Next-Origin-Prüfung; nach Einreichen schreibgeschützt; Rate-Limit je IP (Tausch), je Token (Antworten/Uploads) und je Org | `app/api/lieferant/sitzung/route.ts`, `app/actions/supplier-portal.ts` |
| Malicious upload | Lieferant lädt Schadcode oder Geheimnisse hoch | dieselbe Pipeline wie intern (Typ/Magic-Bytes → clamd fail closed → DLP), `source = supplier_portal`, Klassifizierung nur anhebbar | `lib/evidence/store.ts` |
| Abuse | Klick als Werkzeug für unbefugte Angriffe (Pentest ohne Auftrag, § 202a/c StGB) | Klick führt keine aktiven Tests aus; Sicherheitsaufträge erst nach Hochladen der schriftlichen Beauftragung „beauftragt“, Umfang/Ziele/Regeln danach fest, jeder Schritt im Audit | `lib/security/engagement-rules.ts`, `app/actions/engagements.ts` |
| Information Disclosure | Reproduktionsschritte/Exploit-Details aus Pentests | Beschreibung, Reproduktion und Empfehlung feldverschlüsselt (Org-DEK); Bericht nur als ZIP mit Step-up und Export-ID; Hinweis im Formular: keine echten Zugangsdaten | `app/actions/engagements.ts`, `app/api/export/sicherheitsauftrag.zip/route.ts` |
| Information Disclosure | Secrets aus Scan-Berichten (gitleaks, SARIF-Snippets) landen in Klick | Parser redigieren (Präfix + Länge), Autor/E-Mail verworfen; mit Secrets wird nur die redigierte Normalform als Nachweis gespeichert; Details feldverschlüsselt | `lib/security/parsers.ts`, `lib/security/import-service.ts` |
| Server-Side Request Forgery | Schnellcheck greift interne Ziele/Metadaten an | nur http(s) auf 80/443, keine internen Namen; alle aufgelösten Adressen öffentlich (inkl. IPv4 in IPv6, NAT64, 6to4); Abruf an die geprüfte Adresse gepinnt, jeder Redirect neu geprüft; ≤ 40 Anfragen, 60 s, Größenlimits | `lib/security/quick-check/{ssrf,fetcher}.ts`, `tests/quick-check.test.ts` |
| Abuse | Schnellcheck als Werkzeug gegen fremde Seiten | nur passiv (GET auf Seite, eigene Skripte, Source-Maps, security.txt), keine Pfad-Proben; Bestätigung der Berechtigung im Audit; 10 je Org und Tag; eindeutiger User-Agent | `app/actions/security-checks.ts`, `lib/security/quick-check/run.ts` |
| Abuse | Öffentliches Anfrageformular als Spam- oder Mail-Relay | nur JSON von der eigenen Herkunft, 5 je IP in 10 min, Honeypot und Mindestzeit verwerfen still (gleiche Antwort wie Erfolg); keine Mail an die angegebene Adresse, nur an Plattform-Admins; IP nur als HMAC; Löschung 12 Monate nach der letzten Änderung | `app/api/anfrage/route.ts`, `lib/inquiries/rules.ts`, `lib/jobs/retention.ts`, `tests/e2e/inquiry.spec.ts` |
| Information Disclosure | Schlüsselkompromittierung (KEK) | KEK-Rotation ohne Re-Encrypt der Nutzdaten (`pnpm kek:rotate`), Versionen im Envelope; Org-Löschung = Crypto-Shredding des DEK | `lib/crypto/rotate.ts`, `scripts/rotate-kek.ts` |

## Bekannte Lücken (offen)
- Style-CSP bleibt `'unsafe-inline'` (Tailwind/RSC-Inline-Styles); Skripte laufen mit Nonce.
- Kein KMS/HSM auf Hetzner → `LocalKms` + systemd-Credentials bis Lizenzstufe 2 (Interface steht).
- Playwright deckt Header, Redirects, Login und öffentliche Seiten ab; URL-Tampering und Vier-Augen-Flows laufen als RLS-/Unit-Tests, nicht im Browser.
- Rate-Limit je Org lebt im Prozessspeicher (ein Server); bei mehreren Instanzen auf nginx/Redis verlagern.
- clamd, CrowdSec und GlitchTip sind optional konfiguriert (Env/Runbook) und müssen auf dem Server installiert werden.
- Externer Pentest vor Go-Live steht aus (`/testprogramm`).
- Ingest-Grenzen je Token leben im Prozessspeicher (ein Server), wie das Org-Rate-Limit.
- Anfrage-Limit je IP lebt im Prozessspeicher (ein Server), wie das Org-Rate-Limit.
- SSO-Provisionierung prüft die Ein-Org-Regel (ADR-018) nicht.
- Der Schnellcheck prüft DNSSEC nicht und erkennt registrierbare Domains nur näherungsweise (keine Public-Suffix-Liste).
