# Auftragsverarbeitung (Art. 28 DSGVO) — Eckpunkte

> **Entwurf — anwaltlich prüfen.** Kein vollständiger Vertrag: die Punkte, die ein
> Auftragsverarbeitungsvertrag (AVV) für Klick enthalten muss, mit den Werten aus dem Betrieb.
> Als Grundlage eignet sich ein verbreitetes Muster (z. B. GDD- oder Bitkom-Muster, prüfen), ergänzt
> um diese Angaben.

## Gegenstand und Dauer
- Gegenstand: Bereitstellung der Plattform Klick als Software-Dienst; Dauer: Laufzeit des
  Nutzungsvertrags zuzüglich Export- und Löschfrist (30 Tage).

## Art der Daten und betroffene Personen
- Mitarbeitende, Organe, externe Prüfer:innen und Berater:innen des Kunden (Name, E-Mail, Rolle,
  Funktion, Schulungen, Fit-&-Proper-Angaben verschlüsselt).
- Kund:innen und Geschäftspartner des Kunden, soweit in Registern erfasst (Dienstleister, Vorfälle,
  Beschwerden, Hinweise nach HinSchG verschlüsselt, Geldwäsche-Fälle, Betroffenenanfragen).
- Besucher:innen des Trust Centers des Kunden (NDA-Anfragen), Lieferant:innen im Portal.

## Technische und organisatorische Maßnahmen (Art. 32)
- Verweis auf `/baseline` (Plattform-Baseline mit Nachweisen) und `/vertrauen`.
- Kernpunkte: Mandantentrennung in der Datenbank (Row-Level-Security), Verschlüsselung je
  Organisation (XChaCha20-Poly1305, eigener Schlüssel), Passkeys/MFA für alle Rollen, Audit-Log mit
  Hash-Kette, Backups verschlüsselt mit 30 Tagen Aufbewahrung, Plattform-Zugriff nur mit Begründung
  und Protokoll.

## Unterauftragnehmer (Stand 23.10.2026, prüfen)

| Unterauftragnehmer | Leistung | Ort |
|---|---|---|
| Hetzner Online GmbH | Server, Speicher, Backups | Deutschland |
| Sendinblue SAS (Brevo) | Versand von Service-Mails | Frankreich (EU) |
| [Resend, Inc.] | [nur wenn eingeschaltet: Versand von Service-Mails] | [USA] |

Neue Unterauftragnehmer: Ankündigung mindestens [30] Tage vorher in Textform, Widerspruchsrecht.

## Weitere Pflichten
- Weisungsgebundenheit, Vertraulichkeit der eingesetzten Personen, Unterstützung bei
  Betroffenenrechten und Datenschutz-Folgenabschätzung, Meldung von Datenpannen unverzüglich
  (Ziel: 24 Stunden), Kontrollrechte (Prüfungen nach Absprache, Prüfungspaket als Nachweis),
  Rückgabe und Löschung nach Vertragsende mit Löschbestätigung.
