import type { HelpArticle } from "../types";

// Einstellungen, SSO, Richtlinien-Portal, Integrationen, Datenschutz in Klick.

export const SETTINGS: HelpArticle[] = [
	{
		slug: "einstellungen",
		area: "settings",
		title: "Einstellungen",
		summary:
			"Dein Konto, Organisation, Rahmenwerke, Rollen, SSO, Richtlinien-Portal, Integrationen, Abo und die Methoden für Freigaben, Audits, Risiken, Lieferanten und Nummernkreise.",
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
				tip: "Bevor du SSO erzwingst: Inhaber:innen behalten immer einen Notzugang per Passkey. Fällt der Anbieter aus, kommen sie trotzdem hinein; der Zugang wird protokolliert.",
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
					"Jede Abfrage läuft im Kontext deiner Organisation; die Datenbank selbst lässt nur Zeilen dieser Organisation durch. Zugriffe des Plattform-Betriebs sind begründet und protokolliert.",
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
					"Jede Änderung steht im Protokoll; die Einträge sind über eine Prüfsummen-Kette verbunden.",
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
			{ key: "dsgvo:Art.32", why: "Sicherheit der Verarbeitung." },
			{ key: "soc2:C1.1", why: "Vertrauliche Informationen schützen." },
		],
		related: ["rahmenwerke", "nachweise"],
	},
];
