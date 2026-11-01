# Datenschutzerklärung — Vorlage

> **Entwurf — anwaltlich prüfen.** Stand der Technik: 23.10.2026. Beschreibt, was Klick tatsächlich
> verarbeitet. Platzhalter `[…]` füllen; Abschnitte zu Funktionen, die auf dem Server nicht aktiv sind
> (z. B. Resend, Microsoft-Anmeldung, Fehlerberichte), weglassen. Als CMS-Seite
> `datenschutz-erklaerung` veröffentlichen.

---

# Datenschutzerklärung

Stand: [TT.MM.JJJJ]

## 1. Wer ist verantwortlich?

Verantwortlich für die Verarbeitung auf dieser Website und in der Plattform Klick, soweit wir selbst
über Zweck und Mittel entscheiden, ist:

[Firma, Rechtsform]
[Anschrift]
E-Mail: [Kontaktadresse aus dem Impressum]

[Datenschutzbeauftragte:r: Name/Kontakt — nur, wenn benannt oder nach § 38 BDSG verpflichtend.]

**Wenn deine Organisation Klick nutzt:** Für die Inhalte, die deine Organisation in Klick pflegt
(Risiken, Dokumente, Nachweise, Vorfälle, Personendaten im Team usw.), ist deine Organisation
verantwortlich. Wir verarbeiten diese Daten nur in ihrem Auftrag nach Art. 28 DSGVO
(Auftragsverarbeitungsvertrag). Fragen dazu richtest du am besten an deine Organisation.

## 2. Das Wichtigste vorab

- **Kein Tracking.** Keine Analyse-Werkzeuge, keine Werbe-Cookies, kein Session Replay, keine
  Social-Media-Plugins, keine eingebundenen Inhalte von Dritten.
- **Schriften liegen auf unserem Server.** Beim Aufruf werden keine Daten an Google oder andere
  Schriftanbieter übertragen.
- **Keine automatisierten Entscheidungen** nach Art. 22 DSGVO und keine Profilbildung.
- **Server in Deutschland** (Hetzner). E-Mails versenden wir über Brevo (EU, Frankreich).

## 3. Hosting

Website und Plattform laufen auf Servern der Hetzner Online GmbH, Industriestr. 25, 91710
Gunzenhausen [prüfen], in Rechenzentren in Deutschland. Hetzner verarbeitet die Daten als
Auftragsverarbeiter (Art. 28 DSGVO). Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO (Vertrag) und lit. f
(berechtigtes Interesse an einem sicheren, verfügbaren Betrieb).

## 4. Server-Protokolle und Schutz vor Angriffen

Beim Aufruf jeder Seite speichert unser Webserver (nginx): IP-Adresse, Datum und Uhrzeit, aufgerufene
Adresse, Statuscode, übertragene Datenmenge, Referrer und Browser-Kennung (User-Agent).

- **Zweck:** Betrieb, Fehlersuche, Abwehr von Angriffen. Eine lokal laufende Software (CrowdSec)
  wertet die Protokolle aus und sperrt Adressen, die angreifen (z. B. viele fehlgeschlagene
  Anmeldungen). [Falls die Teilnahme an der CrowdSec-Community-Blockliste eingeschaltet ist: Dabei
  werden IP-Adressen erkannter Angreifer an die CrowdSec SAS, Paris, übermittelt — prüfen oder
  abschalten.]
- **Rechtsgrundlage:** Art. 6 Abs. 1 lit. f DSGVO (Sicherheit unserer Systeme, Art. 32 DSGVO).
- **Speicherdauer:** 14 Tage, danach werden die Protokolle gelöscht. Sperren laufen nach höchstens
  [4 Stunden] ab.

## 5. Cookies und lokaler Speicher

Wir setzen nur Cookies und Einträge im lokalen Speicher, die für den Dienst technisch unbedingt
erforderlich sind (§ 25 Abs. 2 Nr. 2 TDDDG). Eine Einwilligung ist dafür nicht nötig, deshalb gibt es
kein Cookie-Banner.

