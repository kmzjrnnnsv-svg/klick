@AGENTS.md

# TrustVault — Projekt-Gedächtnis

> Dies ist das laufende Notizbuch für künftige Sessions. Halte es aktuell.

## Was wir bauen

Recruiting-Plattform mit klarem Versprechen: **Kandidat besitzt seine Daten, gibt sie selektiv frei, Verifikationen passieren on-demand bei echtem Arbeitgeber-Interesse.** Drei Rollen (Kandidat / Arbeitgeber / Admin) in einer App. Mobile-first, vertrauenswürdig, schlicht. Inspiration: Linear, Stripe-Dashboard, Apple Health — nicht LinkedIn.

Vollständiger Implementierungsplan: `~/.claude/plans/trustvault-initial-prompt-effervescent-lighthouse.md`.

## Stack (verbindlich)

| Schicht | Wahl |
|---|---|
| Framework | Next.js 16 (App Router, React 19, Turbopack) |
| Sprache | TypeScript strict |
| Package Manager | pnpm 10 |
| Node | 22 LTS empfohlen, aktuell installiert: 25.x |
| Styling | Tailwind v4 + eigene shadcn-style UI-Komponenten in `components/ui/` |
| Animation | Framer Motion (sparsam, kommt in P1) |
| DB | PostgreSQL 16 (lokal nativ via brew, nicht Docker — siehe ADR unten) |
| ORM | Drizzle ORM + drizzle-kit |
| Auth | Auth.js v5 (next-auth@beta) mit DB-Sessions, Magic-Link-Provider |
| Storage | S3-kompatibel (kommt in P1, Hetzner Object Storage geplant) |
| Verschlüsselung | libsodium (Envelope-Pattern, kommt in P1) |
| Validierung | Zod + react-hook-form |
| AI | Anthropic Claude (claude-sonnet-4-6) für CV-Parse + Match-Begründung; Voyage AI für Embeddings — austauschbar hinter `AIProvider`-Interface (kommt in P2/P4) |
| Background Jobs | pg-boss (Postgres-basiert, on-prem-fähig) — kommt in P4 |
| i18n | next-intl 4 (cookie-based, kein URL-Prefix) |
| Theme | next-themes (System-Default) |
| Tests | Vitest + happy-dom; Playwright für E2E in P8 |
| Lint/Format | Biome (kein ESLint, kein Prettier) |
| Mail | P0: Console-Mock; Prod: Brevo SMTP (EU/FR-Region) |
| Hosting | Dev: lokal; Prod: Vercel EU + Hetzner Postgres/Storage |

## Konventionen

- **Du-Form überall**, auch in der Arbeitgeber-Sicht (ein Tonfall durchgängig statt fragmentierter Übersetzung).
- **Mobile First**: jeder Layout-Pass beginnt bei 375px, breakpoint-up.
- **Server Components by default**, `"use client"` nur wo State/Browser-API gebraucht wird.
- **Tailwind v4 Tokens** in `app/globals.css` (oklch). Akzent: `--primary` ≈ `#3B6FE4` (light), `#7B9CFF` (dark).
- **Auth-Adapter-Tabellen** heißen `users`, `accounts`, `sessions`, `verification_tokens`. `users` ist um TrustVault-Felder erweitert (`tenantId`, `role`, `locale`, `encryptedDek`).
- **Tenant-Spalte** ab Tag 1 in jeder mandantenrelevanten Tabelle. Lokal: ein Default-Tenant `default` (gesetzt durch `pnpm db:seed`). Prod: subdomain-Lookup via `proxy.ts` setzt `x-tenant-slug`-Header.
- **Magic Link in Dev**: erscheint in der Server-Konsole. Niemals echten Mailer für Dev konfigurieren.
- **Commits klein und thematisch.** Co-Author auf Claude wird automatisch bei `git commit` ergänzt (über harness).
- **CLAUDE.md aktuell halten**, wann immer eine Architektur- oder Konventions-Entscheidung fällt.

## Architectural Decision Records (kurz)

