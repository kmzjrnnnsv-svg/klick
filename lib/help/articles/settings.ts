import type { HelpArticle } from "../types";

// Einstellungen, SSO, Richtlinien-Portal, Integrationen, Datenschutz in Klick.

export const SETTINGS: HelpArticle[] = [
	{
		slug: "einstellungen",
		area: "settings",
		title: "Einstellungen",
		summary:
			"Dein Konto, Organisation, Rahmenwerke, Rollen, SSO, Richtlinien-Portal, Integrationen, Zugriffe durch Klick, Sicherheitsänderungen, Netzwerk, Verlauf, Abo und die Methoden für Freigaben, Audits, Risiken, Lieferanten und Nummernkreise.",
		sections: [
			{
				id: "konto",
				heading: "Dein Konto",
				list: [
					"Sicherheit: Passkeys anlegen und entfernen, Code-App (TOTP) als Alternative, laufende Sitzungen.",
					"Benachrichtigungen: welche Ereignisse per Mail kommen und ob als Tages-Mail.",
				],
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
					"Wähl den Anbieter: Microsoft Entra ID, Google Workspace, Okta oder ein anderer OIDC-Anbieter, oder SAML 2.0.",
					"Folg den Schritten für deinen Anbieter. Klick zeigt die Weiterleitungsadresse zum Kopieren; bei SAML die Metadaten von Klick.",
					"Bestätig die Domain per DNS-TXT-Eintrag.",
					"Teste die Verbindung.",
					"Leg die Regeln fest: welche Gruppe welche Rolle bekommt (Mitarbeitende, Lesend, Bearbeiter:in; nie Inhaber:in), die Standardrolle, ob die Firmen-MFA anerkannt wird und ob SSO erzwungen wird.",
				],
				body: [
					"Über einen Anbieter melden sich nur Adressen seiner bestätigten Domain an; eine fremde Adresse lehnt Klick ab, auch wenn der Anbieter sie meldet. Bei SAML nimmt Klick nur signierte Antworten mit SHA-256 oder stärker an, die zu einer eigenen Anfrage gehören (keine Anmeldung, die der Anbieter von sich aus startet).",
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
				id: "verlauf",
				heading: "Verlauf mit Bitcoin-Anker",
				body: [
					"Täglich und nach Zugriffen durch Klick oder Sicherheitsänderungen geht der Kopf der Prüfsummen-Kette deiner Organisation als Zeitstempel (OpenTimestamps) in die Bitcoin-Blockchain. Dort steht nur ein Hash, keine Inhalte. Nach einigen Stunden melden die Kalender einen Block; Klick zeigt ihn als bestätigt, sobald zwei Kalender ihn unabhängig melden.",
					"„Verlauf herunterladen“ liefert die Kette, jeden Anker mit Merkle-Pfad und Zeitstempel und ein Prüfskript. So prüfen Prüfer:innen ohne Klick, dass seit dem Anker nichts umgeschrieben wurde. Den Bitcoin-Block selbst gleicht das Skript mit deinem eigenen Knoten ab (--block), sonst meldet es ihn als nicht geprüft.",
					"Herunterladen dürfen Inhaber:innen und Prüfer:innen: Die Kette enthält zu jedem Eintrag IP-Adresse und Browser, weil beides zur Prüfsumme gehört.",
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
				id: "methoden",
				heading: "Methoden",
				list: [
					"Freigaben: Standard oder individuell, Abläufe je Auslöser, Vertretungen, Prüfung der Pflichten.",
					"Audits & Fristen: Turnus und Fristen je Rahmenwerk und Abweichungsklasse.",
					"Risikomethodik: Rechenweg, Stufen, Schadensarten, Klassen und Appetit.",
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
		related: ["anmeldung", "rollen-rechte", "freigaben"],
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
				heading: "Keine KI im Hintergrund",
				body: [
					"Klick verarbeitet deine Daten nicht mit KI. Vorschläge (Risiken, Maßnahmen, Messwerte) kommen aus festen Regeln und Katalogen.",
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
		related: ["rahmenwerke", "nachweise"],
	},
];
