# Gestaltung nach Apples Human Interface Guidelines

Verbindlich für Klick und both.money (Entscheidung 24.10.2026: Designsystem und alle Seiten,
„Apple-nah“). Grundlage: Apple Human Interface Guidelines (HIG), abgerufen am 24.10.2026 über
`https://developer.apple.com/tutorials/data/design/human-interface-guidelines/<seite>.json`
(Seiten unter `https://developer.apple.com/design/human-interface-guidelines/<seite>`).
Werte, die Apple nicht veröffentlicht, sind mit **prüfen** markiert.

Die HIG regelt Apple-Plattformen, nicht das Web. Wo sie für eine Web-App übersetzt werden muss,
steht hier, wie wir es tun. Projektregeln (Du-Form, DE-only, Satzschreibung, WCAG AA) gehen vor.

## 1. Grundsätze (Seite „design-principles“, Juni 2026)

Purpose, Agency, Responsibility, Familiarity, Flexibility, Simplicity, Craft, Delight. Für uns:

- **Inhalt vor Rahmen.** Bedienebene (Kopf, Seitenleiste, Tab-Leiste) liegt sichtbar über dem
  Inhalt, nimmt sich aber zurück.
- **Eine Haupthandlung je Ansicht**, höchstens zwei hervorgehobene Buttons.
- **Fehler verzeihen:** Rückgängig vor Rückfrage; Rückfrage nur vor unerwartetem, unumkehrbarem
  Verlust.
- **Feste Orte:** Bedienelemente stehen auf jeder Seite und Breite an derselben Stelle.
- **Barrierefreiheit von Anfang an.** Nur erheben, was gebraucht wird (passt zu DSGVO).

## 2. Maße

| Thema | HIG | Bei uns |
|---|---|---|
| Tippfläche | iOS 44 × 44 pt (min. 28), macOS 28 × 28 (min. 20) | `--control-h`: 44 px bei `pointer: coarse`, sonst 36 px; dichte Tabellen ≥ 28 px. Kleine Ziele (Text-Links, Checkbox, Wortmarke) bekommen ein unsichtbares Vorfeld: `.hit-area` bzw. automatisch jeder reine Text-Link (ohne Fläche, Rundung, eigene Position) außerhalb von Fließtext und Tab-Leiste (`styles/base.css`) |
| Abstand zwischen Bedienelementen | ≈ 12 pt mit Rahmen, ≈ 24 pt ohne | `gap-3` bzw. `gap-6` |
| Textgröße | iOS Standard 17 pt, min. 11 pt; Vergrößern bis 200 % | Body 17 px (`text-body`), nie unter 11 px (`text-caption-2`), alles in rem |
| Kontrast | 4,5 : 1 bis 17 pt; Dark Mode bei kleiner Schrift 7 : 1 anstreben | WCAG AA verbindlich (siehe 4) |
| Ecken | konzentrisch: innen = außen − Abstand; Kapsel = halbe Höhe | Felder 10 px (`rounded-md`), Abschnitte 16 px (`rounded-2xl`), Sheets 24 px (`rounded-3xl`), Buttons `rounded-full` |
| Ränder, Zeilenhöhen | nicht veröffentlicht (**prüfen**) | Seitenrand 16 px (Handy) / 20–24 px, Listenzeilen ≥ 44 px |

1 Apple-Punkt ≈ 1 CSS-Pixel bei 100 % Zoom (eigene Annahme, keine Apple-Aussage).

## 3. Schrift

- **Systemschrift**: `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, …`.
  Auf Apple-Geräten erscheint SF über das Betriebssystem. **SF Pro/New York nie als Webfont
  ausliefern** (Font-Lizenz: nur Mock-ups für Apple-Plattformen, kein „website content“).
  Monospace: `ui-monospace, "SF Mono", Menlo, Consolas, …`.
- **Textstile** nach Dynamic Type (iOS, Größe „L“), als Tailwind-Klassen aus `styles/tokens.css`:

| Klasse | Stil | Größe/Zeile (px) | Gewicht |
|---|---|---|---|
| `text-large-title` | Large Title | 34/41 | fett (Seitentitel) |
| `text-title-1` | Title 1 | 28/34 | halbfett/fett |
| `text-title-2` | Title 2 | 22/28 | halbfett |
| `text-title-3` | Title 3 | 20/25 | halbfett |
| `text-headline` | Headline | 17/22 | halbfett |
| `text-body` | Body | 17/22 | normal |
| `text-callout` | Callout | 16/21 | normal |
| `text-subhead` | Subhead | 15/20 | normal (dichte Tabellen) |
| `text-footnote` | Footnote | 13/18 | normal (Hilfstexte, Abschnittsköpfe) |
| `text-caption` | Caption 1 | 12/16 | normal |
| `text-caption-2` | Caption 2 | 11/13 | mittel (Untergrenze) |

- Keine Schnitte Ultralight/Thin/Light. Überschriften `h1` 700, `h2`/`h3` 600.
- Keine Versalien für Abschnittsköpfe, Buttons, Labels, Tabellenköpfe (HIG seit Liquid Glass:
  Abschnittsköpfe „no longer render entirely in capital letters“).
- Dynamic Type über `font: -apple-system-body` (iOS Safari) ist eine spätere Option; heute wächst
  alles über rem mit der Browser-Schriftgröße.

## 4. Farben