| Name | Zweck | Dauer |
|---|---|---|
| `klick.session_token`, `klick.session_data` [Namen prüfen] | Anmeldung, Sitzung | höchstens 12 Stunden (Sitzung), Inaktivität 30 Minuten |
| `klick.two_factor` [prüfen] | Zweiter Faktor während der Anmeldung | wenige Minuten |
| `klick_reg` | Einladungs- oder Zurücksetz-Link gegen Passkey-Anlage tauschen | bis zur Anlage, höchstens 24 Stunden |
| `klick_blocked` | Hinweis „Konto gesperrt“ beim Anmelden | wenige Minuten |
| `klick_portal` | Zugang zum Lieferantenportal ohne Konto | bis zum Ablauf des Links |
| `kt_<name>` | Zugang zu freigegebenen Unterlagen eines Trust Centers | bis zum Ablauf der Freigabe |
| `theme` (lokaler Speicher) | Hell/Dunkel nach deiner Wahl | bis du ihn löschst |

## 6. Konto und Anmeldung

Wenn du ein Konto hast, verarbeiten wir: Name, E-Mail-Adresse, Rolle und Organisation, deine Passkeys
(nur der öffentliche Schlüssel und eine Kennung — biometrische Daten verlassen dein Gerät nie),
gegebenenfalls ein TOTP-Geheimnis (verschlüsselt) und Wiederherstellungscodes, Sitzungen mit
IP-Adresse und Browser-Kennung.

- **Zweck:** Anmeldung, Schutz deines Kontos (u. a. Hinweis-Mail bei Anmeldung von einem neuen Gerät),
  Nachvollziehbarkeit von Änderungen.
- **Rechtsgrundlage:** Art. 6 Abs. 1 lit. b DSGVO (Nutzungsvertrag deiner Organisation), lit. f
  (Kontosicherheit) und lit. c (Aufzeichnungspflichten deiner Organisation, z. B. § 8 GwG).
- **Speicherdauer:** Konto bis zur Löschung; abgelaufene Sitzungen 30 Tage, Anmelde-Codes 1 Tag,
  Zähler gegen Missbrauch 7 Tage, gelesene Benachrichtigungen 180 Tage, ungelesene ein Jahr. Das Änderungsprotokoll
  (Audit-Log mit IP-Adresse und Browser-Kennung) ist manipulationssicher verkettet und bleibt so lange
  erhalten, wie die Aufbewahrungspflichten deiner Organisation es verlangen (Löschkonzept der
  Organisation), längstens bis zur Löschung der Organisation.

**Anmeldung mit Microsoft oder über das Single Sign-On deiner Organisation** [nur, wenn aktiviert]:
Wählst du diesen Weg, leitet dein Browser dich zu Microsoft (Microsoft Ireland Operations Ltd.) bzw.
zum Anmeldedienst deiner Organisation weiter. Wir erhalten Name, E-Mail-Adresse und eine Kennung.
Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO.

## 7. E-Mails

Wir versenden nur Mails, die zum Dienst gehören (Anmelde- und Einladungslinks, Benachrichtigungen,
Zusammenfassungen), keine Werbung und keinen Newsletter.

- **Dienstleister:** Brevo (Sendinblue SAS, 106 boulevard Haussmann, 75008 Paris, Frankreich
  [prüfen]) als Auftragsverarbeiter. [Nur, wenn eingeschaltet: Resend, Inc., USA — Übermittlung auf
  Grundlage des EU-US Data Privacy Framework bzw. Standardvertragsklauseln, prüfen.]
- **Rechtsgrundlage:** Art. 6 Abs. 1 lit. b DSGVO.
- **Speicherdauer beim Dienstleister:** [laut Vertrag mit Brevo, prüfen].

## 8. Anfrageformular

Wenn du uns über das Formular schreibst, verarbeiten wir: Name, E-Mail-Adresse, Unternehmen, die
gewünschte Leistung und deine Nachricht. Deine IP-Adresse speichern wir nicht, nur einen nicht
umkehrbaren Prüfwert (HMAC), um Missbrauch zu begrenzen (höchstens fünf Anfragen je 10 Minuten).

- **Zweck:** deine Anfrage beantworten, ein Angebot machen.
- **Rechtsgrundlage:** Art. 6 Abs. 1 lit. b DSGVO (vorvertragliche Maßnahmen), sonst lit. f.
- **Speicherdauer:** 12 Monate nach der letzten Bearbeitung, dann automatische Löschung — es sei denn,
  daraus wird ein Vertrag; dann gelten die gesetzlichen Aufbewahrungsfristen (§ 257 HGB, § 147 AO).
