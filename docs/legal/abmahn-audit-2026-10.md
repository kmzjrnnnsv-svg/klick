# Abmahn-Audit raza.work / Klick — Oktober 2026

> **Kein Rechtsrat.** Technische und inhaltliche Prüfung der Website und der Plattform gegen typische
> Abmahngründe im deutschen Recht (Stand 23.10.2026). Rechtsgrundlagen und Urteile nach Recherche aus
> Sekundärquellen; Punkte mit „prüfen“ vor der Veröffentlichung von einer Kanzlei bestätigen lassen.

## Wer abmahnen kann

- **Mitbewerber** (§ 8 Abs. 3 Nr. 1 UWG) — seit 2020 nur, wenn sie in nicht unerheblichem Maß ähnliche
  Leistungen anbieten; bei Verstößen gegen Informationspflichten im Internet und gegen die DSGVO
  durch Unternehmen mit weniger als 250 Beschäftigten keine Kostenerstattung (§ 13 Abs. 4 UWG).
- **Verbände und qualifizierte Einrichtungen** (§ 8 Abs. 3 Nr. 2–4 UWG, UKlaG).
- **Betroffene** bei DSGVO-Verstößen (Art. 82 DSGVO, Unterlassung).
- **Neu:** Der BGH hat am 27.03.2025 entschieden, dass DSGVO-Verstöße Marktverhaltensregeln sein und
  von Mitbewerbern und Verbänden über § 3a UWG verfolgt werden können (I ZR 186/17, I ZR 223/19).
- **Rechteinhaber:innen** bei Urheber- und Markenrecht (Bilder, Schriften, Logos, Software).

## Ergebnis auf einen Blick

