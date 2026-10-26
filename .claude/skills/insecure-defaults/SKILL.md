---
name: insecure-defaults
description: Find insecure default configuration in Klick and both.money - fallback secrets, default credentials, fail-open switches, weak crypto, permissive access, debug leakage. Use when adding or changing an env switch (lib/env.ts, apps/wallet/lib/env.ts), a security setting with a default value, a deploy file (deploy/*), or when reviewing what happens if configuration is missing in production.
allowed-tools: Read Grep Glob
---

> Klick-Ergänzung (lokal, nicht Teil von Trail of Bits). Die Dateien unter `references/` stammen
> unverändert aus `trailofbits/skills` (`plugins/insecure-defaults/references`, CC BY-SA 4.0,
> siehe `.claude/THIRD_PARTY.md`). Das Workflow-Skript und die Tests des Originals sind nicht
> übernommen; diese Datei beschreibt die Methode für Hand-Prüfungen. Projektregeln (CLAUDE.md)
> gehen vor.

# Unsichere Standardwerte finden

Frage bei jedem Schalter: **Was passiert, wenn der Wert fehlt?** Ist der Zustand ohne
Konfiguration der unsichere, ist es ein Befund.

## Vorgehen

1. Kandidaten sammeln. Je Klasse liegt unter `references/<klasse>.json` eine Liste von
   Suchmustern (`seeds`), unter `references/<klasse>.md` Beispiele mit „Report when“ und
   „Skip when“:
   - `fallback-secrets` (Geheimnis mit Ersatzwert im Code),
   - `default-credentials` (Startpasswörter, Beispielkonten),
   - `fail-open-security` (Prüfung aus, wenn der Schalter fehlt),
   - `weak-crypto` (schwache Algorithmen als Standard),
   - `permissive-access` (offen für alle als Standard: CORS, Bind-Adresse, Rechte),
   - `debug-features` (Debug, Stacktraces, Quelltextkarten in Produktion).
2. Jeden Kandidaten bis zur Stelle verfolgen, an der die Sicherheitsentscheidung fällt. Ein
   Schalter, der nie gelesen wird, ist kein Befund; ein Schalter mit sicherem Standard auch nicht.
3. Prüfen, ob Produktion den unsicheren Weg überhaupt erreichen kann: `assertProductionConfig`
   (Start-Prüfung in `instrumentation.ts`) muss ihn abweisen oder ausdrücklich bestätigen lassen.
4. Befund mit Datei und Zeile, Standardwert, Wirkung in Produktion und Abhilfe melden. Kein Befund
   heißt nicht „sicher“; nenne, welche Klassen geprüft wurden.

## Orte in diesem Repo

- `lib/env.ts`, `apps/wallet/lib/env.ts`: alle Env-Schalter mit Standardwerten.
- `instrumentation.ts`, `apps/wallet/instrumentation.ts`: Start-Prüfung.
- `deploy/**`: systemd, nginx, nftables, Postgres, SSH.
- `lib/auth/**`: Anmeldung, Sitzungen, SSO.
