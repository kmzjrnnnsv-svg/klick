import type { HelpArticle } from "../types";

// Einstellungen, SSO, KI, Richtlinien-Portal, Integrationen, Datenschutz in Klick.

export const SETTINGS: HelpArticle[] = [
	{
		slug: "einstellungen",
		area: "settings",
		title: "Einstellungen",
		summary:
			"Fünf Gruppen: Dein Konto, Organisation & Team, Sicherheit & Zugang, Verbindungen sowie Methoden & Abläufe. Das Suchfeld oben findet jeden Bereich.",
		sections: [
			{
				id: "gruppen",
				heading: "So sind die Einstellungen geordnet",
				list: [
					"Dein Konto: Anmeldung & Passkeys, Benachrichtigungen.",
					"Organisation & Team: Organisation, Rahmenwerke & Stufe, Rollen & Rechte, Abo & Leistungen.",
					"Sicherheit & Zugang: SSO, Netzwerk, Zugriffe durch Klick, Sicherheitsänderungen, Verlauf.",
					"Verbindungen: Integrationen, Richtlinien-Portal, KI.",
					"Methoden & Abläufe: Freigaben, Audits & Fristen, Risikomethodik, Lieferantenbewertung, Nummernkreise.",
				],
				tip: "Tipp ins Suchfeld über der Liste, zum Beispiel „Passkey“, „IP“ oder „SAML“. Unter jedem Bereich steht ein Satz, was er regelt. Rollen & Rechte meint, was Personen in Klick tun dürfen; Funktionen wie ISB oder GWB besetzt du unter Organisation.",
			},
			{
				id: "konto",
				heading: "Dein Konto",
				list: [
					"Anmeldung & Passkeys: Passkeys anlegen und entfernen, Code-App (TOTP) als Alternative, laufende Sitzungen. Die Liste zeigt je Passkey „Sicherheitsschlüssel“ (gerätegebunden) oder „Synchronisiert“.",
					"Benachrichtigungen: je Art per Mail, als Push auf deinen Geräten und in Microsoft Teams, auch mehrere Wege zugleich (Teams nur, wenn deine Organisation es eingeschaltet hat), und ob die Tages-Mail kommt.",
				],
			},
			{
				id: "push",
				heading: "Push auf deinen Geräten",
				steps: [
					"Öffne Einstellungen > Benachrichtigungen auf dem Gerät, das Hinweise bekommen soll, und tipp auf „Push einschalten“. Der Browser fragt einmal, ob Klick dir Mitteilungen schicken darf.",
					"Auf dem iPhone und iPad füge Klick zuerst über Teilen > Zum Home-Bildschirm hinzu und öffne es von dort. Safari im Browserfenster kann keine Push-Mitteilungen empfangen.",
					"Wähl je Art, ob sie per Mail, Push oder Teams kommt. Beim ersten Gerät wählt Klick Push für alle Arten vor.",
					"Mit „Testhinweis senden“ prüfst du, ob alles ankommt. Ein Gerät, das du nicht mehr nutzt, entfernst du in der Liste.",
				],
				tip: "Klick schickt nur Titel und Link, verschlüsselt über den Push-Dienst deines Browsers (Apple, Google, Mozilla oder Microsoft). Kommt ein Hinweis dreimal nicht an, geht er per Mail. Blockierte Mitteilungen erlaubst du in den Einstellungen des Browsers bzw. des Systems.",
			},
			{
				id: "organisation",
				heading: "Organisation",
				list: [
					"Stammdaten: Name, Rechtsform, Sitz, LEI, zuständige Behörde, Kennzahlen für die Einstufung.",
					"Rahmenwerke & Stufe: Rahmenwerke wählen, Lizenzstufe und Kryptowerte-Dienste. Ein Stufenwechsel zeigt vorher, was sich ändert.",
					"Rollen & Rechte: eigene Rollen (im individuellen Modus) mit Rechten aus dem Katalog.",
					"Abo & Leistungen: deine Konditionen und Empfehlungen; Leistungen direkt anfragen.",
					"Organisation löschen: nur Inhaber:innen, mit Bestätigung und Abtippen des Kurznamens. Alles wird unwiderruflich gelöscht.",
				],
			},
			{
				id: "sso",
				heading: "Anmeldung mit dem Firmenkonto (SSO)",
				steps: [
					"Wähl den Anbieter: Microsoft Entra ID, Google Workspace, Okta oder ein anderer OIDC-Anbieter, oder SAML 2.0. Bei SAML wählst du noch den Anbieter (Entra ID, Google, Okta, ADFS, JumpCloud, OneLogin oder andere).",
					"Trag die Domain ein. Klick schlägt die Kennung vor und zeigt die Werte für den Anbieter zum Kopieren, bei SAML auch die Metadaten von Klick als Datei.",
					"Gib bei SAML die Metadaten des Anbieters an: als Adresse (Klick holt sie selbst), als Datei oder von Hand. „Prüfen“ zeigt, was Klick daraus liest, und wie lange das Zertifikat gilt.",
					"Bestätig die Domain per DNS-TXT-Eintrag.",
					"Teste die Anmeldung mit „Mit meinem Firmenkonto testen“. Klick zeigt, was ankam (E-Mail, Name, Gruppen, Mehr-Faktor, Rolle), und legt dabei kein Konto und keine Sitzung an.",
					"Leg die Regeln fest: welche Gruppe welche Rolle bekommt (Mitarbeitende, Lesend, Bearbeiter:in; nie Inhaber:in), die Standardrolle, ob die Firmen-MFA anerkannt wird und ob SSO erzwungen wird.",
				],
				body: [
					"Über einen Anbieter melden sich nur Adressen seiner bestätigten Domain an; eine fremde Adresse lehnt Klick ab, auch wenn der Anbieter sie meldet. Bei SAML nimmt Klick nur signierte Antworten mit SHA-256 oder stärker an, die zu einer eigenen Anfrage gehören (keine Anmeldung, die der Anbieter von sich aus startet).",
					"Hat jemand anderes Zugang zum Anbieter, schickst du unter „Die IT einbinden“ ein Blatt als PDF oder einen Link. Über den Link sieht die IT nur die Werte dieser Verbindung und schickt die Metadaten zurück; anlegen tust du.",
					"Mit Metadaten-Adresse prüft Klick jeden Tag, ob der Anbieter ein neues Zertifikat hat. Ein neues Zertifikat wird nie von selbst übernommen: Du übernimmst es, eine zweite Person stimmt zu (sonst wirkt es nach 24 Stunden). 30 und 7 Tage vor dem Ablauf erinnert Klick.",
				],
				tip: "Bevor du SSO erzwingst: Inhaber:innen behalten immer einen Notzugang per Passkey. Fällt der Anbieter aus, kommen sie trotzdem hinein; der Zugang wird protokolliert.",
			},
			{
				id: "zugriffe",
				heading: "Zugriffe durch Klick",
				body: [
					"Der Klick-Betrieb sieht Inhalte deiner Organisation nur mit eurer Freigabe: Er stellt einen Antrag mit Grund und Dauer, Inhaber:innen oder die Geschäftsleitung geben ihn frei oder lehnen ihn ab. Die Freigabe läuft ab und lässt sich jederzeit widerrufen. Nur bei einem Sicherheitsvorfall oder einer behördlichen Anordnung darf der Betrieb sofort zugreifen, höchstens vier Stunden; ihr werdet sofort informiert und bekommt binnen 24 Stunden einen Bericht.",
				],
			},
			{
				id: "sicherheitsaenderungen",
				heading: "Sicherheitsänderungen",
				body: [
					"Kritische Einstellungen wirken erst mit einer zweiten Person: SSO erzwingen oder lockern, Datenschutz-Regeln für Uploads lockern, die IP-Liste ändern, die Organisation löschen, einen Vollexport ziehen, einen Zugang zurücksetzen, Token anlegen und Inhaber:innen ernennen.",
				],
				list: [
					"Zustimmen darf eine andere Inhaber:in oder die Geschäftsleitung, jeweils mindestens 24 Stunden in dieser Rolle.",
					"Gibt es niemanden, wirkt die Änderung nach 24 Stunden; bis dahin kann jede Inhaber:in abbrechen.",
					"Eine Erlaubnis (zum Beispiel für den Vollexport) gilt einmal und nur für die Person, die sie beantragt hat.",
				],
			},
			{
				id: "netzwerk",
				heading: "Netzwerk",
				steps: [
					"Trag die Netze ein, aus denen deine Organisation arbeitet (Büro, VPN), mit einer Beschreibung. „Meine Adresse hinzufügen“ übernimmt die aktuelle.",
					"Leg bei Bedarf eine eigene Liste für Prüfer:innen und Berater:innen fest.",
					"Nimm einzelne Bereiche aus, die von außen erreichbar bleiben sollen: Lieferantenportal, Trust Center, Richtlinien-Portal, Scan-Import, both.money.",
					"Prüf mit der Probe, was eine Adresse darf, und beantrag die Änderung.",
				],
				tip: "Klick lässt die Liste nur speichern, wenn deine eigene Adresse danach noch hineinkommt. Sperrt ihr euch doch aus, setzt der Klick-Betrieb die Liste nach Rückruf am Terminal zurück.",
			},
			{
				id: "standort",
				heading: "Standort-Tunnel",
				body: [
					"Mit einem Standort-Tunnel ist euer Büro über eine verschlüsselte Verbindung (IPsec oder WireGuard) mit Klick verbunden. Im Tunnel ist Klick unter einer eigenen Adresse erreichbar; aus dem Tunnel geht nur HTTPS an Klick, sonst nichts.",
					"Einrichten und abbauen macht der Klick-Betrieb, frag dort an. Danach siehst du hier den Stand (wartet, verbunden, getrennt) und stellst eurer IT einen Link und ein Blatt aus: mit den Werten, den Schritten für eure Firewall und dem Schlüssel. Jeder Abruf des Schlüssels steht im Verlauf.",
				],
				steps: [
					"Stell der IT unter „Link für die IT“ einen Link aus (14 Tage gültig; ein neuer sperrt den alten) und gib ihr das Blatt.",
					"Die IT richtet die Firewall ein und trägt im internen DNS ein, dass der Name von Klick auf die Adresse im Tunnel zeigt.",
					"Steht der Tunnel, meldet Klick „verbunden“ und schickt dir eine Mitteilung.",
					"Soll Klick nur noch aus dem Büro gehen, übernimm unter „Nur aus dem Büro“ die Netze des Standorts in die IP-Liste und beantrag die Änderung. Das geht nur aus dem Büro selbst.",
				],
				tip: "Bricht der Tunnel länger als zehn Minuten ab, bekommen die Inhaber:innen Bescheid. Gilt die IP-Liste nur für den Standort, kommt bis dahin aus dem Büro niemand in Klick.",
			},
			{
				id: "verlauf",
				heading: "Verlauf mit Bitcoin-Anker",
				body: [
					"Täglich und nach Zugriffen durch Klick oder Sicherheitsänderungen geht der Kopf der Prüfsummen-Kette deiner Organisation als Zeitstempel (OpenTimestamps) in die Bitcoin-Blockchain. Dort steht nur ein Hash, keine Inhalte. Nach einigen Stunden melden die Kalender einen Block; Klick zeigt ihn als bestätigt, sobald zwei Kalender ihn unabhängig melden.",
					"„Verlauf herunterladen“ liefert die Kette, jeden Anker mit Merkle-Pfad und Zeitstempel und ein Prüfskript. So prüfen Prüfer:innen ohne Klick, dass seit dem Anker nichts umgeschrieben wurde. Den Bitcoin-Block selbst gleicht das Skript mit deinem eigenen Knoten ab (--block), sonst meldet es ihn als nicht geprüft.",
					"Herunterladen dürfen Inhaber:innen und Prüfer:innen: Die Kette enthält zu jedem Eintrag IP-Adresse und Browser, weil beides zur Prüfsumme gehört.",
				],
			},
			{
				id: "ki",
				heading: "KI",
				body: [
					"Hier richtest du die KI deiner Organisation ein, sobald Klick sie freigeschaltet hat: Anbieter, Modell und API-Schlüssel, die Funktionen und bis zu welcher Einstufung Inhalte hinausgehen dürfen. Einschalten und Lockern bestätigt eine zweite Person. Mehr unter „KI mit eigenem Schlüssel“.",
				],
			},
			{
				id: "portal",
				heading: "Richtlinien-Portal",
				body: [
					"Hier schaltest du das Portal für Mitarbeitende ohne Konto ein, wählst seine Adresse, die erlaubten E-Mail-Domains (per DNS-TXT oder über eine SSO-Domain bestätigt) und wie lange eine Anmeldung gilt. Die Liste zeigt, wer das Portal genutzt hat, und erlaubt, einen Zugang zu beenden.",
				],
			},
			{
				id: "integrationen",
				heading: "Integrationen",
				list: [
					"CI-Zugänge für Scan- und SBOM-Import mit Token; das Token siehst du einmal.",
					"both.money verbinden.",
					"Jeder Zugang lässt sich erneuern oder widerrufen.",
				],
			},
			{
				id: "teams",
				heading: "Microsoft Teams",
				steps: [
					"Unter Einstellungen > Integrationen > Microsoft Teams lädst du das App-Paket herunter und gibst es deiner IT. Sie lädt es im Teams Admin Center hoch.",
					"Trag die Tenant-ID deines Microsoft 365 ein (mit Entra-SSO ist sie vorbelegt) und schick den Freigabe-Link an eine Person mit Administratorrechten. Sie stimmt bei Microsoft zu.",
					"Nach der Freigabe schaltest du Teams ein und schickst dir einen Testhinweis.",
					"Jede Person wählt unter Einstellungen > Benachrichtigungen, welche Arten in Teams kommen.",
				],
				tip: "An Microsoft gehen nur der Titel und der Link zur Seite in Klick, keine Inhalte. Freigeben und Unterschreiben bleiben in Klick mit Passkey. Klappt die Zustellung dreimal nicht, kommt die Nachricht per Mail.",
			},
			{
				id: "methoden",
				heading: "Methoden",
				list: [
					"Freigaben: Standard oder individuell, Abläufe je Auslöser, Vertretungen, Prüfung der Pflichten. Oben die Regel „Unterschriften nur mit Sicherheitsschlüssel“: dann zählen für Unterschriften nur gerätegebundene Schlüssel wie ein YubiKey, Passkeys aus iCloud, Google oder einem Passwortmanager nur noch für die Anmeldung. Einschalten wirkt sofort, Ausschalten braucht eine zweite Person.",
					"Audits & Fristen: Turnus und Fristen je Rahmenwerk und Abweichungsklasse.",
					"Risikomethodik: Rechenweg oder Matrix, vier oder fünf Stufen, Schadensarten, Klassen und Appetit; Vorlage „BSI-Standard 200-3“.",
					"Lieferantenbewertung: Kriterien, Gewichte und Wiedervorlage.",
					"Nummernkreise: Präfixe und Zähler für Dokumente.",
				],
			},
		],
		roles: [
			"Die meisten Einstellungen ändern nur Inhaber:innen, mit Bestätigung.",
			"Mitarbeitende sehen nur „Dein Konto“.",
		],
		norms: [
			{
				key: "iso27001:A.5.16",
				why: "Identitäten zentral verwalten (SSO, Gruppen).",
			},
			{ key: "iso27001:A.8.5", why: "Sichere Authentisierung." },
			{ key: "soc2:CC6.2", why: "Registrierung und Berechtigung von Konten." },
			{ key: "dora:Art.9(4)(d)", why: "Starke Authentisierung." },
			{
				key: "iso27001:A.5.15",
				why: "Zugriffssteuerung, auch für den Betrieb.",
			},
			{ key: "iso27001:A.8.20", why: "Netzwerksicherheit (IP-Liste)." },
			{
				key: "dora:Art.9(4)(c)",
				why: "Zugriffsrechte auf das Nötige beschränken.",
			},
		],
		related: ["anmeldung", "rollen-rechte", "freigaben", "ki"],
	},
	{
		slug: "ki",
		area: "settings",
		title: "KI mit eigenem Schlüssel",
		summary:
			"Fassungen zusammenfassen, Dokumente entwerfen, Nachweise prüfen und Fragen an die Hilfe stellen: mit dem KI-Anbieter deiner Organisation und nur, wenn du es antippst.",
		sections: [
			{
				id: "grundsatz",
				heading: "So arbeitet Klick mit KI",
				body: [
					"Klick nutzt eine KI nur mit dem API-Schlüssel deiner Organisation und nur, wenn du einen KI-Knopf antippst; im Hintergrund läuft nichts. Die Antwort ist immer ein Vorschlag mit Anbieter und Modell. Übernommen wird sie nur, wenn du sie selbst übernimmst (in den Editor, als Änderungsnotiz oder als Kommentar); danach gelten Speichern, Freigabe und Unterschrift wie sonst.",
					"Vor dem Senden entfernt Klick Zugangsschlüssel, Karten- und Kontonummern, Steuer-IDs, E-Mail-Adressen und Telefonnummern. Jeder Aufruf steht im Verlauf deiner Organisation mit Funktion, Anbieter, Modell, Zeichenzahl und Ergebnis, nie mit Inhalten.",
				],
			},
			{
				id: "einrichten",
				heading: "Einrichten",
				steps: [
					"Klick schaltet die KI für deine Organisation frei und legt fest, bis zu welcher Einstufung Inhalte hinausgehen dürfen und ob die KI auch Dateien liest. Frag dafür unter Einstellungen > Abo & Leistungen an.",
					"Unter Einstellungen > KI wählst du den Anbieter: Anthropic (Claude), Google (Gemini), OpenAI, Microsoft (Azure OpenAI), Mistral oder einen Dienst mit OpenAI-kompatibler Adresse, zum Beispiel IONOS AI Model Hub oder STACKIT.",
					"Trag den API-Schlüssel ein. Klick speichert ihn verschlüsselt und zeigt danach nur die letzten vier Zeichen.",
					"Teste die Verbindung; dabei gehen keine Inhalte deiner Organisation hinaus.",
					"Wähl die Funktionen und bis zu welcher Einstufung Inhalte an die KI dürfen, bestätige den Vertrag mit dem Anbieter und speichere die Regel.",
					"Eine zweite Person (Inhaber:in oder Geschäftsleitung) stimmt unter Einstellungen > Sicherheitsänderungen zu. Gibt es niemanden, wirkt die Regel nach 24 Stunden.",
				],
				tip: "Ausschalten, Verschärfen und „Schlüssel entfernen“ wirken sofort.",
			},
			{
				id: "funktionen",
				heading: "Die vier Funktionen",
				list: [
					"Fassungen zusammenfassen: an den Änderungen eines Dokuments oder Nachweises „Mit KI zusammenfassen“. Die KI sagt, was neu, entfallen oder inhaltlich anders ist und welche Folgen das haben kann. Im Entwurf übernimmst du das Ergebnis nach dem Bearbeiten als Änderungsnotiz.",
					"Dokument entwerfen: im Editor eines Entwurfs „Mit KI entwerfen“. Grundlage sind die Vorlage, die verknüpften Controls mit ihren Anforderungen und dein Firmenprofil (Branche, Größe, Rahmenwerke), keine anderen Dokumente und keine Namen. Was die KI nicht weiß, steht als Platzhalter in eckigen Klammern.",
					"Nachweis prüfen: auf der Seite eines Nachweises „Mit KI prüfen“. Die KI sagt je Anforderung der verknüpften Controls, ob sie erkennbar belegt ist und was fehlt; das Ergebnis speicherst du auf Wunsch als Kommentar. Ob der Nachweis genügt, entscheidest du.",
					"Fragen an die Hilfe: auf der Hilfe-Seite „Frage stellen“. An die KI gehen nur deine Frage und die passenden Hilfe-Artikel, keine Daten deiner Organisation; die Artikel stehen als Links unter der Antwort.",
				],
			},
			{
				id: "inhalte",
				heading: "Welche Inhalte hinausgehen",
				list: [
					"Nur bis zu der Einstufung, die Klick und deine Organisation erlauben; es gilt die strengere Grenze.",
					"Streng geheime Inhalte gehen nie an eine KI.",
					"Vertrauliche Inhalte erst nach frischer Bestätigung mit Passkey, wie beim Anzeigen und Herunterladen.",
					"Dateien selbst (zum Beispiel ein eingescanntes PDF) nur im Modus „KI vergleicht auch“, nur bei Anbietern, die Dateien lesen, und nie, wenn die Datei Zugangsdaten, Zahlungs- oder Bankdaten enthält.",
					"Prüfer:innen und Berater:innen ohne „Entwürfe und Verlauf“ sehen an Dokumenten und Nachweisen keine KI-Knöpfe.",
				],
			},
		],
		roles: [
			"Freischalten: der Klick-Betrieb, je Organisation.",
			"Anbieter, Schlüssel und Regel: Inhaber:innen, mit Bestätigung und zweiter Person.",
			"Nutzen: wer den Inhalt sehen darf; entwerfen nur, wer Dokumente bearbeiten darf; Fragen an die Hilfe auch Mitarbeitende.",
		],
		automation: [
			"Klick ruft die KI nie von selbst auf.",
			"Je Organisation höchstens 30 Aufrufe in 10 Minuten.",
		],
		faq: [
			{
				q: "Wer trägt die Kosten?",
				a: "Deine Organisation, über den eigenen Schlüssel beim Anbieter. Klick rechnet KI nicht ab.",
			},
			{
				q: "Lernt der Anbieter aus den Daten deiner Organisation?",
				a: "Das regelt dein Vertrag mit dem Anbieter. Klick verlangt beim Einschalten die Bestätigung, dass ein Auftragsverarbeitungsvertrag besteht und die Daten nicht zum Training genutzt werden (bezahlte API-Stufe). Die kostenlose Stufe von Gemini nutzt Eingaben zum Training.",
			},
			{
				q: "Kann eine Anweisung in einem Dokument die KI steuern?",
				a: "Inhalte gehen getrennt von der Aufgabe als Daten an die KI, mit der Regel, Anweisungen darin nicht zu befolgen. Die KI hat keine Werkzeuge und kann in Klick nichts ändern; ihre Antwort ist nur Text, den du liest und selbst übernimmst.",
			},
		],
		norms: [
			{ key: "dsgvo:Art.28", why: "Der KI-Anbieter verarbeitet im Auftrag." },
			{ key: "dsgvo:Art.32", why: "Schwärzen und Begrenzen vor dem Senden." },
			{
				key: "iso27001:A.5.23",
				why: "Informationssicherheit bei Cloud-Diensten.",
			},
			{ key: "dora:Art.28(1-2)", why: "Risiko aus IKT-Drittdienstleistern." },
		],
		related: ["einstellungen", "datensicherheit", "fassungen"],
	},
	{
		slug: "datensicherheit",
		area: "settings",
		title: "Wie Klick deine Daten schützt",
		summary:
			"Mandantentrennung, Verschlüsselung, Protokoll, Uploads, Backups und Löschung: was hinter den Kulissen passiert.",
		sections: [
			{
				id: "trennung",
				heading: "Trennung der Organisationen",
				body: [
					"Jede Abfrage läuft im Kontext deiner Organisation; die Datenbank selbst lässt nur Zeilen dieser Organisation durch. Der Plattform-Betrieb sieht Inhalte nur mit eurer Freigabe (Zugriffe durch Klick); jeder Zugriff steht in eurem Protokoll.",
					"Die Verwaltung der Plattform ist nur über ein eigenes Admin-Netz (WireGuard) erreichbar. Deine Organisation kann den Zugang zusätzlich auf ihre Netze beschränken (Netzwerk).",
				],
			},
			{
				id: "verschluesselung",
				heading: "Verschlüsselung",
				list: [
					"Dateien und sensible Felder (zum Beispiel Eignung, wirtschaftlich Berechtigte, Hinweise) werden mit einem eigenen Schlüssel deiner Organisation verschlüsselt.",
					"Dieser Schlüssel ist selbst mit einem Hauptschlüssel geschützt, der regelmäßig erneuert werden kann.",
					"Löschst du die Organisation, wird ihr Schlüssel vernichtet.",
				],
			},
			{
				id: "uploads",
				heading: "Uploads",
				body: [
					"Fremde Dateien öffnet nie der App-Prozess selbst. Ein abgeschotteter Prozess ohne Netz prüft Typ und Inhalt, ein Virenscanner prüft zusätzlich; schlägt eine Prüfung fehl, wird die Datei abgelehnt.",
				],
			},
			{
				id: "protokoll",
				heading: "Protokoll und Backups",
				list: [
					"Jede Änderung steht im Protokoll; die Einträge sind über eine Prüfsummen-Kette verbunden. Der Kopf der Kette wird regelmäßig in der Bitcoin-Blockchain verankert (Verlauf), ohne Inhalte.",
					"Datenbank und Dateien werden täglich gesichert und die Sicherungen geprüft.",
					"Gelöschte Dateien verschwinden erst nach Ablauf der Backup-Frist endgültig.",
				],
			},
			{
				id: "ki",
				heading: "KI nur mit eurem Schlüssel und auf Klick",
				body: [
					"Klick verarbeitet deine Daten nicht im Hintergrund mit KI. Vorschläge (Risiken, Maßnahmen, Messwerte) kommen aus festen Regeln und Katalogen.",
					"Eine KI nutzt Klick nur, wenn deine Organisation sie mit eigenem Schlüssel eingerichtet hat und jemand einen KI-Knopf antippt. Vorher entfernt Klick Zugangsdaten, Konten- und Kontaktdaten; streng geheime Inhalte gehen nie hinaus, und jeder Aufruf steht im Protokoll, ohne Inhalte.",
				],
			},
		],
		norms: [
			{ key: "iso27001:A.8.24", why: "Verwendung von Kryptographie." },
			{ key: "iso27001:A.8.13", why: "Sicherung von Informationen." },
			{ key: "iso27001:A.8.15", why: "Protokollierung." },
			{ key: "iso27001:A.8.20", why: "Netzwerksicherheit." },
			{
				key: "nis2:Art.21(2)(i)",
				why: "Zugriffskontrolle und Anlagenverwaltung.",
			},
			{ key: "dsgvo:Art.32", why: "Sicherheit der Verarbeitung." },
			{ key: "soc2:C1.1", why: "Vertrauliche Informationen schützen." },
		],
		related: ["rahmenwerke", "nachweise", "ki"],
	},
];
