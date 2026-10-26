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

<!-- wird nach Abschluss der Durchgänge gefüllt -->
