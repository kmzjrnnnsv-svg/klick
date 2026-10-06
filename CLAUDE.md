@AGENTS.md

# Klick — Projekt-Gedächtnis

> Laufendes Notizbuch für künftige Sessions. Aktuell halten.

## Was wir bauen

**Compliance-/GRC-SaaS** (Pivot Oktober 2026, vorher Recruiting — Archiv-Tag `recruiting-final`).
Mandantenfähig, für regulierte Unternehmen: ISO 27001, DORA, NIS2, ZAG-MaRisk/MaRisk, MiCAR+KMAG,
GwG → AMLR, TFR, Sanktionen, DSGVO, DAC8, AWV, Kassenrecht, KWG. Zwei Zwecke: (1) eigener Weg zur
BaFin-Zulassung als CASP + ZAG (Stablecoin-Zahlungen, Businessplan Frankfurt 26.09.2026 ist Mandant 1),
(2) SaaS für Firmen auf demselben Weg. Die Plattform ist **Mandant 0** und erfüllt die Anforderungen
selbst (Nachweis: `/baseline`, P1).

**Kernkonzept:** Common Controls (Hub-and-Spoke). Rahmenwerk-Anforderungen sind das *Warum*,
~120 harmonisierte Controls das *Was*, `control_requirements` die Synergie-Kante. Status wird pro
Control geführt; Abdeckung je Rahmenwerk wird abgeleitet, nie gespeichert. Anwendbarkeit hängt an
Lizenzstufe (`0_vorbereitung`…`4_bank`), CASP-Diensten und Stichtag (`effectiveFrom/Until`).

Vollständiger Plan: `~/.claude/plans/nach-erstellen-der-firma-glimmering-volcano.md` (Phasen P0–P5,
UX, Härtung, Katalog-Abgleich). Authoring-Quelle der Anforderungen:
`docs/regulatory/anforderungskatalog-2026-10.md`.

## Stack (verbindlich)

| Schicht | Wahl |
|---|---|
| Framework | Next.js 16.2 (App Router, React 19, Turbopack), `proxy.ts` statt middleware |
| Sprache | TypeScript strict, ES2022 |
| Package Manager | pnpm 10 — `minimumReleaseAge: 10080` (7 Tage), Lifecycle-Skripte blockiert |
| Node | 22 LTS (`.nvmrc`, `engines`) |
| Styling | Tailwind v4 + eigene shadcn-v4-Primitives in `components/ui/` (handgeschrieben, Registry nicht erreichbar) auf Maison-Tokens |
| DB | PostgreSQL 16, Drizzle ORM 0.45 (`casing: snake_case`), uuid-IDs |
| Auth | **Better Auth 1.7.6** (`better-auth/minimal` + `@better-auth/drizzle-adapter`): magicLink, organization (eigene AC-Rollen), twoFactor, `@better-auth/passkey`, admin, nextCookies |
| Jobs | pg-boss (Schema `pgboss` gehört der App-Rolle), Start in `instrumentation.ts` |
| Logging | pino (Redaction), `/api/health`, `/api/ready` |
| Krypto | libsodium XChaCha20-Poly1305, per-Org-DEK, `Kms`-Interface (`LocalKms`), `keyVersion` |
| Validierung | zod 4 + react-hook-form; Schemas in `lib/validation/*` |
| i18n | next-intl, **DE-only**, `timeZone: Europe/Berlin`, typisierte Keys (`global.d.ts`) |
| Tests | Vitest (Unit + RLS-Integration mit `DATABASE_URL_TEST`); Playwright ab P4 |
| Lint/Format | Biome (Tabs, double quotes) |
| Mail | Resend → SMTP (Brevo) → Konsole; Magic-Link nie im Prod-Log |
| Hosting | Hetzner, nginx + systemd (gehärtet), Postgres nativ; Dev: `docker-compose.yml` |

## Konventionen

- **Du-Form überall**, deutsche Slugs (`/heute`, `/ueberblick`, `/risiken`, `/nachweise` …), Begriffe: Rahmenwerk · Anforderung · Control · Nachweis · Dokument · Prozess · Dienstleister · Vorfall · Abweichung · Freigabe · Kenntnisnahme · Verantwortlich (Owner) · Bearbeitet von (Assignee).
- **Server Components by default**; `"use client"` nur bei State/Browser-API.
- **Guards zuerst:** jede Action/Query → `requireOrg(perm?)` / `requireStepUp()` / `requirePlatformAdmin()`; Layout-Gates (`lib/auth/gates.ts`) sind nur UX.
- **RLS immer:** Org-Queries in `readOrg`/`withOrg`/`mutateOrg`; Kontext transaktionslokal (`set_config(…, true)`); Plattform-Zugriff nur `withPlatform(ctx, reason)` (auditiert).
- **Audit als letzte Anweisung** derselben Transaktion (`mutateOrg`), mit `before/after`; Hash-Kette je Org; Auth-Ereignisse über Better-Auth-Hooks (`lib/auth/audit-events.ts`).
- **MFA für alle Rollen**, absolute Session 12 h, Idle 30 min, Step-up ≤ 10 min (`lib/auth/session-rules.ts` — pure, getestet).
- **Keine KI in v1.** Falls später: nur auf expliziten Klick, nie im Hintergrund.
- **Enums als Text-Spalten** mit TS-Unions (`db/schema/enums.ts`); `entityType` ist eine Union, kein pg-Enum.
- **Neue Org-Tabelle** = `orgId()` + `orgPolicy()` + `.enableRLS()` + FORCE in Migration; Test `isolation.matrix` erzwingt das.
- **Commits klein und thematisch**; `pnpm preflight` vor jedem Commit.

