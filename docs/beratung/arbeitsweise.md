# Beratung mit Klick – Arbeitsweise

Klick dient zugleich als Self-Service-SaaS und als Werkzeug für Beratungsprojekte. Die fünf
Leistungen stehen öffentlich unter `/leistungen` (Inhalt: `lib/marketing/services.ts`,
Richtwerte – vor Veröffentlichung festlegen).

| Leistung | In Klick | Ergebnis (Export) |
|---|---|---|
| Gap-Analyse & Prüfungsreife | `/gap-analyse` (Fragebogen → Bewertung → Maßnahmen), `/rahmenwerke/[slug]?tab=pruefungsreife` | `gap-analyse.md`, `readiness.md` |
| Security-Check für KI-gebaute Apps | `/sicherheit` (Schnellcheck, Scan-Import, CI-Ingest), Sicherheitsauftrag Art „Security-Check“ | `sicherheitsbericht.md`, `sicherheitsauftrag.zip` |
| CRA-Readiness | `/produkte` (Einstufung, SBOM, Checkliste), Auftrag Art „CRA-Readiness“ | `sicherheitsauftrag.zip` mit `04_CRA-Pruefungsreife.md` |
| Lieferantenprüfung | `/dienstleister/[id]` → Bewertung mit Portal-Link | `informationsregister.zip`, Sorgfaltsprüfung am Dienstleister |
| Penetrationstest | `/sicherheit/auftraege/[id]` (Beauftragung, Befunde mit CVSS, Nachtest) | `sicherheitsauftrag.zip` |

## Heute: ein Konto je Kunde

Better Auth ist so konfiguriert, dass **ein User genau einer Organisation** angehört
(`lib/auth/server.ts`, Prüfungen in `beforeAcceptInvitation` und im Onboarding). Daraus folgt:

1. **Arbeit im Kundenmandanten (Standard):** Der Kunde lädt dich ein – als `auditor` für
   Prüfungsarbeit (zeitlich begrenzt, `member_access`) oder als `editor`, wenn du mitarbeitest.
   Für jeden Kunden brauchst du ein **eigenes Konto** (eigene E-Mail-Adresse, z. B.
   `name+kunde@…`, mit eigenem zweiten Faktor). Alle Schritte stehen im Audit-Log des Kunden.
2. **Arbeit im eigenen Mandanten:** Security-Checks und Pentests kannst du auch in deiner
   eigenen Organisation führen (Produkt bzw. Auftrag je Kunde) und dem Kunden nur das
   Ergebnis-ZIP geben. Dafür brauchst du einen **AV-Vertrag** mit dem Kunden, weil Befunde
   und Nachweise (verschlüsselt) bei dir liegen. Nach Projektende: Auftrag abschließen,
   Export übergeben, Daten nach Vereinbarung löschen.

Für Pentests gilt in beiden Fällen: Ohne hochgeladene **schriftliche Beauftragung** aller
Verantwortlichen lässt sich der Auftrag nicht auf „beauftragt“ setzen (§ 202a/c StGB).

## Später: Mehr-Org-Zugang (ADR-018, offen)

Für Berater:innen mit vielen Kunden: ein Konto, mehrere Organisationen.

- `organizationLimit` und die Ein-Org-Prüfungen in `beforeAcceptInvitation`/Onboarding lockern.
- Org-Switcher in der Shell; `requireOrg` arbeitet bereits je aktiver Organisation.
- Rolle `consultant` mit eigenem Rechteprofil (zwischen `auditor` und `editor`), zeitlich
  begrenzt wie `member_access`, sichtbar im Team-Bereich des Kunden.
- MFA, Idle/Absolut-Grenzen und Step-up gelten unverändert je Sitzung.
