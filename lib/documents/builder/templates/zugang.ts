import type { PolicyBuilder } from "../types";

// Zugangs- und Berechtigungsrichtlinie (RL-ZUGANG). Inhalte nach
// ISO 27001 A.5.15 bis A.5.18, A.8.2, A.8.5, BSI ORP.4, DORA Art. 9
// Abs. 4 c/d, NIS2 Art. 21 Abs. 2 i/j; vor dem Verkauf fachlich prüfen
// (CLAUDE.md, Offene Punkte).

export const ZUGANG: PolicyBuilder = {
	code: "RL-ZUGANG",
	version: 1,
	sections: [
		{
			id: "zweck",
			heading: "Zweck und Geltungsbereich",
			questions: [],
			blocks: [
				{
					kind: "p",
					text: "Diese Richtlinie regelt, wie {{org}} Zugänge zu Informationen und Systemen vergibt, schützt, überprüft und entzieht.",
				},
				{
					kind: "p",
					text: "Die Richtlinie gilt für alle Konten: Konten von Beschäftigten und externen Mitarbeitenden, administrative Konten sowie technische Konten von Anwendungen und Diensten. Eigene Systeme und Cloud-Dienste sind gleichermaßen erfasst.",
				},
			],
		},
		{
			id: "grundsaetze",
			heading: "Grundsätze",
			questions: [
				{
					key: "verantwortung",
					kind: "function",
					label:
						"Welche Funktion pflegt das Berechtigungskonzept und überwacht diese Richtlinie?",
					help: "Meist die oder der Informationssicherheitsbeauftragte. Konten einrichten und sperren kann trotzdem der IT-Betrieb.",
					gap: "verantwortliche Funktion",
					suggest: "isb_ciso",
				},
				{
					key: "rollenmodell",
					kind: "choice",
					label: "Wie werden Rechte vergeben?",
					help: "Bei einem Rollenkonzept bekommt eine Person die Rechte ihrer Rolle, zum Beispiel „Buchhaltung“. Das ist leichter zu prüfen als Einzelrechte.",
					gap: "Vergabe von Rechten",
					options: [
						{
							value: "rollen",
							label: "Über ein Rollenkonzept",
							text: "über festgelegte Rollen aus dem Berechtigungskonzept vergeben. Einzelrechte außerhalb der Rollen sind eine begründete Ausnahme",
						},
						{
							value: "einzeln",
							label: "Einzeln je Person",
							text: "einzeln je Person und System vergeben; jede Vergabe wird mit Begründung dokumentiert",
						},
					],
					recommended: "rollen",
				},
			],
			blocks: [
				{ kind: "p", text: "Für alle Zugänge gelten diese Grundsätze:" },
				{
					kind: "ul",
					items: [
						"Need-to-know: Zugriff gibt es nur auf Informationen, die für die Aufgabe nötig sind.",
						"Minimale Rechte: Jedes Konto hat nur die Rechte, die es für seine Aufgabe braucht.",
						"Standard ist kein Zugriff: Jedes Recht wird ausdrücklich beantragt und genehmigt.",
						"Persönliche Konten: Jede Person nutzt ein eigenes Konto. Gemeinsam genutzte Konten sind nur als dokumentierte Ausnahme mit verantwortlicher Person zulässig.",
						"Funktionstrennung: Unvereinbare Rechte, etwa eine Zahlung anlegen und freigeben, liegen nicht bei derselben Person.",
					],
				},
				{ kind: "p", text: "Rechte werden {{a:rollenmodell}}." },
				{
					kind: "p",
					text: "{{a:verantwortung}} pflegt das Berechtigungskonzept, überwacht die Einhaltung dieser Richtlinie und meldet Abweichungen an die Geschäftsleitung.",
				},
			],
		},
		{
			id: "lebenszyklus",
			heading: "Eintritt, Wechsel und Austritt",
			questions: [
				{
					key: "genehmigung",
					kind: "choice",
					label: "Wer genehmigt neue Zugänge und Rechte?",
					help: "Die Führungskraft kennt die Aufgabe, die oder der Verantwortliche des Systems kennt die Daten. Beide zusammen sind die sicherere Wahl.",
					gap: "Genehmigung",
					options: [
						{
							value: "fuehrung",
							label: "Die Führungskraft",
							text: "der zuständigen Führungskraft",
						},
						{
							value: "fuehrung_system",
							label: "Führungskraft und Verantwortliche des Systems",
							text: "der zuständigen Führungskraft und von der oder dem Verantwortlichen des Systems",
						},
					],
					recommended: "fuehrung_system",
				},
				{
					key: "entzug_frist",
					kind: "choice",
					label: "Wann werden Konten beim Austritt gesperrt?",
					gap: "Sperre beim Austritt",
					options: [
						{
							value: "letzter_tag",
							label: "Am letzten Arbeitstag",
							text: "spätestens mit dem Ende des letzten Arbeitstags",
						},
						{
							value: "24h",
							label: "Innerhalb von 24 Stunden danach",
							text: "spätestens 24 Stunden nach dem Ende des letzten Arbeitstags",
						},
					],
					recommended: "letzter_tag",
				},
			],
			blocks: [
				{
					kind: "p",
					text: "Zugänge und Rechte werden im Ticketsystem oder schriftlich beantragt und von {{a:genehmigung}} genehmigt. Wer genehmigt, richtet die Rechte nicht selbst ein.",
				},
				{
					kind: "ul",
					items: [
						"Eintritt: Die Personalabteilung meldet neue Beschäftigte rechtzeitig. Konten werden zum Arbeitsbeginn mit den genehmigten Rechten eingerichtet.",
						"Wechsel: Bei einer neuen Aufgabe werden nicht mehr benötigte Rechte mit dem Wechsel entzogen.",
						"Austritt: Alle Konten werden {{a:entzug_frist}} gesperrt, bei einer Freistellung oder fristlosen Kündigung sofort. Laufende Sitzungen werden beendet.",
						"Externe: Konten externer Mitarbeitender sind auf die Dauer des Auftrags befristet.",
					],
				},
				{
					kind: "p",
					text: "Gesperrte Konten werden gelöscht, sobald keine Aufbewahrungs- oder Nachweispflicht mehr besteht. Jede Vergabe, Änderung und Sperre ist nachvollziehbar dokumentiert.",
				},
			],
		},
		{
			id: "authentisierung",
			heading: "Anmeldung und Authentisierung",
			questions: [
				{
					key: "mfa_umfang",
					kind: "choice",
					label: "Wo ist eine Anmeldung mit zwei Faktoren (MFA) Pflicht?",
					help: "MFA heißt: Neben dem Passwort gibt es einen zweiten Nachweis, etwa einen Code aus einer App. Ein Passkey mit Fingerabdruck oder PIN zählt schon als zwei Faktoren.",
					gap: "Umfang der MFA",
					options: [
						{
							value: "alle",
							label: "Bei allen Konten und Systemen",
							text: "bei allen Konten und allen Systemen von {{org}}",
						},
						{
							value: "aussen_admin",
							label: "Bei Zugriff von außen und für Admins",
							text: "bei jedem Zugriff aus dem Internet, bei Cloud-Diensten und bei allen privilegierten Konten",
						},
					],
					recommended: "alle",
				},
				{
					key: "faktor",
					kind: "choice",
					label: "Welche Verfahren sind als zweiter Faktor zugelassen?",
					help: "Passkeys und Sicherheitsschlüssel (FIDO2) sind gegen Phishing geschützt. Authenticator-Apps sind verbreitet und besser als SMS.",
					gap: "zugelassene Verfahren",
					options: [
						{
							value: "fido",
							label: "Nur Passkeys und Sicherheitsschlüssel",
							text: "Passkeys und Sicherheitsschlüssel nach FIDO2",
						},
						{
							value: "app",
							label: "Auch Authenticator-Apps",
							text: "Passkeys, Sicherheitsschlüssel nach FIDO2 und Authenticator-Apps mit Einmalcode oder Zahlenabgleich",
						},
					],
					recommended: "app",
				},
			],
			blocks: [
				{
					kind: "p",
					text: "Eine Anmeldung mit mindestens zwei Faktoren (MFA) ist Pflicht {{a:mfa_umfang}}. Zugelassen sind {{a:faktor}}.",
				},
				{
					kind: "p",
					text: "Codes per SMS oder Anruf gelten nicht als zweiter Faktor, weil sie sich abfangen lassen. Privilegierte Konten nutzen immer Passkeys oder Sicherheitsschlüssel.",
				},
				{ kind: "p", text: "Für Passwörter gilt:" },
				{
					kind: "ul",
					items: [
						"Passwörter haben mindestens 12 Zeichen und werden für kein anderes Konto verwendet.",
						"Passwörter werden nur in einem freigegebenen Passwortmanager gespeichert.",
						"Ein Passwort wird geändert, sobald der Verdacht besteht, dass es bekannt geworden ist. Regelmäßige Wechsel ohne Anlass entfallen.",
						"Erstpasswörter und Einmalcodes werden auf einem getrennten Weg übermittelt und bei der ersten Anmeldung ersetzt.",
					],
				},
				{
					kind: "p",
					text: "Sitzungen enden nach einer festgelegten Zeit ohne Aktivität. Besonders schutzbedürftige Aktionen verlangen eine erneute Bestätigung.",
				},
			],
		},
		{
			id: "privilegiert",
			heading: "Privilegierte Zugänge",
			questions: [
				{
					key: "privileg_zugriff",
					kind: "choice",
					label: "Wie werden administrative Rechte vergeben?",
					help: "Just-in-time heißt: Die Rechte werden nur für eine Aufgabe freigeschaltet und laufen danach automatisch ab.",
					gap: "Vergabe administrativer Rechte",
					options: [
						{
							value: "jit",
							label: "Nur bei Bedarf und befristet",
							text: "nur bei Bedarf und zeitlich befristet freigeschaltet (Just-in-time)",
						},
						{
							value: "dauerhaft",
							label: "Dauerhaft an benannte Personen",
							text: "dauerhaft an namentlich benannte Personen vergeben und besonders eng überprüft",
						},
					],
					recommended: "jit",
				},
			],
			blocks: [
				{
					kind: "p",
					text: "Privilegierte Zugänge sind Konten mit erweiterten Rechten, etwa zur Verwaltung von Systemen, Netz, Datenbanken oder Cloud-Diensten. Für sie gilt:",
				},
				{
					kind: "ul",
					items: [
						"Administrative Rechte werden {{a:privileg_zugriff}}.",
						"Administratoren nutzen für Verwaltungsaufgaben ein eigenes, persönliches Admin-Konto, nie das Konto für Mail und Internet.",
						"Die Anmeldung mit Admin-Konten erfolgt nur von dafür vorgesehenen Geräten oder Netzen.",
						"Alle Tätigkeiten mit privilegierten Konten werden protokolliert und nach dem Protokollierungskonzept ausgewertet.",
						"Notfallkonten sind sicher hinterlegt. Jede Nutzung wird gemeldet und begründet; das Passwort wird danach geändert.",
						"Technische Konten haben keine interaktive Anmeldung. Deren Zugangsdaten liegen in einem geschützten Speicher für Geheimnisse.",
					],
				},
			],
		},
		{
			id: "rezertifizierung",
			heading: "Überprüfung der Rechte",
			questions: [
				{
					key: "rezert_kritisch",
					kind: "number",
					label:
						"In welchem Abstand werden Rechte auf kritischen Systemen und privilegierte Konten überprüft?",
					help: "Kritisch sind Systeme mit hohem Schutzbedarf, etwa Zahlungsverkehr, Kundendaten oder die Verwaltung der IT. Üblich ist vierteljährlich.",
					gap: "Prüfabstand für kritische Rechte",
					unit: ["Monat", "Monate"],
					min: 1,
					max: 12,
					recommended: 3,
				},
				{
					key: "inaktiv_tage",
					kind: "number",
					label:
						"Nach wie vielen Tagen ohne Anmeldung wird ein Konto gesperrt?",
					gap: "Sperre ungenutzter Konten",
					unit: ["Tag", "Tage"],
					min: 14,
					max: 365,
					recommended: 90,
				},
			],
			blocks: [
				{
					kind: "p",
					text: "Verantwortliche der Systeme und Führungskräfte prüfen regelmäßig, ob jedes Recht noch gebraucht wird (Rezertifizierung). Für Rechte auf kritischen Systemen und für privilegierte Konten beträgt der Abstand höchstens {{a:rezert_kritisch}}.",
				},
				{
					kind: "p",
					text: "Alle übrigen Rechte werden mindestens einmal im Jahr überprüft. Nicht bestätigte Rechte werden entzogen.",
				},
				{
					kind: "p",
					text: "{{a:verantwortung}} stößt die Überprüfung an, verfolgt offene Punkte und dokumentiert das Ergebnis.",
				},
				{
					kind: "p",
					text: "Konten, deren letzte Anmeldung mehr als {{a:inaktiv_tage}} zurückliegt, werden automatisch gesperrt.",
				},
			],
		},
		{
			id: "aussen",
			heading: "Zugriff von außen",
			questions: [
				{
					key: "fernzugriff",
					kind: "choice",
					label: "Wie greifen Beschäftigte von außen auf interne Systeme zu?",
					gap: "Zugriff von außen",
					options: [
						{
							value: "vpn",
							label: "Über VPN mit MFA",
							text: "über das freigegebene VPN mit MFA",
						},
						{
							value: "vpn_geraet",
							label: "Über VPN mit MFA, nur von Firmengeräten",
							text: "über das freigegebene VPN mit MFA und nur von Geräten, die {{org}} verwaltet",
						},
					],
					recommended: "vpn_geraet",
				},
			],
			blocks: [
				{
					kind: "p",
					text: "Von außerhalb der Geschäftsräume erfolgt der Zugriff auf interne Systeme nur {{a:fernzugriff}}.",
				},
				{
					kind: "p",
					text: "Fernwartung durch Dienstleister wird nur im Einzelfall und befristet freigeschaltet, über persönliche Konten und mit Protokollierung.",
				},
				{
					kind: "p",
					text: "Wer unterwegs arbeitet, achtet darauf, dass niemand Bildschirm oder Eingaben mitlesen kann.",
				},
			],
		},
	],
};
