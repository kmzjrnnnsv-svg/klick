# Klick — Compliance, die zusammenpasst

Mandantenfähige GRC-Plattform für ISO 27001, DORA, NIS2, ZAG-MaRisk/MaRisk, MiCAR, GwG/AMLR, TFR,
ZAG/PSD2 und weitere Rahmenwerke. Kernidee: **ein harmonisierter Satz gemeinsamer Controls**
erfüllt quer alle gewählten Rahmenwerke — einmal umsetzen, überall nachweisen. Die Plattform ist
selbst ihr erster Mandant und erfüllt die Anforderungen technisch (RLS, Audit-Hash-Kette,
Verschlüsselung je Organisation, MFA-Pflicht, gehärteter Betrieb).

## Quickstart (lokal)

```bash
docker compose up -d                    # Postgres 16 + MinIO (Rollen klick_migrator/klick_app)
pnpm install                            # Lieferketten-Cooldown 7 Tage ist aktiv
cp .env.example .env.local              # BETTER_AUTH_SECRET: openssl rand -base64 33 · VAULT_KEK_BASE64: openssl rand -base64 32
pnpm db:migrate                         # 0000_pivot (als klick_migrator)
pnpm db:seed                            # Rahmenwerk-Stammdaten (idempotent)
pnpm dev                                # http://localhost:3000
```

Erster Plattform-Admin: `pnpm dlx auth@latest create-admin --email <email> --role admin`,
dann Magic-Link (erscheint in der Dev-Konsole) → MFA einrichten → `/onboarding`.

## Skripte

| Befehl | Wirkung |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js 16 |
| `pnpm preflight` | typecheck + Biome + Vitest — vor jedem Commit |
| `pnpm test` | Unit-Tests; mit `DATABASE_URL_TEST` auch RLS-Integrationstests |
| `pnpm db:migrate` / `pnpm db:seed` | Migrationen (DDL-Rolle) / Katalog-Sync (App-Rolle) |
| `pnpm auth:generate` / `pnpm auth:check` | Better-Auth-Schema erzeugen / prüfen |
| `pnpm audit` / `pnpm sbom` | Dependency-Audit / CycloneDX-SBOM |
| `pnpm release` | install → migrate → seed → build (Prod) |

## Architektur in einem Absatz

Next.js 16 (App Router) · Better Auth 1.7 (Magic-Link, Passkeys, TOTP-MFA für alle, Organisationen,
Admin) · Drizzle + Postgres 16 mit **Row-Level-Security auf jeder Mandanten-Tabelle** (`withOrg()`
setzt den Kontext transaktionslokal) · append-only Audit-Log mit SHA-256-Kette je Organisation ·
XChaCha20-Poly1305-Envelope mit Org-DEK · pg-boss-Scheduler · pino · shadcn/ui unter Maison-Tokens.
Details: `CLAUDE.md`, Bedrohungsmodell: `docs/security/threat-model.md`, Deploy: `deploy/README.md`.

## Sicherheit

Meldungen an security@raza.work — siehe `SECURITY.md`.
