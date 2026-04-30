@AGENTS.md

# Klick — Projekt-Gedächtnis

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
- **Auth-Adapter-Tabellen** heißen `users`, `accounts`, `sessions`, `verification_tokens`. `users` ist um Klick-Felder erweitert (`tenantId`, `role`, `locale`, `encryptedDek`).
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

### ADR-003: Server-side Envelope Encryption statt Client-side (P1, umgesetzt)
- **Kontext**: Kandidat hat volle Datenhoheit, ID-Dokumente liegen dauerhaft im Vault.
- **Entscheidung**: Per-User-DEK, mit KEK (KMS / lokal openssl) verschlüsselt. Datei wird **server-seitig** vor S3-Upload mit DEK encrypted (XChaCha20-Poly1305 via libsodium).
- **Folgen**: Multi-Device einfach (kein Key-Sync zwischen Browsern), aber Server sieht Klartext beim Upload kurz. Trade-off bewusst für MVP-UX.

### ADR-004: AIProvider-Interface mit Mock-Default (P2)
- **Kontext**: Anthropic-API-Key ist nicht garantiert verfügbar; Dev sollte offline funktionieren.
- **Entscheidung**: `AIProvider` als Interface, `getAIProvider()` wählt Claude wenn `ANTHROPIC_API_KEY` gesetzt, sonst Mock. Mock liefert deterministisch plausible Daten.
- **Folgen**: Erste Demo läuft sofort ohne externe API. Echte Extraktion eine Env-Variable entfernt.

### ADR-005: Match-Engine ohne pgvector im MVP (P4)
- **Kontext**: pgvector + Embeddings (Voyage AI) hätte 1+ Session zusätzlich gekostet, ohne den UX-Kern zu verändern.
- **Entscheidung**: Exakte Skill-Namen-Matches mit Hard-Filter (Berufsjahre, Muss-Skills, Sprachen) + Soft-Score (Nice-Skill-Ratio + Erfahrungs-Bonus).
- **Folgen**: Keine fuzzy-Matches („React Native" matcht nicht „React"). Upgrade-Pfad klar: Embedding-Spalten nachziehen, Match-Engine erweitern. Schema reservieren wir nicht vor — wir bauen, wenn der Bedarf sichtbar wird.

### ADR-006: Verify-Connector-Pattern mit Mock-First (P6)
- **Kontext**: Echte Connectoren (Credly Partner-OAuth, IDnow-Sandbox) sind regulatorisch + zeitlich blockiert.
- **Entscheidung**: Interface `VerifyConnector` + Registry. Mock-Connector liefert deterministisch passed (oder failed bei userId-Prefix `fail-`). Credly via öffentlicher JSON-LD-URL, IDnow als Stub. `pickConnectorForKind` wählt automatisch passend.
- **Folgen**: Neuer Anbieter = eine Datei + Registry-Eintrag. Demo-Path immer grün. Production-Switch erfolgt durch ENV-Variable + DB-Connector-Definition (kommt P7).

### ADR-007: Hintergrund-Arbeit via `next/server.after()` (P4–P6)
- **Kontext**: pg-boss ist installiert aber nicht initialisiert; Match-Compute + Verify-Orchestrator sollen Form-Response nicht blockieren.
- **Entscheidung**: Next.js' `after()` für nicht-blockierende Post-Response-Arbeit. Genug für MVP, Single-Server.
- **Folgen**: Kein Retry, kein Cross-Process-Queue. Bei mehreren Replicas brauchen wir pg-boss — der Refactor ist klein (Funktion-Body in pg-boss-Job-Handler verschieben).

## Wichtige Datei-Pfade

**Foundation**
- `auth.ts` — Auth.js v5 + Drizzle-Adapter + Console-Mock-Mailer
- `proxy.ts` — Tenant-Subdomain-Resolver (Next 16: `proxy`, ehemals `middleware`)
- `db/schema.ts` — Drizzle-Schema (alle Tabellen)
- `db/index.ts` — Client + dotenv für Standalone-Scripts
- `i18n/request.ts` — next-intl Cookie-driven, DE default

**Vault (P1)**
- `lib/crypto/envelope.ts` — DEK/KEK + XChaCha20-Poly1305 (libsodium)
- `lib/storage/s3.ts` — S3-Client (MinIO local, Hetzner prod)
- `app/actions/vault.ts` — uploadVaultItem, deleteVaultItem (hard delete)
- `app/api/vault/[id]/file/route.ts` — Auth-gated Decrypt-Stream
- `components/vault/upload-zone.tsx` — Drag-Drop + Mobile-Kamera (`capture="environment"`)

**AI (P2/P3/P4)**
- `lib/ai/{types,index,mock,claude}.ts` — AIProvider mit Mock + Claude SDK (claude-sonnet-4-6)
- `lib/match/engine.ts` — pure Scoring-Funktion (Hard-Filter + Soft-Score)

