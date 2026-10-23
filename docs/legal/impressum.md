# Impressum — Vorlage

> **Entwurf — anwaltlich prüfen.** Die Pflichtangaben nach § 5 DDG zeigt `/impressum` automatisch aus
> der Server-Konfiguration an (`LEGAL_*`, siehe unten). In die CMS-Seite `impressum` gehört nur, was
> darüber hinausgeht — sonst stehen die Angaben doppelt da.

## 1. Server-Konfiguration (systemd-Credential oder `.env.production`)

```bash
LEGAL_NAME="[Firma, z. B. Raza]"
LEGAL_FORM="[GmbH | UG (haftungsbeschränkt) | e. K. | …]"
LEGAL_ADDRESS="[Straße Hausnummer];[PLZ Ort];Deutschland"     # ladungsfähig, kein Postfach
LEGAL_REPRESENTATIVES="[Vorname Nachname (Geschäftsführer:in)]"
LEGAL_REGISTER="[Amtsgericht Ort, HRB 12345]"                 # weglassen, wenn kein Eintrag
LEGAL_VAT_ID="[DE123456789]"                                  # weglassen, wenn keine USt-IdNr.
LEGAL_PHONE="[+49 …]"                                         # optional, zweiter schneller Kontaktweg
LEGAL_CONTACT_MAIL="no-reply@raza.work"                       # später echte Adresse, ohne Code änderbar
```

**Wichtig zur Kontaktadresse:** § 5 Abs. 1 Nr. 2 DDG verlangt eine Adresse für die *schnelle
elektronische Kontaktaufnahme*. Eine Adresse, an die Mails nicht zugestellt oder nicht gelesen werden,
erfüllt das nicht und ist ein typischer Abmahngrund. Solange `no-reply@raza.work` genutzt wird, muss
das Postfach Mails annehmen und regelmäßig gelesen werden (oder eine Weiterleitung haben). Das
Anfrageformular (`/leistungen#anfrage`) ist ein zusätzlicher Kontaktweg (EuGH C-298/07).

Fehlen `LEGAL_NAME`, `LEGAL_ADDRESS` oder `LEGAL_REPRESENTATIVES`, warnt der Server beim Start im
Journal (`Impressum unvollständig`).

## 2. Ergänzender CMS-Text (Vorschlag)

```markdown
## Aufsichtsbehörde

[Nur, wenn eine erlaubnispflichtige Tätigkeit ausgeübt wird, z. B. nach Erteilung der Erlaubnis als
Kryptowerte-Dienstleister oder Zahlungsinstitut: Bundesanstalt für Finanzdienstleistungsaufsicht
(BaFin), Graurheindorfer Str. 108, 53117 Bonn, und Marie-Curie-Str. 24–28, 60439 Frankfurt am Main.
Bis dahin diesen Abschnitt weglassen.]

## Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV

[Nur nötig bei journalistisch-redaktionellen Inhalten (z. B. Blog, Fachartikel). Name, Anschrift.]

## Zielgruppe

Klick richtet sich ausschließlich an Unternehmen (§ 14 BGB), nicht an Verbraucher:innen.

## Hinweis zu Inhalten der Trust Center

Unter `/vertrauen/<name>` veröffentlichen Organisationen eigene Angaben. Für diese Inhalte ist die
jeweilige Organisation verantwortlich. Rechtswidrige Inhalte kannst du über „Inhalt melden“ auf der
jeweiligen Seite melden.
```

## 3. Was nicht ins Impressum gehört

- **Kein Link zur OS-Plattform der EU.** Die Plattform ist seit 20.07.2025 abgeschaltet; ein alter
  Link ist selbst ein Abmahnrisiko.
- **Keine Angabe nach § 36 VSBG** nötig, solange nur Unternehmen Verträge schließen (die Pflicht gilt
  für Verbraucherverträge).
