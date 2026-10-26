# Selbstprüfung Härtung (Oktober 2026)

Stand: 26.10.2026 · Umfang: alle Änderungen des Plans „Härtung“ (Commits `5c607ed` bis
`6958560`) · Ergebnis und Status je Befund unten. Dieser Bericht ersetzt keinen externen
Pentest (offener Punkt im Testprogramm).

## Umfang

| Bereich | Code |
|---|---|
| Admin-Netz, Start-Prüfung (A2/A6) | `lib/net/*`, `lib/auth/{admin-network,guards,gates,endpoint-policy}.ts`, `lib/env-checks.ts`, `instrumentation.ts` |
| Lockbox (A3) | `lib/platform-access/*`, `lib/db/platform-access.ts`, Hooks in `lib/auth/server.ts`, Admin-Seiten |
| Vier-Augen (A4) | `lib/security-changes/*`, betroffene Actions, Job `security-changes` |
| IP-Liste je Org (A5) | `lib/net/{network-policy,org-network}.ts`, `tokenAuth`, `requirePortal`, Portale, Trust Center, Ingest |
| SSO (A7) | `lib/auth/{sso-policy,sso-saml,sso-provisioning}.ts`, `app/actions/sso.ts` |
| Verlauf (V) | `lib/ledger/*`, `lib/db/ledger.ts`, `/api/export/verlauf.zip`, `scripts/verify-ledger.mjs` |
| Schnellcheck (SSRF) | `lib/security/quick-check/*`, alle neuen ausgehenden Abrufe |
| both.money (W) | `apps/wallet/lib/{orgs,auth}/*`, `apps/wallet/lib/wallet/{mandates,mandate-signer,confirm-relay}.ts`, `lib/wallet/core/mandate.ts`, `signer/*`, `deploy/confirm/*` |
| Server (H) | `deploy/*` (Tests `deploy-hardening`, `deploy-nginx`, `release-guard`) |

## Methode

- Statische Durchsicht in drei unabhängigen Durchgängen (Klick-Zugriffsschutz; SSO, Verlauf
  und SSRF; both.money), je nach den Prüflisten der übernommenen Skills `owasp-security`,
  `differential-review`, `attacking-saml`, `exploiting-ssrf`, `reviewing-cryptography`,
  `sharp-edges` (`.claude/skills/`). Jeder Befund mit einem nachvollzogenen Weg von einem echten
  Einstieg (Route, Server-Action, Better-Auth-Endpunkt, Signer-Befehl) bis zur Wirkung; was sich
  nicht nachvollziehen ließ, ist nicht aufgeführt.
- Automatische Tests: `pnpm preflight` (Einheit, RLS-Integration, Lint, Typen), dazu
  Integrationstests mit eigenem SAML-IdP, Kalender-Nachbau, Testkette und Signer.
- Browser: Einstellungen > Zugang, Vollmachten, Bestätigungsseite (hell/dunkel, 1440/390 px).

## Befunde

Schwere nach Wirkung und Voraussetzung: **hoch** = mit einer gewöhnlichen Sitzung bzw. ohne
zweite Person erreichbar, **mittel** = braucht eine besondere Lage (Impersonation, Berater-Zugang,
feindlicher Dienst), **niedrig** = Härtung ohne direkten Missbrauch. Alle 24 Befunde sind behoben;
Restrisiken stehen unten.

### Klick: Zugriff und Freigaben (Commit `d3f700d`)