- An die angegebene Adresse schicken wir keine automatische Mail.

## 9. Trust Center von Organisationen

Organisationen können unter `/vertrauen/<name>` eine öffentliche Seite betreiben. Wenn du dort
Unterlagen unter Geheimhaltung (NDA) anforderst, verarbeiten wir Name, E-Mail-Adresse, Unternehmen,
Zweck, deine Zustimmung zur angezeigten NDA-Fassung und einen Prüfwert deiner IP-Adresse (HMAC).

- **Verantwortlich** ist die Organisation, deren Trust Center du nutzt; wir verarbeiten in ihrem
  Auftrag. Zugriffe auf freigegebene Unterlagen werden für die Organisation protokolliert.
- **Speicherdauer:** 12 Monate nach der Entscheidung bzw. nach Ablauf der Freigabe, dann
  automatische Löschung.

## 10. Lieferantenportal

Lieferant:innen, die per Link einen Fragebogen einer Organisation beantworten, brauchen kein Konto.
Antworten und hochgeladene Dateien gehören zur jeweiligen Organisation; wir verarbeiten sie in deren
Auftrag. Zugriffe werden protokolliert.

## 11. Hochgeladene Dateien

Dateien werden beim Hochladen auf Typ und Geheimnisse (z. B. Zugangsschlüssel) geprüft[, auf
Schadsoftware durch einen Virenscanner auf unserem Server — nur angeben, wenn clamd eingerichtet ist]
und verschlüsselt mit einem eigenen Schlüssel je Organisation gespeichert. Gelöschte Dateien
verschwinden nach höchstens 30 Tagen auch aus den Sicherungen.

## 12. Fehlerberichte

[Nur, wenn eingerichtet:] Bei Programmfehlern sendet die Plattform einen bereinigten Bericht (ohne
Formularinhalte, E-Mail-Adressen oder Zugangsdaten) an eine eigene GlitchTip-Instanz auf unserem
Server. Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO. Speicherdauer: [90 Tage, prüfen].

## 13. Wallet-Bereich

Organisationen, die den Wallet-Bereich einschalten, beobachten eigene Konten auf Blockchains über
unsere eigenen Knoten; dabei geben wir keine Daten an Dritte. Adressen und Zahlungen auf öffentlichen
Blockchains sind für alle einsehbar und können nicht gelöscht werden. Eingehende Zahlungen werden mit
einer Liste gesperrter Adressen (OFAC) abgeglichen. Verantwortlich ist die jeweilige Organisation.

## 14. Empfänger und Übermittlung in Drittländer

Empfänger sind nur die genannten Auftragsverarbeiter (Hetzner, Brevo[, Resend]) und — bei Inhalten
einer Organisation — deren berechtigte Mitglieder, Prüfer:innen und Berater:innen. Eine Übermittlung
in Länder außerhalb der EU findet nur statt, wenn oben ausdrücklich genannt.

## 15. Deine Rechte

Du hast das Recht auf Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung
(Art. 18), Datenübertragbarkeit (Art. 20) und Widerruf einer Einwilligung (Art. 7 Abs. 3), soweit wir
eine eingeholt haben.

**Widerspruchsrecht (Art. 21 DSGVO):** Verarbeiten wir Daten auf Grundlage von Art. 6 Abs. 1 lit. f,
kannst du aus Gründen, die sich aus deiner besonderen Situation ergeben, jederzeit widersprechen.

Du kannst dich bei einer Datenschutz-Aufsichtsbehörde beschweren, etwa bei der für unseren Sitz
zuständigen: [Landesbeauftragte:r für Datenschutz, Anschrift — je Bundesland].

## 16. Minderjährige

Klick richtet sich ausschließlich an Unternehmen. Personen unter 18 Jahren dürfen kein Konto anlegen
und keine Anfragen stellen. Wir erheben wissentlich keine Daten von Kindern.

## 17. Pflicht zur Bereitstellung

Für ein Konto brauchen wir Name und E-Mail-Adresse, für das Formular eine Kontaktmöglichkeit. Ohne
diese Angaben können wir den Dienst nicht erbringen bzw. die Anfrage nicht beantworten.

## 18. Änderungen

Wir passen diese Erklärung an, wenn sich die Verarbeitung ändert. Es gilt die hier veröffentlichte
Fassung.
