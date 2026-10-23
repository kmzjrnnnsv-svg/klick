# Rechtstexte — Entwürfe

> **Entwurf — anwaltlich prüfen.** Diese Texte sind Vorlagen, keine Rechtsberatung. Sie beschreiben,
> was Klick technisch tut (Stand 23.10.2026). Vor der Veröffentlichung von einer Kanzlei prüfen lassen
> und Platzhalter `[…]` füllen.

| Datei | Wohin | Wer pflegt |
|---|---|---|
| `impressum.md` | Pflichtangaben kommen aus der Env `LEGAL_*` (Block oben auf `/impressum`); ergänzende Angaben als CMS-Seite `impressum` | Env: Server (`deploy/README.md`), Text: Admin → CMS |
| `datenschutzerklaerung.md` | CMS-Seite `datenschutz-erklaerung` | Admin → CMS |
| `nutzungsbedingungen.md` | CMS-Seite `nutzungsbedingungen` (Version oben im Text pflegen) | Admin → CMS |
| `avv.md` | Anlage zum Vertrag (Auftragsverarbeitung nach Art. 28 DSGVO) | Vertrag |
| `abmahn-audit-2026-10.md` | Bericht: was geprüft, was behoben, was offen ist | — |

## Regeln für den Code

- Firmendaten nie in Code oder Messages schreiben: nur `legalEntity()` (`lib/legal/entity-env.ts`).
- Neue Verarbeitung personenbezogener Daten (Formular, Cookie, Dienstleister, Log) ⇒ Abschnitt in
  `datenschutzerklaerung.md` ergänzen und die CMS-Seite nachziehen.
- Neuer Dienstleister mit Kundendaten ⇒ Unterauftragnehmer-Liste in `avv.md`, `/vertrauen` und
  `lib/compliance/catalog/platform-supplier.ts`.
- Werbeaussagen (Standort, Sicherheit, „kostenlos“, „zertifiziert“) nur, wenn sie im Betrieb stimmen
  (§ 5 UWG). Beratungstexte nennen keine Rechtsprüfung im Einzelfall (§ 3 RDG).