Systemfarben iOS 26 (Seite „color“, Stand Juni 2025). Apples Standardwerte erreichen auf Weiß nur
2,2–3,6 : 1 und taugen deshalb nur für Flächen, Linien und Symbole. Für Text nutzen wir dunklere
Varianten, die auf dem grauen Seitengrund (#F2F2F7) mindestens 4,5 : 1 erreichen.

| Token | Hell | Dunkel | Zweck |
|---|---|---|---|
| `--background` | #F2F2F7 | #000000 | Seitengrund (systemGroupedBackground) |
| `--card` | #FFFFFF | #1C1C1E | Abschnitte, Karten |
| `--popover` | #FFFFFF | #2C2C2E | angehobene Ebene (Popover, Sheet) |
| `--foreground` | #000000 | #FFFFFF | label |
| `--muted-foreground` | #636366 | #A1A1A8 | secondaryLabel, abgedunkelt bzw. aufgehellt: ≥ 4,5 : 1 auch auf getönten Flächen (`--muted`) |
| `--border` | #C6C6C8 | #38383A | opaqueSeparator |
| `--muted` | rgba(118,118,128,.12) | rgba(118,118,128,.24) | Füllung (tertiarySystemFill) |
| `--primary` | #0A63D6 | #409CFF | Akzent für Text, Links, Ringe |
| `--primary-fill` | #0A63D6 | #0A63D6 | gefüllte Buttons mit weißer Schrift |
| `--destructive` / `-fill` | #D70015 | #FF6961 / #D70015 | destruktiv |
| `--success` | #1E7B34 | #30D158 | Status ok |
| `--warning` | #C93400 | #FFB340 | Status Achtung |
| `--chart-1…5` | #0088FF, #6155F5, #34C759, #FF8D28, #FF383C | #0091FF, #6D7CFF, #30D158, #FF9230, #FF4245 | Diagramme (Flächen, Linien) |

- Erhöhter Kontrast (`prefers-contrast: more`): dunklerer Grautext und Linien, Bedienebene massiv.
- Hex-Werte der semantischen Farben (Hintergründe, label, separator) veröffentlicht die HIG nicht;
  sie stammen aus den UIKit-Standardwerten (**prüfen** gegen Apple Design Resources).
- Regeln: Farbe nie allein (immer Text oder Symbol dazu); eine Farbe = eine Bedeutung; Akzent
  sparsam, für die Haupthandlung als Fläche statt als farbiger Text; Kursanstieg/-fall nicht nur
  rot/grün.
- **Darstellung folgt dem System** (`prefers-color-scheme`), keine eigene Umschaltung in der App
  (HIG Dark Mode: „Avoid offering an app-specific appearance setting“).

## 5. Materialien

- Unschärfe (`.material-bar`: `backdrop-filter` mit `--bar`) nur in der Bedienebene: Kopf-,
  Seiten-, Tab-Leiste. Nie in Tabellen, Formularen, Karten (HIG: kein Liquid Glass im Inhalt).
- Bei `prefers-reduced-transparency` und `prefers-contrast: more` massiv (`--bar-solid`).
- Kein massiver Hintergrund direkt unter schwebenden Bedienelementen, wo Unschärfe möglich ist.

## 6. Bausteine

- **Buttons:** Rollen Primär (gefüllt, Akzent), Sekundär (grau getönt), Schlicht, Destruktiv
  (Rot). Destruktiv ist nie die Primärrolle. Je Ansicht höchstens 1–2 hervorgehoben; Vorrang über
  Stil, nicht über Größe. Beschriftung mit Verb; „…“, wenn noch eine Eingabe folgt. Ladezustand im
  Button mit geänderter Beschriftung („Speichern“ → „Speichert …“). Kapselform.
- **Listen:** gruppiert und eingerückt (`ListSection`), Kopf und Fuß in Footnote, Zeilen ≥ 44 px,
  Pfeil nach rechts nur für Drill-down, Werte rechts in Grau, Trennlinien eingerückt.
- **Tabellen:** Spaltenköpfe ohne Versalien, Sortieren per Klick, Hover als Tönung (kein
  Vergrößern), Auslassung in der Mitte für lange Kennungen (`MiddleEllipsis`), markierbar.
  Am Handy werden Tabellen zu Listen.
- **Seitenleiste:** höchstens zwei Ebenen, nicht standardmäßig versteckt, nichts Kritisches ganz
  unten.
- **Tab-Leiste (Handy):** höchstens fünf Tabs, nur Navigation, nie Aktionen, keine ausgeblendeten
  oder deaktivierten Tabs, möglichst kein „Mehr“.
- **Werkzeugleiste/Kopf:** Titel kurz; Zurück als Symbol (Chevron) mit dem Titel der Elternseite;
  eine Primäraktion hinten; Suche hinten.
- **Sheet** (statt Dialog): für abgegrenzte Aufgaben; am Handy von unten, am Desktop mittig;
  Abbrechen vorne, Fertig/Sichern hinten; nie zwei Modale gleichzeitig; Wischen zum Schließen nur
  ohne ungesicherte Änderungen. **Im Code:** Rückfragen wie der Step-up erscheinen **im** offenen
  Sheet (`components/ui/modal-host.tsx`: `DialogContent` meldet sich als Gastgeber, `HostPanel`
  legt die Rückfrage darüber, Esc schließt nur die Rückfrage); ohne offenes Sheet eigenes Sheet.
- **Alert:** nur für Kritisches; Titel nicht „Fehler“; höchstens drei Buttons; „Abbrechen“ statt
  „OK“, kein Ja/Nein; Abbrechen nie Standard; Esc bricht ab. **Im Code:** Rückfragen vor
  unumkehrbaren Schritten nur über `useConfirm` (`components/ui/confirm-alert.tsx`; im offenen
  Sheet erscheint sie im Sheet), nie `window.confirm`.
- **Popover:** klein, nie für Warnungen, auf schmalen Bildschirmen als Sheet.
- **Menüs:** Verben, „…“ bei Folgeeingabe, Symbole ganz oder gar nicht je Gruppe, höchstens eine
  Untermenü-Ebene; Kontextmenüs blenden Unpassendes aus statt es zu sperren.
- **Segmentierte Steuerung:** höchstens fünf gleich breite Segmente, Text oder Symbol, nicht für
  die Hauptnavigation.
- **Schalter** nur in Listenzeilen; Checkbox für Mehrfachauswahl in Formularen.
- **Pfeile und Chevrons** (Seiten „Lists and tables“, „Disclosure controls“; Test
  `tests/ui-arrows.test.ts`). Nur dort, wo Apple sie auch zeigt:
  - Chevron rechts = Drill-down in einer Listenzeile (Disclosure-Indikator) und Untermenü.
  - Chevron links = Zurück, immer mit dem Titel der Elternseite (`BackLink`).
  - Aufklappen: Chevron zeigt zugeklappt nach rechts (zur Mitte), aufgeklappt nach unten;
    ein Aufklapp-Knopf daneben zeigt nach unten bzw. oben, höchstens einer je Ansicht.
  - Auf-/Ab-Chevrons im Pop-up-Knopf (Select), Chevrons zum Blättern (Jahr vor/zurück).
  - Pfeil schräg nach rechts oben hinter dem Text = öffnet woanders (externer Link).
  - Fachliche Richtung, wo Apple sie zeigt: Ein-/Ausgang einer Bewegung, Umsortieren.
  - **Nie:** Pfeile als Schmuck an Knöpfen oder Links („Weiter →“), Pfeilketten im Text
    („A → B → C“ → als Satz oder nummerierte Schritte), Pfeile zwischen Vorher und Nachher
    („von 40 % auf 55 %“ bzw. alter Wert durchgestrichen), Pfeile als Achsenbeschriftung.
  - Menüpfade im Text mit „>“: „Einstellungen > Freigaben“.
- **Formularfelder:** Label über dem Feld, Platzhalter mit Beispiel („z. B. …“), Fehler direkt am
  Feld mit Lösung („Bitte nur Ziffern“ statt „Ungültig“), Zahlen und Daten im deutschen Format,
  Passwortfelder nie vorbelegt. Am Touch-Bildschirm Feldschrift ≥ 16 px (sonst zoomt Safari beim
  Tippen; Regel in `styles/base.css`, keine Überschreibung mit `text-footnote` an Feldern) und
  Feldhöhe 44 px (`--control-h`, kein `h-8`).
- **Fehler** (Code: `components/ui/{error-text,form-alert,toast}.ts(x)`): Prüf- und Aktionsfehler
  eines Formulars stehen über dem Absenden-Knopf (`FormAlert`, `role="alert"`), nicht im Toast.
  Fehler-Toasts bleiben stehen, bis man sie schließt (`toast.error` aus `components/ui/toast`, nie
  direkt aus `sonner`); Bestätigungen verschwinden von selbst. Codes nie roh anzeigen:
  `errorText(tc, res)` übersetzt sie und hängt die Referenz an (Test `ui-feedback`). Ladetexte als
  Satz („Wird gespeichert …“), nicht als Verb mit Auslassung.
- **Fortschritt:** bestimmte Anzeige, wo möglich; keine vagen „Laden“-Texte; sofort Platzhalter.
- **Badges** nur für Benachrichtigungen; Status als Status-Label (Punkt + Text).
- **Diagramme:** Werte ohne Interaktion erkennbar, Achsen sparsam, Farbe nie allein, zugängliche
  Beschriftung mit echten Werten, Tabelle als Alternative.

## 7. Muster und Texte

- Meldungen nach Gewicht: Status am Element, Toast für Bestätigungen, Alert nur für Kritisches.
  Wichtiges nie nur als Toast, der von selbst verschwindet.
- Einführung: optional, später wiederauffindbar; Einstellungen erst dort, wo sie wirken.
- Konten: Passkeys zuerst (ADR-019); kein Wort „Passcode“.
- Texte: Verben auf Buttons, kein „wir“, kein „Ups“, kein „Klicke hier“, keine Roboter-Fehler;
  leere Zustände nennen den nächsten Schritt. **Projektregeln:** Du-Form, deutsche Rechtschreibung
  in Satzschreibung (Apples Title Case ist fürs Englische definiert), „…“-Anführungszeichen.
- Tooltips höchstens 60–75 Zeichen, mit Verb, ohne den Namen des Bedienelements zu wiederholen.

## 8. Barrierefreiheit und Bewegung

- Text bis 200 % vergrößerbar ohne Überlauf; Bedienelemente wachsen mit.
- Automatisch geprüft: `tests/ui-hig.test.ts` (Bausteine und alle Seiten beider Apps: keine
  Versalien, Serifen, Tailwind-Schriftgrößen bis 3xl, px-Schrift, `divide-y` in Karten-Listen,
  `window.confirm`, `h-8` an Feldern, Ladetexte mit Auslassung; CSS-Module ohne px-Schrift),
  `tests/ui-back-links.test.ts` (Zurück auf jeder Unterseite), `tests/ui-arrows.test.ts`,
  `tests/ui-feedback.test.ts`. Im Browser: `scripts/qa/hig-check.ts [--dialogs] <pfade>`
  (Tippflächen, Kontrast hell/dunkel, 200 % Text; mit `--dialogs` auch in den Dialogen).
- Jede Bedienfläche hat einen Namen; Statusänderungen werden angesagt (`aria-live`).
- Sichtbarer Fokus, Tastatur vollständig; Esc schließt, ⌘K sucht; keine Standardkürzel
  überschreiben.
- Bewegung nur mit Zweck, kurz, abbrechbar; bei `prefers-reduced-motion` nur Überblendung
  (Grundstil in `styles/base.css`).

## 9. Lizenzen und Marke

- **Keine SF-Schriften und keine SF Symbols ausliefern.** Symbole: Lucide (ISC), gestaltet nach
  den HIG-Regeln; keine Symbole oder Logos, die Apple-Symbolen verwechselbar ähneln.
- „Apple-nah“ heißt nicht „Apple“: kein Apple-Logo, keine Apple-Produktnamen in der Oberfläche.

## 10. Umsetzung im Code

- Tokens: `styles/tokens.css`; Grundstile und `.material-bar`: `styles/base.css`.
- Textstile als Klassen `text-large-title` … `text-caption-2`; `cn()` kennt sie als Schriftgrößen
  (`TEXT_STYLES` in `lib/utils.ts`, sonst verwirft tailwind-merge daneben stehende Textfarben).
- Bausteine `components/ui/*`:
  - `Button`: `default` = Primär (`bg-primary-fill`, weiße Schrift), `secondary`/`outline` = grau
    getönt, `ghost` = schlicht in Akzentfarbe, `destructive` = Rot; `pending` für den Ladezustand.
  - `Input`/`Textarea`/`SelectTrigger`: gefülltes Feld, mindestens 16 px Schrift (kein Zoom in
    Safari auf iOS), `Label` darüber in Subhead.
  - `Badge` = Status-Label: Punkt in der Statusfarbe, Text in der Vordergrundfarbe (getönte Flächen
    drücken farbigen Text unter 4,5 : 1).
  - `Dialog` = Sheet (am Handy von unten), `AlertDialog` = Alert (schmal, mittig, gestapelt am
    Handy), `Tabs`/`UrlTabs` bis fünf als segmentierte Steuerung (`--segment`), mehr als Kapseln.
  - `List` (`ListGroup`, `ListSection`, `ListRow`, `current` für die gewählte Zeile) für
    gruppierte Listen, `MiddleEllipsis` für Adressen und Hashes.
  - Natives `<select>` nur mit `nativeSelectClass` bzw. `nativeSelectCompactClass` aus
    `components/ui/input.tsx` (gefüllt, 16 px).
  - `CardHeader` ist ein Raster mit `minmax(0,1fr)` als Basisspalte, sonst bestimmt das längste
    Wort die Kartenbreite (200 % Text).
- Einstellungen nach dem Muster der iOS-Einstellungen: Bereiche als gruppierte Liste
  (`lib/settings/sections.ts`), am Handy erst Liste, dann Bereich mit Rückweg, ab Desktop Liste
  links und Bereich rechts; Adresse bleibt `?tab=`.
- Klebende Leisten am unteren Rand (Speichern, Auswahl) mit `sticky bottom-(--bar-offset)` und
  `.material-bar`: `--bar-offset` hebt sie am Handy über die Tab-Leiste.
- Spalten mit eigenem Bedienelement in `RegisterPage` tragen `interactive: true`, damit der
  Zeilen-Link nie ein Bedienelement umschließt.
- Mails (`lib/mail/templates.ts`, `apps/wallet/lib/mail/templates.ts`) im selben Stil:
  Systemschrift, weiße Karte auf Systemgrau, Knopf als Kapsel.
  - Seitengerüste: `PageHeader` (Large Title), `EntityLayout`/`Section`/`MetaItem`, `EmptyState`,
    `RegisterPage` (am Handy gruppierte Liste mit Pfeil).
- Rahmen: `components/shell/*`, `apps/wallet/components/shell/*` (Phase A3).
- Alte Klassen `font-serif-display`, `lv-eyebrow`, `lv-nav`, `lv-wordmark` sind umgedeutet (keine
  Serifen, keine Versalien) und verschwinden mit dem Umbau der Seiten (Phase A5).
- Prüfung: Test `ui-hig` (Bausteine) und `pnpm exec tsx scripts/qa/hig-check.ts <pfade>` gegen
  eine laufende Instanz (Sitzung aus `crawl.ts --login`): Tippflächen am Handy ≥ 44 und am
  Desktop ≥ 28 (Vorfeld zählt mit, Links im Fließtext ausgenommen), Kontrast jedes Textes hell
  und dunkel, 200 % Textgröße bei 768 px ohne Überlauf, mit `--shots <ordner>` Fotos dunkel,
  erhöhter Kontrast und reduzierte Bewegung. Für both.money `QA_BASE` und `QA_STATE_FILE` setzen.

## Nicht von Apple belegt (prüfen)

Ränder 16/20 pt, Listen-Zeilenhöhen, ein Raster, maximale Zeilenlänge, Hex-Werte der semantischen
Farben, Dauer und Kurven von Bewegungen, deutsche Begriffe Apples für Buttons.
