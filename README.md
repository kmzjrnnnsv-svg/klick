# Klick

Recruiting-Plattform, die deine Daten dir lässt. Du entscheidest pro Arbeitgeber, was geteilt und was geprüft wird.

## Quickstart

Voraussetzungen: macOS mit Homebrew, Node 22+ und pnpm.

```bash
brew install postgresql@16
brew services start postgresql@16
createdb trustvault

pnpm install
cp .env.example .env.local      # AUTH_SECRET via: openssl rand -base64 33
pnpm db:migrate
pnpm db:seed
pnpm dev
```

→ http://localhost:3000

## Login (Dev)

Auf `/login` E-Mail eingeben — der Magic Link erscheint in der **Server-Konsole** als Box (kein echter Mail-Versand).

## Scripts

| Befehl | Wirkung |
|---|---|
| `pnpm dev` | Next.js Dev-Server (Turbopack) |
| `pnpm build` / `pnpm start` | Production Build & Start |
| `pnpm lint` / `pnpm lint:fix` | Biome check |
| `pnpm format` | Biome format |
| `pnpm test` | Vitest |
| `pnpm db:generate` | Drizzle-Migration aus Schema generieren |
| `pnpm db:migrate` | Pending Migrations anwenden (lädt `.env.local`, `.env.production`, `.env`) |
| `pnpm db:push` | Schema direkt pushen (Dev) |
| `pnpm db:studio` | Drizzle Studio |
| `pnpm db:seed` | Default-Tenant anlegen (idempotent) |

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind v4 · Drizzle ORM · PostgreSQL 16 · Auth.js v5 (Magic Link) · next-intl (DE/EN) · next-themes (Dark/Light) · Biome · Vitest.

Vollständige Architektur-Notizen in [`CLAUDE.md`](CLAUDE.md).