**Match + Interest (P4/P5)**
- `app/actions/{matches,interests}.ts` — Compute, listing, decision logic
- `lib/verify/{types,registry,orchestrator}.ts` + `connectors/{mock,credly,idnow}.ts`

**Routes**
- `app/(marketing)/` → Landing
- `app/(candidate)/{vault,profile,matches,requests}` — Kandidat
- `app/(employer)/jobs[+/new+/[id]+/[id]/candidates]` — Arbeitgeber
- `app/(admin)/admin` — Admin (P7-Lite: Audit-Viewer)

**Dev-Hilfen**
- `scripts/set-role.ts` (`pnpm set-role <email> <candidate|employer|admin>`)

## Quickstart für künftige Sessions

```bash
brew services start postgresql@16  # falls nicht läuft
brew services start minio          # für Vault-Storage
pnpm install
pnpm db:migrate
pnpm db:seed                        # default Tenant idempotent
pnpm dev                            # http://localhost:3000
pnpm test                           # Vitest
pnpm lint                           # Biome
pnpm typecheck                      # tsc --noEmit
```

**Magic-Link in Dev**: E-Mail in `/login` → Link erscheint als Box in der Server-Konsole.

**Test-Rollen flippen**: `pnpm set-role you@example.com employer` (oder `candidate` / `admin`).

**Mit echter KI testen**: `ANTHROPIC_API_KEY` in `.env.local` setzen, neu starten — getAIProvider() wechselt automatisch von Mock zu Claude.

**MinIO Web-Console**: http://localhost:62351 (oder Port aus `tail /opt/homebrew/var/log/minio.log`), Login `minioadmin` / `minioadmin`.

## Phasen-Status

- ✅ **P0 Skeleton** — Next 16 + Tailwind v4 + Drizzle + Auth.js v5 + i18n + Theme
- ✅ **P1 Vault MVP** — Encrypted Upload (libsodium Envelope), Drag-Drop + Mobile-Kamera, Preview-Stream, Hard-Delete
- ✅ **P2 Profil & CV-Parse** — AIProvider-Interface (Mock + Claude SDK), RHF-Editor, Visibility-Radio
- ✅ **P3 Employer & Jobs** — Employer-Onboarding, Job-Form mit Sektionen, AI-Skill-Vorschlag
- ✅ **P4 Match-Engine** — Hard-Filter + Skill-Score (kein pgvector im MVP), Claude-Rationale, anonymisierte Match-Listen
- ✅ **P5 Interest & Disclosure** — Employer fragt mit Verify-Tiefe + Nachricht, Kandidat genehmigt, Identität wird sichtbar
- ✅ **P6 Verify-Connector** — Interface + Registry, Mock + Credly (JSON-LD-Fallback) + IDnow-Stub, Orchestrator triggert via `after()`
- 🟡 **P7 Admin-CMS** — Audit-Log-Viewer steht; dynamische API-Routen, Tenant-Verwaltung, Connector-Definitions-UI fehlen noch
- 🟡 **P8 PWA, A11y, Polish** — manifest.json + Apple-Touch-Meta + viewport-themeColor; serwist-Service-Worker, A11y-Audit, E2E-Tests, Sentry stehen aus

## Was komplett funktioniert (E2E)

1. Magic-Link-Login (Konsole zeigt Link), Session mit role+tenantId
2. Vault-Upload mit Envelope-Encryption, Datei landet verschlüsselt in MinIO
3. CV-Parse (Mock liefert plausibles Profil; mit ANTHROPIC_API_KEY echte Extraktion)
4. Profil-Editor mit allen Feldern + Visibility
5. Employer-Onboarding + Job-Wizard mit AI-Skill-Vorschlag
6. Job veröffentlichen → Match-Engine berechnet Top-20 mit KI-Rationale
7. Anonymisierte Kandidaten-Liste pro Stelle
8. Interest-Anfrage mit Verify-Tiefe + Mock-Verifications laufen automatisch
9. Kandidat sieht Anfrage + Prüfungs-Ergebnisse, entscheidet
10. Approval → Employer sieht Identität, Audit-Log dokumentiert alles

## Was bewusst noch nicht real ist

- Echte Mail (Brevo) — Magic Link bleibt Konsole-Mock
- Credly Partner-OAuth — JSON-LD-Fallback funktioniert; Partner-Status TODO
- IDnow-Sandbox — Connector-Stub, Demo läuft über Mock
- Background-Job-System (pg-boss) — `after()` reicht für MVP
- Per-File-Disclosure (P5.5) — Approval ist binär, keine pro-Datei-Wahl
- pgvector / fuzzy match (P4.5) — exakte Skill-Namen reichen
- Dynamische API-Routen im Admin-CMS (P7-Hauptteil) — Catch-All-Endpoint nicht gebaut

## Was wir bewusst NICHT bauen

Bezahlung/Stripe, komplexe E-Mail-Templates jenseits Magic Link, komplexe Reportings, Sprachen außer DE/EN, native Mobile Apps (PWA reicht).
