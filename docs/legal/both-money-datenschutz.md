# both.money – Datenschutzerklärung (Entwurf zur Prüfung)

Stand: 24.10.2026. Der veröffentlichte Text steht in
`apps/wallet/lib/legal/privacy.ts` (Seite `/privacy`), Abschnitt 1
(Verantwortliche:r) kommt aus denselben `LEGAL_*`-Werten wie bei Klick
(`docs/legal/impressum.md`). Vor dem öffentlichen Start anwaltlich prüfen.

## Was der Text abdeckt

| Abschnitt | Inhalt | Prüfen |
|---|---|---|
| Rollen | both.money als Auftragsverarbeiter für Wallet-Daten der Organisation (Art. 28 DSGVO), eigene Verantwortung für Website, Konto, Protokolle | AV-Vertrag für both.money-Kund:innen fehlt noch; Abgrenzung bei der Betreiber-Org (eigene Bestände) |
| Hosting, Server-Protokolle | Hetzner (DE), Sicherungen ≤ 30 Tage, Webserver-Protokolle 14 Tage | Fristen gegen die echte Konfiguration (logrotate, Backup-Unit) prüfen |
| Cookies | `both.*` (Sitzung), `both_link` (≤ 30 min), `both_pending_invite` (Sitzungsspeicher) | § 25 Abs. 2 Nr. 2 TDDDG – ohne Einwilligung tragfähig? |
| Konto | Passkeys nur öffentlicher Schlüssel, Sitzungen mit IP/Browser, Protokoll verkettet | Aufbewahrung des Protokolls vs. Löschanspruch |
| Wallet-Daten | xpub, Adressen, Zahlungen, Stände über eigene Knoten; Sanktionslisten-Abgleich vor Gutschrift; öffentliche Blockchains nicht löschbar | Rechtsgrundlage Sanktionsprüfung (lit. c über GwG/AWV/EU-Sanktionsverordnungen?); Hinweis zur Unlöschbarkeit ausreichend? |
| Export an Klick | Ein-/Ausgänge, Tagesabschluss, Prüfungen, Auffälligkeiten an die gewählte Klick-Org | Empfänger-Konstellation (dieselbe Anbieterin, zwei Dienste); VVT beider Dienste ergänzen |
| E-Mails | Brevo (FR), Postfach Namecheap (USA, SCC) | Transfer Impact Assessment für Namecheap; Brevo-Domain both.money |
| Rechte, Aufsicht | Art. 15–21, Widerspruch, HBDI Wiesbaden | Zuständigkeit HBDI bei Sitz Frankfurt bestätigen |

## Offene Punkte

- Verdachtsmeldungen aus Sanktionstreffern (Export nach Klick) enthalten keine
  Personendaten; trotzdem Zweckbindung und Zugriff in Klick beschreiben.
- Kundengelder (Verwahrung mit CASP-Erlaubnis) sind nicht abgedeckt; bei
  Freischaltung neu fassen (KYC, Travel Rule, Aufbewahrung nach GwG).
- Markenrecherche „both.money“ vor öffentlicher Bewerbung.
