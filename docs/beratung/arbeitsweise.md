# Beratung mit Klick – Arbeitsweise

Klick dient zugleich als Self-Service-SaaS und als Werkzeug für Beratungsprojekte. Die fünf
Leistungen stehen öffentlich unter `/leistungen` (Inhalt: `lib/marketing/services.ts`). Preise
pflegst du als Plattform-Admin unter **Admin → Preise** (Preisgruppen nach Unternehmensgröße,
Stufe oder eigene Werte); Anfragen kommen über das Formular auf `/leistungen` oder aus der App
(Einstellungen → Abo & Leistungen) unter **Admin → Anfragen** an, mit Sofort-Mail.

| Leistung | In Klick | Ergebnis (Export) |
|---|---|---|
| Gap-Analyse & Prüfungsreife | `/gap-analyse` (Fragebogen → Bewertung → Maßnahmen), `/rahmenwerke/[slug]?tab=pruefungsreife` | `gap-analyse.md`, `readiness.md` |
| Security-Check für KI-gebaute Apps | `/sicherheit` (Schnellcheck, Scan-Import, CI-Ingest), Sicherheitsauftrag Art „Security-Check“ | `sicherheitsbericht.md`, `sicherheitsauftrag.zip` |
| CRA-Readiness | `/produkte` (Einstufung, SBOM, Checkliste), Auftrag Art „CRA-Readiness“ | `sicherheitsauftrag.zip` mit `04_CRA-Pruefungsreife.md` |
| Lieferantenprüfung | `/dienstleister/[id]` → Bewertung mit Portal-Link | `informationsregister.zip`, Sorgfaltsprüfung am Dienstleister |
| Penetrationstest | `/sicherheit/auftraege/[id]` (Beauftragung, Befunde mit CVSS, Nachtest) | `sicherheitsauftrag.zip` |

## Ein Konto für alle Kunden (ADR-018)

Du arbeitest mit **einem** Konto: deine eigene Organisation plus beliebig viele Kunden, in die
du als **Berater:in (extern)** eingeladen wirst.

1. **Einladung:** Der Kunde lädt deine Adresse unter Team mit der Rolle „Berater:in (extern)“
   ein. Als andere Rolle geht es nicht, solange du eine eigene Organisation hast. Der Link führt
   nach dem Login zurück zur Einladung (`?weiter=`).
2. **Zugang:** 90 Tage ab Annahme, der Kunde verlängert unter Team → Zugang. Du arbeitest wie
   Bearbeiter:innen (Controls, Gap-Analyse inklusive Übernehmen, Register, Dokumente,
   Nachweise, Exporte), aber du löschst nichts, erteilst keine Freigaben, akzeptierst keine
   Risiken oder Befunde und siehst keine Hinweisgeber-Fälle. AML-, Personal- und
   Beschwerde-Details nur, wenn der Kunde dir den Grant gibt — wie bei Prüfer:innen.
3. **Wechseln:** Umschalter oben in der Seitenleiste oder `/organisationen`. Beim Wechsel
   bestätigst du sensible Aktionen neu (Step-up gilt nur in der Organisation, in der du ihn
   bestätigt hast). Beim Login öffnet Klick deine eigene Organisation.
4. **Nachvollziehbar:** Alles steht im Audit-Log des Kunden; in Team und Aktivität bist du als
   „extern“ gekennzeichnet. Läuft der Zugang ab, landest du auf der Auswahl, die anderen
   Organisationen bleiben offen.

**Arbeit im eigenen Mandanten** bleibt möglich: Security-Checks und Pentests kannst du in
deiner Organisation führen (Produkt bzw. Auftrag je Kunde) und dem Kunden nur das Ergebnis-ZIP
geben. Dafür brauchst du einen **AV-Vertrag**, weil Befunde und Nachweise (verschlüsselt) bei dir
liegen. Nach Projektende: Auftrag abschließen, Export übergeben, Daten nach Vereinbarung löschen.

Für Pentests gilt immer: Ohne hochgeladene **schriftliche Beauftragung** aller
Verantwortlichen lässt sich der Auftrag nicht auf „beauftragt“ setzen (§ 202a/c StGB).

**Grenzen:** Über SSO provisionierte Konten prüft Klick nicht auf die Ein-Org-Regel. Löscht ein
Kunde seine Organisation, beendet Klick alle Sitzungen der Mitglieder — auch deine; nach dem
neuen Login sind deine anderen Zugänge unverändert da.

## Grenze: keine Rechtsdienstleistung (§ 3 RDG)

Wir liefern Abgleiche mit Checklisten, technische Einschätzungen, Vorlagen und Nachweise — keine
rechtliche Prüfung im Einzelfall. Konkret:

- **Verträge (DORA Art. 30):** Abgleich mit der Klausel-Checkliste („vorhanden / teilweise / offen“),
  keine Auslegung und keine Formulierung von Vertragsklauseln für die Kundin.
- **CRA:** technische Einschätzung von Anwendungsbereich, Klasse und Konformitätsweg; die verbindliche
  Einstufung trifft die Kundin mit ihrer Kanzlei.
- **Gap-Analyse, Prüfungsreife:** Bewertung von Umsetzung und Nachweisen, keine Aussage, ob eine
  Norm im Einzelfall erfüllt ist.

Berichte und Pakete aus Klick tragen den Hinweis „kein Rechtsrat“ bzw. „keine Rechtsberatung“
(`lib/export/*`); Angebote und Texte auf `/leistungen` nennen keine Rechtsprüfung (Test `legal`).