| Nr. | Schwere | Befund | Behebung |
|---|---|---|---|
| K1 | hoch | Die Admin-Endpunkte von Better Auth (`/admin/update-user`, `set-role`, `remove-user`, `create-user`, `revoke-user-sessions` …) waren per HTTP aus dem Admin-Netz erreichbar — ohne zweiten Faktor, Step-up und Lockbox; nur die Admin-Actions prüfen das. | Per HTTP nur noch `impersonate-user` und `stop-impersonating`; alles andere nur über `auth.api` aus den Actions (`httpServerOnly` in `lib/auth/endpoint-policy.ts`). |
| K2 | hoch | Eine Inhaber:in konnte die andere ohne zweite Person herabstufen oder entfernen und hätte danach jede Sicherheitsänderung nur noch mit der Wartezeit durchgesetzt. | Neue Erlaubnis `owner_remove` (Vier-Augen) für Herabstufen und Entfernen einer Inhaber:in (`app/actions/team.ts`, Test `security-change-wired`). |
| K3 | mittel | In einer Impersonation-Sitzung ließen sich Mitglieder einladen und Integrations-Token anlegen — beides wirkt über das Ende der Freigabe hinaus. | `requireOrg` erlaubt Team, Einladungen und Integrationen in Impersonation nur lesend (`impersonationDenies`). |
| K4 | mittel | Lesende Org-Endpunkte (`/organization/list-members`, `get-full-organization` …) liefen an der IP-Liste der Org und an der Org-Bindung der Lockbox vorbei. | Org-Plugin per HTTP nur Einladung annehmen/ablehnen; Impersonation-Sitzungen per HTTP nur `get-session`, `sign-out`, `stop-impersonating`. |
| K5 | mittel | „Seit 24 h im Amt“ zählte ab Anlage der Zeile: ein lange offener, dann umbesetzter Vorschlag oder ein spät ernanntes Mitglied war sofort Zweitperson. | Zeitpunkt der Wirkung: Bestellung (`approval_requests.decided_at`) bzw. Ernennung zur Inhaber:in (angewandte `owner_add`-Erlaubnis). |
| K6 | niedrig | `ADMIN_IP_ALLOWLIST` nur mit ungültigen Einträgen hob die Admin-Sperre auf (fail open). | Als Netzliste geprüft (Start bricht ab); eine Liste ohne gültiges Netz sperrt (`lib/auth/admin-network.ts`). |
| K7 | niedrig | Lockbox-Freigaben galten für jede:n Plattform-Admin und „Zugang zurücksetzen“ mehrfach. | Freigabe gilt nur der beantragenden Person; Zurücksetzen einmalig, in der Transaktion verbraucht. |
| K8 | niedrig | Die IP-Liste wurde vor dem Commit aus dem Zwischenspeicher genommen; eine parallele Anfrage konnte den alten Stand für 30 s zurückschreiben. | Nach einer Änderung 5 s nicht zwischenspeichern. |

### Klick: SSO (Commit `a6b4374`)

| Nr. | Schwere | Befund | Behebung |
|---|---|---|---|
| S1 | mittel | Anerkannte Firmen-MFA galt für die ganze Sitzung — eine Berater:in, die sich über den IdP von Org A anmeldet, galt auch in Org C als bestätigt; auch Nicht-Mitglieder der Anbieter-Org bekamen sie. | Sitzungsspalte `mfa_org_id` (Migration 0052), `effectiveMfaVerifiedAt`: Firmen-MFA nur in der Org des Anbieters und nur für ihre Mitglieder; eigener Faktor gilt überall. |
| S7 | niedrig | Die Prüfung der SAML-Verfahren dekodierte die Antwort vor der Größengrenze des Plugins. | Größe zuerst (`SAML_SECURITY.maxResponseSize`). |
| S8 | mittel | Google: ein privates Konto mit einer Adresse der Firmen-Domain (ohne passendes `hd`) wurde nicht Mitglied, bekam aber eine Sitzung. | Rückruf bricht vor dem Sitzungs-Cookie ab (`SSO_DOMAIN_MISMATCH`). Rest siehe unten. |

### Klick: Verlauf mit Bitcoin-Anker (Commit `a9c14d8`)

| Nr. | Schwere | Befund | Behebung |
|---|---|---|---|
| S2 | mittel | Ein einzelner feindlicher Kalender konnte „bestätigt in Block …“ vortäuschen. | Bestätigt erst, wenn zwei Kalender je in ihrer eigenen Antwort einen Block melden (bei nur einem angenommenen Kalender dieser); Beglaubigung nur auf 32-Byte-Nachricht. |
| S3 | mittel | OTS-Antworten konnten beim Lesen Speicher und Rechenzeit sprengen (hexlify-Ketten, viele Knoten, ganzer Körper vor der Größenprüfung). | Nachricht ≤ 4096 Bytes, ≤ 1000 Knoten, Zusammenführen über Map, Antwort beim Lesen auf 64 KB begrenzt. |
| S4 | niedrig | `pruefen.mjs` zeigte den Bitcoin-Block mit ✓, ohne ihn zu prüfen. | „nicht geprüft“ mit Exit-Code 2; `--block <höhe>:<merkleroot>` gleicht gegen den eigenen Knoten ab. |
| S5 | niedrig | Der Verlauf (auch im Prüfungspaket) enthält IP und Browser je Eintrag und war für alle mit Export-Recht abrufbar. | Nur Inhaber:innen und Prüfer:innen (`ledgerExportAllowed`). |

### Klick: Schnellcheck (Commits `80f69b2` und dieser Bericht)