## ADRs (kurz)

- **ADR-008 Pivot & Chain-Reset:** Recruiting komplett entfernt (Tag `recruiting-final`); Migrationshistorie neu ab `0000_pivot` (Block A drops Alt-Tabellen + RLS-Funktionen, Block B generiert, Block C FORCE RLS + Carry-over Admins/CMS + Audit-Trigger). Reproduzierbar über `scripts/wrap-pivot-migration.sh`.
- **ADR-009 Better Auth statt Auth.js:** fertige Org-/Rollen-/MFA-/Passkey-Verwaltung. MFA-Gating, Idle/Absolut-Grenze und Step-up sind **unsere** Regeln im Guard (Plugin gated passwortlose Logins nicht). Ein User = eine Org (app-seitig). `member`/`invitation` sind die einzigen Org-Tabellen ohne RLS (Adapter liest ohne Kontext) — Fachcode filtert explizit.
- **ADR-010 Postgres-RLS als zweite Verteidigungslinie:** App-Rolle `klick_app` ohne BYPASSRLS/DDL, Migrationen über `klick_migrator`; `app_current_org()` (uuid) / `app_is_platform()`.
- **ADR-011 pg-boss statt `after()`** für geplante Arbeit; `after()` nur Fire-and-forget im Request.
- **ADR-012 XChaCha20-Poly1305** (korrigiert: früher XSalsa20 secretbox) mit Org-DEK, Feldverschlüsselung für sensible Spalten (`lib/crypto/fields.ts`).
- **ADR-013 shadcn ohne Registry:** `ui.shadcn.com` ist aus der Build-Umgebung nicht erreichbar → Primitives handgeschrieben im shadcn-v4-Stil (`radix-ui`, `cmdk`, `sonner`); `components.json` bleibt für späteren CLI-Einsatz.

## Wichtige Pfade

- `lib/auth/{server,client,permissions,guards,gates,session-rules,step-up,audit-events,org}.ts`
- `lib/db/{with-org,global,health}.ts` · `lib/audit.ts` · `lib/audit-hash.ts` · `lib/log.ts` · `lib/env.ts`
- `lib/crypto/{envelope,kms,fields}.ts` · `lib/uploads/validate.ts` · `lib/jobs/{boss,register}.ts`
- `lib/nav.ts` (abgeleitete Navigation) · `lib/compliance/catalog/{types,frameworks,seed-catalog}.ts`
- `db/schema/{enums,catalog,platform,registers,grc,management,aml}.ts` · `db/rls.ts` · `db/auth-schema.ts` (generiert)
- `components/shell/*` (AppShell, Sidebar, ⌘K, Glocke) · `components/ui/*` · `components/auth/*`
- `app/(marketing)` `/`, `/[slug]` · `app/(auth)` `/login`, `/login/verify`, `/login/2fa`, `/einrichtung/2fa`, `/onboarding`, `/einladung/[id]` · `app/(app)` `/heute`, `/ueberblick`, `/team`, `/einstellungen` · `app/(admin)/admin/*`
- `deploy/{systemd,nginx,postgres,firewall.nft,README.md}` · `scripts/{db-migrate.ts,backup-db.sh,restore-db.sh,wrap-pivot-migration.sh}`

## Quickstart

```bash
docker compose up -d && pnpm install && cp .env.example .env.local   # Secrets eintragen
pnpm db:migrate && pnpm db:seed && pnpm dev
pnpm preflight                                                       # vor jedem Commit
```
Lokal ohne Docker: Postgres 16 nativ, Rollen aus `deploy/postgres/init-dev.sql`.

## Phasen-Status

- ✅ **P0 Fundament** — Chain-Reset-Migration (93 Tabellen, 77 mit FORCE RLS), Better Auth mit MFA-Pflicht/Passkeys/Step-up, Guards/Gates, Audit-Hash-Kette, Org-DEK, pg-boss-Gerüst, Shell + 25 UI-Primitives, Login/2FA/Onboarding/Einladung, Heute/Überblick/Team/Einstellungen, Admin (Orgs/Users/Audit mit Kettenprüfung/CMS), Tests (Unit + RLS), CI mit Postgres/OSV/gitleaks/CodeQL, gehärtete Deploy-Artefakte.
- ⬜ **P1 Synergie-Kern + UX-Basis** — `controls.ts`, Kanten ISO/DORA/NIS2, `recommendations.ts`, `coverage.ts`/`synergy.ts`, `<RegisterPage>`/`<EntityLayout>`, `/controls`, `/synergien`, `/rahmenwerke/[slug]`, `/nachweise`, `/baseline`, Setup-Checkliste live, Nonce-CSP, ZAP.
- ⬜ **P2** Register, Risiko-Matrix, Freigaben, Dokumente, Vorfälle · ⬜ **P3** Managementsystem, Prüfer-Cockpit, Kalender · ⬜ **P4** AML/CASP, Restkataloge, Antrag, Playwright · ⬜ **P5** Datenschutz, Bank-Stufe, SSO, Prüfungspaket, `/vertrauen`.

## Offene Punkte / Risiken

- Rechtsinhalte (≈ 470 Anforderungen, ≈ 550 Kanten) sind der größte Aufwand; juristisches Review vor SaaS-Verkauf.
- CSP mit `'unsafe-inline'` bis Nonce (P1). Kein KMS auf Hetzner bis Stufe 2.
- Prod-Deploy: alte DB-Rolle zu `klick_migrator` umbenennen, damit `0000_pivot` die Alt-Tabellen droppen darf (`deploy/README.md`).