### ADR-001: Postgres nativ via brew statt Docker (P0)
- **Kontext**: Plan sah Docker-Compose (Postgres + MinIO) vor. `brew install --cask docker-desktop` braucht sudo, das Claude nicht autonom geben kann.
- **Entscheidung**: Postgres@16 nativ via `brew services start postgresql@16`, MinIO später analog.
- **Folgen**: Kein einheitliches `docker compose up`-Setup für künftige Mitwirkende. Bei Bedarf wird das in P8 (Polish) nachgeholt — bis dahin reicht die brew-Variante für Solo-Dev.

### ADR-002: Cookie-basiertes i18n statt URL-Prefix
- **Kontext**: next-intl unterstützt beides. URL-Prefix (`/de/...`) hätte mit subdomain-Tenant-Routing kombiniert werden müssen.
- **Entscheidung**: Cookie-basiert (`NEXT_LOCALE`), kein `[locale]`-Segment.
- **Folgen**: Sauberere URLs, keine Kollision mit Tenant-Routing. SEO-Trade-off in Kauf genommen (Recruiting-App, kein Content-SEO).

### ADR-003: Server-side Envelope Encryption statt Client-side (P1, geplant)
- **Kontext**: Kandidat hat volle Datenhoheit, ID-Dokumente liegen dauerhaft im Vault.
- **Entscheidung**: Per-User-DEK, mit KEK (KMS / lokal openssl) verschlüsselt. Datei wird **server-seitig** vor S3-Upload mit DEK encrypted (XChaCha20-Poly1305 via libsodium).
- **Folgen**: Multi-Device einfach (kein Key-Sync zwischen Browsern), aber Server sieht Klartext beim Upload kurz. Trade-off bewusst für MVP-UX.

## Wichtige Datei-Pfade

- `auth.ts` — Auth.js v5 Konfiguration + Drizzle-Adapter + Console-Mock-Mailer
- `proxy.ts` — Tenant-Subdomain-Resolver (Next 16: `proxy`, ehemals `middleware`)
- `db/schema.ts` — Drizzle-Schema (tenants, users + Auth-Tabellen)
- `db/index.ts` — Drizzle-Client + dotenv-Loading für Standalone-Scripts
- `db/seed.ts` — Default-Tenant-Seed
- `i18n/request.ts` — next-intl Request-Config (DE-default, Cookie-driven)
- `messages/{de,en}.json` — Übersetzungen
- `app/layout.tsx` — Root: Inter + JetBrains Mono, ThemeProvider, NextIntlClientProvider
- `app/page.tsx` — Marketing-Landing
- `app/login/page.tsx` — Magic-Link-Form (Server Action `loginAction`)
- `app/post-login/page.tsx` — Rollen-basierter Redirect nach Login
- `components/ui/{button,input}.tsx` — eigene shadcn-style Primitives
- `components/header.tsx` — sticky Header mit Locale + Theme Switcher

## Quickstart für künftige Sessions

```bash
brew services start postgresql@16  # falls nicht läuft
pnpm install
pnpm db:migrate
pnpm db:seed                        # idempotent
pnpm dev                            # http://localhost:3000
pnpm test                           # Vitest
pnpm lint                           # Biome
```

Magic-Link-Login in Dev: E-Mail in Form eingeben → Link erscheint in der Server-Konsole als Box.

## Phasen-Status

- ✅ **P0 Skeleton** — Stack steht, Login funktioniert, Landing ruhig
- ⏳ **P1 Vault MVP** — als nächstes: Drag-Drop-Upload + Envelope-Encryption + S3
- ⏳ **P2 Profil & CV-Parse**
- ⏳ **P3 Employer & Jobs**
- ⏳ **P4 Match-Engine**
- ⏳ **P5 Interest & Disclosure**
- ⏳ **P6 Verify-Connector + Credly**
- ⏳ **P7 Admin-CMS** (dynamische API-Routen)
- ⏳ **P8 PWA, A11y, Polish**

## Was wir bewusst NICHT bauen

Bezahlung/Stripe, komplexe E-Mail-Templates jenseits Magic Link, komplexe Reportings, Sprachen außer DE/EN, native Mobile Apps (PWA reicht).