| Nr. | Schwere | Befund | Behebung |
|---|---|---|---|
| S6 | niedrig | `safeFetch` hatte nur eine Pausen-Frist; ein tröpfelnder Server hielt den Abruf beliebig lange. | Gesamtfrist je Anfrage, danach `timeout` statt halbem Körper. Zusätzlich gesperrt: Teredo `2001::/32` und lokales NAT64 `64:ff9b:1::/48`. |

### both.money (Commit `eb8254b`)

| Nr. | Schwere | Befund | Behebung |
|---|---|---|---|
| B1 | mittel | Widerruf einer Vollmacht war nicht verlässlich: ein Fehler im Signer wurde verschluckt, offene Auszahlungen darauf liefen weiter, der Job prüfte die Vollmacht in der App nicht, Entfernen oder Herabstufen der Bedienung ließ die Vollmacht stehen. | Widerruf bricht offene Auszahlungen ab und meldet Signer-Ausfälle; der Job prüft vor dem Signieren `mandateStillValid` (Widerruf, Zeitraum, Rolle, Unterschrift); Mitglied entfernt/Rolle geändert widerruft. Integrationstest „nur in der App widerrufen“. |
| B2 | niedrig | Der Signer meldete eine widerrufene oder abgelaufene Vollmacht als „not_approved“; Auszahlungen hingen. | Endgültige Gründe (`mandate_revoked`, `mandate_expired`, `window_closed`) vor dem Quorum; der Job schließt die Auszahlung. |
| B3 | niedrig | Die Bestätigungsseite sagte „die Person darf“, obwohl der Signer die Person nicht kennt. | „both.money darf im Auftrag von …“; Runbook: Personen-ID beim Einrichten = both.money-Konto-ID. |
| B4 | niedrig | Ein nicht mehr lesbarer Vollmachtstext im Journal verhinderte den Start des Signers. | Fällt beim Nachspielen weg (fail closed). |
| B5 | niedrig | Die Ratengrenze je ID galt für alle IPs: wer eine ID kennt, sperrte die Bestätigung. | Grenze je IP und ID. |
| B6 | niedrig | Ohne `WALLET_ADMIN_NETWORKS` war die Plattform-Verwaltung offen. | In Produktion gesperrt, Meldung beim Start; Liste ohne gültiges Netz sperrt. |
| B7 | niedrig | Zugangsregeln: derselbe Zwischenspeicher-Wettlauf wie K8. | 5 s nicht zwischenspeichern. |
| B8 | niedrig | Die Bestätigungsseite lehnte Base58-Adressen ab, die der Kern annimmt (Freigabe unmöglich). | Gleiche Formate wie `lib/wallet/core/address.ts`; Test in `confirm-static`. |

## Restrisiken (offen, bewusst)

- **SSO-Kontoverknüpfung:** Better Auth verknüpft einen SSO-Rückruf über die E-Mail mit einem
  bestehenden Konto. Abgesichert durch bestätigte Domain je Anbieter (A7) und `hd` bei Google; ein
  kompromittierter IdP einer Org kann trotzdem Konten seiner Domain übernehmen — das ist das
  Vertrauensmodell von SSO. Vor dem Verkauf je Anbieter einmal gegen den echten IdP prüfen.
- **Sitzungswahl bei Firmen-MFA:** Die Provisionierung kennt die neue Sitzung nicht und nimmt die
  jüngste der letzten 60 s (ohne Impersonation). Zwei gleichzeitige Anmeldungen derselben Person
  könnten die Markierung tauschen; wegen `mfa_org_id` bleibt die Wirkung auf die Anbieter-Org
  begrenzt. Sauber erst, wenn das Plugin die Sitzung übergibt.
- **OIDC-Discovery im Plugin:** Discovery und JWKS lädt `@better-auth/sso` selbst, ohne
  `safeFetch` (DNS-Rebinding möglich). Gemildert: nur Inhaber:innen mit Step-up legen Anbieter an,
  der Verbindungstest läuft über `safeFetch`.
- **Bitcoin-Block:** Klick prüft den Block nicht gegen einen eigenen Mainnet-Knoten; „bestätigt“
  heißt „zwei Kalender melden ihn“. Endgültig prüft `pruefen.mjs --block` bzw. `ots verify`.
- **Schnellcheck-Frist (S6):** nicht automatisch getestet — der SSRF-Schutz lässt keinen lokalen
  Test-Server zu; geprüft durch Durchsicht.
- **Kein externer Pentest:** dieser Bericht ersetzt ihn nicht (Testprogramm).