| Bereich | Stand | Was getan wurde |
|---|---|---|
| Schriften | ✅ in Ordnung | `next/font` lädt Jost, Cormorant Garamond, JetBrains Mono beim Build und liefert sie selbst aus — keine Anfrage an Google (LG München I, 20.01.2022, 3 O 17493/20). Lizenz (OFL) auf `/lizenzen`. |
| Tracking, Session Replay, Cookies | ✅ in Ordnung | Keine Analyse, kein Replay, keine Drittanbieter-Skripte (CSP mit Nonce verhindert sie). Nur technisch nötige Cookies (§ 25 Abs. 2 Nr. 2 TDDDG) → kein Banner nötig; Liste in der Datenschutzerklärung (Entwurf). Ein Banner ohne „Alle ablehnen“ wäre selbst angreifbar (OLG Köln 19.01.2024, 6 U 80/23; VG Hannover 19.03.2025). |
| Impressum | 🟠 du musst | Angaben kommen jetzt aus der Env (`LEGAL_*`) und stehen auf `/impressum`; Kontaktformular als zweiter Weg. Fehlen Angaben, warnt der Server beim Start. **Firmendaten setzen** und dafür sorgen, dass `no-reply@raza.work` Mails annimmt und gelesen wird (§ 5 DDG). |
| Datenschutzerklärung | 🟠 du musst | Entwurf `docs/legal/datenschutzerklaerung.md` deckt Hosting, Logs, CrowdSec, Cookies, Konto, Brevo, Anfragen, Trust Center, Lieferantenportal, Uploads, Wallet, Rechte ab. **Prüfen lassen und als CMS-Seite veröffentlichen.** |
| Erreichbarkeit Rechtstexte | ✅ behoben | Impressum, Datenschutz, Nutzungsbedingungen, Lizenzen jetzt in jeder Fußzeile: Website, App, Wallet, Einrichtung, Admin, Lieferantenportal, Trust Center, 404. Handy-Menü im Kopf. |
| OS-Plattform-Link | ✅ in Ordnung | Kein Link vorhanden — richtig so, die Plattform ist seit 20.07.2025 abgeschaltet (Test verhindert einen Rückfall). |
| B2B-Beschränkung | ✅ behoben | Hinweis „nur für Unternehmen (§ 14 BGB)“ direkt an jeder Preisliste, Pflicht-Häkchen bei Registrierung und Anfrage (BGH I ZR 99/08: Beschränkung muss klar erkennbar sein). Damit entfallen B2C-Pflichten wie Widerrufsbutton (§ 356a BGB, seit 19.06.2026), Kündigungsbutton (§ 312k BGB), Preisangaben brutto und BFSG — **solange tatsächlich nur an Unternehmen verkauft wird.** |
| Preisangaben | ✅ behoben | „netto zuzüglich gesetzlicher Umsatzsteuer“ an jeder Preisliste (PAngV gilt für B2B nicht, Klarheit trotzdem wegen § 5 UWG). „Bis dahin kostet die Software nichts“ ist mit Bedingung genannt und stimmt. |
| Laufzeit, Verlängerung, Kündigung | ✅ behoben | Überall gleich: Vertragsjahr ab bestandenem Audit, verlängert sich um ein Jahr, Kündigung jederzeit zum Ende des Vertragsjahres, vorher sofort. Widerspruch „keine Bindung“ ↔ „Mindestfrist“ beseitigt. Nutzungsbedingungen als Entwurf. |
| Irreführende Aussagen (§ 5 UWG) | ✅ behoben | „Datenverarbeitung ausschließlich in Deutschland“ → Server in DE, Mails über Brevo (EU). „Nur deine Organisation“ → Betreiber-Zugriff mit Begründung genannt. Virenscan-Versprechen entfernt (clamd ist optional). IP-Allowlist als „einstellbar“. Tests verhindern Rückfälle. |
| Rechtsdienstleistung (§ 3 RDG) | ✅ behoben | „Vertragsprüfung nach DORA Art. 30“ → „Abgleich mit der Klausel-Checkliste“; CRA-Einstufung als „technische Einschätzung“; FAQ „Prüft ihr unsere Verträge rechtlich? — Nein“. Grenze in `docs/beratung/arbeitsweise.md`. Das Bildschirmfoto `public/leistungen/vertrag.jpg` zeigt noch den alten Seitentitel — beim nächsten Bilder-Update neu aufnehmen. |
| Markenrecht | ✅ behoben | Favicon war das Next.js/Vercel-Standardlogo → eigenes „K“. |
| Urheberrecht Bilder | ✅ in Ordnung | Bilder unter `public/leistungen` und `public/funktionen` sind eigene Bildschirmfotos mit Beispieldaten; keine Stockfotos, keine Hotlinks (BGH I ZR 179/22 zur Urhebernennung entfällt). Vermerk auf `/lizenzen`. |
| Urheberrecht Software | ✅ behoben | `/lizenzen` listet alle 484 ausgelieferten Pakete mit Lizenz und Urheber:in (`pnpm legal:licenses`; Test bei fehlenden Einträgen). Volle Lizenztexte im Browser-Bundle: prüfen. |
| Kinder / Minderjährige | ✅ behoben | Angebot nur für Unternehmen; Registrierung bestätigt Volljährigkeit; Abschnitt in der Datenschutzerklärung. Keine an Kinder gerichteten Inhalte (Art. 8 DSGVO greift nicht). |
| Kontaktformular | ✅ behoben | Statt einer „Einwilligung“ (falsche Rechtsgrundlage) eine Bestätigung „für ein Unternehmen“ mit Hinweis auf Zweck und Löschfrist; Rechtsgrundlage Art. 6 Abs. 1 lit. b. IP nur als HMAC. |
| E-Mails | ✅ behoben | Jede Mail mit Firma, Anschrift, Vertretung, Register, USt-IdNr. und Impressum-Link (§ 35a GmbHG, § 37a HGB — greift, sobald `LEGAL_*` gesetzt ist). Keine Werbung → kein Opt-out nötig (§ 7 UWG); Abbestellen ist ein späterer Komfortpunkt. Resend (USA) nur mit Schalter. |
| Trust Center (Inhalte Dritter) | ✅ behoben | Öffentliche Seiten mit Rechtslinks und „Inhalt melden“ (DSA Art. 16, gilt auch für kleine Hosting-Anbieter); Meldungen stehen in Admin → Anfragen oben. NDA-Formular nennt Verantwortliche und Löschfrist; Anfragen werden 12 Monate nach Ablauf gelöscht. |
| Server-Logs | ✅ behoben | Zugriffslogs 14 Tage (`deploy/logrotate/nginx`), CrowdSec dokumentiert. **Community-Blockliste:** teilen nur, wenn in der Datenschutzerklärung genannt, sonst abschalten. |
| Barrierefreiheit | ✅ Grundlagen | BFSG gilt nur für Verbraucher:innen-Angebote — bei B2B keine Pflicht. Trotzdem: Sprunglink, `<main>` überall, Fokus sichtbar. |
| KI-Kennzeichnung | ✅ in Ordnung | Keine KI-Funktionen (AI Act Art. 50 seit 02.08.2026 nicht einschlägig). |
| Umweltaussagen | ✅ in Ordnung | Keine „grün/klimaneutral“-Aussagen (EmpCo-Umsetzung im UWG seit 27.09.2026). |
| Bewertungen, Logos, Referenzen | ✅ in Ordnung | Keine erfundenen Kund:innen, Bewertungen oder Siegel; „Zertifiziert“ nur mit gültigem Zertifikat. |

## Was du tun musst

1. **Firmendaten** als Env auf dem Server setzen (`LEGAL_NAME`, `LEGAL_FORM`, `LEGAL_ADDRESS`,
   `LEGAL_REPRESENTATIVES`, `LEGAL_REGISTER`, `LEGAL_VAT_ID`) — Runbook „Rechtsangaben“ in
   `deploy/README.md`.
2. **Postfach** `no-reply@raza.work` so einrichten, dass Mails ankommen und gelesen werden — oder bald
   eine echte Adresse über `LEGAL_CONTACT_MAIL`.
3. **Kanzlei:** Impressum-Ergänzung, Datenschutzerklärung, Nutzungsbedingungen und AVV aus
   `docs/legal/` prüfen lassen und unter Admin → CMS veröffentlichen.
4. **Brevo:** Auftragsverarbeitungsvertrag abschließen; ein vorhandenes Resend-Konto kündigen oder
   `MAIL_ALLOW_RESEND` aus lassen.
5. **Server:** `deploy/logrotate/nginx` übernehmen, CrowdSec-Teilen klären, `ADMIN_IP_ALLOWLIST`
   setzen, clamd installieren (dann darf der Virenscan wieder beworben werden).
6. **Nur an Unternehmen verkaufen.** Sobald Verbraucher:innen kaufen können, gelten Widerrufs- und
   Kündigungsbutton, Bruttopreise und BFSG — dann vorher neu prüfen.

## Quellen (Auswahl)

- BGH, Urteile vom 27.03.2025 — I ZR 186/17 (Lindenapotheke), I ZR 223/19: DSGVO-Verstöße über § 3a UWG verfolgbar.
- LG München I, 20.01.2022 — 3 O 17493/20: dynamische Google Fonts ohne Einwilligung.
- OLG Köln, 19.01.2024 — 6 U 80/23; VG Hannover, 19.03.2025 (Az. prüfen): Cookie-Banner ohne gleichwertige Ablehnung.
- BGH, 29.04.2010 — I ZR 99/08: Beschränkung des Angebots auf Gewerbetreibende muss klar und transparent sein.
- BGH — I ZR 179/22 (Datum prüfen): Urhebernennung bei Bildern.
- EuGH, 16.10.2008 — C-298/07: E-Mail plus weiterer schneller Kontaktweg im Impressum.
- VO (EU) 2024/3228: Aufhebung der ODR-Verordnung, Abschaltung der OS-Plattform zum 20.07.2025.
- § 356a BGB (Widerrufsbutton) seit 19.06.2026; § 312k BGB (Kündigungsbutton); BFSG seit 28.06.2025.
- VO (EU) 2022/2065 (DSA), Art. 11, 12, 16, 17.
- § 5 DDG (früher § 5 TMG), § 25 TDDDG, § 3 RDG, §§ 3a, 5, 7, 8, 13 UWG, § 35a GmbHG, § 37a HGB.
